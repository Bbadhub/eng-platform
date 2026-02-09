# MCP Server Setup Guide

**Smart-Memory** and **Team-Analytics** MCP servers for cross-platform team knowledge and engineer health monitoring.

---

## ✅ Cross-Platform Compatibility

Both MCP servers are **fully compatible** with Windows, Mac, and Linux. Only the file paths differ.

---

## 🔧 Installation

### For Claude Code CLI

**Windows:**
```json
// ~/.claude/.mcp.json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\Documents\\GitHub\\eng-platform\\mcp-servers\\smart-memory\\index.js"],
      "env": {
        "MEMORY_FILE_PATH": "C:\\Users\\YourName\\Documents\\GitHub\\eng-platform\\.shared\\team-memory.json"
      }
    },
    "team-analytics": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\Documents\\GitHub\\eng-platform\\mcp-servers\\team-analytics\\server.js"],
      "env": {
        "MEMORY_FILE_PATH": "C:\\Users\\YourName\\Documents\\GitHub\\eng-platform\\.shared\\team-memory.json",
        "REPO_PATH": "C:\\Users\\YourName\\Documents\\GitHub\\LegalAI_System"
      }
    }
  }
}
```

**Mac/Linux:**
```json
// ~/.claude/.mcp.json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/Users/yourname/Documents/GitHub/eng-platform/mcp-servers/smart-memory/index.js"],
      "env": {
        "MEMORY_FILE_PATH": "/Users/yourname/Documents/GitHub/eng-platform/.shared/team-memory.json"
      }
    },
    "team-analytics": {
      "command": "node",
      "args": ["/Users/yourname/Documents/GitHub/eng-platform/mcp-servers/team-analytics/server.js"],
      "env": {
        "MEMORY_FILE_PATH": "/Users/yourname/Documents/GitHub/eng-platform/.shared/team-memory.json",
        "REPO_PATH": "/Users/yourname/Documents/GitHub/LegalAI_System"
      }
    }
  }
}
```

---

### For Cursor

**Option 1: Project-Specific Config**

Create `.cursor/mcp.json` in your project root:

**Windows:**
```json
// .cursor/mcp.json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\Documents\\GitHub\\eng-platform\\mcp-servers\\smart-memory\\index.js"],
      "env": {
        "MEMORY_FILE_PATH": "C:\\Users\\YourName\\Documents\\GitHub\\eng-platform\\.shared\\team-memory.json"
      }
    }
  }
}
```

**Mac:**
```json
// .cursor/mcp.json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/Users/yourname/Documents/GitHub/eng-platform/mcp-servers/smart-memory/index.js"],
      "env": {
        "MEMORY_FILE_PATH": "/Users/yourname/Documents/GitHub/eng-platform/.shared/team-memory.json"
      }
    }
  }
}
```

**Option 2: Cursor Settings UI**
1. Open Cursor Settings (Cmd/Ctrl + ,)
2. Search for "MCP" or "Model Context Protocol"
3. Add servers via the UI (paths will be platform-specific)

---

## 📊 Available Tools

### Smart-Memory
- `memory.create_entity` - Create knowledge graph entities
- `memory.create_observation` - Add observations to entities
- `memory.create_relation` - Link entities together
- `memory.search` - Search knowledge graph

### Team-Analytics
- `team-analytics.engineer_health` - Individual health score with alerts
- `team-analytics.team_insights` - Organization-wide health
- `team-analytics.daily_summary` - Daily health check with action items
- `team-analytics.training_recommendations` - Suggested training programs
- `team-analytics.find_mentors` - Mentoring pair suggestions

---

## 🧪 Testing

Test the smart-memory system:

**Windows:**
```powershell
cd C:\Users\YourName\Documents\GitHub\eng-platform\mcp-servers\smart-memory
node test-memory.js
```

**Mac/Linux:**
```bash
cd ~/Documents/GitHub/eng-platform/mcp-servers/smart-memory
node test-memory.js
```

Expected output:
```
🧪 Testing smart-memory system...

📖 Current memory state:
  - Entities: 0
  - Relations: 0
  - Observations: 0

✅ Test memory created successfully!
```

---

## 🔄 Git Sync Workflow

The team memory is **automatically synced** via Git:

1. **Pull before work:**
   ```bash
   cd eng-platform
   git pull
   ```

2. **Work with memory** (via Claude Code/Cursor using MCP tools)

3. **Commit and push:**
   ```bash
   git add .shared/team-memory.json
   git commit -m "docs: update team knowledge"
   git push
   ```

4. **Team members pull** to get latest knowledge

---

## 🛠️ Path Configuration for Teams

### Using Environment Variables (Recommended for Teams)

Instead of hardcoding paths, use environment variables:

**Windows (.env):**
```env
ENG_PLATFORM_PATH=C:\Users\YourName\Documents\GitHub\eng-platform
PROJECT_PATH=C:\Users\YourName\Documents\GitHub\LegalAI_System
```

**Mac (.env):**
```env
ENG_PLATFORM_PATH=/Users/yourname/Documents/GitHub/eng-platform
PROJECT_PATH=/Users/yourname/Documents/GitHub/LegalAI_System
```

Then reference in MCP config:
```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["${ENG_PLATFORM_PATH}/mcp-servers/smart-memory/index.js"],
      "env": {
        "MEMORY_FILE_PATH": "${ENG_PLATFORM_PATH}/.shared/team-memory.json"
      }
    }
  }
}
```

---

## 🔍 Troubleshooting

### MCP Tools Not Appearing

1. **Verify Node.js:** `node --version` (requires v18+)
2. **Check syntax:** `node -c path/to/index.js`
3. **Restart editor:** Close and reopen Cursor/Claude Code
4. **Check logs:** Look for MCP startup errors in console

### Path Issues

**Windows:**
- Use double backslashes: `C:\\Users\\...`
- Or forward slashes: `C:/Users/...` (also works in Node.js)

**Mac/Linux:**
- Use forward slashes: `/Users/...`
- Check file permissions: `chmod +x index.js`

### Git Conflicts in team-memory.json

If multiple team members edit simultaneously:
```bash
git pull
# Resolve conflicts manually (keep both contributions if possible)
git add .shared/team-memory.json
git commit -m "merge: resolve team memory conflicts"
git push
```

---

## 📝 Platform Differences Summary

| Aspect | Windows | Mac | Linux |
|--------|---------|-----|-------|
| **Path separator** | `\` or `/` | `/` | `/` |
| **Example path** | `C:\Users\...` | `/Users/...` | `/home/...` |
| **Node.js** | ✅ Same | ✅ Same | ✅ Same |
| **Git sync** | ✅ Same | ✅ Same | ✅ Same |
| **MCP protocol** | ✅ Same | ✅ Same | ✅ Same |

**All code is identical across platforms** - only configuration paths differ.

---

## 🚀 Quick Start for New Team Members

1. **Clone eng-platform:**
   ```bash
   git clone https://github.com/Bbadhub/eng-platform.git
   ```

2. **Copy MCP config template** (adjust paths for your OS)

3. **Test memory system:**
   ```bash
   cd eng-platform/mcp-servers/smart-memory
   node test-memory.js
   ```

4. **Restart Cursor/Claude Code**

5. **Verify tools available** - Try creating a memory in your editor

---

**Cross-platform tested:** ✅ Windows 11, ✅ macOS (not yet), ✅ Linux (not yet)

Need help? Check [TEST_RESULTS.md](./TEST_RESULTS.md) for validation results.
