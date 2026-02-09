# ADR-003: Memory Organization Strategy

**Status:** Accepted
**Date:** 2026-02-09
**Related:** ADR-001 (Memory Server), ADR-002 (Team Memory Strategy)

---

## Context

With git-synced team memory, we need to decide:

**Where should team memory live?**
1. eng-platform (org-wide)
2. Per-project repos (project-specific)
3. Hybrid (both)

**What memory scope makes sense?**
- Organization standards vs project specifics
- How to handle multiple projects
- How to prevent context pollution

---

## Decision

**Use eng-platform with namespaced memory structure**

Single `team-memory.json` in eng-platform, organized by context:

```json
{
  "entities": {
    "org": { ... },      // Organization-wide standards
    "legalai": { ... },  // LegalAI-specific knowledge
    "adhub": { ... }     // AdHub-specific knowledge
  }
}
```

---

## Rationale

### Why Single File (eng-platform)?

| Benefit | Why It Matters |
|---------|----------------|
| **Single source of truth** | No duplicate standards across projects |
| **Easier onboarding** | New devs get org + project knowledge in one place |
| **Cross-project patterns** | See how other projects solve similar problems |
| **Simpler setup** | One MCP config, not per-project |
| **Better for small teams** | Under 10 projects, one file is manageable |

### Why Namespacing?

Prevents context pollution:

```json
// ❌ BAD: Mixed context
{
  "entities": {
    "tRPC": "We use tRPC for APIs",  // Which project?
    "REST": "AdHub uses REST",       // Confusing!
    "deployment": "Use Hetzner"      // For what?
  }
}

// ✅ GOOD: Clear context
{
  "entities": {
    "org": {
      "standards": "Prefer tRPC over REST for TypeScript projects"
    },
    "legalai": {
      "api": "tRPC routers in src/server/routers/",
      "deployment": "Hetzner 178.156.192.12"
    },
    "adhub": {
      "api": "REST endpoints (legacy - consider migrating)",
      "deployment": "Vercel"
    }
  }
}
```

---

## Structure

### Memory File Organization

```
eng-platform/.shared/team-memory.json
├── entities
│   ├── org           ← Organization standards (all projects)
│   ├── {project1}    ← Project-specific knowledge
│   ├── {project2}
│   └── {project3}
├── relations         ← How entities connect
└── observations      ← Tagged with context
```

### Prompting Claude

When working on a specific project:

```bash
# LegalAI work
cd LegalAI_System
claude "Remember for legalai: tRPC actors router has 35 endpoints"

# AdHub work
cd AdHub
claude "Remember for adhub: Use Supabase RLS for auth"

# Org-wide standard
claude "Remember for org: We use conventional commits"
```

Claude will namespace memories automatically based on context.

---

## When to Migrate to Per-Project

**Triggers for splitting memory:**

| Indicator | Threshold |
|-----------|-----------|
| **File size** | > 500 KB |
| **Project count** | > 10 projects |
| **Team size** | > 30 developers |
| **Context collisions** | Frequent namespace conflicts |

**Migration path:**

```bash
# Extract project-specific memory
cd LegalAI_System
mkdir -p .shared
jq '.entities.legalai' ../eng-platform/.shared/team-memory.json > .shared/project-memory.json

# Update MCP config to read from project
# (See migration guide in ADR-004 when needed)
```

---

## Comparison Table

| Criterion | eng-platform (Chosen) | Per-Project | Hybrid |
|-----------|-----------------------|-------------|--------|
| **Setup complexity** | ⭐ Simple | ⭐⭐ Moderate | ⭐⭐⭐ Complex |
| **Onboarding** | ✅ One-time setup | ⚠️ Per-project | ⚠️ Two setups |
| **Context pollution** | ⚠️ Possible (use namespaces) | ✅ None | ✅ None |
| **Cross-project learning** | ✅ Easy | ❌ Hard | ⚠️ Manual |
| **File size** | ⚠️ Grows with projects | ✅ Small | ⚠️ Two files |
| **Best for** | 2-10 projects, <30 devs | >10 projects | Large orgs |

---

## Examples

### Adding Org-Wide Standard

```bash
claude "Remember for org: All APIs must have OpenAPI/tRPC schema docs"
```

**Result:**
```json
{
  "entities": {
    "org": {
      "observations": [
        "All APIs must have OpenAPI/tRPC schema docs"
      ]
    }
  }
}
```

### Adding Project-Specific Knowledge

```bash
cd LegalAI_System
claude "Remember for legalai: Protected routers require PRE-FLIGHT checklist"
```

**Result:**
```json
{
  "entities": {
    "legalai": {
      "observations": [
        "Protected routers require PRE-FLIGHT checklist",
        "See actors.ts:1-3777, validations.ts:1-2237"
      ]
    }
  }
}
```

### Querying Memory

```bash
# Get org standards
claude "What are our org standards for testing?"

# Get project-specific info
cd LegalAI_System
claude "What's the LegalAI deployment process?"
```

---

## Guidelines

### What Goes in "org" Namespace?

✅ **Include:**
- Engineering standards (linters, formatters, test frameworks)
- Tool choices (Vite, Docker, PostgreSQL)
- Coding conventions (naming, file structure)
- Process patterns (git workflow, PR templates)
- Security practices (secrets management, auth patterns)

❌ **Exclude:**
- Project-specific API endpoints
- Business logic patterns
- Client-specific information
- Deployment credentials (use .env instead)

### What Goes in Project Namespace?

✅ **Include:**
- Project architecture (folder structure, key files)
- API endpoints and usage
- Database schema patterns
- Deployment procedures
- Protected code locations
- Common bugs and fixes

❌ **Exclude:**
- Secrets (use .env)
- Large code snippets (use docs/ instead)
- Personal preferences (use local memory)

---

## Consequences

### Positive

- ✅ **Simple setup** - One MCP config for all projects
- ✅ **Easy onboarding** - New devs get everything at once
- ✅ **Cross-project learning** - See how other teams solve problems
- ✅ **Consistency** - Org standards visible in all contexts

### Negative

- ⚠️ **File size growth** - Will grow with each project
  - **Mitigation:** Archive old projects, use namespacing
- ⚠️ **Context switching** - Need to specify project in prompts
  - **Mitigation:** Claude infers from `pwd` if in project directory
- ⚠️ **Potential collisions** - Two projects with similar patterns
  - **Mitigation:** Clear namespacing + documentation

---

## Success Metrics

### 30 Days

- [ ] All team members using eng-platform memory
- [ ] Clear namespace separation (org, legalai, adhub, etc.)
- [ ] File size < 100 KB
- [ ] Zero context confusion reports

### 90 Days

- [ ] 3+ projects with namespaced memory
- [ ] Team reports faster onboarding
- [ ] Cross-project pattern reuse examples
- [ ] File size < 250 KB

---

## Review Date

**May 9, 2026** - Reassess if file size > 250 KB or team > 10 projects

---

## References

- [ADR-001: Memory Server](./ADR-001-memory-server.md)
- [ADR-002: Team Memory Strategy](./ADR-002-team-memory-strategy.md)
- [Team Memory Git Sync Guide](../team-memory-git-sync.md)

---

## Approvals

- [x] Engineering Lead - Brett (2026-02-09)

---

## Changelog

- **2026-02-09** - Initial decision (Brett)
