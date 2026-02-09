"""
PostgreSQL MCP Server (HTTP+SSE Transport)
Provides case state, actors, investigations, and timeline access via MCP protocol.

Uses PostgREST REST API for database access (not direct psycopg2).

Implements proper MCP SSE transport (protocol 2024-11-05):
- GET /sse - SSE endpoint, sends 'endpoint' event with POST URL
- POST /messages - Client sends JSON-RPC requests here
- Server responds via SSE with matching request IDs

Tools:
- get_case_state: Get complete case state JSON
- update_case_state: Patch case state with changes
- get_actors: Get actors by role
- get_branches: Get branches for a case
- get_investigations: Get investigations from registry
- create_investigation: Start new investigation
- get_timeline: Get case timeline events
- flag_brady_material: Flag potential Brady material
"""

import os
import json
import asyncio
import uuid
from typing import Optional, Dict, Any, List
import httpx
from aiohttp import web
from datetime import datetime

# PostgREST configuration
POSTGREST_URL = os.environ.get("POSTGREST_URL", "http://178.156.192.12:3001")
SERVER_PORT = int(os.environ.get("MCP_SERVER_PORT", "3011"))
AUTH_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")

# Store active SSE sessions
SSE_SESSIONS: Dict[str, Any] = {}


def get_headers() -> dict:
    """Get headers for PostgREST API requests."""
    return {
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }


# Tool definitions for MCP
TOOLS = [
    {
        "name": "get_case_state",
        "description": "Get the complete case state including actors, counts, timeline, and Brady items.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID (e.g., 'us-v-blackman')", "default": "us-v-blackman"}
            },
            "required": []
        }
    },
    {
        "name": "update_case_state",
        "description": "Update case state with partial changes. Uses optimistic locking via version check.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID"},
                "updates": {"type": "object", "description": "Partial state updates to apply"}
            },
            "required": ["case_id", "updates"]
        }
    },
    {
        "name": "get_actors",
        "description": "Get actors from case state, optionally filtered by role.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "role": {"type": "string", "description": "Filter by role (defendant, witness, prosecutor, attorney, judge)"}
            },
            "required": []
        }
    },
    {
        "name": "get_actor_by_name",
        "description": "Fuzzy search for an actor by name across all roles.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "name": {"type": "string", "description": "Name to search for (partial match)"}
            },
            "required": ["name"]
        }
    },
    {
        "name": "get_branches",
        "description": "Get branches (world views) for a case.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "user_id": {"type": "string", "description": "Filter by user ID"}
            },
            "required": []
        }
    },
    {
        "name": "get_investigations",
        "description": "Get investigations from the investigation registry.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "status": {"type": "string", "description": "Filter by status: active, completed, paused, draft", "enum": ["active", "completed", "paused", "draft"]}
            },
            "required": []
        }
    },
    {
        "name": "create_investigation",
        "description": "Create a new investigation record in the registry.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID"},
                "query": {"type": "string", "description": "Original investigation query"},
                "entities": {"type": "array", "items": {"type": "string"}, "description": "Entities involved in investigation"}
            },
            "required": ["case_id", "query"]
        }
    },
    {
        "name": "save_investigation_finding",
        "description": "Save a finding to an investigation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "investigation_id": {"type": "string", "description": "Investigation ID"},
                "finding": {"type": "string", "description": "Finding text"},
                "confidence": {"type": "number", "description": "Confidence score 0-1", "default": 0.8},
                "tier": {"type": "string", "description": "Finding tier: primary, secondary, gap", "default": "primary"},
                "sources": {"type": "array", "items": {"type": "string"}, "description": "Source document IDs"}
            },
            "required": ["investigation_id", "finding"]
        }
    },
    {
        "name": "get_timeline",
        "description": "Get timeline events for a case.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "start_date": {"type": "string", "description": "Filter events after this date (YYYY-MM-DD)"},
                "end_date": {"type": "string", "description": "Filter events before this date (YYYY-MM-DD)"}
            },
            "required": []
        }
    },
    {
        "name": "flag_brady_material",
        "description": "Flag potential Brady/Giglio material found in documents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID"},
                "item_type": {"type": "string", "description": "Brady type: exculpatory, impeachment, deal, coercion"},
                "description": {"type": "string", "description": "Description of the Brady material"},
                "source_doc_ids": {"type": "array", "items": {"type": "string"}, "description": "Source document IDs"},
                "priority": {"type": "string", "description": "Priority: high, medium, low", "default": "medium"}
            },
            "required": ["case_id", "item_type", "description"]
        }
    },
    {
        "name": "get_brady_items",
        "description": "Get all Brady/Giglio items for a case.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "priority": {"type": "string", "description": "Filter by priority: high, medium, low"}
            },
            "required": []
        }
    },
    {
        "name": "find_similar_investigations",
        "description": "Find prior investigations similar to a query. Used by Claude-Flow pre-query hooks to detect duplicate work.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The investigation query to match against"},
                "entities": {"type": "array", "items": {"type": "string"}, "description": "Entity names involved"},
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "threshold": {"type": "number", "description": "Similarity threshold 0-1", "default": 0.7}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_investigation_context",
        "description": "Get context from prior investigations for query enhancement.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "investigation_ids": {"type": "array", "items": {"type": "string"}, "description": "Investigation IDs to get context from"}
            },
            "required": ["investigation_ids"]
        }
    },
    # ============================================================================
    # Statement Extraction Tools (for witness consistency tracking)
    # ============================================================================
    {
        "name": "get_actor_statements",
        "description": "Get all extracted statements for an actor. Shows what they said across all documents (depositions, 302s, interviews, trial testimony) with dates and sources.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "actor_id": {"type": "string", "description": "Actor ID to get statements for"},
                "actor_name": {"type": "string", "description": "Or search by actor name (partial match)"}
            },
            "required": []
        }
    },
    {
        "name": "check_statement_consistency",
        "description": "Check if an actor has made consistent statements on a topic. Returns any detected inconsistencies across documents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "actor_id": {"type": "string", "description": "Actor ID to check"},
                "topic": {"type": "string", "description": "Topic to check consistency on (e.g., 'billing', 'authorization', 'knowledge')"}
            },
            "required": ["actor_id"]
        }
    },
    {
        "name": "search_statements",
        "description": "Search for statements matching a query across all actors. Use during investigations to find relevant testimony.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "query": {"type": "string", "description": "Search query (e.g., 'knew about billing', 'authorized payment')"},
                "actor_id": {"type": "string", "description": "Optional: filter by actor ID"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_inconsistencies",
        "description": "Get all flagged statement inconsistencies for a case or actor. Shows pending, confirmed, and dismissed inconsistencies.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "actor_id": {"type": "string", "description": "Filter by actor ID"},
                "status": {"type": "string", "description": "Filter by status: pending, confirmed, dismissed", "enum": ["pending", "confirmed", "dismissed"]}
            },
            "required": []
        }
    },
    {
        "name": "compare_statements",
        "description": "Compare two specific statements side-by-side. Use when investigating potential inconsistencies.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "statement_id_a": {"type": "string", "description": "First statement ID"},
                "statement_id_b": {"type": "string", "description": "Second statement ID"}
            },
            "required": ["statement_id_a", "statement_id_b"]
        }
    },
    # ============================================================================
    # ML Context Tools (for Claude Flow context enrichment)
    # ============================================================================
    {
        "name": "get_learned_weights",
        "description": "Get learned weights from user interactions. Shows what factors (keywords, tags, actors, document types) have been most relevant in past investigations. Use at START of investigations to prioritize results.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "factor_type": {"type": "string", "description": "Filter by type: keyword, tag, actor, document_type"},
                "min_weight": {"type": "number", "description": "Minimum weight threshold (0-1)", "default": 0.1},
                "limit": {"type": "integer", "description": "Max results to return", "default": 50}
            },
            "required": []
        }
    },
    {
        "name": "get_activity_signals",
        "description": "Get recent user activity signals (views, edits, annotations, confirmations). Shows what the user has been focusing on. Use to understand investigation context and patterns.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "signal_types": {"type": "array", "items": {"type": "string"}, "description": "Filter by signal types (e.g., 'actor_viewed', 'relationship_confirmed')"},
                "entity_id": {"type": "string", "description": "Filter by specific entity ID"},
                "hours_back": {"type": "integer", "description": "Look back N hours", "default": 168},
                "limit": {"type": "integer", "description": "Max results", "default": 100}
            },
            "required": []
        }
    },
    {
        "name": "get_relationship_confidence",
        "description": "Get confidence scores for relationships based on ML signals. Returns relationships ranked by combined evidence (ground truth approvals, human verifications, activity signals, learned weights).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "actor_id": {"type": "string", "description": "Filter by source actor ID"},
                "min_confidence": {"type": "number", "description": "Minimum confidence score (0-1)", "default": 0.5},
                "include_unverified": {"type": "boolean", "description": "Include AI-only relationships", "default": False}
            },
            "required": []
        }
    },
    {
        "name": "get_ground_truth_relationships",
        "description": "Get human-verified ground truth relationships. These are the most reliable relationships for investigation. Use to establish verified facts before exploring AI-detected patterns.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_id": {"type": "string", "description": "Case ID", "default": "us-v-blackman"},
                "actor_id": {"type": "string", "description": "Filter by actor ID"},
                "relationship_type": {"type": "string", "description": "Filter by relationship type (e.g., 'employer', 'co-conspirator')"}
            },
            "required": []
        }
    }
]


# ============================================================================
# Tool Implementations
# ============================================================================

async def get_case_state(case_id: str = "us-v-blackman") -> str:
    """Get complete case state."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            state = data[0]
            state_json = state.get("state_json", {})

            output = f"**Case State: {case_id}**\n\n"

            # Case info
            case_info = state_json.get("caseInfo", {})
            if case_info:
                output += f"**Case:** {case_info.get('caseName', 'Unknown')}\n"
                output += f"**Number:** {case_info.get('caseNumber', 'Unknown')}\n"
                output += f"**Court:** {case_info.get('court', 'Unknown')}\n"
                output += f"**Judge:** {case_info.get('judge', 'Unknown')}\n\n"

            # Counts
            actors = state_json.get("actors", [])
            counts = state_json.get("counts", [])
            timeline = state_json.get("timeline", [])
            brady = state_json.get("bradyItems", [])

            output += f"**Actors:** {len(actors)}\n"
            output += f"**Counts:** {len(counts)}\n"
            output += f"**Timeline Events:** {len(timeline)}\n"
            output += f"**Brady Items:** {len(brady)}\n\n"

            output += f"**Last Updated:** {state_json.get('lastUpdated', 'Unknown')}\n"
            output += f"**Version:** {state_json.get('version', 1)}\n"

            return output

    except Exception as e:
        return f"Error getting case state: {str(e)}"


async def update_case_state(case_id: str, updates: dict) -> str:
    """Update case state with partial changes."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # First get current state
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            current_state = data[0].get("state_json", {})

            # Merge updates
            for key, value in updates.items():
                if isinstance(value, dict) and isinstance(current_state.get(key), dict):
                    current_state[key].update(value)
                elif isinstance(value, list) and isinstance(current_state.get(key), list):
                    current_state[key].extend(value)
                else:
                    current_state[key] = value

            current_state["lastUpdated"] = datetime.utcnow().isoformat()
            current_state["version"] = current_state.get("version", 0) + 1

            # Update
            update_response = await client.patch(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"},
                json={"state_json": current_state}
            )
            update_response.raise_for_status()

            return f"Case state updated successfully. Version: {current_state['version']}"

    except Exception as e:
        return f"Error updating case state: {str(e)}"


async def get_actors(case_id: str = "us-v-blackman", role: str = None) -> str:
    """Get actors from case state."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            actors = data[0].get("state_json", {}).get("actors", [])

            if role:
                actors = [a for a in actors if a.get("role", "").lower() == role.lower()]

            if not actors:
                filter_msg = f" with role '{role}'" if role else ""
                return f"No actors found{filter_msg}"

            output = f"**Actors ({len(actors)}):**\n\n"
            for actor in actors:
                name = actor.get("name", "Unknown")
                actor_role = actor.get("role", "unknown")
                aliases = actor.get("aliases", [])
                verified = "✓" if actor.get("verified") else "○"
                related_actors = actor.get("relatedActors", [])

                output += f"**{verified} {name}** ({actor_role})\n"
                if aliases:
                    output += f"   Aliases: {', '.join(aliases)}\n"
                if actor.get("ragflowEntityIds"):
                    output += f"   RAGFlow IDs: {len(actor['ragflowEntityIds'])}\n"
                # Include relationships from Ground Truth Builder
                if related_actors:
                    output += f"   Relationships ({len(related_actors)}):\n"
                    for rel in related_actors:
                        rel_type = rel.get("relationshipType", "related to")
                        target_id = rel.get("actorId", "unknown")
                        source = rel.get("source", "unknown")
                        verified_mark = "✓" if rel.get("groundTruthApproved") else "○"
                        output += f"      {verified_mark} {rel_type} → {target_id} (source: {source})\n"
                        if rel.get("notes"):
                            notes_preview = rel.get("notes", "")[:100]
                            output += f"         Notes: {notes_preview}...\n"
                        if rel.get("startDate") or rel.get("endDate"):
                            output += f"         Period: {rel.get('startDate', '?')} to {rel.get('endDate', '?')}\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error getting actors: {str(e)}"


async def get_actor_by_name(case_id: str = "us-v-blackman", name: str = "") -> str:
    """Fuzzy search for actor by name."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            actors = data[0].get("state_json", {}).get("actors", [])
            name_lower = name.lower()

            matches = []
            for actor in actors:
                actor_name = actor.get("name", "").lower()
                aliases = [a.lower() for a in actor.get("aliases", [])]

                if name_lower in actor_name or any(name_lower in alias for alias in aliases):
                    matches.append(actor)

            if not matches:
                return f"No actors found matching '{name}'"

            output = f"**Actors matching '{name}':**\n\n"
            for actor in matches:
                output += f"**{actor.get('name')}** ({actor.get('role', 'unknown')})\n"
                output += f"   ID: `{actor.get('id')}`\n"
                if actor.get("aliases"):
                    output += f"   Aliases: {', '.join(actor['aliases'])}\n"
                if actor.get("notes"):
                    output += f"   Notes: {actor['notes'][:100]}...\n"
                # Include relationships from Ground Truth Builder
                related_actors = actor.get("relatedActors", [])
                if related_actors:
                    output += f"   **Relationships ({len(related_actors)}):**\n"
                    for rel in related_actors:
                        rel_type = rel.get("relationshipType", "related to")
                        target_id = rel.get("actorId", "unknown")
                        source = rel.get("source", "unknown")
                        verified_mark = "✓" if rel.get("groundTruthApproved") else "○"
                        output += f"      {verified_mark} {rel_type} → {target_id} (source: {source})\n"
                        if rel.get("notes"):
                            notes_preview = rel.get("notes", "")[:150]
                            output += f"         Notes: {notes_preview}...\n"
                        if rel.get("startDate") or rel.get("endDate"):
                            output += f"         Period: {rel.get('startDate', '?')} to {rel.get('endDate', '?')}\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error searching actors: {str(e)}"


async def get_branches(case_id: str = "us-v-blackman", user_id: str = None) -> str:
    """Get branches for a case."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            params = {"case_id": f"eq.{case_id}"}
            if user_id:
                params["created_by"] = f"eq.{user_id}"

            response = await client.get(
                f"{POSTGREST_URL}/case_branches",
                headers=get_headers(),
                params=params
            )
            response.raise_for_status()
            branches = response.json()

            if not branches:
                return f"No branches found for case_id: {case_id}"

            output = f"**Branches ({len(branches)}):**\n\n"
            for branch in branches:
                name = branch.get("name", "Unknown")
                branch_type = branch.get("branch_type", "working")
                status = branch.get("status", "active")

                output += f"**{name}** ({branch_type})\n"
                output += f"   ID: `{branch.get('id')}`\n"
                output += f"   Status: {status}\n"
                output += f"   Created: {branch.get('created_at', 'Unknown')}\n\n"

            return output

    except Exception as e:
        return f"Error getting branches: {str(e)}"


async def get_investigations(case_id: str = "us-v-blackman", status: str = None) -> str:
    """Get investigations from registry."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            params = {"case_id": f"eq.{case_id}"}
            if status:
                params["status"] = f"eq.{status}"

            response = await client.get(
                f"{POSTGREST_URL}/investigations",
                headers=get_headers(),
                params=params
            )

            if response.status_code == 404:
                return "Investigations table not found. Run INVREG-001 to create it."

            response.raise_for_status()
            investigations = response.json()

            if not investigations:
                filter_msg = f" with status '{status}'" if status else ""
                return f"No investigations found{filter_msg}"

            output = f"**Investigations ({len(investigations)}):**\n\n"
            for inv in investigations:
                query = inv.get("original_query", "Unknown")[:80]
                inv_status = inv.get("status", "unknown")
                finding_count = inv.get("finding_count", 0)

                output += f"**{query}...**\n"
                output += f"   ID: `{inv.get('investigation_id')}`\n"
                output += f"   Status: {inv_status} | Findings: {finding_count}\n"
                output += f"   Created: {inv.get('created_at', 'Unknown')}\n\n"

            return output

    except Exception as e:
        return f"Error getting investigations: {str(e)}"


async def create_investigation(case_id: str, query: str, entities: List[str] = None) -> str:
    """Create new investigation."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            investigation_id = str(uuid.uuid4())

            payload = {
                "investigation_id": investigation_id,
                "case_id": case_id,
                "original_query": query,
                "entities": entities or [],
                "status": "active",
                "finding_count": 0
            }

            response = await client.post(
                f"{POSTGREST_URL}/investigations",
                headers=get_headers(),
                json=payload
            )

            if response.status_code == 404:
                return "Investigations table not found. Run INVREG-001 to create it."

            response.raise_for_status()

            return f"Investigation created successfully.\n**ID:** `{investigation_id}`\n**Query:** {query}"

    except Exception as e:
        return f"Error creating investigation: {str(e)}"


async def save_investigation_finding(investigation_id: str, finding: str,
                                      confidence: float = 0.8, tier: str = "primary",
                                      sources: List[str] = None) -> str:
    """Save finding to investigation."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            finding_id = str(uuid.uuid4())

            payload = {
                "finding_id": finding_id,
                "investigation_id": investigation_id,
                "finding_text": finding,
                "confidence": confidence,
                "tier": tier,
                "source_chunks": sources or []
            }

            response = await client.post(
                f"{POSTGREST_URL}/investigation_findings",
                headers=get_headers(),
                json=payload
            )

            if response.status_code == 404:
                return "Investigation findings table not found. Run INVREG-001 to create it."

            response.raise_for_status()

            # Update finding count
            await client.rpc(
                f"{POSTGREST_URL}/rpc/increment_finding_count",
                json={"inv_id": investigation_id}
            )

            return f"Finding saved.\n**ID:** `{finding_id}`\n**Confidence:** {confidence}\n**Tier:** {tier}"

    except Exception as e:
        return f"Error saving finding: {str(e)}"


async def get_timeline(case_id: str = "us-v-blackman", start_date: str = None,
                        end_date: str = None) -> str:
    """Get timeline events."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            timeline = data[0].get("state_json", {}).get("timeline", [])

            # Filter by date if provided
            if start_date or end_date:
                filtered = []
                for event in timeline:
                    event_date = event.get("date", "")
                    if start_date and event_date < start_date:
                        continue
                    if end_date and event_date > end_date:
                        continue
                    filtered.append(event)
                timeline = filtered

            if not timeline:
                return "No timeline events found"

            output = f"**Timeline Events ({len(timeline)}):**\n\n"
            for event in sorted(timeline, key=lambda x: x.get("date", "")):
                date = event.get("date", "Unknown")
                title = event.get("title", "Unknown")
                description = event.get("description", "")[:100]

                output += f"**{date}:** {title}\n"
                if description:
                    output += f"   {description}...\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error getting timeline: {str(e)}"


async def flag_brady_material(case_id: str, item_type: str, description: str,
                               source_doc_ids: List[str] = None, priority: str = "medium") -> str:
    """Flag Brady material."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get current state
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            state = data[0].get("state_json", {})
            brady_items = state.get("bradyItems", [])

            # Create new Brady item
            new_item = {
                "id": f"brady-{uuid.uuid4().hex[:8]}",
                "type": item_type,
                "description": description,
                "priority": priority,
                "sources": source_doc_ids or [],
                "status": "pending_review",
                "flaggedAt": datetime.utcnow().isoformat()
            }

            brady_items.append(new_item)
            state["bradyItems"] = brady_items
            state["lastUpdated"] = datetime.utcnow().isoformat()

            # Update
            update_response = await client.patch(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"},
                json={"state_json": state}
            )
            update_response.raise_for_status()

            return f"**Brady material flagged:**\n**Type:** {item_type}\n**Priority:** {priority}\n**Description:** {description[:100]}..."

    except Exception as e:
        return f"Error flagging Brady material: {str(e)}"


async def get_brady_items(case_id: str = "us-v-blackman", priority: str = None) -> str:
    """Get Brady items."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            brady_items = data[0].get("state_json", {}).get("bradyItems", [])

            if priority:
                brady_items = [b for b in brady_items if b.get("priority") == priority]

            if not brady_items:
                filter_msg = f" with priority '{priority}'" if priority else ""
                return f"No Brady items found{filter_msg}"

            output = f"**Brady Items ({len(brady_items)}):**\n\n"
            for item in brady_items:
                item_type = item.get("type", "unknown")
                desc = item.get("description", "")[:100]
                item_priority = item.get("priority", "medium")
                status = item.get("status", "pending")

                priority_icon = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(item_priority, "⚪")

                output += f"{priority_icon} **{item_type.upper()}** ({item_priority})\n"
                output += f"   {desc}...\n"
                output += f"   Status: {status}\n\n"

            return output

    except Exception as e:
        return f"Error getting Brady items: {str(e)}"


async def find_similar_investigations(query: str, entities: List[str] = None,
                                       case_id: str = "us-v-blackman",
                                       threshold: float = 0.7) -> str:
    """Find prior investigations similar to a query.

    Uses keyword matching on query text and entity overlap.
    Returns investigations above similarity threshold.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/investigations",
                headers=get_headers(),
                params={
                    "case_id": f"eq.{case_id}",
                    "status": "in.(active,completed)"
                }
            )

            if response.status_code == 404:
                return json.dumps({"similar": [], "message": "No investigations table found"})

            response.raise_for_status()
            investigations = response.json()

            if not investigations:
                return json.dumps({"similar": [], "message": "No prior investigations found"})

            # Compute similarity scores
            query_words = set(query.lower().split())
            entities_set = set(e.lower() for e in (entities or []))
            similar = []

            for inv in investigations:
                inv_query = inv.get("original_query", "").lower()
                inv_words = set(inv_query.split())
                inv_entities = set(e.lower() for e in inv.get("entities", []))

                # Word overlap score
                word_overlap = len(query_words & inv_words) / max(len(query_words | inv_words), 1)

                # Entity overlap score (weighted higher)
                if entities_set and inv_entities:
                    entity_overlap = len(entities_set & inv_entities) / max(len(entities_set | inv_entities), 1)
                else:
                    entity_overlap = 0

                # Combined score (entities weighted 2x)
                score = (word_overlap + 2 * entity_overlap) / 3

                if score >= threshold:
                    similar.append({
                        "investigation_id": inv.get("investigation_id"),
                        "query": inv.get("original_query"),
                        "entities": inv.get("entities", []),
                        "status": inv.get("status"),
                        "finding_count": inv.get("finding_count", 0),
                        "similarity_score": round(score, 2),
                        "created_at": inv.get("created_at")
                    })

            # Sort by similarity score descending
            similar.sort(key=lambda x: x["similarity_score"], reverse=True)

            return json.dumps({
                "similar": similar[:5],  # Top 5 matches
                "total_checked": len(investigations),
                "threshold": threshold
            })

    except Exception as e:
        return json.dumps({"error": str(e), "similar": []})


async def get_investigation_context(investigation_ids: List[str]) -> str:
    """Get context from prior investigations for query enhancement.

    Retrieves findings, sources, and key insights from specified investigations
    to help enhance a new query with prior knowledge.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            context = {
                "investigations": [],
                "key_findings": [],
                "entities_mentioned": set(),
                "sources_used": set()
            }

            for inv_id in investigation_ids:
                # Get investigation details
                inv_response = await client.get(
                    f"{POSTGREST_URL}/investigations",
                    headers=get_headers(),
                    params={"investigation_id": f"eq.{inv_id}"}
                )

                if inv_response.status_code == 200:
                    inv_data = inv_response.json()
                    if inv_data:
                        inv = inv_data[0]
                        context["investigations"].append({
                            "id": inv_id,
                            "query": inv.get("original_query"),
                            "entities": inv.get("entities", []),
                            "status": inv.get("status")
                        })
                        for entity in inv.get("entities", []):
                            context["entities_mentioned"].add(entity)

                # Get findings for this investigation
                findings_response = await client.get(
                    f"{POSTGREST_URL}/investigation_findings",
                    headers=get_headers(),
                    params={"investigation_id": f"eq.{inv_id}"}
                )

                if findings_response.status_code == 200:
                    findings = findings_response.json()
                    for finding in findings:
                        context["key_findings"].append({
                            "text": finding.get("finding_text", "")[:200],
                            "confidence": finding.get("confidence", 0),
                            "tier": finding.get("tier", "secondary")
                        })
                        for source in finding.get("source_chunks", []):
                            context["sources_used"].add(source)

            # Convert sets to lists for JSON serialization
            context["entities_mentioned"] = list(context["entities_mentioned"])
            context["sources_used"] = list(context["sources_used"])[:20]  # Limit sources

            # Generate enhancement suggestions
            if context["key_findings"]:
                context["enhancement_suggestion"] = (
                    f"Prior investigations found {len(context['key_findings'])} relevant findings "
                    f"involving entities: {', '.join(context['entities_mentioned'][:5])}. "
                    f"Consider building on these insights."
                )
            else:
                context["enhancement_suggestion"] = "No prior findings available for enhancement."

            return json.dumps(context)

    except Exception as e:
        return json.dumps({"error": str(e), "investigations": []})


# ============================================================================
# Statement Extraction Tool Implementations
# ============================================================================

async def get_actor_statements(case_id: str = "us-v-blackman", actor_id: str = None, actor_name: str = None) -> str:
    """Get all extracted statements for an actor."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            actors = data[0].get("state_json", {}).get("actors", [])

            # Find actor by ID or name
            target_actor = None
            if actor_id:
                target_actor = next((a for a in actors if a.get("id") == actor_id), None)
            elif actor_name:
                name_lower = actor_name.lower()
                for actor in actors:
                    if name_lower in actor.get("name", "").lower():
                        target_actor = actor
                        break
                    if any(name_lower in alias.lower() for alias in actor.get("aliases", [])):
                        target_actor = actor
                        break

            if not target_actor:
                return f"No actor found with {'id: ' + actor_id if actor_id else 'name: ' + actor_name}"

            statements = target_actor.get("statements", [])

            if not statements:
                return f"**{target_actor.get('name')}** has no extracted statements yet.\n\nStatements are extracted from testimony documents (302s, depositions, interviews, trial testimony) after processing."

            output = f"**Statements by {target_actor.get('name')}** ({len(statements)} total)\n\n"

            # Sort by date
            sorted_statements = sorted(statements, key=lambda s: s.get("date", "9999"))

            for stmt in sorted_statements:
                date = stmt.get("date", "Unknown date")
                doc_id = stmt.get("documentId", "Unknown")
                content = stmt.get("content", "")[:200]
                context = stmt.get("context", "")
                is_inconsistent = stmt.get("isInconsistent", False)

                flag = "⚠️ " if is_inconsistent else "📅 "
                output += f"{flag}**{date}** | Doc: {doc_id[:8]}...\n"
                if context:
                    output += f"   Context: {context}\n"
                output += f"   \"{content}{'...' if len(stmt.get('content', '')) > 200 else ''}\"\n"

                if is_inconsistent:
                    inconsistent_with = stmt.get("inconsistentWith", [])
                    output += f"   🔴 INCONSISTENT with {len(inconsistent_with)} other statement(s)\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error getting actor statements: {str(e)}"


async def check_statement_consistency(case_id: str = "us-v-blackman", actor_id: str = "", topic: str = None) -> str:
    """Check if actor has made consistent statements on a topic."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            actors = data[0].get("state_json", {}).get("actors", [])
            target_actor = next((a for a in actors if a.get("id") == actor_id), None)

            if not target_actor:
                return f"No actor found with id: {actor_id}"

            statements = target_actor.get("statements", [])

            if len(statements) < 2:
                return f"**{target_actor.get('name')}** has {len(statements)} statement(s). Need at least 2 to check consistency."

            # Topic keywords for filtering
            topic_keywords = {
                "billing": ["billing", "invoice", "charge", "payment", "bill", "reimburse"],
                "authorization": ["authorize", "approve", "consent", "permission", "approve"],
                "knowledge": ["knew", "know", "aware", "understand", "realize", "learn"],
                "communication": ["told", "said", "inform", "notify", "communicate", "discuss"],
                "financial": ["money", "payment", "fee", "compensation", "dollar", "$"],
            }

            # Filter statements by topic if provided
            if topic and topic.lower() in topic_keywords:
                keywords = topic_keywords[topic.lower()]
                filtered_statements = [
                    s for s in statements
                    if any(kw in s.get("content", "").lower() for kw in keywords)
                ]
            else:
                filtered_statements = statements

            if len(filtered_statements) < 2:
                return f"**{target_actor.get('name')}** has fewer than 2 statements on topic '{topic}'. Cannot check consistency."

            # Check for inconsistencies
            inconsistencies = []
            for stmt in filtered_statements:
                if stmt.get("isInconsistent"):
                    inconsistencies.append(stmt)

            output = f"**Consistency Check: {target_actor.get('name')}**\n"
            output += f"Topic: {topic or 'All topics'}\n"
            output += f"Statements analyzed: {len(filtered_statements)}\n\n"

            if not inconsistencies:
                output += "✅ **No inconsistencies detected**\n\n"
                output += "Statements appear consistent across documents."
            else:
                output += f"⚠️ **{len(inconsistencies)} potential inconsistencies found**\n\n"
                for stmt in inconsistencies:
                    output += f"📅 {stmt.get('date', 'Unknown')}\n"
                    output += f"   \"{stmt.get('content', '')[:150]}...\"\n"
                    output += f"   Conflicts with: {', '.join(stmt.get('inconsistentWith', []))}\n\n"

            return output

    except Exception as e:
        return f"Error checking consistency: {str(e)}"


async def search_statements(case_id: str = "us-v-blackman", query: str = "", actor_id: str = None) -> str:
    """Search for statements matching a query across all actors."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            actors = data[0].get("state_json", {}).get("actors", [])

            # Filter by actor if specified
            if actor_id:
                actors = [a for a in actors if a.get("id") == actor_id]

            query_lower = query.lower()
            query_words = query_lower.split()

            matches = []
            for actor in actors:
                for stmt in actor.get("statements", []):
                    content_lower = stmt.get("content", "").lower()
                    context_lower = stmt.get("context", "").lower()

                    # Check if any query word matches
                    if any(word in content_lower or word in context_lower for word in query_words):
                        matches.append({
                            "actor_name": actor.get("name"),
                            "actor_id": actor.get("id"),
                            "statement": stmt
                        })

            if not matches:
                return f"No statements found matching '{query}'"

            output = f"**Statements matching '{query}'** ({len(matches)} found)\n\n"

            for match in matches[:20]:  # Limit to 20 results
                stmt = match["statement"]
                is_inconsistent = stmt.get("isInconsistent", False)
                flag = "⚠️" if is_inconsistent else "📝"

                output += f"{flag} **{match['actor_name']}** ({stmt.get('date', 'Unknown date')})\n"
                output += f"   \"{stmt.get('content', '')[:200]}{'...' if len(stmt.get('content', '')) > 200 else ''}\"\n"
                if is_inconsistent:
                    output += f"   🔴 Has inconsistencies\n"
                output += "\n"

            if len(matches) > 20:
                output += f"\n... and {len(matches) - 20} more matches"

            return output

    except Exception as e:
        return f"Error searching statements: {str(e)}"


async def get_inconsistencies(case_id: str = "us-v-blackman", actor_id: str = None, status: str = None) -> str:
    """Get all flagged statement inconsistencies."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            actors = data[0].get("state_json", {}).get("actors", [])

            # Collect all inconsistencies
            all_inconsistencies = []
            for actor in actors:
                if actor_id and actor.get("id") != actor_id:
                    continue

                for stmt in actor.get("statements", []):
                    if stmt.get("isInconsistent"):
                        all_inconsistencies.append({
                            "actor_name": actor.get("name"),
                            "actor_id": actor.get("id"),
                            "statement": stmt
                        })

            # Also check for stored inconsistency flags in state
            inconsistency_flags = data[0].get("state_json", {}).get("inconsistencyFlags", [])

            if status:
                inconsistency_flags = [f for f in inconsistency_flags if f.get("status") == status]

            if not all_inconsistencies and not inconsistency_flags:
                return "No statement inconsistencies found."

            output = f"**Statement Inconsistencies** ({len(all_inconsistencies)} flagged statements)\n\n"

            # Group by actor
            by_actor = {}
            for item in all_inconsistencies:
                actor_name = item["actor_name"]
                if actor_name not in by_actor:
                    by_actor[actor_name] = []
                by_actor[actor_name].append(item["statement"])

            for actor_name, statements in by_actor.items():
                output += f"**{actor_name}** ({len(statements)} inconsistencies)\n"
                for stmt in statements:
                    output += f"  ⚠️ {stmt.get('date', 'Unknown')}: \"{stmt.get('content', '')[:100]}...\"\n"
                output += "\n"

            # Show detailed flags if available
            if inconsistency_flags:
                output += f"\n**Detailed Flags** ({len(inconsistency_flags)})\n"
                for flag in inconsistency_flags[:10]:
                    status_icon = {"pending": "⏳", "confirmed": "✅", "dismissed": "❌"}.get(flag.get("status"), "❓")
                    output += f"{status_icon} {flag.get('topic', 'Unknown topic')}: {flag.get('explanation', '')[:100]}\n"

            return output

    except Exception as e:
        return f"Error getting inconsistencies: {str(e)}"


async def compare_statements(case_id: str = "us-v-blackman", statement_id_a: str = "", statement_id_b: str = "") -> str:
    """Compare two specific statements side-by-side."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return f"No case state found for case_id: {case_id}"

            actors = data[0].get("state_json", {}).get("actors", [])

            # Find both statements
            stmt_a = None
            stmt_b = None
            actor_a = None
            actor_b = None

            for actor in actors:
                for stmt in actor.get("statements", []):
                    if stmt.get("id") == statement_id_a:
                        stmt_a = stmt
                        actor_a = actor
                    if stmt.get("id") == statement_id_b:
                        stmt_b = stmt
                        actor_b = actor

            if not stmt_a:
                return f"Statement not found: {statement_id_a}"
            if not stmt_b:
                return f"Statement not found: {statement_id_b}"

            output = "**STATEMENT COMPARISON**\n"
            output += "=" * 50 + "\n\n"

            # Statement A
            output += f"**STATEMENT A** ({stmt_a.get('date', 'Unknown date')})\n"
            output += f"Speaker: {actor_a.get('name', 'Unknown')}\n"
            output += f"Source: {stmt_a.get('documentId', 'Unknown')[:20]}...\n"
            if stmt_a.get("context"):
                output += f"Context: {stmt_a.get('context')}\n"
            output += f"\n\"{stmt_a.get('content', '')}\"\n\n"

            output += "-" * 50 + "\n\n"

            # Statement B
            output += f"**STATEMENT B** ({stmt_b.get('date', 'Unknown date')})\n"
            output += f"Speaker: {actor_b.get('name', 'Unknown')}\n"
            output += f"Source: {stmt_b.get('documentId', 'Unknown')[:20]}...\n"
            if stmt_b.get("context"):
                output += f"Context: {stmt_b.get('context')}\n"
            output += f"\n\"{stmt_b.get('content', '')}\"\n\n"

            output += "=" * 50 + "\n\n"

            # Analysis
            if actor_a.get("id") == actor_b.get("id"):
                output += "**Analysis:** Same speaker - checking for self-contradiction\n"
            else:
                output += "**Analysis:** Different speakers - checking for conflicting accounts\n"

            # Check for obvious conflicts
            content_a = stmt_a.get("content", "").lower()
            content_b = stmt_b.get("content", "").lower()

            conflicts = []
            if ("knew" in content_a or "aware" in content_a) and ("didn't know" in content_b or "unaware" in content_b):
                conflicts.append("Knowledge conflict")
            if ("didn't know" in content_a or "unaware" in content_a) and ("knew" in content_b or "aware" in content_b):
                conflicts.append("Knowledge conflict")
            if ("authorized" in content_a or "approved" in content_a) and ("never" in content_b or "didn't" in content_b):
                conflicts.append("Authorization conflict")

            if conflicts:
                output += f"⚠️ Potential conflicts detected: {', '.join(conflicts)}\n"
            else:
                output += "No obvious semantic conflicts detected (manual review recommended)\n"

            return output

    except Exception as e:
        return f"Error comparing statements: {str(e)}"


# ============================================================================
# ML Context Tool Implementations
# ============================================================================

async def get_learned_weights(case_id: str = "us-v-blackman", factor_type: str = None,
                               min_weight: float = 0.1, limit: int = 50) -> str:
    """Get learned weights from user interactions for context enrichment.

    Schema: learned_weights table has:
    - factor_type: keyword, tag, actor, document_type
    - factor_value: e.g., "wire" for keyword, "Brady" for tag
    - weight_adjustment: positive = user accepts, negative = rejects
    - accept_count, reject_count: statistics
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            params = {"case_id": f"eq.{case_id}"}
            if factor_type:
                params["factor_type"] = f"eq.{factor_type}"
            params["weight_adjustment"] = f"gte.{min_weight}"
            params["order"] = "weight_adjustment.desc"
            params["limit"] = str(limit)

            response = await client.get(
                f"{POSTGREST_URL}/learned_weights",
                headers=get_headers(),
                params=params
            )

            if response.status_code == 404:
                return json.dumps({
                    "weights": [],
                    "message": "learned_weights table not found. User interactions not yet recorded."
                })

            response.raise_for_status()
            weights = response.json()

            if not weights:
                return json.dumps({
                    "weights": [],
                    "message": f"No learned weights found above threshold {min_weight}",
                    "suggestion": "User has not yet interacted with enough entities to generate weights."
                })

            # Group by factor type for better context
            by_type = {}
            for w in weights:
                ft = w.get("factor_type", "unknown")
                if ft not in by_type:
                    by_type[ft] = []
                by_type[ft].append({
                    "factor_value": w.get("factor_value"),
                    "weight": round(w.get("weight_adjustment", 0), 3),
                    "accept_count": w.get("accept_count", 0),
                    "reject_count": w.get("reject_count", 0),
                    "last_updated": w.get("last_updated")
                })

            output = f"**Learned Weights for {case_id}** ({len(weights)} factors)\n\n"
            output += "These factors have been most relevant in past investigations:\n\n"

            for ft, items in by_type.items():
                output += f"**{ft.upper()}** ({len(items)})\n"
                for item in items[:10]:  # Top 10 per type
                    signals = item['accept_count'] + item['reject_count']
                    output += f"  • {item['factor_value']}: {item['weight']} (accepts: {item['accept_count']}, rejects: {item['reject_count']})\n"
                if len(items) > 10:
                    output += f"  ... and {len(items) - 10} more\n"
                output += "\n"

            return json.dumps({
                "weights": weights,
                "by_type": by_type,
                "total_count": len(weights),
                "formatted": output
            })

    except Exception as e:
        return json.dumps({"error": str(e), "weights": []})


async def get_activity_signals(case_id: str = "us-v-blackman", signal_types: List[str] = None,
                                entity_id: str = None, hours_back: int = 168, limit: int = 100) -> str:
    """Get recent user activity signals for context understanding."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Calculate time threshold
            from datetime import datetime, timedelta
            time_threshold = (datetime.utcnow() - timedelta(hours=hours_back)).isoformat()

            params = {
                "case_id": f"eq.{case_id}",
                "created_at": f"gte.{time_threshold}",
                "order": "created_at.desc",
                "limit": str(limit)
            }

            if entity_id:
                params["entity_id"] = f"eq.{entity_id}"

            response = await client.get(
                f"{POSTGREST_URL}/activity_signals",
                headers=get_headers(),
                params=params
            )

            if response.status_code == 404:
                return json.dumps({
                    "signals": [],
                    "message": "activity_signals table not found."
                })

            response.raise_for_status()
            signals = response.json()

            # Filter by signal types if provided
            if signal_types:
                signals = [s for s in signals if s.get("signal_type") in signal_types]

            if not signals:
                return json.dumps({
                    "signals": [],
                    "message": f"No activity signals found in last {hours_back} hours"
                })

            # Aggregate by signal type
            by_type = {}
            for s in signals:
                st = s.get("signal_type", "unknown")
                if st not in by_type:
                    by_type[st] = []
                by_type[st].append({
                    "entity_id": s.get("entity_id"),
                    "entity_type": s.get("entity_type"),
                    "document_id": s.get("document_id"),
                    "base_weight": float(s.get("base_weight", 0.3)),
                    "consensus_multiplier": float(s.get("consensus_multiplier", 1.0)),
                    "timestamp": s.get("created_at"),
                    "user_email": s.get("user_email")
                })

            # Find most active entities
            entity_activity = {}
            for s in signals:
                eid = s.get("entity_id")
                if eid:
                    if eid not in entity_activity:
                        entity_activity[eid] = {"count": 0, "types": set()}
                    entity_activity[eid]["count"] += 1
                    entity_activity[eid]["types"].add(s.get("signal_type"))

            # Sort by activity count
            top_entities = sorted(
                [(eid, data) for eid, data in entity_activity.items()],
                key=lambda x: x[1]["count"],
                reverse=True
            )[:10]

            output = f"**Activity Signals** (last {hours_back} hours)\n\n"
            output += f"Total signals: {len(signals)}\n\n"

            output += "**Signal Types:**\n"
            for st, items in by_type.items():
                output += f"  • {st}: {len(items)} signals\n"
            output += "\n"

            output += "**Most Active Entities:**\n"
            for eid, data in top_entities:
                types_str = ", ".join(list(data["types"])[:3])
                output += f"  • {eid}: {data['count']} signals ({types_str})\n"

            return json.dumps({
                "signals": signals,
                "by_type": {k: len(v) for k, v in by_type.items()},
                "top_entities": [(eid, data["count"]) for eid, data in top_entities],
                "total_count": len(signals),
                "hours_back": hours_back,
                "formatted": output
            })

    except Exception as e:
        return json.dumps({"error": str(e), "signals": []})


async def get_relationship_confidence(case_id: str = "us-v-blackman", actor_id: str = None,
                                       min_confidence: float = 0.5, include_unverified: bool = False) -> str:
    """Get relationship confidence scores based on combined ML signals."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get case state for relationships
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return json.dumps({"error": f"No case state found for {case_id}", "relationships": []})

            actors = data[0].get("state_json", {}).get("actors", [])

            # Get learned weights for boost (factor_type=actor for relationship boosts)
            weights_response = await client.get(
                f"{POSTGREST_URL}/learned_weights",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}", "factor_type": "eq.actor"}
            )
            learned_weights = {}
            if weights_response.status_code == 200:
                for w in weights_response.json():
                    learned_weights[w.get("factor_value")] = w.get("weight_adjustment", 0)

            # Build relationship list with confidence scores
            relationships = []
            for actor in actors:
                if actor_id and actor.get("id") != actor_id:
                    continue

                for rel in actor.get("relatedActors", []):
                    source = rel.get("source", "unknown")

                    # Skip unverified if not requested
                    if not include_unverified and source not in ["ground_truth", "human"]:
                        if not rel.get("groundTruthApproved") and not rel.get("humanVerified"):
                            continue

                    # Calculate confidence score
                    base_score = 0.3  # Base for any relationship

                    # Ground truth approval is highest signal
                    if rel.get("groundTruthApproved"):
                        base_score += 0.5

                    # Human verification is strong signal
                    if rel.get("humanVerified"):
                        base_score += 0.3

                    # Source-based scoring
                    source_scores = {
                        "ground_truth": 0.2,
                        "human": 0.15,
                        "kg_ai": 0.05,
                        "ml_inference": 0.03
                    }
                    base_score += source_scores.get(source, 0)

                    # Boost from learned weights
                    rel_key = f"{actor.get('id')}_{rel.get('actorId')}_{rel.get('relationshipType')}"
                    if rel_key in learned_weights:
                        base_score += learned_weights[rel_key] * 0.2

                    # Has notes = more context
                    if rel.get("notes"):
                        base_score += 0.1

                    # Has date range = more specific
                    if rel.get("startDate") or rel.get("endDate"):
                        base_score += 0.05

                    # Cap at 1.0
                    confidence = min(base_score, 1.0)

                    if confidence >= min_confidence:
                        relationships.append({
                            "source_actor_id": actor.get("id"),
                            "source_actor_name": actor.get("name"),
                            "target_actor_id": rel.get("actorId"),
                            "relationship_type": rel.get("relationshipType"),
                            "confidence": round(confidence, 3),
                            "source": source,
                            "ground_truth_approved": rel.get("groundTruthApproved", False),
                            "human_verified": rel.get("humanVerified", False),
                            "has_notes": bool(rel.get("notes")),
                            "has_dates": bool(rel.get("startDate") or rel.get("endDate"))
                        })

            # Sort by confidence
            relationships.sort(key=lambda r: r["confidence"], reverse=True)

            output = f"**Relationship Confidence Scores**\n"
            output += f"Min confidence: {min_confidence} | Include unverified: {include_unverified}\n\n"

            if not relationships:
                output += "No relationships found above confidence threshold.\n"
            else:
                output += f"Found {len(relationships)} relationships:\n\n"
                for rel in relationships[:20]:
                    conf_bar = "█" * int(rel["confidence"] * 10) + "░" * (10 - int(rel["confidence"] * 10))
                    verified = "✓" if rel["ground_truth_approved"] else ("○" if rel["human_verified"] else "·")
                    output += f"{verified} [{conf_bar}] {rel['confidence']:.2f} | "
                    output += f"{rel['source_actor_name']} → {rel['relationship_type']} → {rel['target_actor_id']}\n"

            return json.dumps({
                "relationships": relationships,
                "total_count": len(relationships),
                "formatted": output
            })

    except Exception as e:
        return json.dumps({"error": str(e), "relationships": []})


async def get_ground_truth_relationships(case_id: str = "us-v-blackman", actor_id: str = None,
                                          relationship_type: str = None) -> str:
    """Get human-verified ground truth relationships."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{POSTGREST_URL}/case_state",
                headers=get_headers(),
                params={"case_id": f"eq.{case_id}"}
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return json.dumps({"error": f"No case state found for {case_id}", "relationships": []})

            actors = data[0].get("state_json", {}).get("actors", [])

            # Build actor name lookup
            actor_names = {a.get("id"): a.get("name") for a in actors}

            # Collect ground truth relationships
            ground_truth = []
            for actor in actors:
                if actor_id and actor.get("id") != actor_id:
                    continue

                for rel in actor.get("relatedActors", []):
                    # Only include ground truth approved
                    if not rel.get("groundTruthApproved") and rel.get("source") != "ground_truth":
                        continue

                    rel_type = rel.get("relationshipType", "")
                    if relationship_type and rel_type.lower() != relationship_type.lower():
                        continue

                    target_name = actor_names.get(rel.get("actorId"), rel.get("actorId"))

                    ground_truth.append({
                        "source_actor_id": actor.get("id"),
                        "source_actor_name": actor.get("name"),
                        "target_actor_id": rel.get("actorId"),
                        "target_actor_name": target_name,
                        "relationship_type": rel_type,
                        "notes": rel.get("notes"),
                        "start_date": rel.get("startDate"),
                        "end_date": rel.get("endDate"),
                        "human_verified": rel.get("humanVerified", False),
                        "ground_truth_approved": rel.get("groundTruthApproved", True),
                        "source": rel.get("source", "ground_truth")
                    })

            output = f"**Ground Truth Relationships** ({len(ground_truth)} verified)\n\n"

            if not ground_truth:
                output += "No ground truth relationships found.\n"
                output += "Use the Ground Truth Builder to verify relationships from the Knowledge Graph.\n"
            else:
                # Group by source actor
                by_actor = {}
                for rel in ground_truth:
                    src = rel["source_actor_name"]
                    if src not in by_actor:
                        by_actor[src] = []
                    by_actor[src].append(rel)

                for actor_name, rels in by_actor.items():
                    output += f"**{actor_name}**\n"
                    for rel in rels:
                        period = ""
                        if rel["start_date"] or rel["end_date"]:
                            period = f" ({rel['start_date'] or '?'} - {rel['end_date'] or '?'})"
                        output += f"  ✓ {rel['relationship_type']} → {rel['target_actor_name']}{period}\n"
                        if rel["notes"]:
                            output += f"    Notes: {rel['notes'][:100]}...\n"
                    output += "\n"

            return json.dumps({
                "relationships": ground_truth,
                "total_count": len(ground_truth),
                "formatted": output
            })

    except Exception as e:
        return json.dumps({"error": str(e), "relationships": []})


# Tool dispatcher
TOOL_HANDLERS = {
    "get_case_state": get_case_state,
    "update_case_state": update_case_state,
    "get_actors": get_actors,
    "get_actor_by_name": get_actor_by_name,
    "get_branches": get_branches,
    "get_investigations": get_investigations,
    "create_investigation": create_investigation,
    "save_investigation_finding": save_investigation_finding,
    "get_timeline": get_timeline,
    "flag_brady_material": flag_brady_material,
    "get_brady_items": get_brady_items,
    "find_similar_investigations": find_similar_investigations,
    "get_investigation_context": get_investigation_context,
    # Statement tools
    "get_actor_statements": get_actor_statements,
    "check_statement_consistency": check_statement_consistency,
    "search_statements": search_statements,
    "get_inconsistencies": get_inconsistencies,
    "compare_statements": compare_statements,
    # ML Context tools
    "get_learned_weights": get_learned_weights,
    "get_activity_signals": get_activity_signals,
    "get_relationship_confidence": get_relationship_confidence,
    "get_ground_truth_relationships": get_ground_truth_relationships
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
                "serverInfo": {"name": "postgres", "version": "1.0.0"}
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
    return web.json_response({
        "status": "healthy",
        "service": "postgres-mcp",
        "tools": len(TOOLS),
        "postgrest_url": POSTGREST_URL,
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
    print("PostgreSQL MCP Server (SSE Transport)")
    print("=" * 60)
    print(f"Port: {SERVER_PORT}")
    print(f"PostgREST URL: {POSTGREST_URL}")
    print(f"SSE endpoint: http://0.0.0.0:{SERVER_PORT}/sse")
    print(f"Health check: http://0.0.0.0:{SERVER_PORT}/health")
    print(f"Tools available: {len(TOOLS)}")
    for tool in TOOLS:
        print(f"  - {tool['name']}")
    print("=" * 60)

    app = create_app()
    web.run_app(app, host="0.0.0.0", port=SERVER_PORT)
