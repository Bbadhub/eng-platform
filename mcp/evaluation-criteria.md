# MCP Server Evaluation Criteria

**Purpose:** Standardized criteria for evaluating new MCP servers before adding to platform.

**Principle:** Quality over quantity. Better 5 excellent servers than 15 mediocre ones.

---

## 🎯 Evaluation Framework

### 1. **Maintenance & Viability** (30 points)

| Criterion | Points | Threshold |
|-----------|--------|-----------|
| Active maintenance | 10 | Commits in last 90 days |
| GitHub stars | 5 | 100+ stars (or official implementation) |
| Issues response time | 5 | < 7 days median response |
| Dependencies health | 5 | No critical vulnerabilities |
| Community adoption | 5 | Real-world usage examples |

### 2. **Technical Quality** (30 points)

| Criterion | Points | Threshold |
|-----------|--------|-----------|
| Tool count | 10 | < 15 tools (context window efficiency) |
| System overhead | 10 | < 200MB disk, < 100MB RAM |
| Documentation | 5 | README with examples, types documented |
| Test coverage | 5 | Unit tests present |

### 3. **Relevance & Value** (30 points)

| Criterion | Points | Threshold |
|-----------|--------|-----------|
| Solves real problem | 15 | Addresses actual team need |
| No overlap | 10 | Doesn't duplicate existing server |
| Cross-project utility | 5 | Useful for 2+ projects |

### 4. **Integration Cost** (10 points)

| Criterion | Points | Threshold |
|-----------|--------|-----------|
| Setup complexity | 5 | < 5 minutes to configure |
| External dependencies | 5 | < 2 external services required |

---

## 📊 Scoring Rubric

| Score | Tier | Action |
|-------|------|--------|
| 80-100 | **Tier 1: Install Now** | Add to platform immediately |
| 60-79 | **Tier 2: Evaluate** | Test in one project first |
| 40-59 | **Tier 3: Watch** | Revisit in 3-6 months |
| < 40 | **Skip** | Not ready or not needed |

---

## 🔍 Evaluation Process

### Step 1: Initial Screening (5 min)
```bash
# Check GitHub
- Stars: __
- Last commit: __
- Open issues: __
- Maintenance status: Active / Stale / Abandoned

# Decision: Pass / Fail
```

### Step 2: Technical Review (15 min)
```bash
# Clone and inspect
git clone [repo]
cd [repo]
npm install  # Check install size
npm run build  # Check if builds

# Count tools
grep -r "server.tool" . | wc -l

# Check docs
cat README.md

# Decision: Pass / Fail
```

### Step 3: Testing (30 min)
```bash
# Install in test project
cd ~/test-project
npm install [mcp-server]

# Configure
# ... add to .claude/settings.json

# Test tools
# ... try each tool

# Decision: Pass / Fail
```

### Step 4: Scoring (5 min)
```
Maintenance: __ / 30
Technical Quality: __ / 30
Relevance: __ / 30
Integration Cost: __ / 10
---
Total: __ / 100

Tier: 1 / 2 / 3 / Skip
```

---

## 📝 Evaluation Template

```markdown
# MCP Server Evaluation: [SERVER_NAME]

**Date:** YYYY-MM-DD
**Evaluator:** [Name]
**Version:** x.y.z

## Scores

| Category | Score | Notes |
|----------|-------|-------|
| Maintenance | __ / 30 | |
| Technical Quality | __ / 30 | |
| Relevance | __ / 30 | |
| Integration Cost | __ / 10 | |
| **Total** | **__ / 100** | |

## Decision

- [ ] **Tier 1:** Install Now
- [ ] **Tier 2:** Evaluate
- [ ] **Tier 3:** Watch
- [ ] **Skip**

## Rationale

[Why this decision? What are the trade-offs?]

## Next Steps

[What needs to happen next?]

## Related Links

- GitHub: [URL]
- Docs: [URL]
- Similar servers: [List]
```

---

## 🚨 Red Flags (Auto-Reject)

- ❌ No commits in 6+ months (unless officially abandoned)
- ❌ Critical security vulnerabilities
- ❌ Requires root/admin access
- ❌ > 1GB disk space
- ❌ No documentation
- ❌100% overlap with existing server
- ❌ Requires paid API with no free tier

---

## ✅ Green Flags (Fast-Track to Tier 1)

- ✅ Official implementation (GitHub, Elastic, etc.)
- ✅ Used by 1000+ projects
- ✅ Recommended by Anthropic
- ✅ < 10MB, < 5 tools, solves critical need
- ✅ Active community (Discord, discussions)

---

## 📅 Review Schedule

- **Monthly:** Check for new Tier 1 candidates
- **Quarterly:** Re-evaluate Tier 2/3 servers
- **Annually:** Audit all servers for deprecation

**Next Review:** 2026-03-08
