# Quick Guide: Add MCP Tool from Repo

**Time:** 5-10 minutes per tool
**Goal:** Quickly integrate an MCP server from a GitHub repo into your project

---

## 🚀 Method 1: Reference from Submodule (Recommended)

### **If eng-platform is already a submodule:**

```bash
# 1. Add MCP tool to eng-platform
cd .eng-platform/mcp-servers

# 2. Clone the tool
git clone https://github.com/org/mcp-tool-name.git

# 3. Install dependencies
cd mcp-tool-name
npm install

# 4. Add to your .mcp.json (in your project root)
cat >> ../.mcp.json << 'EOF'
{
  "mcpServers": {
    "mcp-tool-name": {
      "command": "node",
      "args": ["${workspaceFolder}/.eng-platform/mcp-servers/mcp-tool-name/server.js"]
    }
  }
}
EOF

# 5. Restart Claude Code
```

**Done!** Tool is now available in Claude Code.

---

## 🔧 Method 2: Add Directly to Project

### **If you want tool in project, not platform:**

```bash
# 1. Create MCP directory in your project
mkdir -p mcp-servers
cd mcp-servers

# 2. Clone the tool
git clone https://github.com/org/mcp-tool-name.git

# 3. Install dependencies
cd mcp-tool-name
npm install

# 4. Add to .mcp.json (in your project root)
cat >> ../../.mcp.json << 'EOF'
{
  "mcpServers": {
    "mcp-tool-name": {
      "command": "node",
      "args": ["${workspaceFolder}/mcp-servers/mcp-tool-name/server.js"]
    }
  }
}
EOF

# 5. Restart Claude Code
```

---

## 📦 Method 3: npm Package (If Available)

### **If the MCP tool is published to npm:**

```bash
# 1. Install globally or locally
npm install -g @org/mcp-tool-name
# OR
npm install --save-dev @org/mcp-tool-name

# 2. Add to .mcp.json
{
  "mcpServers": {
    "mcp-tool-name": {
      "command": "npx",
      "args": ["-y", "@org/mcp-tool-name"]
    }
  }
}

# 3. Restart Claude Code
```

**Pro:** Auto-updates with `npx -y`

---

## 🎯 Quick Template: .mcp.json

```json
{
  "mcpServers": {
    "tool-name": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "OPTIONAL_ENV_VAR": "value"
      }
    }
  }
}
```

**Common paths:**
- Submodule: `${workspaceFolder}/.eng-platform/mcp-servers/tool-name/server.js`
- Project: `${workspaceFolder}/mcp-servers/tool-name/server.js`
- npm: Use `npx` command instead

---

## ✅ Verify Installation

```bash
# Check MCP servers are listed
# In Claude Code, type:
"List available MCP servers"

# Or test the tool directly
"Use [tool-name] to [do something]"
```

---

## 🔄 Add to tools-registry.json (Optional)

**If you want to track this tool for experimentation:**

1. **Edit tools-registry.json:**
```json
{
  "categories": {
    "your_category": {
      "options": [
        {
          "id": "mcp-tool-name",
          "name": "MCP Tool Name",
          "package": "@org/mcp-tool-name",
          "version": "^1.0.0",
          "description": "What this tool does",
          "status": "experimental",
          "introduced": "2026-02-09"
        }
      ],
      "tracked_metrics": [
        "code_quality_score",
        "velocity_commits_per_week"
      ]
    }
  }
}
```

2. **Update engineer profiles to track usage:**
```json
{
  "engineer_name": "Your Name",
  "tool_stack": {
    "your_category": "mcp-tool-name"
  }
}
```

---

## 📋 Popular MCP Tools to Add

### **From Anthropic/Community:**

```bash
# Filesystem operations
git clone https://github.com/modelcontextprotocol/servers.git mcp-servers/filesystem

# Database (PostgreSQL)
git clone https://github.com/modelcontextprotocol/servers.git mcp-servers/postgres

# Web search
git clone https://github.com/modelcontextprotocol/servers.git mcp-servers/brave-search

# GitHub integration
git clone https://github.com/modelcontextprotocol/servers.git mcp-servers/github
```

### **From eng-platform (Built-in):**

Already available in `.eng-platform/mcp-servers/`:
- research-swarm
- basin-analyzer
- constraint-validator
- report-writer
- team-analytics
- smart-memory
- postgres, mysql, dropbox

---

## 🐛 Troubleshooting

### **"MCP server not starting"**
```bash
# Check logs
node path/to/server.js

# Ensure dependencies are installed
cd path/to/mcp-tool
npm install
```

### **"Command not found"**
```bash
# Check path in .mcp.json is correct
# Use absolute paths if ${workspaceFolder} doesn't work
{
  "command": "node",
  "args": ["C:\\full\\path\\to\\server.js"]
}
```

### **"Environment variables missing"**
```json
// Add to .mcp.json
{
  "mcpServers": {
    "tool-name": {
      "command": "node",
      "args": ["..."],
      "env": {
        "API_KEY": "your-key-here",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

---

## 🎓 Example: Add a Custom Research Tool

```bash
# 1. Clone tool
cd .eng-platform/mcp-servers
git clone https://github.com/yourorg/research-assistant.git
cd research-assistant
npm install

# 2. Configure
cp config.example.json config.json
# Edit config.json with your settings

# 3. Add to .mcp.json
{
  "mcpServers": {
    "research-assistant": {
      "command": "node",
      "args": ["${workspaceFolder}/.eng-platform/mcp-servers/research-assistant/server.js"],
      "env": {
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}"
      }
    }
  }
}

# 4. Restart Claude Code

# 5. Test
# In Claude Code: "Use research-assistant to find papers on X"
```

---

## 🚀 Next: Track Tool Effectiveness

Once tool is added:

1. **Add to tools-registry.json** (if tracking)
2. **Update your engineer profile**
3. **Run experiment** (if comparing tools)
   ```bash
   node scripts/manage-experiments.js start exp-xxx
   ```
4. **Analyze effectiveness**
   ```bash
   node scripts/analyze-tool-effectiveness.js your_category
   ```

---

## 📚 Related Docs

- [MCP Official Docs](https://modelcontextprotocol.io)
- [MCP Server Repository](https://github.com/modelcontextprotocol/servers)
- [Tool Experimentation Guide](./tool-experimentation-guide.md)
- [tools-registry.json](../../tools-registry.json)

---

**Questions?** Check [CONTRIBUTING.md](../../CONTRIBUTING.md) or open an issue.
