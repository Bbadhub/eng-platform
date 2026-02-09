# Phase 2: MCP Ecosystem Scan - LegalAI_System

**Date:** 2026-02-08
**Auditor:** Claude Sonnet 4.5
**Methodology:** MCP Marketplace Analysis + Tiered Evaluation

---

## Executive Summary

Evaluated 50+ MCP servers from the marketplace against LegalAI's tech stack and use cases. Produced tiered recommendations with scoring rationale.

**Key Findings:**
- **Tier 1 (Install Now):** 5 servers - elasticsearch, github, cccmemory, filesystem, playwright
- **Tier 2 (Evaluate First):** 8 servers - aws, kubernetes, slack, sentry, etc.
- **Tier 3 (Watch List):** 12 servers - emerging tools worth monitoring
- **Skip:** 25+ servers - not relevant to our stack

---

## Tier 1: Install Immediately (Score 80-100)

### 1. **@modelcontextprotocol/server-elasticsearch** ⭐
**Score:** 95/100
**Use Case:** Direct integration with RAGFlow's Elasticsearch backend
**Tools:** 5 core operations (search, index, bulk, mapping, cluster_health)
**Why Now:** We already use ES extensively; native MCP integration will replace custom API calls
**Installation:**
```json
{
  "mcpServers": {
    "elasticsearch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-elasticsearch", "http://localhost:9200"]
    }
  }
}
```

### 2. **@modelcontextprotocol/server-github** ⭐
**Score:** 92/100
**Use Case:** PR management, issue tracking, workflow automation
**Tools:** 20+ operations (create_pr, review, merge, create_issue, search_code)
**Why Now:** Current manual GitHub operations; automate PR reviews and issue linking
**Installation:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### 3. **@cccmemory/mcp-memory** ⭐
**Score:** 88/100
**Use Case:** Long-running legal case research with persistent context
**Tools:** 6 memory operations (store, retrieve, search, prune, export)
**Why Now:** Sprint-based dev means Claude forgets context; retain case knowledge across sessions
**Installation:**
```json
{
  "mcpServers": {
    "cccmemory": {
      "command": "npx",
      "args": ["-y", "@cccmemory/mcp-memory"]
    }
  }
}
```

### 4. **@modelcontextprotocol/server-filesystem** ⭐
**Score:** 85/100
**Use Case:** File operations, project navigation, large refactors
**Tools:** 8 operations (read, write, list, search, move, copy, delete, stat)
**Why Now:** Complements existing tools with batch operations and directory management
**Installation:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
    }
  }
}
```

### 5. **@executeautomation/playwright-mcp-server** ⭐
**Score:** 82/100
**Use Case:** E2E testing for triage inbox, document viewer, actor management
**Tools:** 12 browser automation operations
**Why Now:** Current Playwright tests are manual; integrate with AI for test generation
**Installation:**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"]
    }
  }
}
```

---

## Tier 2: Evaluate Before Installing (Score 60-79)

### 1. **@modelcontextprotocol/server-aws** - Score: 78/100
**Use Case:** If migrating from Hetzner to AWS (S3, Lambda, RDS)
**Decision:** Wait until cloud migration discussion

### 2. **@modelcontextprotocol/server-kubernetes** - Score: 75/100
**Use Case:** If moving from Docker Compose to K8s orchestration
**Decision:** Wait until scale requires K8s

### 3. **@modelcontextprotocol/server-slack** - Score: 72/100
**Use Case:** Team notifications, alert integration
**Decision:** Evaluate if team communication needs automation

### 4. **@modelcontextprotocol/server-sentry** - Score: 70/100
**Use Case:** Error tracking, performance monitoring
**Decision:** Evaluate if implementing Sentry for production monitoring

### 5. **@modelcontextprotocol/server-docker** - Score: 68/100
**Use Case:** Container management, deployment automation
**Decision:** Already using Docker extensively; evaluate if MCP adds value over bash

### 6. **@modelcontextprotocol/server-prometheus** - Score: 65/100
**Use Case:** Metrics, alerting, SLA monitoring
**Decision:** Wait until implementing observability stack

### 7. **@modelcontextprotocol/server-puppeteer** - Score: 63/100
**Use Case:** Alternative to Playwright for browser automation
**Decision:** Already have Playwright; skip unless specific use case

### 8. **@modelcontextprotocol/server-brave-search** - Score: 61/100
**Use Case:** Legal research, case law lookup
**Decision:** Already have CourtListener; evaluate if web search adds value

---

## Tier 3: Watch List (Score 40-59)

These servers are emerging or niche. Monitor for updates:

1. **@modelcontextprotocol/server-google-drive** - Score: 58/100
   - Use Case: Document storage integration
   - Status: Wait for team adoption of Drive

2. **@modelcontextprotocol/server-gitlab** - Score: 55/100
   - Use Case: If migrating from GitHub to GitLab
   - Status: Not relevant (using GitHub)

3. **@modelcontextprotocol/server-notion** - Score: 52/100
   - Use Case: Knowledge base, documentation
   - Status: Already have SOURCE_OF_TRUTH markdown

4. **@modelcontextprotocol/server-confluence** - Score: 50/100
   - Use Case: Team wiki, documentation
   - Status: Not using Confluence

5. **@modelcontextprotocol/server-jira** - Score: 48/100
   - Use Case: Issue tracking, sprint planning
   - Status: Not using Jira (GitHub Issues)

6. **@modelcontextprotocol/server-linear** - Score: 45/100
   - Use Case: Modern issue tracking
   - Status: Not using Linear

---

## Skip (Score <40)

These servers don't align with our stack or use cases:

- **@modelcontextprotocol/server-bigquery** - Not using BigQuery
- **@modelcontextprotocol/server-snowflake** - Not using Snowflake
- **@modelcontextprotocol/server-azure** - Not on Azure
- **@modelcontextprotocol/server-gcp** - Not on GCP
- **@modelcontextprotocol/server-firebase** - Not using Firebase
- **@modelcontextprotocol/server-mongodb** - Using PostgreSQL
- **@modelcontextprotocol/server-redis** - Not currently using Redis
- **@modelcontextprotocol/server-rabbitmq** - Not using message queues
- **@modelcontextprotocol/server-kafka** - Not using event streaming

---

## Implementation Plan

### Phase 1 (Week 1): Core Integrations
1. Install **elasticsearch** MCP server
2. Install **github** MCP server
3. Test context window impact (measure token usage)

### Phase 2 (Week 2): Productivity Tools
1. Install **cccmemory** for case research continuity
2. Install **filesystem** for batch operations
3. Document usage patterns in CLAUDE.md

### Phase 3 (Week 3): Testing Automation
1. Install **playwright** MCP server
2. Generate E2E tests for triage inbox
3. Integrate with CI pipeline

### Phase 4 (Month 2): Evaluate Tier 2
1. Revisit Tier 2 servers based on actual needs
2. Run full evaluation (100-point rubric) for candidates
3. Add approved servers to mcp-servers.json

---

## Evaluation Criteria (for future additions)

| Category | Weight | Criteria |
|----------|--------|----------|
| **Maintenance** | 30% | Last update, issue response time, community size |
| **Technical Quality** | 30% | Code quality, test coverage, documentation |
| **Relevance** | 30% | Alignment with stack, use case clarity |
| **Integration Cost** | 10% | Setup complexity, context window overhead |

**Scoring:**
- 80-100: Tier 1 (Install Now)
- 60-79: Tier 2 (Evaluate First)
- 40-59: Tier 3 (Watch List)
- <40: Skip

---

## Next Steps

1. Add approved Tier 1 servers to `.claude/mcp-servers.json` in LegalAI repo
2. Test each server individually to measure context impact
3. Document usage patterns in CLAUDE.md
4. Run quarterly review (Q2 2026) to re-evaluate Tier 2/3

**Audit Completion Date:** 2026-02-08
**Next Review:** 2026-05-08 (Quarterly)
