# Team Memory with Git Sync

**Status:** Optional (Alternative to waiting for Cowork)
**Last Updated:** 2026-02-09
**Related:** ADR-002 (Team Memory Strategy)

---

## Overview

Use git as a team memory sync mechanism:
- Single `team-memory.json` file in eng-platform repo
- Git hooks auto-sync on pull/push
- Git handles merge conflicts
- Works on Windows/Mac/Linux (now)

---

## Architecture

```
┌────────────────────────────────────────┐
│      eng-platform/.shared/             │
│        team-memory.json                │ ← Single source of truth
│                                        │
│  Git commit: "sync: update memory"    │
└────────────────────────────────────────┘
                ↑↓ Git sync
    ┌───────────┼───────────┐
    ↓           ↓           ↓
  Dev 1       Dev 2       Dev 3
  (pull)      (pull)      (pull)
```

### Flow

1. **Dev 1** asks Claude to remember something
2. MCP server writes to `eng-platform/.shared/team-memory.json`
3. **Dev 1** commits and pushes: `git add .shared/ && git commit -m "sync: update team memory"`
4. **Dev 2** pulls: `git pull` (post-merge hook auto-reloads)
5. **Dev 2's** MCP server sees updated memory

---

## Setup (5 minutes per developer)

### 1. Initialize (Run once - team lead)

```bash
cd eng-platform
./scripts/setup-team-memory.sh

# Commit the files
git add .shared/team-memory.json .githooks/
git commit -m "feat: add team memory with git sync"
git push
```

### 2. Team Setup (Each developer)

```bash
# Pull latest
cd ~/Documents/GitHub/eng-platform
git pull

# Run setup script (installs hooks)
./scripts/setup-team-memory.sh

# Update your MCP config
```

**Update `~/.claude/.mcp.json`:**

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "C:\\Users\\YOUR_USERNAME\\Documents\\GitHub\\eng-platform\\.shared\\team-memory.json"
      }
    }
  }
}
```

**Windows path example:**
```
C:\Users\Brett\Documents\GitHub\eng-platform\.shared\team-memory.json
```

**Mac/Linux path example:**
```
/Users/brett/Documents/GitHub/eng-platform/.shared/team-memory.json
```

### 3. Verify Setup

```bash
# Check hooks are installed
ls -la eng-platform/.git/hooks/post-merge
ls -la eng-platform/.git/hooks/pre-push

# Test memory file exists
cat eng-platform/.shared/team-memory.json
```

---

## Usage Workflow

### Adding Team Knowledge

```bash
# 1. Use Claude Code normally - memory auto-saves to team file
claude "Remember: our API uses tRPC, not REST"

# 2. Check what changed
cd eng-platform
git diff .shared/team-memory.json

# 3. Commit and push
git add .shared/team-memory.json
git commit -m "sync: add tRPC standard to team memory"
git push
```

### Syncing From Team

```bash
# Pull updates (hook auto-reloads memory)
cd eng-platform
git pull

# Verify new memory loaded
# (MCP server auto-reloads on next use)
```

---

## Pros & Cons

### ✅ Pros

| Benefit | Why It Matters |
|---------|----------------|
| **Works today** | No waiting for Cowork Windows |
| **Zero infrastructure** | No database, no server, just git |
| **Version control** | See who added what, when, rollback if needed |
| **Familiar tools** | Team already knows git |
| **Cross-platform** | Works on Windows/Mac/Linux |
| **Conflict resolution** | Git's merge tools handle conflicts |

### ⚠️ Cons

| Limitation | Workaround |
|------------|------------|
| **Manual git push** | Not real-time (need to commit) | Use git aliases for quick commits |
| **Merge conflicts** | If 2+ devs commit simultaneously | Git handles this - resolve manually |
| **Git history noise** | Memory commits clutter history | Use conventional commit prefix: `sync:` |
| **Requires discipline** | Team must commit changes | Add pre-push hook reminder |

---

## Merge Conflict Resolution

**If two developers add memory simultaneously:**

```bash
# You'll see this on pull:
Auto-merging .shared/team-memory.json
CONFLICT (content): Merge conflict in .shared/team-memory.json

# Open the file and resolve
code .shared/team-memory.json

# Look for conflict markers:
<<<<<<< HEAD
  "entities": { "project_x": {...} }
=======
  "entities": { "project_y": {...} }
>>>>>>> main

# Merge both manually:
  "entities": {
    "project_x": {...},
    "project_y": {...}
  }

# Commit the resolution
git add .shared/team-memory.json
git commit -m "sync: merge team memory conflict"
git push
```

---

## Git Hooks Reference

### post-merge (After `git pull`)

```bash
# Notifies when team memory was updated
# MCP server auto-reloads on next use
```

### pre-push (Before `git push`)

```bash
# Warns if team-memory.json has uncommitted changes
# Prevents forgetting to sync your memory updates
```

---

## Comparison: Git Sync vs Cowork vs Local Only

| Feature | Local Only | Git Sync (This) | Cowork (Future) |
|---------|-----------|-----------------|-----------------|
| **Team sync** | ❌ No | ✅ Manual (git push) | ✅ Real-time |
| **Merge conflicts** | N/A | ⚠️ Manual resolution | ✅ Auto-resolved |
| **Version control** | ❌ No | ✅ Yes (git history) | ✅ Yes (built-in) |
| **Windows support** | ✅ Now | ✅ Now | ⏳ Mid-2026 |
| **Setup complexity** | ⭐ Simple | ⭐⭐ Moderate | ⭐⭐⭐ TBD |
| **Real-time sync** | N/A | ❌ Manual push | ✅ Yes |
| **Infrastructure** | ✅ None | ✅ Just git | ✅ None (Anthropic) |
| **Cost** | ✅ Free | ✅ Free | ✅ Included in Team |

---

## Best Practices

### 1. Commit Message Convention

```bash
# Use "sync:" prefix for memory commits
git commit -m "sync: add API authentication pattern"
git commit -m "sync: update project preferences"

# This helps filter memory commits from code commits
git log --grep="^sync:"
```

### 2. Sync Frequency

**Recommended:**
- After learning major team patterns
- At end of workday (consolidate changes)
- After pair programming sessions
- When discovering new team standards

**Avoid:**
- Syncing every minor change (too noisy)
- Going weeks without syncing (defeats purpose)

### 3. What to Store

**Good for team memory:**
- ✅ Project architecture patterns
- ✅ API design decisions
- ✅ Coding conventions
- ✅ Common pitfalls to avoid
- ✅ Tool preferences (ESLint, Prettier)

**Keep in personal memory:**
- ❌ Personal preferences (theme, keybindings)
- ❌ Private notes
- ❌ Client-specific info (if NDA)

### 4. Conflict Prevention

```bash
# Pull before making major memory updates
git pull

# Add your knowledge
claude "Remember: our API uses GraphQL"

# Push soon after
git add .shared/team-memory.json
git commit -m "sync: add GraphQL standard"
git push
```

---

## Troubleshooting

### Memory not updating after pull

```bash
# Restart Claude Code (hook only notifies, MCP reloads on next use)
# Or manually verify:
cat .shared/team-memory.json
```

### Hooks not running

```bash
# Re-run setup script
./scripts/setup-team-memory.sh

# Or manually install:
chmod +x .githooks/*
git config core.hooksPath .githooks
```

### Path issues (Windows)

```json
// Use double backslashes in .mcp.json
{
  "env": {
    "MEMORY_FILE_PATH": "C:\\Users\\Brett\\Documents\\GitHub\\eng-platform\\.shared\\team-memory.json"
  }
}
```

---

## Migration Path

### Now → Mid-2026: Git Sync

Use this git-based approach until Cowork Windows launches.

### Mid-2026: Cowork Migration

When Cowork Windows is available:

1. **Export team memory:**
   ```bash
   cp .shared/team-memory.json .shared/team-memory-backup.json
   git commit -m "backup: preserve team memory before Cowork migration"
   ```

2. **Enable Cowork** (Windows desktop app)

3. **Import key knowledge** into Cowork workspaces

4. **Deprecate git sync:**
   ```bash
   git rm .shared/team-memory.json
   git commit -m "migrate: moved team memory to Cowork"
   ```

5. **Update .mcp.json** back to local memory for personal use

---

## FAQ

### Q: Does this replace local MCP memory?

**A:** No - you choose:
- **Team memory** (git-synced) - Shared knowledge
- **Personal memory** (local) - Your preferences

Update `.mcp.json` to point to team or personal file.

### Q: What if I forget to commit?

**A:** The pre-push hook warns you. But changes stay local until committed.

### Q: Can I have both team and personal memory?

**A:** Not simultaneously in one MCP server. But you could:
1. Create two MCP servers (e.g., `memory-team`, `memory-personal`)
2. Or switch `MEMORY_FILE_PATH` as needed

### Q: What about large files?

**A:** Memory files stay small (~10-50KB). If growing large, consider:
- Archiving old memories
- Moving detailed docs to `docs/` instead

---

## Rollout Checklist

**Team Lead:**
- [ ] Run `setup-team-memory.sh`
- [ ] Commit and push `.shared/team-memory.json` + hooks
- [ ] Share this doc with team
- [ ] Set expectations (commit frequency, what to store)

**Each Developer:**
- [ ] Pull latest eng-platform
- [ ] Run `./scripts/setup-team-memory.sh`
- [ ] Update `~/.claude/.mcp.json` with team memory path
- [ ] Test: Ask Claude to remember something, check file updates
- [ ] Commit and push first memory update

---

## References

- [ADR-002: Team Memory Strategy](./decisions/ADR-002-team-memory-strategy.md)
- [MCP Memory Server Setup](./mcp-memory-setup.md)
- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)

---

## Questions?

- Slack: `#eng-platform`
- Issues: [eng-platform/issues](https://github.com/your-org/eng-platform/issues)
