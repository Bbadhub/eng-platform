"""
MySQL MCP Server (HTTP+SSE Transport)
Provides READ-ONLY access to RAGFlow's internal MySQL database for debugging and analysis.

IMPORTANT: This server is READ-ONLY. Never write to RAGFlow's MySQL database.

Implements proper MCP SSE transport (protocol 2024-11-05):
- GET /sse - SSE endpoint, sends 'endpoint' event with POST URL
- POST /messages - Client sends JSON-RPC requests here
- Server responds via SSE with matching request IDs

Tools:
- get_document_status: Check processing status of documents
- get_dataset_stats: Get detailed KB statistics
- search_document_metadata: Search document names/metadata
- get_chunk_stats: Get chunk statistics for a document
- get_graphrag_status: Check GraphRAG build status
"""

import os
import json
import asyncio
import uuid
from typing import Optional, Dict, Any, List
import aiomysql
from aiohttp import web

# MySQL configuration (RAGFlow internal database)
MYSQL_HOST = os.environ.get("MYSQL_HOST", "ragflow-mysql")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "ragflow")

SERVER_PORT = int(os.environ.get("MCP_SERVER_PORT", "3012"))
AUTH_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")

# Store active SSE sessions
SSE_SESSIONS: Dict[str, Any] = {}

# Connection pool
_pool: Optional[aiomysql.Pool] = None


async def get_pool() -> aiomysql.Pool:
    """Get or create MySQL connection pool."""
    global _pool
    if _pool is None:
        _pool = await aiomysql.create_pool(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            db=MYSQL_DATABASE,
            autocommit=True,
            minsize=1,
            maxsize=5
        )
    return _pool


# Tool definitions for MCP
TOOLS = [
    {
        "name": "get_document_status",
        "description": "Check processing status of documents by their IDs. Returns status, chunk count, and any errors.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "doc_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of document IDs to check"
                }
            },
            "required": ["doc_ids"]
        }
    },
    {
        "name": "get_dataset_stats",
        "description": "Get detailed statistics for a knowledge base including document count, chunk count, and embedding model.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "kb_id": {"type": "string", "description": "Knowledge base ID (dataset_id)"}
            },
            "required": ["kb_id"]
        }
    },
    {
        "name": "search_document_metadata",
        "description": "Search for documents by name or metadata across all knowledge bases.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query for document name"},
                "kb_id": {"type": "string", "description": "Optionally limit to specific KB"},
                "limit": {"type": "integer", "description": "Max results (default 20)", "default": 20}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_chunk_stats",
        "description": "Get chunk statistics for a specific document.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "doc_id": {"type": "string", "description": "Document ID"}
            },
            "required": ["doc_id"]
        }
    },
    {
        "name": "get_graphrag_status",
        "description": "Check GraphRAG build status for a knowledge base.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "kb_id": {"type": "string", "description": "Knowledge base ID"}
            },
            "required": ["kb_id"]
        }
    },
    {
        "name": "list_all_datasets",
        "description": "List all datasets/knowledge bases in RAGFlow MySQL with their stats.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max results (default 50)", "default": 50}
            },
            "required": []
        }
    },
    {
        "name": "get_recent_documents",
        "description": "Get recently uploaded or processed documents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max results (default 20)", "default": 20},
                "status": {"type": "string", "description": "Filter by status: processing, done, failed"}
            },
            "required": []
        }
    }
]


# ============================================================================
# Tool Implementations (READ-ONLY)
# ============================================================================

async def get_document_status(doc_ids: List[str]) -> str:
    """Get processing status for documents."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                placeholders = ','.join(['%s'] * len(doc_ids))
                await cur.execute(f"""
                    SELECT id, name, status, chunk_num, process_begin_at, process_duation,
                           parser_id, kb_id, size, location
                    FROM document
                    WHERE id IN ({placeholders})
                """, doc_ids)
                docs = await cur.fetchall()

                if not docs:
                    return f"No documents found for IDs: {doc_ids}"

                status_map = {0: "PENDING", 1: "PROCESSING", 2: "DONE", 3: "FAILED", 4: "CANCELED"}

                output = f"**Document Status ({len(docs)} found):**\n\n"
                for doc in docs:
                    name = doc.get("name", "Unknown")
                    status = status_map.get(doc.get("status", 0), "UNKNOWN")
                    chunks = doc.get("chunk_num", 0)
                    size = doc.get("size", 0)

                    output += f"**{name}**\n"
                    output += f"   ID: `{doc.get('id')}`\n"
                    output += f"   Status: {status} | Chunks: {chunks} | Size: {size:,} bytes\n"
                    if doc.get("process_begin_at"):
                        output += f"   Started: {doc.get('process_begin_at')}\n"
                    output += "\n"

                return output

    except Exception as e:
        return f"Error getting document status: {str(e)}"


async def get_dataset_stats(kb_id: str) -> str:
    """Get detailed KB statistics."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                # Get dataset info
                await cur.execute("""
                    SELECT id, name, description, embd_id, parser_id, doc_num, chunk_num,
                           create_time, update_time, parser_config
                    FROM knowledgebase
                    WHERE id = %s
                """, (kb_id,))
                kb = await cur.fetchone()

                if not kb:
                    return f"Knowledge base not found: {kb_id}"

                output = f"**Knowledge Base: {kb.get('name')}**\n\n"
                output += f"**ID:** `{kb.get('id')}`\n"
                output += f"**Documents:** {kb.get('doc_num', 0)}\n"
                output += f"**Chunks:** {kb.get('chunk_num', 0)}\n"
                output += f"**Embedding Model:** {kb.get('embd_id', 'Unknown')}\n"
                output += f"**Parser:** {kb.get('parser_id', 'Unknown')}\n"
                output += f"**Created:** {kb.get('create_time')}\n"
                output += f"**Updated:** {kb.get('update_time')}\n"

                # Parse parser_config for GraphRAG status
                parser_config = kb.get("parser_config")
                if parser_config:
                    try:
                        config = json.loads(parser_config) if isinstance(parser_config, str) else parser_config
                        graphrag = config.get("graphrag", {})
                        if graphrag.get("use_graphrag"):
                            output += f"\n**GraphRAG:** Enabled\n"
                            output += f"   Entity Types: {', '.join(graphrag.get('entity_types', []))}\n"
                    except:
                        pass

                return output

    except Exception as e:
        return f"Error getting dataset stats: {str(e)}"


async def search_document_metadata(query: str, kb_id: str = None, limit: int = 20) -> str:
    """Search documents by name."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                sql = """
                    SELECT d.id, d.name, d.status, d.chunk_num, d.size, d.kb_id,
                           k.name as kb_name
                    FROM document d
                    LEFT JOIN knowledgebase k ON d.kb_id = k.id
                    WHERE d.name LIKE %s
                """
                params = [f"%{query}%"]

                if kb_id:
                    sql += " AND d.kb_id = %s"
                    params.append(kb_id)

                sql += " ORDER BY d.create_time DESC LIMIT %s"
                params.append(limit)

                await cur.execute(sql, params)
                docs = await cur.fetchall()

                if not docs:
                    return f"No documents found matching: {query}"

                status_map = {0: "PENDING", 1: "PROCESSING", 2: "DONE", 3: "FAILED", 4: "CANCELED"}

                output = f"**Documents matching '{query}' ({len(docs)} found):**\n\n"
                for doc in docs:
                    name = doc.get("name", "Unknown")
                    status = status_map.get(doc.get("status", 0), "UNKNOWN")
                    kb_name = doc.get("kb_name", "Unknown KB")

                    output += f"**{name}**\n"
                    output += f"   ID: `{doc.get('id')}`\n"
                    output += f"   KB: {kb_name}\n"
                    output += f"   Status: {status} | Chunks: {doc.get('chunk_num', 0)}\n\n"

                return output

    except Exception as e:
        return f"Error searching documents: {str(e)}"


async def get_chunk_stats(doc_id: str) -> str:
    """Get chunk statistics for a document."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                # Get document info
                await cur.execute("""
                    SELECT id, name, chunk_num, status, kb_id
                    FROM document
                    WHERE id = %s
                """, (doc_id,))
                doc = await cur.fetchone()

                if not doc:
                    return f"Document not found: {doc_id}"

                output = f"**Chunk Stats for: {doc.get('name')}**\n\n"
                output += f"**Document ID:** `{doc_id}`\n"
                output += f"**Total Chunks:** {doc.get('chunk_num', 0)}\n"

                # Note: Chunk details are in Elasticsearch, not MySQL
                output += "\n*Note: Chunk content is stored in Elasticsearch, not MySQL.*\n"
                output += "*Use mcp-ragflow search_knowledge_base for chunk content.*\n"

                return output

    except Exception as e:
        return f"Error getting chunk stats: {str(e)}"


async def get_graphrag_status(kb_id: str) -> str:
    """Check GraphRAG status for a KB."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT id, name, parser_config
                    FROM knowledgebase
                    WHERE id = %s
                """, (kb_id,))
                kb = await cur.fetchone()

                if not kb:
                    return f"Knowledge base not found: {kb_id}"

                output = f"**GraphRAG Status for: {kb.get('name')}**\n\n"

                parser_config = kb.get("parser_config")
                if not parser_config:
                    return output + "GraphRAG: Not configured (no parser_config)"

                try:
                    config = json.loads(parser_config) if isinstance(parser_config, str) else parser_config
                    graphrag = config.get("graphrag", {})

                    if not graphrag.get("use_graphrag"):
                        output += "**GraphRAG:** Disabled\n"
                        output += "*Enable via parser_config.graphrag.use_graphrag = true*\n"
                    else:
                        output += "**GraphRAG:** Enabled\n"
                        output += f"**Entity Types:** {', '.join(graphrag.get('entity_types', []))}\n"
                        output += f"**Method:** {graphrag.get('method', 'light')}\n"
                        output += f"**Community Detection:** {graphrag.get('community', False)}\n"
                        output += f"**Entity Resolution:** {graphrag.get('resolution', False)}\n"

                except Exception as e:
                    output += f"Error parsing parser_config: {e}\n"

                return output

    except Exception as e:
        return f"Error getting GraphRAG status: {str(e)}"


async def list_all_datasets(limit: int = 50) -> str:
    """List all datasets."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("""
                    SELECT id, name, doc_num, chunk_num, embd_id, create_time
                    FROM knowledgebase
                    ORDER BY create_time DESC
                    LIMIT %s
                """, (limit,))
                datasets = await cur.fetchall()

                if not datasets:
                    return "No knowledge bases found"

                output = f"**Knowledge Bases ({len(datasets)}):**\n\n"
                for ds in datasets:
                    output += f"**{ds.get('name')}**\n"
                    output += f"   ID: `{ds.get('id')}`\n"
                    output += f"   Docs: {ds.get('doc_num', 0)} | Chunks: {ds.get('chunk_num', 0)}\n"
                    output += f"   Embedding: {ds.get('embd_id', 'Unknown')}\n\n"

                return output

    except Exception as e:
        return f"Error listing datasets: {str(e)}"


async def get_recent_documents(limit: int = 20, status: str = None) -> str:
    """Get recently processed documents."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                sql = """
                    SELECT d.id, d.name, d.status, d.chunk_num, d.create_time,
                           k.name as kb_name
                    FROM document d
                    LEFT JOIN knowledgebase k ON d.kb_id = k.id
                """

                status_map_reverse = {"pending": 0, "processing": 1, "done": 2, "failed": 3, "canceled": 4}
                params = []

                if status and status.lower() in status_map_reverse:
                    sql += " WHERE d.status = %s"
                    params.append(status_map_reverse[status.lower()])

                sql += " ORDER BY d.create_time DESC LIMIT %s"
                params.append(limit)

                await cur.execute(sql, params)
                docs = await cur.fetchall()

                if not docs:
                    return "No recent documents found"

                status_map = {0: "PENDING", 1: "PROCESSING", 2: "DONE", 3: "FAILED", 4: "CANCELED"}

                output = f"**Recent Documents ({len(docs)}):**\n\n"
                for doc in docs:
                    name = doc.get("name", "Unknown")
                    doc_status = status_map.get(doc.get("status", 0), "UNKNOWN")
                    kb_name = doc.get("kb_name", "Unknown KB")

                    output += f"**{name}**\n"
                    output += f"   Status: {doc_status} | KB: {kb_name}\n"
                    output += f"   Chunks: {doc.get('chunk_num', 0)} | Created: {doc.get('create_time')}\n\n"

                return output

    except Exception as e:
        return f"Error getting recent documents: {str(e)}"


# Tool dispatcher
TOOL_HANDLERS = {
    "get_document_status": get_document_status,
    "get_dataset_stats": get_dataset_stats,
    "search_document_metadata": search_document_metadata,
    "get_chunk_stats": get_chunk_stats,
    "get_graphrag_status": get_graphrag_status,
    "list_all_datasets": list_all_datasets,
    "get_recent_documents": get_recent_documents
}


# ============================================================================
# MCP Protocol Handlers
# ============================================================================

async def handle_mcp_request(data: dict, session_id: str = None) -> dict:
    """Handle a JSON-RPC MCP request and return response."""
    method = data.get("method", "")
    request_id = data.get("id")
    params = data.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "mysql", "version": "1.0.0"}
            }
        }
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"tools": TOOLS}
        }
    elif method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if tool_name not in TOOL_HANDLERS:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"}
            }

        handler = TOOL_HANDLERS[tool_name]
        result = await handler(**arguments)

        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"content": [{"type": "text", "text": result}]}
        }
    elif method == "notifications/initialized":
        return None
    else:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32601, "message": f"Unknown method: {method}"}
        }


# ============================================================================
# HTTP+SSE Endpoints
# ============================================================================

def verify_auth(request) -> bool:
    """Verify authorization token."""
    if not AUTH_TOKEN:
        return True

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer ") and auth_header[7:] == AUTH_TOKEN:
        return True
    if request.headers.get("api_key") == AUTH_TOKEN:
        return True
    if request.query.get("api_key") == AUTH_TOKEN:
        return True
    return False


async def handle_sse_get(request):
    """SSE endpoint for MCP protocol."""
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    session_id = str(uuid.uuid4())

    response = web.StreamResponse(
        status=200,
        headers={
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        }
    )
    await response.prepare(request)

    SSE_SESSIONS[session_id] = response

    try:
        await response.write(f"event: endpoint\ndata: /sse?session_id={session_id}\n\n".encode())

        while True:
            await asyncio.sleep(30)
            try:
                await response.write(f": ping\n\n".encode())
            except:
                break

    except asyncio.CancelledError:
        pass
    finally:
        SSE_SESSIONS.pop(session_id, None)

    return response


async def handle_sse_post(request):
    """Handle POST to /sse."""
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
        session_id = request.query.get("session_id")

        response_data = await handle_mcp_request(data, session_id)

        if response_data and session_id and session_id in SSE_SESSIONS:
            sse_response = SSE_SESSIONS.get(session_id)
            if sse_response:
                await sse_response.write(f"event: message\ndata: {json.dumps(response_data)}\n\n".encode())
            return web.Response(status=202)
        elif response_data:
            return web.json_response(response_data)
        else:
            return web.Response(status=202)

    except Exception as e:
        return web.json_response(
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32603, "message": str(e)}},
            status=500
        )


async def handle_sse(request):
    """Route /sse based on HTTP method."""
    if request.method == 'GET':
        return await handle_sse_get(request)
    elif request.method == 'POST':
        return await handle_sse_post(request)
    return web.Response(status=405)


async def handle_health(request):
    """Health check endpoint."""
    # Try to connect to MySQL
    mysql_ok = False
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                mysql_ok = True
    except:
        pass

    return web.json_response({
        "status": "healthy" if mysql_ok else "degraded",
        "service": "mysql-mcp",
        "tools": len(TOOLS),
        "mysql_host": MYSQL_HOST,
        "mysql_connected": mysql_ok,
        "active_sessions": len(SSE_SESSIONS)
    })


async def handle_cors_preflight(request):
    """Handle CORS preflight."""
    return web.Response(
        status=200,
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, api_key',
        }
    )


def create_app():
    """Create the aiohttp application."""
    app = web.Application()

    @web.middleware
    async def cors_middleware(request, handler):
        if request.method == 'OPTIONS':
            return await handle_cors_preflight(request)
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response

    app.middlewares.append(cors_middleware)

    app.router.add_get("/sse", handle_sse)
    app.router.add_post("/sse", handle_sse)
    app.router.add_options("/sse", handle_cors_preflight)
    app.router.add_get("/health", handle_health)

    return app


if __name__ == "__main__":
    print("=" * 60)
    print("MySQL MCP Server (SSE Transport) - READ ONLY")
    print("=" * 60)
    print(f"Port: {SERVER_PORT}")
    print(f"MySQL Host: {MYSQL_HOST}:{MYSQL_PORT}")
    print(f"MySQL Database: {MYSQL_DATABASE}")
    print(f"SSE endpoint: http://0.0.0.0:{SERVER_PORT}/sse")
    print(f"Health check: http://0.0.0.0:{SERVER_PORT}/health")
    print(f"Tools available: {len(TOOLS)}")
    for tool in TOOLS:
        print(f"  - {tool['name']}")
    print("=" * 60)
    print("WARNING: This server is READ-ONLY. Never write to RAGFlow MySQL.")
    print("=" * 60)

    app = create_app()
    web.run_app(app, host="0.0.0.0", port=SERVER_PORT)
