"""
Dropbox MCP Server (HTTP+SSE Transport)
Provides direct access to Dropbox files for document retrieval and search.

Implements proper MCP SSE transport (protocol 2024-11-05):
- GET /sse - SSE endpoint, sends 'endpoint' event with POST URL
- POST /messages - Client sends JSON-RPC requests here
- Server responds via SSE with matching request IDs

Tools:
- list_folder: List contents of a Dropbox folder
- search_files: Search for files by name/path
- get_file_content: Download and return file content (text/PDF extraction)
- get_file_metadata: Get file metadata without downloading
"""

import os
import json
import asyncio
import uuid
import io
from typing import Optional, Dict, Any, List
import httpx
from aiohttp import web

# Dropbox API configuration
DROPBOX_ACCESS_TOKEN = os.environ.get("DROPBOX_ACCESS_TOKEN", "")
DROPBOX_REFRESH_TOKEN = os.environ.get("DROPBOX_REFRESH_TOKEN", "")
DROPBOX_APP_KEY = os.environ.get("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = os.environ.get("DROPBOX_APP_SECRET", "")
SERVER_PORT = int(os.environ.get("MCP_SERVER_PORT", "3015"))
AUTH_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")

# Dropbox API endpoints
DROPBOX_API_URL = "https://api.dropboxapi.com/2"
DROPBOX_CONTENT_URL = "https://content.dropboxapi.com/2"

# Store active SSE sessions
SSE_SESSIONS: Dict[str, Any] = {}

# Current access token (may be refreshed)
current_access_token = DROPBOX_ACCESS_TOKEN


async def refresh_access_token():
    """Refresh the Dropbox access token using refresh token."""
    global current_access_token
    if not DROPBOX_REFRESH_TOKEN or not DROPBOX_APP_KEY or not DROPBOX_APP_SECRET:
        return False

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": DROPBOX_REFRESH_TOKEN,
                "client_id": DROPBOX_APP_KEY,
                "client_secret": DROPBOX_APP_SECRET
            }
        )
        if response.status_code == 200:
            data = response.json()
            current_access_token = data.get("access_token", "")
            return True
        return False


def get_headers() -> dict:
    """Get headers for Dropbox API requests."""
    return {
        "Authorization": f"Bearer {current_access_token}",
        "Content-Type": "application/json"
    }


# Tool definitions for MCP
TOOLS = [
    {
        "name": "list_folder",
        "description": "List contents of a Dropbox folder. Returns files and subfolders with metadata.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Dropbox folder path (e.g., '/US v Blackman et. al. ATTY CLIENT PRIVILEGED FILES/Government Exhibits'). Use empty string for root.",
                    "default": ""
                },
                "recursive": {
                    "type": "boolean",
                    "description": "List contents recursively (default false)",
                    "default": False
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (default 100, max 2000)",
                    "default": 100
                }
            },
            "required": []
        }
    },
    {
        "name": "search_files",
        "description": "Search for files in Dropbox by filename or path. Useful for finding specific documents like 'GX 708' or 'FD-302'.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query (filename, partial name, or keywords)"
                },
                "path": {
                    "type": "string",
                    "description": "Limit search to this folder path (optional)",
                    "default": ""
                },
                "file_extensions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filter by file extensions (e.g., ['pdf', 'xlsx'])",
                    "default": []
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum results to return (default 50)",
                    "default": 50
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_file_content",
        "description": "Download and return file content. For PDFs, extracts text. For text files, returns raw content. For other files, returns base64.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Full Dropbox path to the file"
                },
                "extract_text": {
                    "type": "boolean",
                    "description": "For PDFs, attempt to extract text (default true)",
                    "default": True
                },
                "max_size_mb": {
                    "type": "number",
                    "description": "Maximum file size to download in MB (default 10)",
                    "default": 10
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "get_file_metadata",
        "description": "Get metadata for a file or folder without downloading content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Full Dropbox path to the file or folder"
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "get_shared_link_content",
        "description": "Get content from a Dropbox shared link URL.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Dropbox shared link URL"
                },
                "extract_text": {
                    "type": "boolean",
                    "description": "For PDFs, attempt to extract text (default true)",
                    "default": True
                }
            },
            "required": ["url"]
        }
    }
]


async def handle_list_folder(args: dict) -> dict:
    """List contents of a Dropbox folder."""
    path = args.get("path", "")
    recursive = args.get("recursive", False)
    limit = min(args.get("limit", 100), 2000)

    # Normalize path - Dropbox expects empty string for root, not "/"
    if path == "/":
        path = ""
    elif path and not path.startswith("/"):
        path = "/" + path

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{DROPBOX_API_URL}/files/list_folder",
            headers=get_headers(),
            json={
                "path": path,
                "recursive": recursive,
                "limit": limit,
                "include_deleted": False,
                "include_has_explicit_shared_members": False,
                "include_mounted_folders": True
            }
        )

        if response.status_code == 401:
            # Try to refresh token
            if await refresh_access_token():
                response = await client.post(
                    f"{DROPBOX_API_URL}/files/list_folder",
                    headers=get_headers(),
                    json={
                        "path": path,
                        "recursive": recursive,
                        "limit": limit
                    }
                )

        if response.status_code != 200:
            return {"error": f"Dropbox API error: {response.status_code}", "detail": response.text}

        data = response.json()
        entries = []

        for entry in data.get("entries", []):
            item = {
                "name": entry.get("name"),
                "path": entry.get("path_display"),
                "type": "folder" if entry.get(".tag") == "folder" else "file"
            }
            if entry.get(".tag") == "file":
                item["size"] = entry.get("size")
                item["modified"] = entry.get("server_modified")
            entries.append(item)

        return {
            "path": path or "/",
            "entries": entries,
            "has_more": data.get("has_more", False),
            "cursor": data.get("cursor") if data.get("has_more") else None
        }


async def handle_search_files(args: dict) -> dict:
    """Search for files in Dropbox."""
    query = args.get("query", "")
    path = args.get("path", "")
    file_extensions = args.get("file_extensions", [])
    max_results = min(args.get("max_results", 50), 1000)

    if not query:
        return {"error": "Query is required"}

    # Build search options
    options = {
        "max_results": max_results,
        "file_status": "active"
    }

    if path:
        if not path.startswith("/"):
            path = "/" + path
        options["path"] = path

    if file_extensions:
        options["file_extensions"] = file_extensions

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{DROPBOX_API_URL}/files/search_v2",
            headers=get_headers(),
            json={
                "query": query,
                "options": options
            }
        )

        if response.status_code == 401:
            if await refresh_access_token():
                response = await client.post(
                    f"{DROPBOX_API_URL}/files/search_v2",
                    headers=get_headers(),
                    json={
                        "query": query,
                        "options": options
                    }
                )

        if response.status_code != 200:
            return {"error": f"Dropbox API error: {response.status_code}", "detail": response.text}

        data = response.json()
        results = []

        for match in data.get("matches", []):
            metadata = match.get("metadata", {}).get("metadata", {})
            result = {
                "name": metadata.get("name"),
                "path": metadata.get("path_display"),
                "type": "folder" if metadata.get(".tag") == "folder" else "file"
            }
            if metadata.get(".tag") == "file":
                result["size"] = metadata.get("size")
                result["modified"] = metadata.get("server_modified")
            results.append(result)

        return {
            "query": query,
            "results": results,
            "has_more": data.get("has_more", False)
        }


async def handle_get_file_content(args: dict) -> dict:
    """Download and return file content."""
    path = args.get("path", "")
    extract_text = args.get("extract_text", True)
    max_size_mb = args.get("max_size_mb", 10)

    if not path:
        return {"error": "Path is required"}

    if not path.startswith("/"):
        path = "/" + path

    # First get metadata to check size
    async with httpx.AsyncClient(timeout=30.0) as client:
        meta_response = await client.post(
            f"{DROPBOX_API_URL}/files/get_metadata",
            headers=get_headers(),
            json={"path": path}
        )

        if meta_response.status_code == 401:
            if await refresh_access_token():
                meta_response = await client.post(
                    f"{DROPBOX_API_URL}/files/get_metadata",
                    headers=get_headers(),
                    json={"path": path}
                )

        if meta_response.status_code != 200:
            return {"error": f"File not found or access denied: {path}"}

        metadata = meta_response.json()
        file_size = metadata.get("size", 0)

        if file_size > max_size_mb * 1024 * 1024:
            return {
                "error": f"File too large ({file_size / 1024 / 1024:.1f} MB). Max: {max_size_mb} MB",
                "metadata": {
                    "name": metadata.get("name"),
                    "path": metadata.get("path_display"),
                    "size": file_size,
                    "modified": metadata.get("server_modified")
                }
            }

        # Download the file
        download_headers = {
            "Authorization": f"Bearer {current_access_token}",
            "Dropbox-API-Arg": json.dumps({"path": path})
        }

        download_response = await client.post(
            f"{DROPBOX_CONTENT_URL}/files/download",
            headers=download_headers
        )

        if download_response.status_code != 200:
            return {"error": f"Download failed: {download_response.status_code}"}

        content = download_response.content
        filename = metadata.get("name", "").lower()

        # Handle different file types
        if filename.endswith(".pdf") and extract_text:
            try:
                import fitz  # PyMuPDF
                pdf_doc = fitz.open(stream=content, filetype="pdf")
                text_content = []
                for page_num in range(len(pdf_doc)):
                    page = pdf_doc[page_num]
                    text_content.append(f"--- Page {page_num + 1} ---\n{page.get_text()}")
                pdf_doc.close()
                return {
                    "path": path,
                    "name": metadata.get("name"),
                    "type": "pdf",
                    "pages": len(text_content),
                    "content": "\n\n".join(text_content),
                    "size": file_size
                }
            except ImportError:
                # PyMuPDF not available, return base64
                import base64
                return {
                    "path": path,
                    "name": metadata.get("name"),
                    "type": "pdf",
                    "content_base64": base64.b64encode(content).decode("utf-8"),
                    "size": file_size,
                    "note": "PDF text extraction requires PyMuPDF. Returning base64 content."
                }
            except Exception as e:
                import base64
                return {
                    "path": path,
                    "name": metadata.get("name"),
                    "type": "pdf",
                    "content_base64": base64.b64encode(content).decode("utf-8"),
                    "size": file_size,
                    "extraction_error": str(e)
                }

        elif filename.endswith((".txt", ".md", ".json", ".csv", ".xml", ".html", ".py", ".js", ".ts")):
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                text = content.decode("latin-1")
            return {
                "path": path,
                "name": metadata.get("name"),
                "type": "text",
                "content": text,
                "size": file_size
            }

        elif filename.endswith((".xlsx", ".xls")):
            try:
                import pandas as pd
                df = pd.read_excel(io.BytesIO(content))
                return {
                    "path": path,
                    "name": metadata.get("name"),
                    "type": "spreadsheet",
                    "rows": len(df),
                    "columns": list(df.columns),
                    "preview": df.head(50).to_dict(orient="records"),
                    "size": file_size
                }
            except ImportError:
                import base64
                return {
                    "path": path,
                    "name": metadata.get("name"),
                    "type": "spreadsheet",
                    "content_base64": base64.b64encode(content).decode("utf-8"),
                    "size": file_size,
                    "note": "Excel parsing requires pandas and openpyxl. Returning base64 content."
                }

        else:
            import base64
            return {
                "path": path,
                "name": metadata.get("name"),
                "type": "binary",
                "content_base64": base64.b64encode(content).decode("utf-8"),
                "size": file_size
            }


async def handle_get_file_metadata(args: dict) -> dict:
    """Get metadata for a file or folder."""
    path = args.get("path", "")

    if not path:
        return {"error": "Path is required"}

    if not path.startswith("/"):
        path = "/" + path

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{DROPBOX_API_URL}/files/get_metadata",
            headers=get_headers(),
            json={
                "path": path,
                "include_media_info": True,
                "include_has_explicit_shared_members": True
            }
        )

        if response.status_code == 401:
            if await refresh_access_token():
                response = await client.post(
                    f"{DROPBOX_API_URL}/files/get_metadata",
                    headers=get_headers(),
                    json={"path": path}
                )

        if response.status_code != 200:
            return {"error": f"Not found or access denied: {path}", "status": response.status_code}

        data = response.json()

        result = {
            "name": data.get("name"),
            "path": data.get("path_display"),
            "type": "folder" if data.get(".tag") == "folder" else "file"
        }

        if data.get(".tag") == "file":
            result["size"] = data.get("size")
            result["modified"] = data.get("server_modified")
            result["content_hash"] = data.get("content_hash")

        return result


async def handle_get_shared_link_content(args: dict) -> dict:
    """Get content from a Dropbox shared link."""
    url = args.get("url", "")
    extract_text = args.get("extract_text", True)

    if not url:
        return {"error": "URL is required"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Get shared link metadata first
        response = await client.post(
            f"{DROPBOX_API_URL}/sharing/get_shared_link_metadata",
            headers=get_headers(),
            json={"url": url}
        )

        if response.status_code != 200:
            return {"error": f"Invalid shared link: {response.status_code}"}

        metadata = response.json()

        # Download content
        download_headers = {
            "Authorization": f"Bearer {current_access_token}",
            "Dropbox-API-Arg": json.dumps({"url": url})
        }

        download_response = await client.post(
            f"{DROPBOX_CONTENT_URL}/sharing/get_shared_link_file",
            headers=download_headers
        )

        if download_response.status_code != 200:
            return {"error": f"Download failed: {download_response.status_code}"}

        # Process content similar to get_file_content
        content = download_response.content
        filename = metadata.get("name", "").lower()

        if filename.endswith(".pdf") and extract_text:
            try:
                import fitz
                pdf_doc = fitz.open(stream=content, filetype="pdf")
                text_content = []
                for page_num in range(len(pdf_doc)):
                    page = pdf_doc[page_num]
                    text_content.append(f"--- Page {page_num + 1} ---\n{page.get_text()}")
                pdf_doc.close()
                return {
                    "url": url,
                    "name": metadata.get("name"),
                    "type": "pdf",
                    "pages": len(text_content),
                    "content": "\n\n".join(text_content)
                }
            except Exception as e:
                import base64
                return {
                    "url": url,
                    "name": metadata.get("name"),
                    "type": "pdf",
                    "content_base64": base64.b64encode(content).decode("utf-8"),
                    "extraction_error": str(e)
                }
        else:
            try:
                text = content.decode("utf-8")
                return {
                    "url": url,
                    "name": metadata.get("name"),
                    "type": "text",
                    "content": text
                }
            except:
                import base64
                return {
                    "url": url,
                    "name": metadata.get("name"),
                    "type": "binary",
                    "content_base64": base64.b64encode(content).decode("utf-8")
                }


# Tool handler dispatcher
TOOL_HANDLERS = {
    "list_folder": handle_list_folder,
    "search_files": handle_search_files,
    "get_file_content": handle_get_file_content,
    "get_file_metadata": handle_get_file_metadata,
    "get_shared_link_content": handle_get_shared_link_content
}


async def handle_tool_call(name: str, arguments: dict) -> dict:
    """Route tool calls to appropriate handlers."""
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return {"error": f"Unknown tool: {name}"}

    try:
        return await handler(arguments)
    except Exception as e:
        return {"error": f"Tool execution failed: {str(e)}"}


async def process_jsonrpc(request: dict, session_id: str) -> dict:
    """Process a JSON-RPC request and return the response."""
    method = request.get("method", "")
    request_id = request.get("id")
    params = request.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {"listChanged": False}
                },
                "serverInfo": {
                    "name": "dropbox-mcp-server",
                    "version": "1.0.0"
                }
            }
        }

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"tools": TOOLS}
        }

    elif method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})

        result = await handle_tool_call(tool_name, tool_args)

        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result, indent=2, default=str)
                    }
                ]
            }
        }

    elif method == "notifications/initialized":
        return None  # No response needed for notifications

    else:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}"
            }
        }


async def sse_handler(request: web.Request) -> web.StreamResponse:
    """Handle SSE connections from MCP clients."""
    # Check auth if configured
    if AUTH_TOKEN:
        auth_header = request.headers.get("Authorization", "")
        if auth_header != f"Bearer {AUTH_TOKEN}":
            return web.Response(status=401, text="Unauthorized")

    session_id = str(uuid.uuid4())

    response = web.StreamResponse(
        status=200,
        reason="OK",
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        }
    )
    await response.prepare(request)

    # Store the response writer for this session
    SSE_SESSIONS[session_id] = response

    # Send the endpoint event with the POST URL
    endpoint_data = json.dumps(f"/messages?session_id={session_id}")
    await response.write(f"event: endpoint\ndata: {endpoint_data}\n\n".encode())

    # Keep connection alive
    try:
        while True:
            await asyncio.sleep(30)
            await response.write(b": keepalive\n\n")
    except (asyncio.CancelledError, ConnectionResetError):
        pass
    finally:
        SSE_SESSIONS.pop(session_id, None)

    return response


async def messages_handler(request: web.Request) -> web.Response:
    """Handle JSON-RPC messages from MCP clients."""
    session_id = request.query.get("session_id", "")

    if not session_id or session_id not in SSE_SESSIONS:
        return web.Response(status=400, text="Invalid or missing session_id")

    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.Response(status=400, text="Invalid JSON")

    # Process the request
    response_data = await process_jsonrpc(body, session_id)

    if response_data:
        # Send response via SSE
        sse_response = SSE_SESSIONS.get(session_id)
        if sse_response:
            message = f"event: message\ndata: {json.dumps(response_data)}\n\n"
            await sse_response.write(message.encode())

    return web.Response(status=202, text="Accepted")


async def health_handler(request: web.Request) -> web.Response:
    """Health check endpoint."""
    status = {
        "status": "healthy",
        "service": "dropbox-mcp-server",
        "has_token": bool(current_access_token),
        "has_refresh_token": bool(DROPBOX_REFRESH_TOKEN)
    }
    return web.json_response(status)


def create_app() -> web.Application:
    """Create the aiohttp application."""
    app = web.Application()
    app.router.add_get("/sse", sse_handler)
    app.router.add_post("/messages", messages_handler)
    app.router.add_get("/health", health_handler)
    return app


if __name__ == "__main__":
    print(f"Starting Dropbox MCP Server on port {SERVER_PORT}")
    print(f"SSE endpoint: http://localhost:{SERVER_PORT}/sse")
    print(f"Messages endpoint: http://localhost:{SERVER_PORT}/messages")
    print(f"Health check: http://localhost:{SERVER_PORT}/health")

    if not current_access_token:
        print("WARNING: No DROPBOX_ACCESS_TOKEN set. Server will not be able to access Dropbox.")

    app = create_app()
    web.run_app(app, port=SERVER_PORT)
