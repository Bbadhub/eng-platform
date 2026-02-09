# ADR-002: Team Memory Strategy

**Status:** Accepted
**Date:** 2026-02-09
**Supersedes:** ADR-001 (extends it for team context)
**Related:** ADR-001 (Memory Server)

---

## Context

After deploying MCP memory server (ADR-001) for personal developer memory, the question arose:

**Should we build a shared/centralized team memory system?**

### Considered Options

1. **Git-based team memory** - Store memory.json in shared repo
2. **PostgreSQL backend** - Custom MCP server with shared database
3. **Wait for Claude Cowork** - Use Anthropic's built-in team workspace
4. **Hybrid approach** - Local MCP + Project CLAUDE.md + Future Cowork

---

## Decision

**Adopt Hybrid Approach:**

### Now → Mid-2026: Local MCP + Project Documentation

**Team knowledge** → Version-controlled docs:
- `eng-platform/.claude/CLAUDE.md` - Team standards
- `docs/decisions/*.md` - ADRs (this file!)
- `docs/runbooks/*.md` - Procedures, how-tos
- Project `.claude/CLAUDE.md` - Per-project context

**Personal memory** → Local MCP server:
- `~/.claude/memory.json` - Personal preferences, patterns
- No team sync (by design)

### Mid-2026+: Migrate to Claude Cowork

When Windows Cowork launches:
- **Team collaboration** → Cowork workspaces
- **Personal CLI work** → Keep local MCP memory
- **Shared context** → Cowork's built-in team memory

---

## Rationale

### Why NOT Build Custom Team Memory?

| Concern | Why Not Custom | Why Wait for Cowork |
|---------|----------------|---------------------|
| **Development effort** | 2-4 weeks to build custom MCP server | ✅ 0 hours - included in plan |
| **Maintenance** | Ongoing DB maintenance, scaling | ✅ Anthropic maintains |
| **Sync conflicts** | Need merge/conflict resolution logic | ✅ Built-in real-time sync |
| **Infrastructure cost** | PostgreSQL hosting (~$50/month) | ✅ Included in Team plan |
| **File system sync** | Need separate system | ✅ Built-in folder access |
| **Windows timeline** | Works today | ⏳ Mid-2026 (3-4 months) |

### Why Project Documentation Works Better

**For team knowledge, docs > database:**

1. **Version control** - Git tracks who changed what, when, why
2. **Code review** - PRs ensure quality of team standards
3. **Searchable** - GitHub search, grep, VS Code find
4. **Onboarding** - New devs read docs, not query memory database
5. **Portable** - Works across IDEs, no special tooling

**Examples:**

```markdown
# .claude/CLAUDE.md (Team standards)
## Protected Code Pattern
- Use @protected comments for stable code
- Run PRE-FLIGHT checklists before editing
- See: docs/decisions/ADR-001-memory-server.md

## Memory Setup
- Install MCP memory server (personal)
- See: docs/mcp-memory-setup.md
```

---

## Consequences

### Positive

- ✅ **Zero infrastructure cost** - No DB to maintain
- ✅ **Zero development effort** - Use existing tools
- ✅ **Better for team knowledge** - Docs > memory DB
- ✅ **Future-proof** - Easy migration to Cowork later
- ✅ **No sync conflicts** - Git handles docs, MCP handles personal memory

### Negative

- ⚠️ **No real-time team memory** until Cowork (mid-2026)
  - **Mitigation:** Use Slack/Discord for real-time coordination
- ⚠️ **Docs can go stale** if not maintained
  - **Mitigation:** Quarterly doc review (add to eng-platform process)

### Neutral

- 🔄 **Two systems** - Docs for team, MCP for personal
  - **Rationale:** Different use cases, both valuable

---

## Implementation Plan

### Phase 1: Documentation Standards (Week 1)

1. ✅ Create ADR-001 (memory server)
2. ✅ Create ADR-002 (team memory strategy - this doc)
3. ✅ Document MCP memory setup (`docs/mcp-memory-setup.md`)
4. 🔄 Create CLAUDE.md template for projects
5. 🔄 Document when to update docs vs rely on memory

### Phase 2: Team Rollout (Week 2-3)

1. Share ADRs with team
2. Each dev installs local MCP memory
3. Update project CLAUDE.md files with team context
4. Establish quarterly doc review process

### Phase 3: Cowork Migration Planning (Q2 2026)

1. Monitor Cowork Windows release announcements
2. Test Cowork with pilot group (Mac users if available)
3. Document Cowork setup process
4. Plan team migration (mid-2026)

---

## Alternatives Considered (Detailed)

### Alternative 1: Git-Based Team Memory

**Config:**
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "~/eng-platform/.shared/team-memory.json"
      }
    }
  }
}
```

**Why rejected:**
- Merge conflicts if 2+ devs commit simultaneously
- Git history cluttered with memory updates
- Requires manual `git pull` to sync
- Docs are better for team knowledge anyway

### Alternative 2: PostgreSQL Backend

**Architecture:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Dev 1 MCP  │────▶│             │◀────│  Dev 2 MCP  │
└─────────────┘     │ PostgreSQL  │     └─────────────┘
                    │  (Shared)   │
┌─────────────┐     │             │     ┌─────────────┐
│  Dev 3 MCP  │────▶│             │◀────│  Dev 4 MCP  │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Why rejected:**
- 2-4 weeks development effort
- Ongoing maintenance burden
- Infrastructure cost (~$50/month)
- Cowork will be better (and free with Team plan)
- **Wait 3-4 months** instead of building custom solution

---

## Success Metrics

### Short-term (30 days)

- [ ] 100% team has local MCP memory installed
- [ ] All project repos have updated CLAUDE.md
- [ ] 3+ ADRs created (documenting decisions)
- [ ] Zero requests for custom team memory server

### Long-term (Q3 2026)

- [ ] Team migrated to Cowork (when Windows launches)
- [ ] Local MCP still used for CLI workflows
- [ ] Docs remain primary source of team knowledge
- [ ] No custom team memory infrastructure built

---

## Review Date

**May 9, 2026** - Reassess when Cowork Windows beta available

---

## References

- [ADR-001: Memory Server](./ADR-001-memory-server.md)
- [MCP Memory Setup Guide](../mcp-memory-setup.md)
- [Claude Cowork Announcement](https://claude.com/blog/cowork-research-preview)
- [Cowork Help Center](https://support.claude.com/en/articles/13345190-getting-started-with-cowork)

---

## Decision Matrix

| Criterion | Local MCP + Docs | Git-Based Team Memory | PostgreSQL Backend | Wait for Cowork |
|-----------|------------------|----------------------|--------------------|--------------------|
| **Development effort** | ✅ 0 hours | ⚠️ 4 hours | ❌ 40+ hours | ✅ 0 hours |
| **Infrastructure cost** | ✅ $0 | ✅ $0 | ❌ $50/month | ✅ $0 (included) |
| **Maintenance burden** | ✅ None | ⚠️ Low | ❌ High | ✅ None (Anthropic) |
| **Real-time sync** | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Conflict resolution** | ✅ Git (docs) | ❌ Manual | ✅ DB transactions | ✅ Built-in |
| **Team knowledge** | ✅ Excellent (docs) | ⚠️ OK | ⚠️ OK | ✅ Excellent |
| **Personal memory** | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| **Windows support** | ✅ Now | ✅ Now | ✅ Now | ⏳ Mid-2026 |
| **File system sync** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Timeline to value** | ✅ Immediate | ⚠️ 1 week | ❌ 1+ month | ⏳ Q2 2026 |

**Winner:** Local MCP + Docs (Phase 1) → Cowork (Phase 2)

---

## Approvals

- [x] Engineering Lead - Brett (2026-02-09)
- [ ] Team consensus (after rollout)

---

## Changelog

- **2026-02-09** - Initial decision (Brett)
- **TBD** - Review after Cowork Windows launch
