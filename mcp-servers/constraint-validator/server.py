"""
Constraint Validator MCP Server (HTTP+SSE Transport)

Validates logical consistency of legal constraints using Z3 SMT solver.
Returns UNSAT cores mapped to source documents for court-ready explanations.

Tools:
- extract_constraints: Extract logical rules from findings with provenance
- validate_consistency: Z3 SAT check on constraints
- explain_conflict: Map UNSAT core to source documents
- rank_by_authority: Apply legal hierarchy to conflicts
"""

import os
import json
import asyncio
import uuid
from typing import Dict, Any, List
from aiohttp import web

from constraint_extractor import ConstraintExtractor, Constraint
from z3_validator import Z3Validator, ValidationResult
from authority_model import AuthorityRanker


# Configuration
SERVER_PORT = int(os.environ.get("MCP_SERVER_PORT", "9385"))
LITELLM_URL = os.environ.get("LITELLM_URL", "http://litellm:4000")
LITELLM_API_KEY = os.environ.get("LITELLM_API_KEY", "sk-1234")
AUTH_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")

# Store active SSE sessions
SSE_SESSIONS: Dict[str, Any] = {}

# Store constraint extraction results for retrieval
EXTRACTION_CACHE: Dict[str, List[Dict]] = {}

# Initialize components
extractor = ConstraintExtractor(litellm_url=LITELLM_URL, api_key=LITELLM_API_KEY)
validator = Z3Validator()
authority_ranker = AuthorityRanker()


# Tool definitions for MCP
TOOLS = [
    {
        "name": "extract_constraints",
        "description": "Extract logical constraints from investigation findings. Uses LLM to convert natural language findings into formal logic with full provenance tracking. Returns constraints with variables, logic forms, and source citations.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "findings": {
                    "type": "array",
                    "description": "Array of finding objects with 'quote', 'document', 'significance' fields",
                    "items": {
                        "type": "object",
                        "properties": {
                            "quote": {"type": "string"},
                            "document": {"type": "string"},
                            "significance": {"type": "string"},
                            "entities": {"type": "array", "items": {"type": "string"}}
                        }
                    }
                },
                "sources": {
                    "type": "array",
                    "description": "Optional source documents for additional context",
                    "items": {"type": "object"}
                }
            },
            "required": ["findings"]
        }
    },
    {
        "name": "validate_consistency",
        "description": "Check if constraints are logically consistent using Z3 SMT solver. Returns satisfiability status. If UNSAT, returns the conflicting constraint IDs (UNSAT core) that can be mapped back to source documents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "constraints": {
                    "type": "array",
                    "description": "Array of constraint objects from extract_constraints",
                    "items": {"type": "object"}
                },
                "include_soft": {
                    "type": "boolean",
                    "description": "Whether to include soft constraints (default: false, hard only)",
                    "default": False
                }
            },
            "required": ["constraints"]
        }
    },
    {
        "name": "explain_conflict",
        "description": "Map UNSAT core constraint IDs back to source documents with detailed explanations. Includes provenance (document, paragraph, quote) for each conflicting constraint.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "unsat_core": {
                    "type": "array",
                    "description": "Array of constraint IDs from validate_consistency UNSAT result",
                    "items": {"type": "string"}
                },
                "constraints": {
                    "type": "array",
                    "description": "Full constraint list for provenance lookup",
                    "items": {"type": "object"}
                }
            },
            "required": ["unsat_core", "constraints"]
        }
    },
    {
        "name": "rank_by_authority",
        "description": "Rank constraints by legal authority level (Supreme Court > Circuit > District > etc). Used to resolve conflicts when higher authority overrides lower.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "constraints": {
                    "type": "array",
                    "description": "Array of constraint objects with source provenance",
                    "items": {"type": "object"}
                }
            },
            "required": ["constraints"]
        }
    }
]


# ============================================================================
# Tool Implementations
# ============================================================================

async def extract_constraints_tool(findings: List[Dict], sources: List[Dict] = None) -> str:
    """Extract logical constraints from findings."""
    try:
        constraints = await extractor.extract_constraints(findings, sources)

        # Store in cache for later retrieval
        cache_id = str(uuid.uuid4())[:8]
        EXTRACTION_CACHE[cache_id] = [c.to_dict() for c in constraints]

        # Format output
        output = f"""**Constraint Extraction Results**

**Extraction ID:** {cache_id}
**Constraints Found:** {len(constraints)}

"""
        for i, c in enumerate(constraints, 1):
            prov = c.provenance
            source_info = f"{prov.doc_title}" if prov else "Unknown source"

            output += f"""**Constraint {i}:** {c.id}
- Type: {c.constraint_type.value}
- Subject: {c.subject}
- Logic: `{c.logic_form}`
- Natural: "{c.natural_language}"
- Confidence: {c.confidence:.2f}
- Hard Constraint: {c.is_hard}
- Source: {source_info}
- Variables: {', '.join(c.variables)}

"""

        output += f"""
**Raw JSON (for validate_consistency):**
```json
{json.dumps([c.to_dict() for c in constraints], indent=2, default=str)}
```
"""
        return output

    except Exception as e:
        return f"Error extracting constraints: {str(e)}"


async def validate_consistency_tool(constraints: List[Dict], include_soft: bool = False) -> str:
    """Validate constraint consistency with Z3."""
    try:
        # Convert dicts back to Constraint objects
        constraint_objects = []
        for cd in constraints:
            from constraint_extractor import ConstraintType, Provenance

            prov = None
            if cd.get('provenance'):
                p = cd['provenance']
                prov = Provenance(
                    doc_id=p.get('doc_id', ''),
                    doc_title=p.get('doc_title', ''),
                    paragraph=p.get('paragraph'),
                    page=p.get('page'),
                    quote=p.get('quote', ''),
                    court=p.get('court'),
                    date=p.get('date'),
                    doc_type=p.get('doc_type')
                )

            c = Constraint(
                id=cd.get('id', f'c_{len(constraint_objects)}'),
                constraint_type=ConstraintType(cd.get('constraint_type', 'assertion')),
                subject=cd.get('subject', ''),
                predicate=cd.get('predicate'),
                variables=cd.get('variables', []),
                logic_form=cd.get('logic_form', ''),
                natural_language=cd.get('natural_language', ''),
                confidence=cd.get('confidence', 0.8),
                provenance=prov,
                is_hard=cd.get('is_hard', True)
            )
            constraint_objects.append(c)

        # Validate
        result = validator.validate_consistency(constraint_objects, include_soft)

        # Format output
        if result.satisfiable:
            status_emoji = ""
            status_text = "SATISFIABLE (All constraints are logically consistent)"
        else:
            status_emoji = ""
            status_text = f"UNSATISFIABLE ({len(result.unsat_core or [])} conflicting constraints)"

        output = f"""**Z3 Validation Results**

{status_emoji} **Status: {status_text}**

**Constraints Checked:** {len(constraint_objects)}
**Include Soft Constraints:** {include_soft}

"""

        if result.satisfiable and result.model:
            output += "**Variable Assignments (Model):**\n"
            for var, val in result.model.items():
                output += f"- {var} = {val}\n"

        if not result.satisfiable and result.unsat_core:
            output += "**Conflicting Constraints (UNSAT Core):**\n"
            for cid in result.unsat_core:
                output += f"- {cid}\n"

            output += "\n**Use explain_conflict to get detailed provenance.**\n"

        if result.conflicts:
            output += "\n**Conflict Details:**\n"
            for conflict in result.conflicts:
                output += f"""
---
**Conflict Type:** {conflict.get('conflict_type', 'unknown')}
**Explanation:** {conflict.get('explanation', 'No explanation')}
**Authority Resolution:** {conflict.get('authority_resolution', 'None available')}
**Can Resolve:** {conflict.get('resolution_available', False)}
"""

        output += f"""
**Raw Result (JSON):**
```json
{json.dumps(result.to_dict(), indent=2, default=str)}
```
"""
        return output

    except Exception as e:
        import traceback
        return f"Error validating constraints: {str(e)}\n{traceback.format_exc()}"


async def explain_conflict_tool(unsat_core: List[str], constraints: List[Dict]) -> str:
    """Explain conflicts with provenance."""
    try:
        # Convert dicts to Constraint objects
        from constraint_extractor import ConstraintType, Provenance

        constraint_objects = []
        for cd in constraints:
            prov = None
            if cd.get('provenance'):
                p = cd['provenance']
                prov = Provenance(
                    doc_id=p.get('doc_id', ''),
                    doc_title=p.get('doc_title', ''),
                    paragraph=p.get('paragraph'),
                    page=p.get('page'),
                    quote=p.get('quote', ''),
                    court=p.get('court'),
                    date=p.get('date'),
                    doc_type=p.get('doc_type')
                )

            c = Constraint(
                id=cd.get('id', ''),
                constraint_type=ConstraintType(cd.get('constraint_type', 'assertion')),
                subject=cd.get('subject', ''),
                predicate=cd.get('predicate'),
                variables=cd.get('variables', []),
                logic_form=cd.get('logic_form', ''),
                natural_language=cd.get('natural_language', ''),
                confidence=cd.get('confidence', 0.8),
                provenance=prov,
                is_hard=cd.get('is_hard', True)
            )
            constraint_objects.append(c)

        # Get explanations
        explanations = validator.explain_conflict(unsat_core, constraint_objects)

        output = f"""**Conflict Explanation Report**

**Conflicting Constraint IDs:** {', '.join(unsat_core)}
**Conflicts Found:** {len(explanations)}

"""
        for i, exp in enumerate(explanations, 1):
            ca = exp.get('constraint_a', {})
            cb = exp.get('constraint_b', {})

            prov_a = ca.get('provenance', {})
            prov_b = cb.get('provenance', {})

            output += f"""
## Conflict {i}: {exp.get('conflict_type', 'unknown')}

### Statement A:
- **Document:** {prov_a.get('doc_title', 'Unknown')}
- **Quote:** "{prov_a.get('quote', 'N/A')[:200]}..."
- **Claim:** {ca.get('natural_language', 'N/A')}
- **Logic:** `{ca.get('logic_form', 'N/A')}`

### Statement B:
- **Document:** {prov_b.get('doc_title', 'Unknown')}
- **Quote:** "{prov_b.get('quote', 'N/A')[:200]}..."
- **Claim:** {cb.get('natural_language', 'N/A')}
- **Logic:** `{cb.get('logic_form', 'N/A')}`

### Analysis:
{exp.get('explanation', 'No explanation available')}

### Authority Resolution:
{exp.get('authority_resolution', 'No authority-based resolution available')}

---
"""

        return output

    except Exception as e:
        return f"Error explaining conflict: {str(e)}"


async def rank_by_authority_tool(constraints: List[Dict]) -> str:
    """Rank constraints by legal authority."""
    try:
        # Extract sources for ranking
        sources_with_constraints = []
        for cd in constraints:
            prov = cd.get('provenance', {})
            source = {
                'doc_title': prov.get('doc_title', ''),
                'court': prov.get('court', ''),
                'quote': prov.get('quote', ''),
                'doc_type': prov.get('doc_type', '')
            }
            sources_with_constraints.append({
                'constraint': cd,
                'source': source
            })

        # Rank by authority
        ranked = authority_ranker.rank_constraints(
            [{'source': s['source'], **s['constraint']} for s in sources_with_constraints]
        )

        output = """**Authority Ranking Results**

Constraints ranked by legal authority (highest first):

"""
        for i, item in enumerate(ranked, 1):
            source = item.get('source', {})
            auth = authority_ranker.detect_authority(source)

            output += f"""**{i}. {auth.level.name}** (Level {auth.level.value})
- Document: {source.get('doc_title', 'Unknown')}
- Court: {auth.court_name or 'N/A'}
- Jurisdiction: {auth.jurisdiction or 'N/A'}
- Binding: {auth.binding}
- Constraint: {item.get('natural_language', 'N/A')}

"""

        return output

    except Exception as e:
        return f"Error ranking by authority: {str(e)}"


# Tool dispatcher
TOOL_HANDLERS = {
    "extract_constraints": extract_constraints_tool,
    "validate_consistency": validate_consistency_tool,
    "explain_conflict": explain_conflict_tool,
    "rank_by_authority": rank_by_authority_tool
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
                "serverInfo": {"name": "constraint-validator", "version": "1.0.0"}
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
    """Handle POST to /sse for MCP SSE transport."""
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
        session_id = request.query.get("session_id")

        response_data = await handle_mcp_request(data, session_id)

        if response_data and session_id and session_id in SSE_SESSIONS:
            sse_response = SSE_SESSIONS.get(session_id)
            if sse_response:
                msg = json.dumps(response_data)
                await sse_response.write(f"event: message\ndata: {msg}\n\n".encode())
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
    else:
        return web.Response(status=405)


async def handle_messages(request):
    """Handle POST messages from MCP client."""
    session_id = request.query.get("session_id")

    if not session_id or session_id not in SSE_SESSIONS:
        return web.json_response({"error": "Invalid or expired session"}, status=400)

    try:
        data = await request.json()
        response_data = await handle_mcp_request(data, session_id)

        if response_data:
            sse_response = SSE_SESSIONS.get(session_id)
            if sse_response:
                msg = json.dumps(response_data)
                await sse_response.write(f"event: message\ndata: {msg}\n\n".encode())

        return web.Response(status=202)

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_health(request):
    """Health check endpoint."""
    return web.json_response({
        "status": "healthy",
        "service": "constraint-validator-mcp",
        "tools": len(TOOLS),
        "litellm_url": LITELLM_URL,
        "active_sessions": len(SSE_SESSIONS),
        "cached_extractions": len(EXTRACTION_CACHE)
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

    # Routes
    app.router.add_get("/sse", handle_sse)
    app.router.add_post("/sse", handle_sse)
    app.router.add_options("/sse", handle_cors_preflight)
    app.router.add_post("/messages", handle_messages)
    app.router.add_options("/messages", handle_cors_preflight)
    app.router.add_get("/health", handle_health)

    return app


if __name__ == "__main__":
    print("=" * 60)
    print("Constraint Validator MCP Server")
    print("=" * 60)
    print(f"Port: {SERVER_PORT}")
    print(f"SSE endpoint: http://0.0.0.0:{SERVER_PORT}/sse")
    print(f"Health check: http://0.0.0.0:{SERVER_PORT}/health")
    print(f"LiteLLM URL: {LITELLM_URL}")
    print("=" * 60)

    app = create_app()
    web.run_app(app, host="0.0.0.0", port=SERVER_PORT)
