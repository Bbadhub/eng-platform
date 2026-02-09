# ADR-001: Replace history.jsonl with Anthropic Memory Server

**Status:** Accepted
**Date:** 2026-02-09
**Deciders:** Engineering Team
**Context Source:** LegalAI_System v0.2.0 audit

---

## Context

Claude Code maintains a `~/.claude/history.jsonl` file to store command history for autocomplete and context retention. Over time, this file becomes problematic:

### Observed Issues
- **6.6 MB file size** with 8,538 entries (LegalAI audit)
- Cursor/VS Code slow startup (parsing on every launch)
- Flat command structure (no semantic search)
- No entity tracking or knowledge graph
- Manual cleanup required

### Performance Impact
- Startup delay: ~2-5 seconds per session
- Memory overhead: 6+ MB loaded into context
- No structured knowledge retention

---

## Decision

**Adopt Anthropic's official `@modelcontextprotocol/server-memory` as team standard.**

Replace command-based history with a knowledge graph memory system that stores:
1. **Entities** - projects, files, APIs, people
2. **Relations** - how entities connect
3. **Observations** - facts learned during development

---

## Considered Alternatives

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **@modelcontextprotocol/server-memory** (Anthropic) | Official, knowledge graph, semantic search, actively maintained | New (Dec 2025) | ✅ **Chosen** |
| **cccmemory** (xiaolai) | Mature (500+ stars), proven in production | 3rd-party, flat structure, no knowledge graph | ❌ Rejected |
| **mcp-memory-service** (doobidoo) | Automatic context capture | Too new, overlaps with official | ❌ Rejected |
| **Keep history.jsonl** | No changes needed | Performance issues, no semantic search | ❌ Rejected |

---

## Rationale

### Why Anthropic Official Memory?

1. **Official MCP Implementation**
   - First-party support from Anthropic
   - Active maintenance (last commit: Feb 2026)
   - Reference implementation for MCP standard

2. **Knowledge Graph Structure**
   - Entities, relations, observations
   - Semantic search (future capability)
   - Better context retention than flat history

3. **Performance**
   - Local storage (~2-5 KB JSON file vs 6+ MB)
   - Faster startup (no parsing 8,000+ commands)
   - Lower memory overhead

4. **Standards Alignment**
   - MCP is Anthropic's official protocol
   - Future-proof for Claude API evolution
   - Interoperable with other MCP clients (Cursor, Goose)

---

## Implementation

### Phase 1: Team Standard (Week of Feb 9, 2026)

1. ✅ Update `eng-platform/mcp/mcp-servers.json` (Tier 1)
2. ✅ Create `templates/.mcp.json` with memory server config
3. ✅ Document setup in `docs/mcp-memory-setup.md`
4. 🔄 Rollout to team (5-minute setup per developer)

### Phase 2: Validation (Feb 16-23, 2026)

1. Monitor for issues in team Slack
2. Collect performance improvements (startup time)
3. Measure adoption rate (who's migrated?)
4. Document learnings

### Phase 3: Enforcement (March 2026)

1. Add to onboarding checklist
2. Archive old history files (team-wide cleanup)
3. Update CLAUDE.md templates

---

## Consequences

### Positive

- ✅ **Faster startup** - Remove 6+ MB parsing overhead
- ✅ **Better memory** - Structured knowledge vs flat commands
- ✅ **Official support** - Anthropic-maintained, future-proof
- ✅ **Team consistency** - One standard memory system

### Negative

- ⚠️ **Not team-synced** - Each developer has local `memory.json`
  - **Mitigation:** Use `.claude/CLAUDE.md` for team knowledge
- ⚠️ **New tool** - Released Dec 2025, not battle-tested like cccmemory
  - **Mitigation:** Monitor for issues, can rollback to cccmemory if needed
- ⚠️ **Migration effort** - 5 min per developer (low impact)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Memory server breaks | Low | Medium | Rollback to cccmemory (Tier 2 backup) |
| Team forgets to migrate | Medium | Low | Add to onboarding checklist |
| Performance regression | Very Low | High | Monitor first 2 weeks, measure startup times |

---

## Compliance

### Team Standards

- ✅ Aligns with "Official > 3rd-party" policy
- ✅ Aligns with "Modern > Legacy" policy
- ✅ Low context cost (single MCP server)

### Security

- ✅ Local storage only (no external API calls)
- ✅ User controls data (memory.json in home directory)
- ✅ No PII/secrets stored (developer responsibility)

---

## Monitoring

### Success Metrics (30 days)

- [ ] 100% team adoption (all devs migrated)
- [ ] Average startup time reduced by 2+ seconds
- [ ] Zero rollbacks due to memory server issues
- [ ] Positive developer feedback (informal survey)

### Review Date

**March 9, 2026** - Reassess after 30 days of team usage

---

## References

- [Anthropic Knowledge Graph Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- [MCP Memory Benchmark](https://research.aimultiple.com/memory-mcp/)
- [LegalAI v0.2.0 Audit](../../audits/legalai-system/phase1-audit.json)
- [Setup Guide](../mcp-memory-setup.md)

---

## Approvals

- [x] Engineering Lead - Brett (2026-02-09)
- [ ] Team vote (add names after migration)

---

## Changelog

- **2026-02-09** - Initial decision (Brett)
- **TBD** - 30-day review results
