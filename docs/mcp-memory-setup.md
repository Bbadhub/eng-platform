# MCP Memory Server Setup

**Status:** Team Standard (Required)
**Last Updated:** 2026-02-09
**Replaces:** history.jsonl (deprecated)

---

## Problem

Claude Code's `history.jsonl` file can grow to **6+ MB** with 8,000+ entries, causing:
- Slow startup times in Cursor/VS Code
- Memory overhead on every session
- No semantic search capabilities
- Flat command history (not structured knowledge)

## Solution

**Anthropic's Official Knowledge Graph Memory Server**

Replace command history with a structured knowledge graph that stores:
- **Entities** - projects, people, preferences
- **Relations** - how entities connect
- **Observations** - facts learned during work

---

## Setup (5 minutes)

### 1. Copy the template

```bash
# From eng-platform root
cp templates/.mcp.json ~/.claude/.mcp.json
```

### 2. Verify configuration

Your `~/.claude/.mcp.json` should contain:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "${HOME}/.claude/memory.json"
      }
    }
  }
}
```

### 3. Archive old history (optional but recommended)

```bash
cd ~/.claude
mv history.jsonl history.jsonl.archived-$(date +%Y%m%d)
```

**Note:** The archived file is safe to delete after 30 days if you haven't needed it.

### 4. Restart Claude Code / Cursor

The memory server will:
- Start automatically on first prompt
- Create `~/.claude/memory.json`
- Begin building your knowledge graph
- Free up 6+ MB of startup overhead

---

## How It Works

### Personal Memory (Not Team-Synced)

⚠️ **Important:** This server stores memory **locally per developer**. Each team member has their own `memory.json` file.

**What gets remembered:**
- Your project preferences
- Code patterns you frequently use
- Entities you work with (files, APIs, databases)
- Your personal workflow patterns

**What does NOT sync:**
- Team knowledge is NOT shared automatically
- Use project `CLAUDE.md` files for team-wide context
- Use GitHub documentation for shared knowledge

### For Team Knowledge Sharing

Use these instead:
- **Project `.claude/CLAUDE.md`** - Team standards, architecture docs
- **GitHub Wiki/Docs** - Shared onboarding, runbooks
- **ADRs** (Architecture Decision Records) - Design decisions
- **Living documentation** - Keep docs in code, version-controlled

---

## Verification

Check the server is running:

```bash
# After first Claude Code session
ls -lh ~/.claude/memory.json

# Should show a new JSON file (starts small, grows over time)
```

Expected output:
```
-rw-r--r-- 1 user user 2.5K Feb 09 01:00 /home/user/.claude/memory.json
```

---

## Troubleshooting

### Memory server not starting

```bash
# Test manually
npx -y @modelcontextprotocol/server-memory
```

### Old history still loading

- Verify `history.jsonl` was renamed/removed
- Restart Cursor/VS Code completely (quit, not just reload)

### "Command not found: npx"

Install Node.js 18+:
```bash
# Windows (via winget)
winget install OpenJS.NodeJS.LTS

# macOS (via Homebrew)
brew install node

# Linux (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
```

---

## Team Rollout

**Migration window:** Feb 9-16, 2026

1. ✅ **You:** Share this doc in team Slack/Discord
2. ✅ **Each developer:** Follow setup steps (5 min)
3. ✅ **Verify:** Everyone archives `history.jsonl`
4. ✅ **Monitor:** First week - check for issues

**Expected benefits:**
- Faster Claude Code startup (~2-5 seconds improvement)
- Better context retention across sessions
- Semantic memory queries (coming soon)

---

## References

- [Anthropic Knowledge Graph Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- [MCP Memory Benchmark](https://research.aimultiple.com/memory-mcp/)
- [eng-platform ADR-001: Memory Server Decision](#) *(coming soon)*

---

## Questions?

- Slack: `#eng-platform` channel
- Issues: [eng-platform/issues](https://github.com/your-org/eng-platform/issues)
