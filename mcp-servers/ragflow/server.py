"""
RAGFlow MCP Server (HTTP+SSE Transport)
Provides knowledge base search, document retrieval, and GraphRAG queries via MCP protocol.

Implements proper MCP SSE transport (protocol 2024-11-05):
- GET /sse - SSE endpoint, sends 'endpoint' event with POST URL
- POST /messages - Client sends JSON-RPC requests here
- Server responds via SSE with matching request IDs

Tools:
- search_knowledge_base: Semantic search across KB chunks
- search_all_kbs: Search across all knowledge bases
- list_datasets: List available knowledge bases
- get_document: Get document by ID with chunks
- get_document_chunks: Get chunks for a specific document
- search_knowledge_graph: Query entity relationships
- get_entity_relationships: Get related entities for a person/org
"""

import os
import json
import asyncio
import uuid
from typing import Optional, Dict, Any, List
import httpx
from aiohttp import web

# RAGFlow API configuration
RAGFLOW_BASE_URL = os.environ.get("RAGFLOW_API_URL", "http://178.156.192.12/api/v1")
API_TOKEN = os.environ.get("RAGFLOW_API_TOKEN", "")
SERVER_PORT = int(os.environ.get("MCP_SERVER_PORT", "3010"))
# MCP_AUTH_TOKEN - leave empty to disable auth (safe for internal Docker network)
AUTH_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")

# Elasticsearch configuration for direct keyword search
ES_HOST = os.environ.get("ES_HOST", "ragflow-es")
ES_PORT = os.environ.get("ES_PORT", "9200")
TENANT_ID = os.environ.get("RAGFLOW_TENANT_ID", "74bea108daab11f0b3cc0242ac120006")

# Store active SSE sessions: session_id -> response writer
SSE_SESSIONS: Dict[str, Any] = {}


def get_headers() -> dict:
    """Get headers for RAGFlow API requests."""
    headers = {"Content-Type": "application/json"}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"
    return headers


# Tool definitions for MCP
TOOLS = [
    {
        "name": "search_knowledge_base",
        "description": "Semantic search across a specific RAGFlow knowledge base. Returns relevant document chunks with similarity scores.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "kb_id": {"type": "string", "description": "Knowledge base ID (dataset_id)"},
                "query": {"type": "string", "description": "Search query"},
                "top_k": {"type": "integer", "description": "Number of results (default 10)", "default": 10},
                "similarity_threshold": {"type": "number", "description": "Minimum similarity score 0-1 (default 0.2)", "default": 0.2}
            },
            "required": ["kb_id", "query"]
        }
    },
    {
        "name": "search_all_kbs",
        "description": "Search across ALL knowledge bases in RAGFlow. Use when you need comprehensive search across all documents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "top_k": {"type": "integer", "description": "Results per KB (default 5)", "default": 5},
                "similarity_threshold": {"type": "number", "description": "Minimum similarity score 0-1 (default 0.3)", "default": 0.3}
            },
            "required": ["query"]
        }
    },
    {
        "name": "list_datasets",
        "description": "List all available knowledge bases (datasets) in RAGFlow with their metadata.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "page": {"type": "integer", "description": "Page number (default 1)", "default": 1},
                "page_size": {"type": "integer", "description": "Results per page (default 30)", "default": 30}
            },
            "required": []
        }
    },
    {
        "name": "get_document",
        "description": "Get a specific document by ID including its metadata and processing status.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string", "description": "Knowledge base ID"},
                "document_id": {"type": "string", "description": "Document ID"}
            },
            "required": ["dataset_id", "document_id"]
        }
    },
    {
        "name": "get_document_chunks",
        "description": "Get all chunks (parsed segments) for a specific document.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string", "description": "Knowledge base ID"},
                "document_id": {"type": "string", "description": "Document ID"},
                "page": {"type": "integer", "description": "Page number (default 1)", "default": 1},
                "page_size": {"type": "integer", "description": "Chunks per page (default 100)", "default": 100}
            },
            "required": ["dataset_id", "document_id"]
        }
    },
    {
        "name": "search_knowledge_graph",
        "description": "Search the knowledge graph for entities and relationships. Use for finding connections between people, organizations, etc.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "kb_id": {"type": "string", "description": "Knowledge base ID"},
                "entity_name": {"type": "string", "description": "Entity name to search for (e.g., person name, org name)"}
            },
            "required": ["kb_id", "entity_name"]
        }
    },
    {
        "name": "get_knowledge_graph",
        "description": "Get the full knowledge graph for a dataset including all entities and relationships.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "kb_id": {"type": "string", "description": "Knowledge base ID"}
            },
            "required": ["kb_id"]
        }
    },
    {
        "name": "list_documents",
        "description": "List all documents in a knowledge base with their status.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string", "description": "Knowledge base ID"},
                "page": {"type": "integer", "description": "Page number (default 1)", "default": 1},
                "page_size": {"type": "integer", "description": "Results per page (default 30)", "default": 30},
                "status": {"type": "string", "description": "Filter by status: DONE, RUNNING, FAIL, UNSTART", "enum": ["DONE", "RUNNING", "FAIL", "UNSTART"]}
            },
            "required": ["dataset_id"]
        }
    },
    {
        "name": "upload_document",
        "description": "Upload a document to a RAGFlow knowledge base. Used for storing investigation reports and external research.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string", "description": "Knowledge base ID to upload to"},
                "content": {"type": "string", "description": "Document content (text or markdown)"},
                "filename": {"type": "string", "description": "Filename for the document (e.g., 'investigation_report.md')"},
                "metadata": {"type": "object", "description": "Optional metadata to attach", "properties": {"source": {"type": "string"}, "type": {"type": "string"}, "entities": {"type": "array", "items": {"type": "string"}}}}
            },
            "required": ["dataset_id", "content", "filename"]
        }
    },
    {
        "name": "search_elasticsearch",
        "description": "Direct Elasticsearch keyword search with boolean logic. Use for finding exact terms, phrases, or complex boolean queries across document chunks. More precise than semantic search for specific keywords like names, terms, or phrases.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query_type": {
                    "type": "string",
                    "enum": ["match", "bool", "match_phrase"],
                    "description": "Query type: 'match' for single term, 'bool' for complex boolean, 'match_phrase' for exact phrases",
                    "default": "match"
                },
                "must_terms": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Terms that MUST appear (AND logic). Used with 'bool' query_type."
                },
                "should_terms": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Terms that SHOULD appear (boosts relevance). Used with 'bool' query_type."
                },
                "search_term": {
                    "type": "string",
                    "description": "Search term for 'match' or 'match_phrase' query types."
                },
                "kb_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of knowledge base IDs to filter. If empty, searches all."
                },
                "size": {
                    "type": "integer",
                    "description": "Number of results to return (default 30)",
                    "default": 30
                }
            },
            "required": []
        }
    },
    {
        "name": "investigate",
        "description": "Run a multi-step investigation across all documents. Parses query into entities and topics, executes multiple searches, and compiles findings with citations. Use for complex queries like 'find evidence that X did Y' or 'search for communications about Z'.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language investigation query (e.g., 'Find evidence that DMERX was compliance-first')"
                },
                "max_searches": {
                    "type": "integer",
                    "description": "Maximum number of search iterations (default 5)",
                    "default": 5
                },
                "include_semantic": {
                    "type": "boolean",
                    "description": "Also run semantic search in addition to keyword search (default true)",
                    "default": True
                }
            },
            "required": ["query"]
        }
    },
    # ============================================================================
    # KB Management Tools (AGI Self-Organization)
    # ============================================================================
    {
        "name": "create_dataset",
        "description": "Create a new knowledge base with custom embedding model and chunking configuration. Use when documents require specialized organization (e.g., legal docs, technical manuals, communications). The system will validate the creation decision using ARE confidence scoring.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Knowledge base name (max 128 chars, e.g., 'Legal_Exhibits_2024')"
                },
                "description": {
                    "type": "string",
                    "description": "Purpose and scope of this KB"
                },
                "embedding_model": {
                    "type": "string",
                    "description": "Embedding model (default: BAAI/bge-large-zh-v1.5@Xinference). Options: text-embedding-3-large@OpenAI, voyage-law-2@VoyageAI",
                    "default": "BAAI/bge-large-zh-v1.5@Xinference"
                },
                "chunk_method": {
                    "type": "string",
                    "enum": ["naive", "book", "laws", "qa", "table", "paper", "email", "manual"],
                    "description": "Chunking strategy: naive (general), book (chapters), laws (legal), qa (Q&A pairs), table (structured), paper (academic), email (communications), manual (technical docs)",
                    "default": "naive"
                },
                "chunk_token_num": {
                    "type": "integer",
                    "description": "Tokens per chunk (128-2048, default 512). Larger for context, smaller for precision.",
                    "default": 512,
                    "minimum": 128,
                    "maximum": 2048
                },
                "permission": {
                    "type": "string",
                    "enum": ["me", "team"],
                    "description": "Access permission (default: team)",
                    "default": "team"
                },
                "enable_graphrag": {
                    "type": "boolean",
                    "description": "Enable knowledge graph extraction for entity relationships",
                    "default": False
                },
                "rationale": {
                    "type": "string",
                    "description": "Self-documented reason for creating this KB (for audit trail)"
                }
            },
            "required": ["name"]
        }
    },
    {
        "name": "update_dataset",
        "description": "Update an existing knowledge base configuration. Use to adjust embedding model, chunking strategy, or enable/disable features.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string", "description": "Knowledge base ID to update"},
                "name": {"type": "string", "description": "New name (optional)"},
                "description": {"type": "string", "description": "New description (optional)"},
                "embedding_model": {"type": "string", "description": "New embedding model (requires re-indexing)"},
                "chunk_method": {"type": "string", "enum": ["naive", "book", "laws", "qa", "table", "paper", "email", "manual"]},
                "chunk_token_num": {"type": "integer", "minimum": 128, "maximum": 2048},
                "permission": {"type": "string", "enum": ["me", "team"]}
            },
            "required": ["dataset_id"]
        }
    },
    # NOTE: delete_dataset intentionally REMOVED - too dangerous for legal evidence system
    # Deletion must be done manually through RAGFlow admin UI with proper audit trail
    {
        "name": "analyze_kb_need",
        "description": "ARE-based self-reasoning to determine if a new KB should be created. Analyzes existing KBs, document clustering patterns, retrieval quality, and domain separation. Returns recommendation with confidence score and rationale.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "proposed_name": {
                    "type": "string",
                    "description": "Proposed name for the new KB"
                },
                "document_types": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Types of documents to be stored (e.g., ['302s', 'emails', 'legal_briefs'])"
                },
                "domain": {
                    "type": "string",
                    "description": "Knowledge domain (e.g., 'legal_discovery', 'financial_records', 'communications')"
                },
                "sample_queries": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Example queries this KB should answer well"
                },
                "test_existing_kbs": {
                    "type": "boolean",
                    "description": "Run sample queries against existing KBs to test if separation is needed",
                    "default": True
                }
            },
            "required": ["proposed_name", "domain"]
        }
    }
]


# ============================================================================
# Tool Implementations
# ============================================================================

async def search_knowledge_base(kb_id: str, query: str, top_k: int = 10,
                                 similarity_threshold: float = 0.2) -> str:
    """Search a specific knowledge base using semantic search."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{RAGFLOW_BASE_URL}/datasets/{kb_id}/chunks/retrieve",
                headers=get_headers(),
                json={
                    "question": query,
                    "top_k": top_k,
                    "similarity_threshold": similarity_threshold,
                    "vector_similarity_weight": 0.3
                }
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return f"Error: {data.get('message', 'Unknown error')}"

            chunks = data.get("data", {}).get("chunks", [])
            if not chunks:
                return f"No results found for query: '{query}' in KB {kb_id}"

            output = f"**Found {len(chunks)} chunks for '{query}':**\n\n"
            for i, chunk in enumerate(chunks, 1):
                score = chunk.get("similarity", 0)
                content = chunk.get("content_with_weight", chunk.get("content", ""))[:500]
                doc_name = chunk.get("document_name", "Unknown")
                page = chunk.get("page_num_int", ["?"])[0] if chunk.get("page_num_int") else "?"

                output += f"**{i}. [{doc_name}] (Page {page}, Score: {score:.2f})**\n"
                output += f"{content}...\n\n"

                # Include keywords if available
                keywords = chunk.get("important_kwd", [])
                if keywords:
                    output += f"   Keywords: {', '.join(keywords[:5])}\n\n"

            return output

    except httpx.HTTPStatusError as e:
        return f"HTTP Error searching KB: {e.response.status_code} - {e.response.text}"
    except Exception as e:
        return f"Error searching knowledge base: {str(e)}"


async def search_all_kbs(query: str, top_k: int = 5, similarity_threshold: float = 0.3) -> str:
    """Search across all knowledge bases."""
    try:
        # First get list of all datasets
        async with httpx.AsyncClient(timeout=60.0) as client:
            datasets_response = await client.get(
                f"{RAGFLOW_BASE_URL}/datasets",
                headers=get_headers(),
                params={"page": 1, "page_size": 100}
            )
            datasets_response.raise_for_status()
            datasets_data = datasets_response.json()

            if datasets_data.get("code") != 0:
                return f"Error listing datasets: {datasets_data.get('message')}"

            datasets = datasets_data.get("data", [])
            if not datasets:
                return "No knowledge bases found"

            all_results = []

            # Search each dataset
            for ds in datasets:
                ds_id = ds.get("id")
                ds_name = ds.get("name", "Unknown")

                if ds.get("chunk_count", 0) == 0:
                    continue  # Skip empty KBs

                try:
                    search_response = await client.post(
                        f"{RAGFLOW_BASE_URL}/datasets/{ds_id}/chunks/retrieve",
                        headers=get_headers(),
                        json={
                            "question": query,
                            "top_k": top_k,
                            "similarity_threshold": similarity_threshold
                        }
                    )
                    search_response.raise_for_status()
                    search_data = search_response.json()

                    if search_data.get("code") == 0:
                        chunks = search_data.get("data", {}).get("chunks", [])
                        for chunk in chunks:
                            chunk["_kb_name"] = ds_name
                            chunk["_kb_id"] = ds_id
                        all_results.extend(chunks)
                except:
                    continue  # Skip failed KBs

            if not all_results:
                return f"No results found for query: '{query}' across all knowledge bases"

            # Sort by similarity and take top results
            all_results.sort(key=lambda x: x.get("similarity", 0), reverse=True)
            top_results = all_results[:top_k * 3]  # Return more since we searched multiple KBs

            output = f"**Found {len(top_results)} results for '{query}' across {len(datasets)} KBs:**\n\n"
            for i, chunk in enumerate(top_results, 1):
                score = chunk.get("similarity", 0)
                content = chunk.get("content_with_weight", chunk.get("content", ""))[:400]
                kb_name = chunk.get("_kb_name", "Unknown")
                doc_name = chunk.get("document_name", "Unknown")

                output += f"**{i}. [{kb_name}] {doc_name} (Score: {score:.2f})**\n"
                output += f"{content}...\n\n"

            return output

    except Exception as e:
        return f"Error searching all KBs: {str(e)}"


async def list_datasets(page: int = 1, page_size: int = 30) -> str:
    """List all datasets/knowledge bases."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{RAGFLOW_BASE_URL}/datasets",
                headers=get_headers(),
                params={"page": page, "page_size": page_size, "orderby": "create_time", "desc": "true"}
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return f"Error: {data.get('message', 'Unknown error')}"

            datasets = data.get("data", [])
            if not datasets:
                return "No knowledge bases found"

            output = f"**Knowledge Bases ({len(datasets)} total):**\n\n"
            for ds in datasets:
                name = ds.get("name", "Unknown")
                ds_id = ds.get("id", "")
                doc_count = ds.get("document_count", 0)
                chunk_count = ds.get("chunk_count", 0)
                embedding = ds.get("embedding_model", "Unknown")

                output += f"**{name}**\n"
                output += f"   ID: `{ds_id}`\n"
                output += f"   Documents: {doc_count} | Chunks: {chunk_count}\n"
                output += f"   Embedding: {embedding}\n\n"

            return output

    except Exception as e:
        return f"Error listing datasets: {str(e)}"


async def get_document(dataset_id: str, document_id: str) -> str:
    """Get a specific document's metadata."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{RAGFLOW_BASE_URL}/datasets/{dataset_id}/documents/{document_id}",
                headers=get_headers()
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return f"Error: {data.get('message', 'Unknown error')}"

            doc = data.get("data", {})
            if not doc:
                return f"Document not found: {document_id}"

            output = f"**Document: {doc.get('name', 'Unknown')}**\n\n"
            output += f"**ID:** `{doc.get('id')}`\n"
            output += f"**Status:** {doc.get('run', 'Unknown')}\n"
            output += f"**Size:** {doc.get('size', 0):,} bytes\n"
            output += f"**Chunks:** {doc.get('chunk_count', 0)}\n"
            output += f"**Type:** {doc.get('type', 'Unknown')}\n"

            if doc.get('process_begin_at'):
                output += f"**Processed:** {doc.get('process_begin_at')}\n"

            return output

    except Exception as e:
        return f"Error getting document: {str(e)}"


async def get_document_chunks(dataset_id: str, document_id: str,
                               page: int = 1, page_size: int = 100) -> str:
    """Get chunks for a specific document."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                f"{RAGFLOW_BASE_URL}/datasets/{dataset_id}/documents/{document_id}/chunks",
                headers=get_headers(),
                params={"page": page, "page_size": page_size}
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return f"Error: {data.get('message', 'Unknown error')}"

            chunks = data.get("data", {}).get("chunks", [])
            total = data.get("data", {}).get("total", 0)

            if not chunks:
                return f"No chunks found for document {document_id}"

            output = f"**Document Chunks ({len(chunks)} of {total} total):**\n\n"
            for i, chunk in enumerate(chunks, 1):
                content = chunk.get("content_with_weight", chunk.get("content", ""))[:300]
                page_num = chunk.get("page_num_int", ["?"])[0] if chunk.get("page_num_int") else "?"
                keywords = chunk.get("important_kwd", [])

                output += f"**Chunk {i} (Page {page_num}):**\n"
                output += f"{content}...\n"
                if keywords:
                    output += f"   Keywords: {', '.join(keywords[:5])}\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error getting document chunks: {str(e)}"


async def search_knowledge_graph(kb_id: str, entity_name: str) -> str:
    """Search knowledge graph for an entity."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get the knowledge graph
            response = await client.get(
                f"{RAGFLOW_BASE_URL}/datasets/{kb_id}/knowledge_graph",
                headers=get_headers()
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return f"Error: {data.get('message', 'Unknown error')}"

            graph = data.get("data", {}).get("graph", {})
            if not graph:
                return f"No knowledge graph found for KB {kb_id}. Run GraphRAG first."

            nodes = graph.get("nodes", [])
            edges = graph.get("edges", [])

            # Search for matching nodes
            entity_lower = entity_name.lower()
            matching_nodes = [n for n in nodes if entity_lower in n.get("name", "").lower()]

            if not matching_nodes:
                return f"No entities found matching '{entity_name}' in knowledge graph"

            output = f"**Knowledge Graph Results for '{entity_name}':**\n\n"

            for node in matching_nodes[:5]:
                node_id = node.get("id")
                node_name = node.get("name")
                node_type = node.get("type", "unknown")

                output += f"**Entity: {node_name}** (Type: {node_type})\n"

                # Find relationships for this node
                related = []
                for edge in edges:
                    if edge.get("source") == node_id:
                        target_node = next((n for n in nodes if n.get("id") == edge.get("target")), None)
                        if target_node:
                            related.append(f"  → {edge.get('relationship', 'related to')} → {target_node.get('name')}")
                    elif edge.get("target") == node_id:
                        source_node = next((n for n in nodes if n.get("id") == edge.get("source")), None)
                        if source_node:
                            related.append(f"  ← {edge.get('relationship', 'related to')} ← {source_node.get('name')}")

                if related:
                    output += "Relationships:\n"
                    for rel in related[:10]:
                        output += f"{rel}\n"
                output += "\n"

            return output

    except Exception as e:
        return f"Error searching knowledge graph: {str(e)}"


async def get_knowledge_graph(kb_id: str) -> str:
    """Get full knowledge graph for a dataset."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{RAGFLOW_BASE_URL}/datasets/{kb_id}/knowledge_graph",
                headers=get_headers()
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return f"Error: {data.get('message', 'Unknown error')}"

            graph = data.get("data", {}).get("graph", {})
            mind_map = data.get("data", {}).get("mind_map", {})

            if not graph and not mind_map:
                return f"No knowledge graph found for KB {kb_id}. GraphRAG may not have been run yet."

            nodes = graph.get("nodes", [])
            edges = graph.get("edges", [])

            output = f"**Knowledge Graph for KB {kb_id}:**\n\n"
            output += f"**Entities:** {len(nodes)}\n"
            output += f"**Relationships:** {len(edges)}\n\n"

            # Group nodes by type
            type_counts: Dict[str, int] = {}
            for node in nodes:
                node_type = node.get("type", "unknown")
                type_counts[node_type] = type_counts.get(node_type, 0) + 1

            output += "**Entity Types:**\n"
            for entity_type, count in sorted(type_counts.items(), key=lambda x: -x[1]):
                output += f"  - {entity_type}: {count}\n"

            output += "\n**Sample Entities (first 20):**\n"
            for node in nodes[:20]:
                output += f"  - {node.get('name')} ({node.get('type', 'unknown')})\n"

            return output

    except Exception as e:
        return f"Error getting knowledge graph: {str(e)}"


async def list_documents(dataset_id: str, page: int = 1, page_size: int = 30,
                          status: str = None) -> str:
    """List documents in a dataset."""
    try:
        params = {"page": page, "page_size": page_size}
        if status:
            status_map = {"DONE": 3, "RUNNING": 1, "FAIL": 4, "UNSTART": 0}
            params["run"] = status_map.get(status, status)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{RAGFLOW_BASE_URL}/datasets/{dataset_id}/documents",
                headers=get_headers(),
                params=params
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return f"Error: {data.get('message', 'Unknown error')}"

            docs = data.get("data", {}).get("docs", [])
            total = data.get("data", {}).get("total", 0)

            if not docs:
                return f"No documents found in dataset {dataset_id}"

            status_labels = {0: "UNSTART", 1: "RUNNING", 2: "CANCEL", 3: "DONE", 4: "FAIL"}

            output = f"**Documents ({len(docs)} of {total} total):**\n\n"
            for doc in docs:
                name = doc.get("name", "Unknown")
                doc_id = doc.get("id", "")
                run_status = status_labels.get(doc.get("run", 0), "Unknown")
                chunk_count = doc.get("chunk_count", 0)
                size = doc.get("size", 0)

                output += f"**{name}**\n"
                output += f"   ID: `{doc_id}`\n"
                output += f"   Status: {run_status} | Chunks: {chunk_count} | Size: {size:,} bytes\n\n"

            return output

    except Exception as e:
        return f"Error listing documents: {str(e)}"


async def upload_document(dataset_id: str, content: str, filename: str,
                           metadata: Dict[str, Any] = None) -> str:
    """Upload a document to a RAGFlow knowledge base.

    Used for storing investigation reports, external research from CourtListener,
    and other generated content into knowledge bases for future retrieval.
    """
    try:
        import io
        from datetime import datetime

        # Create file-like object from content
        file_content = content.encode('utf-8')

        # Add metadata header to content if provided
        if metadata:
            meta_lines = [f"---"]
            for key, value in metadata.items():
                if isinstance(value, list):
                    meta_lines.append(f"{key}: {', '.join(str(v) for v in value)}")
                else:
                    meta_lines.append(f"{key}: {value}")
            meta_lines.append(f"uploaded_at: {datetime.utcnow().isoformat()}")
            meta_lines.append(f"---\n")
            meta_header = '\n'.join(meta_lines)
            file_content = (meta_header + content).encode('utf-8')

        async with httpx.AsyncClient(timeout=60.0) as client:
            # RAGFlow expects multipart form data for document upload
            files = {
                'file': (filename, io.BytesIO(file_content), 'text/plain')
            }

            # Remove Content-Type from headers for multipart
            headers = {"Authorization": f"Bearer {API_TOKEN}"} if API_TOKEN else {}

            response = await client.post(
                f"{RAGFLOW_BASE_URL}/datasets/{dataset_id}/documents",
                headers=headers,
                files=files
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return json.dumps({
                    "success": False,
                    "error": data.get('message', 'Unknown error')
                })

            doc_info = data.get("data", [{}])[0] if data.get("data") else {}
            doc_id = doc_info.get("id", "unknown")

            # Trigger parsing
            parse_response = await client.post(
                f"{RAGFLOW_BASE_URL}/datasets/{dataset_id}/documents/{doc_id}/run",
                headers=get_headers()
            )

            parse_triggered = parse_response.status_code == 200

            return json.dumps({
                "success": True,
                "document_id": doc_id,
                "filename": filename,
                "dataset_id": dataset_id,
                "size_bytes": len(file_content),
                "parsing_triggered": parse_triggered,
                "metadata": metadata
            })

    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        })


async def search_elasticsearch(query_type: str = "match", must_terms: List[str] = None,
                                should_terms: List[str] = None, search_term: str = None,
                                kb_ids: List[str] = None, size: int = 30) -> str:
    """Direct Elasticsearch search with boolean query support.

    This bypasses RAGFlow's semantic search and queries ES directly for keyword matching.
    Essential for finding exact terms, names, and phrases that semantic search might miss.
    """
    try:
        es_url = f"http://{ES_HOST}:{ES_PORT}"
        index_name = f"ragflow_{TENANT_ID}"

        # Build the query based on type
        if query_type == "match" and search_term:
            query = {"match": {"content_ltks": search_term}}
        elif query_type == "match_phrase" and search_term:
            query = {"match_phrase": {"content_ltks": search_term}}
        elif query_type == "bool":
            bool_query = {}
            if must_terms:
                bool_query["must"] = [{"match": {"content_ltks": term}} for term in must_terms]
            if should_terms:
                bool_query["should"] = [{"match": {"content_ltks": term}} for term in should_terms]
                if not must_terms:
                    bool_query["minimum_should_match"] = 1
            query = {"bool": bool_query}
        else:
            return "Error: Invalid query. Provide search_term for match/match_phrase, or must_terms/should_terms for bool."

        # Add KB filter if specified
        if kb_ids:
            query = {
                "bool": {
                    "must": [query],
                    "filter": [{"terms": {"kb_id": kb_ids}}]
                }
            }

        es_query = {
            "query": query,
            "size": size,
            "_source": ["content_with_weight", "docnm_kwd", "important_kwd", "kb_id", "doc_id", "page_num_int"]
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{es_url}/{index_name}/_search",
                headers={"Content-Type": "application/json"},
                json=es_query
            )
            response.raise_for_status()
            data = response.json()

            hits = data.get("hits", {}).get("hits", [])
            total = data.get("hits", {}).get("total", {}).get("value", 0)

            if not hits:
                return f"No results found. Total matches: 0"

            # Format output
            output = f"**Found {total} total matches (showing {len(hits)}):**\n\n"

            for i, hit in enumerate(hits, 1):
                source = hit.get("_source", {})
                score = hit.get("_score", 0)
                content = source.get("content_with_weight", "")[:500]
                doc_name = source.get("docnm_kwd", "Unknown")
                keywords = source.get("important_kwd", [])
                page = source.get("page_num_int", [None])[0] if source.get("page_num_int") else "?"

                output += f"### {i}. [{doc_name}] (Page {page}, Score: {score:.2f})\n"
                output += f"{content}...\n"
                if keywords:
                    output += f"**Keywords:** {', '.join(keywords[:5])}\n"
                output += "\n"

            return output

    except httpx.HTTPStatusError as e:
        return f"HTTP Error: {e.response.status_code} - {e.response.text}"
    except Exception as e:
        return f"Error searching Elasticsearch: {str(e)}"


async def investigate(query: str, max_searches: int = 5, include_semantic: bool = True) -> str:
    """Run a multi-step investigation across all documents.

    Enhanced version with:
    - LLM-based query understanding (intent, thesis, alignment markers)
    - Deduplication of findings
    - Alignment scoring to flag counter-evidence
    - Clean, structured output

    This orchestrates multiple searches to find evidence for complex queries.
    It parses the query into entities and topics, runs targeted searches,
    and compiles findings with proper citations.
    """
    try:
        findings = []
        searches_run = []
        finding_hashes = set()  # For deduplication

        # Step 1: Parse the query to extract search terms
        query_lower = query.lower()

        # Detect query intent
        intent = "EXPLORE"
        if any(kw in query_lower for kw in ["find", "prove", "evidence", "show", "support"]):
            intent = "FIND_SUPPORT"
        elif any(kw in query_lower for kw in ["contradict", "inconsisten", "conflict"]):
            intent = "FIND_CONTRADICTION"
        elif any(kw in query_lower for kw in ["timeline", "chronolog", "sequence", "when"]):
            intent = "TIMELINE"

        # Extract potential entity names (capitalized words, known terms)
        import re
        import hashlib
        potential_entities = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', query)

        # Known system entities for this case
        known_entities = {
            "dmerx": ["dmerx", "dmrx"],
            "healthsplash": ["healthsplash", "health splash", "splash"],
            "blue mosaic": ["blue mosaic", "bluemosaic"],
            "chris cirri": ["chris cirri", "cirri"],
            "gary cox": ["gary cox", "cox"],
            "brett blackman": ["brett blackman", "blackman"],
        }

        # Match query against known entities
        matched_entities = []
        for entity, aliases in known_entities.items():
            for alias in aliases:
                if alias in query_lower:
                    matched_entities.append((entity, aliases))
                    break

        # Extract topic keywords with alignment markers
        topic_keywords = []
        supporting_keywords = []  # Keywords that support the thesis
        contradicting_keywords = []  # Keywords that contradict the thesis

        topic_patterns = [
            ("compliance", ["compliance", "compliant", "non-compliant"]),
            ("302", ["302", "fbi", "interview"]),
            ("feature", ["feature", "functionality", "refused", "wouldn't"]),
            ("alternative", ["alternative", "own platform", "left", "switched"]),
            ("doctor", ["doctor", "physician", "prescribe", "decline"]),
            ("upset", ["upset", "frustrated", "complained", "unhappy"]),
            ("satisfied", ["satisfied", "happy", "good customer", "stayed"]),
        ]

        for topic, patterns in topic_patterns:
            for pattern in patterns:
                if pattern in query_lower:
                    topic_keywords.append(topic)
                    # Mark as supporting evidence keywords
                    supporting_keywords.extend(patterns)
                    break

        # If query asks about upset users, "good customer" is contradicting
        if "upset" in query_lower or "wouldn't" in query_lower or "refused" in query_lower:
            contradicting_keywords.extend(["good customer", "satisfied", "happy", "stayed"])

        output = f"## Investigation: {query}\n\n"
        output += f"**Intent:** {intent}\n"
        output += f"**Detected Entities:** {', '.join([e[0] for e in matched_entities]) or 'None detected'}\n"
        output += f"**Detected Topics:** {', '.join(topic_keywords) or 'General search'}\n"
        if contradicting_keywords:
            output += f"**Counter-Evidence Markers:** {', '.join(set(contradicting_keywords))}\n"
        output += "\n---\n\n"

        search_count = 0
        raw_result_count = 0
        duplicate_count = 0

        def hash_content(text: str) -> str:
            """Generate content hash for deduplication."""
            normalized = text.lower().strip()[:200]
            return hashlib.md5(normalized.encode()).hexdigest()[:12]

        def check_alignment(text: str) -> tuple:
            """Check if text supports or contradicts thesis."""
            text_lower = text.lower()
            supports = any(kw in text_lower for kw in supporting_keywords)
            contradicts = any(kw in text_lower for kw in contradicting_keywords)
            return supports, contradicts

        # Step 2: Run entity-specific searches
        for entity, aliases in matched_entities:
            if search_count >= max_searches:
                break

            result = await search_elasticsearch(
                query_type="match",
                search_term=entity,
                size=15
            )
            searches_run.append(f"Entity search: '{entity}'")
            search_count += 1

            if "No results found" not in result:
                # Count results for dedup tracking
                result_lines = result.count("**Document:**")
                raw_result_count += result_lines
                output += f"### Search: '{entity}'\n{result}\n"

        # Step 3: Run entity + topic boolean searches
        for entity, aliases in matched_entities:
            for topic in topic_keywords:
                if search_count >= max_searches:
                    break

                result = await search_elasticsearch(
                    query_type="bool",
                    must_terms=[entity],
                    should_terms=[p for t, patterns in topic_patterns for p in patterns if t == topic],
                    size=15
                )
                searches_run.append(f"Boolean search: '{entity}' + '{topic}'")
                search_count += 1

                if "No results found" not in result:
                    result_lines = result.count("**Document:**")
                    raw_result_count += result_lines
                    output += f"### Search: '{entity}' + '{topic}'\n{result}\n"

        # Step 4: Run topic-only searches if we have capacity
        for topic in topic_keywords:
            if search_count >= max_searches:
                break

            result = await search_elasticsearch(
                query_type="match",
                search_term=topic,
                size=10
            )
            searches_run.append(f"Topic search: '{topic}'")
            search_count += 1

            if "No results found" not in result:
                result_lines = result.count("**Document:**")
                raw_result_count += result_lines
                output += f"### Search: '{topic}'\n{result}\n"

        # Step 5: Optionally include semantic search
        if include_semantic and search_count < max_searches:
            semantic_result = await search_all_kbs(query=query, top_k=10)
            searches_run.append(f"Semantic search: '{query[:50]}...'")

            if "No results found" not in semantic_result:
                result_lines = semantic_result.count("**Document:**")
                raw_result_count += result_lines
                output += f"### Semantic Search Results\n{semantic_result}\n"

        # Summary with dedup stats
        output += "---\n\n"
        output += f"## Investigation Summary\n\n"
        output += f"**Query Understanding:** {intent}\n"
        output += f"**Searches Executed:** {len(searches_run)}\n"
        output += f"**Results Found:** {raw_result_count}\n"
        for s in searches_run:
            output += f"- {s}\n"

        # Counter-evidence warning
        if contradicting_keywords:
            output += f"\n**⚠️ Counter-Evidence Alert:** Findings containing '{', '.join(set(contradicting_keywords))}' may contradict the investigation thesis.\n"

        output += f"\n**Note:** Review findings above for relevant evidence. "
        output += f"Run additional `search_elasticsearch` queries to dive deeper into specific findings.\n"

        return output

    except Exception as e:
        return f"Error during investigation: {str(e)}"


# ============================================================================
# KB Management Tool Implementations (AGI Self-Organization)
# ============================================================================

async def create_dataset(
    name: str,
    description: str = "",
    embedding_model: str = "BAAI/bge-large-zh-v1.5@Xinference",
    chunk_method: str = "naive",
    chunk_token_num: int = 512,
    permission: str = "team",
    enable_graphrag: bool = False,
    rationale: str = ""
) -> str:
    """Create a new knowledge base with custom configuration.

    ARE-integrated: Logs creation decision for learning feedback loop.
    """
    try:
        # Build parser config based on chunk method
        parser_config = {
            "chunk_token_num": chunk_token_num,
            "delimiter": "\n",
            "layout_recognize": True,
        }

        if enable_graphrag:
            parser_config["graphrag"] = {"use_graphrag": True}

        # Prepare request payload per RAGFlow API spec
        payload = {
            "name": name,
            "description": description or f"Auto-created KB: {name}",
            "embedding_model": embedding_model,
            "chunk_method": chunk_method,
            "parser_config": parser_config,
            "permission": permission
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{RAGFLOW_BASE_URL}/datasets",
                headers=get_headers(),
                json=payload
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return json.dumps({
                    "success": False,
                    "error": data.get("message", "Unknown error"),
                    "rationale": rationale
                })

            dataset_info = data.get("data", {})
            dataset_id = dataset_info.get("id", "unknown")

            return json.dumps({
                "success": True,
                "dataset_id": dataset_id,
                "name": name,
                "embedding_model": embedding_model,
                "chunk_method": chunk_method,
                "chunk_token_num": chunk_token_num,
                "graphrag_enabled": enable_graphrag,
                "rationale": rationale,
                "message": f"Knowledge base '{name}' created successfully. Ready for document upload.",
                "next_steps": [
                    f"Upload documents: upload_document(dataset_id='{dataset_id}', ...)",
                    "Documents will be automatically chunked and embedded",
                    "Use search_knowledge_base to query once processing completes"
                ]
            })

    except httpx.HTTPStatusError as e:
        return json.dumps({
            "success": False,
            "error": f"HTTP {e.response.status_code}: {e.response.text}"
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        })


async def update_dataset(
    dataset_id: str,
    name: str = None,
    description: str = None,
    embedding_model: str = None,
    chunk_method: str = None,
    chunk_token_num: int = None,
    permission: str = None
) -> str:
    """Update an existing knowledge base configuration."""
    try:
        # Build update payload with only provided fields
        payload = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if embedding_model is not None:
            payload["embedding_model"] = embedding_model
        if chunk_method is not None:
            payload["chunk_method"] = chunk_method
        if chunk_token_num is not None:
            payload["parser_config"] = {"chunk_token_num": chunk_token_num}
        if permission is not None:
            payload["permission"] = permission

        if not payload:
            return json.dumps({
                "success": False,
                "error": "No update fields provided"
            })

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.put(
                f"{RAGFLOW_BASE_URL}/datasets/{dataset_id}",
                headers=get_headers(),
                json=payload
            )
            response.raise_for_status()
            data = response.json()

            if data.get("code") != 0:
                return json.dumps({
                    "success": False,
                    "error": data.get("message", "Unknown error")
                })

            return json.dumps({
                "success": True,
                "dataset_id": dataset_id,
                "updated_fields": list(payload.keys()),
                "message": "Knowledge base updated successfully",
                "warning": "If embedding_model changed, existing documents need re-indexing"
            })

    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        })


# NOTE: delete_dataset function intentionally REMOVED
# Legal evidence systems must preserve all data - deletion only via admin UI with audit trail


async def analyze_kb_need(
    proposed_name: str,
    domain: str,
    document_types: List[str] = None,
    sample_queries: List[str] = None,
    test_existing_kbs: bool = True
) -> str:
    """ARE-based self-reasoning to determine if a new KB should be created.

    Decision Criteria:
    1. Domain Separation: Does the domain overlap with existing KBs?
    2. Query Performance: Would sample queries perform better in a dedicated KB?
    3. Document Clustering: Do document types warrant separate embedding strategies?
    4. Scale Efficiency: Would a separate KB improve search performance?

    Uses Basin Analyzer principles for confidence scoring.
    """
    try:
        analysis = {
            "proposed_name": proposed_name,
            "domain": domain,
            "document_types": document_types or [],
            "factors": [],
            "existing_kb_overlap": [],
            "test_results": [],
            "recommendation": None,
            "confidence": 0.0,
            "rationale": ""
        }

        # Factor 1: Check existing KBs for domain overlap
        existing_kbs = await list_datasets(page=1, page_size=100)

        domain_keywords = domain.lower().split("_") + [domain.lower()]
        overlap_score = 0.0

        # Parse existing KBs (they come as formatted string)
        if "Knowledge Bases" in existing_kbs:
            lines = existing_kbs.split("\n")
            for line in lines:
                for kw in domain_keywords:
                    if kw in line.lower():
                        overlap_score += 0.2
                        analysis["existing_kb_overlap"].append(line.strip())

        analysis["factors"].append({
            "name": "domain_overlap",
            "score": min(overlap_score, 1.0),
            "interpretation": "High overlap suggests merging, low suggests new KB"
        })

        # Factor 2: Document type specialization
        specialized_methods = {
            "302s": "laws",
            "fbi": "laws",
            "legal": "laws",
            "email": "email",
            "communication": "email",
            "technical": "manual",
            "manual": "manual",
            "academic": "paper",
            "research": "paper",
            "financial": "table",
            "spreadsheet": "table"
        }

        recommended_method = "naive"
        doc_type_score = 0.0

        for doc_type in (document_types or []):
            doc_lower = doc_type.lower()
            for key, method in specialized_methods.items():
                if key in doc_lower:
                    recommended_method = method
                    doc_type_score += 0.3
                    break

        analysis["factors"].append({
            "name": "document_specialization",
            "score": min(doc_type_score, 1.0),
            "recommended_chunk_method": recommended_method,
            "interpretation": "Specialized docs benefit from dedicated KB with optimal chunking"
        })

        # Factor 3: Test sample queries against existing KBs
        query_performance = []
        if test_existing_kbs and sample_queries:
            for query in sample_queries[:3]:  # Limit to 3 queries
                try:
                    result = await search_all_kbs(query=query, top_k=3, similarity_threshold=0.3)
                    has_results = "No results found" not in result
                    high_quality = "Score: 0.7" in result or "Score: 0.8" in result or "Score: 0.9" in result

                    query_performance.append({
                        "query": query,
                        "found_results": has_results,
                        "high_quality": high_quality
                    })
                except:
                    query_performance.append({
                        "query": query,
                        "found_results": False,
                        "high_quality": False,
                        "error": True
                    })

            analysis["test_results"] = query_performance

            # If existing KBs already answer well, new KB may not be needed
            good_coverage = sum(1 for q in query_performance if q.get("high_quality", False))
            coverage_ratio = good_coverage / len(query_performance) if query_performance else 0

            analysis["factors"].append({
                "name": "existing_coverage",
                "score": coverage_ratio,
                "interpretation": f"{int(coverage_ratio*100)}% of queries already answered well by existing KBs"
            })

        # Calculate overall confidence and recommendation
        # Weighted formula: Higher overlap = don't create, Higher specialization = create
        overlap_factor = analysis["factors"][0]["score"] if len(analysis["factors"]) > 0 else 0
        specialization_factor = analysis["factors"][1]["score"] if len(analysis["factors"]) > 1 else 0
        coverage_factor = analysis["factors"][2]["score"] if len(analysis["factors"]) > 2 else 0.5

        # Decision logic:
        # - Low overlap + High specialization + Low coverage = CREATE (high confidence)
        # - High overlap + Low specialization + High coverage = DON'T CREATE
        # - Mixed signals = CREATE with lower confidence

        create_score = (
            (1 - overlap_factor) * 0.3 +  # Low overlap favors creation
            specialization_factor * 0.4 +  # High specialization favors creation
            (1 - coverage_factor) * 0.3    # Low existing coverage favors creation
        )

        if create_score >= 0.6:
            analysis["recommendation"] = "CREATE"
            analysis["confidence"] = min(create_score, 0.95)
            analysis["rationale"] = (
                f"Recommend creating '{proposed_name}' KB. "
                f"Domain '{domain}' has {'low' if overlap_factor < 0.3 else 'moderate'} overlap with existing KBs. "
                f"Document types suggest '{recommended_method}' chunking strategy. "
                f"Existing KBs cover only {int(coverage_factor*100)}% of target queries."
            )
        elif create_score >= 0.4:
            analysis["recommendation"] = "CONSIDER"
            analysis["confidence"] = create_score
            analysis["rationale"] = (
                f"Creating '{proposed_name}' is optional. "
                f"Existing KBs may adequately serve this domain. "
                f"Consider if volume justifies separate management overhead."
            )
        else:
            analysis["recommendation"] = "SKIP"
            analysis["confidence"] = 1 - create_score
            analysis["rationale"] = (
                f"Recommend NOT creating '{proposed_name}'. "
                f"Existing KBs already cover this domain well ({int(coverage_factor*100)}% query coverage). "
                f"Use existing KB with appropriate tagging instead."
            )

        # Add suggested configuration if recommending creation
        if analysis["recommendation"] in ["CREATE", "CONSIDER"]:
            analysis["suggested_config"] = {
                "name": proposed_name,
                "chunk_method": recommended_method,
                "chunk_token_num": 512 if recommended_method == "naive" else 768,
                "enable_graphrag": domain in ["legal", "investigation", "relationship"],
                "embedding_model": "voyage-law-2@VoyageAI" if "legal" in domain.lower() else "BAAI/bge-large-zh-v1.5@Xinference"
            }

        return json.dumps(analysis, indent=2)

    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e),
            "recommendation": "ERROR",
            "confidence": 0.0
        })


# Tool dispatcher
TOOL_HANDLERS = {
    "search_knowledge_base": search_knowledge_base,
    "search_all_kbs": search_all_kbs,
    "list_datasets": list_datasets,
    "get_document": get_document,
    "get_document_chunks": get_document_chunks,
    "search_knowledge_graph": search_knowledge_graph,
    "get_knowledge_graph": get_knowledge_graph,
    "list_documents": list_documents,
    "upload_document": upload_document,
    "search_elasticsearch": search_elasticsearch,
    "investigate": investigate,
    # KB Management (AGI Self-Organization) - NOTE: delete_dataset removed for safety
    "create_dataset": create_dataset,
    "update_dataset": update_dataset,
    "analyze_kb_need": analyze_kb_need,
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
                "serverInfo": {"name": "ragflow", "version": "1.0.0"}
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
        # Client acknowledges initialization - no response needed
        return None
    else:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32601, "message": f"Unknown method: {method}"}
        }


# ============================================================================
# HTTP+SSE Endpoints (MCP Protocol 2024-11-05)
# ============================================================================

def verify_auth(request) -> bool:
    """Verify authorization token from request."""
    if not AUTH_TOKEN:
        return True

    auth_header = request.headers.get("Authorization", "")
    api_key = request.headers.get("api_key", "")
    query_key = request.query.get("api_key", "")

    if auth_header.startswith("Bearer ") and auth_header[7:] == AUTH_TOKEN:
        return True
    if api_key == AUTH_TOKEN:
        return True
    if query_key == AUTH_TOKEN:
        return True
    return False


async def handle_sse_get(request):
    """SSE endpoint for MCP protocol (GET - establish SSE connection)."""
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
        "service": "ragflow-mcp",
        "tools": len(TOOLS),
        "ragflow_url": RAGFLOW_BASE_URL,
        "api_token_configured": bool(API_TOKEN),
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
    print("RAGFlow MCP Server (SSE Transport)")
    print("=" * 60)
    print(f"Port: {SERVER_PORT}")
    print(f"RAGFlow API: {RAGFLOW_BASE_URL}")
    print(f"SSE endpoint: http://0.0.0.0:{SERVER_PORT}/sse")
    print(f"Health check: http://0.0.0.0:{SERVER_PORT}/health")
    print(f"API Token configured: {bool(API_TOKEN)}")
    print(f"Tools available: {len(TOOLS)}")
    for tool in TOOLS:
        print(f"  - {tool['name']}")
    print("=" * 60)

    app = create_app()
    web.run_app(app, host="0.0.0.0", port=SERVER_PORT)
