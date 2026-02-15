# MCP Server Registry

**Last Updated:** 2026-02-14
**Active in `.mcp.json`:** 13 servers
**In `.eng-platform/mcp-servers/`:** 14 directories (8 active, 4 inactive, 1 template, 1 docs)

---

## Active Servers (in `.mcp.json`)

| Server | Type | Directory | Port/URL | Status |
|--------|------|-----------|----------|--------|
| beads | Node stdio | `beads-integration/` | — | Active |
| team-analytics | Node stdio | `team-analytics/` | — | Active |
| smart-memory | Node stdio | `smart-memory/` | — | Active |
| basin-analyzer | Python HTTP+SSE | `basin-analyzer/` | :9383 | Active |
| constraint-validator | Python HTTP+SSE | `constraint-validator/` | :9385 | Active |
| report-writer | Python HTTP+SSE | `report-writer/` | :3015 | Active |
| research-swarm | Node HTTP | `research-swarm/` | :3012 | Active |
| playwright | npx (external) | — | — | Active |
| supabase-dev | Remote HTTP | — | mcp.supabase.com | Active |
| supabase-staging | Remote HTTP | — | mcp.supabase.com | Active |
| supabase-prod | Remote HTTP | — | mcp.supabase.com | Active (READ ONLY) |
| posthog | Remote SSE | — | mcp.posthog.com | Active |
| render | Remote HTTP | — | mcp.render.com | Active |

---

## Inactive Servers (NOT in `.mcp.json`)

| Directory | Why Inactive | Prerequisites to Activate |
|-----------|-------------|--------------------------|
| `dropbox/` | Not needed — no Dropbox integration in AdHub | Add Dropbox API credentials to `.env`, add entry to `.mcp.json` |
| `mysql/` | Not needed — AdHub uses PostgreSQL via Supabase | Only activate if a MySQL data source is added |
| `postgres/` | Superseded by Supabase MCP servers | Supabase MCP provides the same capabilities with built-in auth. No reason to activate |
| `ragflow/` | Built but requires running RAGFlow instance | 1. RAGFlow instance running (was at `178.156.192.12`), 2. Set `RAGFLOW_API_URL` + `RAGFLOW_API_TOKEN` in `.env`, 3. Add entry to `.mcp.json` — see Sprint 22 plan Phase 6 |

---

## Template (Not a Server)

| Directory | Purpose |
|-----------|---------|
| `mcp-saas-template/` | Starter template for building new MCP servers. Includes HTTP+SSE transport, auth middleware, rate limiting, Docker setup. Copy this to start a new server. |

---

## Adding a New MCP Server

1. Copy `mcp-saas-template/` to a new directory
2. Implement MCP tool definitions
3. Add entry to `.mcp.json` (root of repo)
4. Add usage row to `CLAUDE.md` auto-trigger table
5. Update this registry
6. Update server count in `CLAUDE.md`

See `README.md` in this directory for architecture overview.
