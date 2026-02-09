"""
Basin Analyzer MCP Server (HTTP+SSE Transport)
Measures LLM output stability to estimate confidence.

Supports both legacy SSE and Streamable HTTP transports for RAGFlow compatibility.

Tools:
- measure_confidence: Run query N times, measure output stability
- analyze_query_type: Classify query as factual/interpretive/counterfactual
- get_basin_metrics: Return detailed basin metrics
- compare_responses: Compare two responses for semantic similarity
"""

import os
import json
import asyncio
import uuid
from typing import Dict, Any
from aiohttp import web

from analyzer import BasinAnalyzer, QueryType

# Configuration
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY", "")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
SERVER_PORT = int(os.environ.get("MCP_SERVER_PORT", "9383"))
# MCP_AUTH_TOKEN - leave empty to disable auth (safe for internal Docker network)
AUTH_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")
DEFAULT_SAMPLE_COUNT = 5

# Store active SSE sessions
SSE_SESSIONS: Dict[str, Any] = {}

# Initialize analyzer
analyzer = BasinAnalyzer(
    voyage_api_key=VOYAGE_API_KEY,
    deepseek_api_key=DEEPSEEK_API_KEY
)

# Tool definitions for MCP
TOOLS = [
    {
        "name": "measure_confidence",
        "description": "Measure LLM output confidence by analyzing response stability. Runs the query multiple times and measures how consistent the outputs are. Returns: epsilon (0-1, lower=more confident), n_basins (distinct patterns), coherence (0-1, higher=more consistent), confidence_level (HIGH/MEDIUM/LOW).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The query to analyze"},
                "context": {"type": "string", "description": "Optional context/documents to include with query"},
                "sample_count": {"type": "integer", "description": f"Number of times to run query (default {DEFAULT_SAMPLE_COUNT})", "default": DEFAULT_SAMPLE_COUNT},
                "model": {"type": "string", "description": "LLM model to use (default: deepseek-chat)", "default": "deepseek-chat"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "analyze_query_type",
        "description": "Classify a query by type to predict expected basin behavior. Types: FACTUAL (single answer, low epsilon), INTERPRETIVE (multiple valid interpretations), COUNTERFACTUAL (hypothetical scenarios, higher variance).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The query to classify"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_basin_metrics",
        "description": "Get detailed basin analysis metrics from a previous measurement. Returns raw clustering data, individual responses, and statistical analysis.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "analysis_id": {"type": "string", "description": "ID from a previous measure_confidence call"}
            },
            "required": ["analysis_id"]
        }
    },
    {
        "name": "compare_responses",
        "description": "Compare two LLM responses for semantic similarity. Useful for checking if follow-up responses are consistent with initial answers. Returns similarity score (0-1) and highlights key differences.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "response_a": {"type": "string", "description": "First response to compare"},
                "response_b": {"type": "string", "description": "Second response to compare"}
            },
            "required": ["response_a", "response_b"]
        }
    }
]


# ============================================================================
# Tool Implementations
# ============================================================================

async def measure_confidence(query: str, context: str = None, sample_count: int = DEFAULT_SAMPLE_COUNT, model: str = "deepseek-chat") -> str:
    """Measure confidence by analyzing output stability."""
    try:
        result = await analyzer.measure_confidence(
            query=query,
            context=context,
            sample_count=sample_count,
            model=model
        )

        confidence_emoji = {
            "HIGH": "🟢",
            "MEDIUM": "🟡",
            "LOW": "🔴"
        }.get(result["confidence_level"], "⚪")

        output = f"""**Basin Analysis Results**

{confidence_emoji} **Confidence Level: {result["confidence_level"]}**

**Metrics:**
- Epsilon (spread): {result["epsilon"]:.3f} (lower = more stable)
- Number of Basins: {result["n_basins"]} (distinct answer patterns)
- Coherence Score: {result["coherence"]:.3f} (higher = more consistent)

**Query Type:** {result["query_type"]}

**Interpretation:**
{result["interpretation"]}

**Analysis ID:** {result["analysis_id"]}
(Use with get_basin_metrics for detailed data)
"""
        return output

    except Exception as e:
        return f"Error measuring confidence: {str(e)}"


async def analyze_query_type(query: str) -> str:
    """Classify query type."""
    try:
        result = await analyzer.classify_query_type(query)

        type_descriptions = {
            QueryType.FACTUAL: {
                "emoji": "📊",
                "description": "Single correct answer expected",
                "expected_behavior": "Low epsilon, single basin",
                "examples": "Dates, names, citations, specific facts"
            },
            QueryType.INTERPRETIVE: {
                "emoji": "⚖️",
                "description": "Requires legal analysis/judgment",
                "expected_behavior": "Moderate epsilon, may have multiple valid interpretations",
                "examples": "Is this exculpatory? What's the legal significance?"
            },
            QueryType.COUNTERFACTUAL: {
                "emoji": "🔮",
                "description": "Hypothetical scenarios",
                "expected_behavior": "Higher variance expected, multiple basins possible",
                "examples": "What if X had happened? Alternative scenarios"
            }
        }

        info = type_descriptions.get(result["query_type"], {})

        output = f"""**Query Type Analysis**

{info.get("emoji", "❓")} **Type: {result["query_type"].value}**

**Description:** {info.get("description", "Unknown")}

**Expected Basin Behavior:**
{info.get("expected_behavior", "Unknown")}

**Similar Query Examples:**
{info.get("examples", "None")}

**Classification Confidence:** {result["confidence"]:.2f}

**Key Indicators Found:**
{chr(10).join(f"- {ind}" for ind in result.get("indicators", []))}
"""
        return output

    except Exception as e:
        return f"Error classifying query: {str(e)}"


async def get_basin_metrics(analysis_id: str) -> str:
    """Get detailed metrics from previous analysis."""
    try:
        result = analyzer.get_stored_analysis(analysis_id)

        if not result:
            return f"Analysis not found: {analysis_id}"

        output = f"""**Detailed Basin Metrics**

**Analysis ID:** {analysis_id}
**Query:** {result["query"][:100]}...

**Raw Metrics:**
- Sample Count: {result["sample_count"]}
- Epsilon: {result["epsilon"]:.4f}
- N Basins: {result["n_basins"]}
- Coherence: {result["coherence"]:.4f}
- Silhouette Score: {result.get("silhouette", "N/A")}

**Individual Responses:**
"""
        for i, resp in enumerate(result.get("responses", [])[:3], 1):
            output += f"\n**Response {i}:**\n{resp[:200]}...\n"

        output += f"""
**Cluster Assignments:**
{result.get("cluster_assignments", "N/A")}

**Centroid Distances:**
{result.get("centroid_distances", "N/A")}
"""
        return output

    except Exception as e:
        return f"Error retrieving metrics: {str(e)}"


async def compare_responses(response_a: str, response_b: str) -> str:
    """Compare two responses for similarity."""
    try:
        result = await analyzer.compare_responses(response_a, response_b)

        similarity_bar = "█" * int(result["similarity"] * 10) + "░" * (10 - int(result["similarity"] * 10))

        output = f"""**Response Comparison**

**Similarity Score:** {result["similarity"]:.3f}
[{similarity_bar}] {result["similarity"]*100:.1f}%

**Interpretation:** {result["interpretation"]}

**Key Differences:**
{chr(10).join(f"- {diff}" for diff in result.get("differences", ["None identified"]))}

**Common Elements:**
{chr(10).join(f"- {common}" for common in result.get("common_elements", ["None identified"]))}
"""
        return output

    except Exception as e:
        return f"Error comparing responses: {str(e)}"


# Tool dispatcher
TOOL_HANDLERS = {
    "measure_confidence": measure_confidence,
    "analyze_query_type": analyze_query_type,
    "get_basin_metrics": get_basin_metrics,
    "compare_responses": compare_responses
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
                "serverInfo": {"name": "basin-analyzer", "version": "1.0.0"}
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
    """Verify authorization token from request."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        if token == AUTH_TOKEN:
            return True
    api_key = request.headers.get("api_key", "")
    if api_key == AUTH_TOKEN:
        return True
    if request.query.get("api_key") == AUTH_TOKEN:
        return True
    if not AUTH_TOKEN:
        return True
    return False


async def handle_sse_get(request):
    """SSE endpoint (GET - establish connection)."""
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    session_id = str(uuid.uuid4())

    response = web.StreamResponse(
        status=200,
        reason='OK',
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
        endpoint_url = f"/sse?session_id={session_id}"
        await response.write(f"event: endpoint\ndata: {endpoint_url}\n\n".encode())

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
    """
    Handle POST to /sse for MCP SSE transport.

    Per MCP SSE spec: Client POSTs to the endpoint URL received from the SSE stream.
    Response is sent back via the SSE stream, not as HTTP response body.
    """
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
        session_id = request.query.get("session_id")

        response_data = await handle_mcp_request(data, session_id)

        if response_data and session_id and session_id in SSE_SESSIONS:
            # Send response via SSE stream
            sse_response = SSE_SESSIONS.get(session_id)
            if sse_response:
                msg = json.dumps(response_data)
                await sse_response.write(f"event: message\ndata: {msg}\n\n".encode())
            return web.Response(status=202)
        elif response_data:
            # No session - return JSON directly (fallback)
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
    else:
        return web.Response(status=405)


async def handle_messages(request):
    """
    Handle POST messages from MCP client.

    Per MCP spec: Client POSTs JSON-RPC requests here,
    server sends responses via the SSE connection.
    """
    session_id = request.query.get("session_id")

    if not session_id or session_id not in SSE_SESSIONS:
        return web.json_response(
            {"error": "Invalid or expired session"},
            status=400
        )

    try:
        data = await request.json()

        # Handle the MCP request
        response_data = await handle_mcp_request(data, session_id)

        if response_data:
            # Send response via SSE
            sse_response = SSE_SESSIONS.get(session_id)
            if sse_response:
                msg = json.dumps(response_data)
                await sse_response.write(f"event: message\ndata: {msg}\n\n".encode())

        # Return 202 Accepted per MCP spec
        return web.Response(status=202)

    except Exception as e:
        return web.json_response(
            {"error": str(e)},
            status=500
        )


async def handle_health(request):
    """Health check endpoint."""
    return web.json_response({
        "status": "healthy",
        "service": "basin-analyzer-mcp",
        "tools": len(TOOLS),
        "voyage_key_configured": bool(VOYAGE_API_KEY),
        "deepseek_key_configured": bool(DEEPSEEK_API_KEY),
        "active_sessions": len(SSE_SESSIONS)
    })


async def handle_cors_preflight(request):
    """Handle CORS preflight requests."""
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

    # Routes - MCP SSE Transport (supports both legacy SSE and Streamable HTTP)
    app.router.add_get("/sse", handle_sse)
    app.router.add_post("/sse", handle_sse)
    app.router.add_options("/sse", handle_cors_preflight)
    app.router.add_post("/messages", handle_messages)
    app.router.add_options("/messages", handle_cors_preflight)

    # Health check
    app.router.add_get("/health", handle_health)

    return app


if __name__ == "__main__":
    print("=" * 60)
    print("Basin Analyzer MCP Server")
    print("=" * 60)
    print(f"Port: {SERVER_PORT}")
    print(f"SSE endpoint: http://0.0.0.0:{SERVER_PORT}/sse")
    print(f"Health check: http://0.0.0.0:{SERVER_PORT}/health")
    print(f"Voyage API Key configured: {bool(VOYAGE_API_KEY)}")
    print(f"DeepSeek API Key configured: {bool(DEEPSEEK_API_KEY)}")
    print("=" * 60)

    app = create_app()
    web.run_app(app, host="0.0.0.0", port=SERVER_PORT)
