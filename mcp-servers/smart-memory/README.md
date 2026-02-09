# Smart Memory MCP Server

**Auto-detects project context** and namespaces memories automatically.

## Features

- 🧠 **Automatic context detection** - Knows if you're in LegalAI, AdHub, or eng-platform
- 📁 **Project-aware namespacing** - Memories tagged with correct project
- 🔍 **Context-filtered search** - Search within specific project or org-wide
- ✅ **No manual prefixing** - Just say "Remember: ..." and it figures out the context

## How It Works

### Context Detection

Detects project from:
1. **Working directory** - `pwd` contains project name
2. **Project markers** - Looks for signature files:
   - `legalai`: `legalai-browser/`, `prisma/schema.prisma`
   - `adhub`: `next.config.js`, `adhub`
   - `eng-platform`: `mcp-servers/`, `docs/decisions/`
3. **Defaults to `org`** if no project detected

### Usage

```bash
# Working in LegalAI
cd LegalAI_System
claude "Remember: tRPC routers are in src/server/routers/"
# → Stored as: legalai:observation

# Working in AdHub
cd AdHub
claude "Remember: Use Supabase for auth"
# → Stored as: adhub:observation

# Org-wide (from any location)
claude "Remember: We use conventional commits"
# → Stored as: org:observation (if not in a project)
```

### Querying

```bash
# Auto-searches current context
cd LegalAI_System
claude "What's our API structure?"
# → Searches legalai namespace

# Explicit context
claude "What does adhub use for auth?"
# → Searches adhub namespace
```

## Installation

### 1. Install dependencies

```bash
cd eng-platform/mcp-servers/smart-memory
npm install
```

### 2. Update MCP config

**Replace** the standard memory server with smart-memory:

```json
// ~/.claude/.mcp.json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": [
        "C:\\Users\\Brett\\Documents\\GitHub\\eng-platform\\mcp-servers\\smart-memory\\index.js"
      ],
      "env": {
        "MEMORY_FILE_PATH": "C:\\Users\\Brett\\Documents\\GitHub\\eng-platform\\.shared\\team-memory.json"
      }
    }
  }
}
```

### 3. Test

```bash
cd LegalAI_System
claude "What context am I in?"
# → Should return: legalai

claude "Remember: This is a test"
# Check team-memory.json - should be namespaced under legalai
```

## Configuration

### Adding New Projects

Edit `PROJECT_MARKERS` in `index.js`:

```javascript
const PROJECT_MARKERS = {
  'legalai': ['legalai-browser', 'prisma/schema.prisma'],
  'adhub': ['next.config.js', 'adhub'],
  'my-new-project': ['unique-file.txt', 'my-project-folder']
};
```

## Tools Available

| Tool | Description |
|------|-------------|
| `create_entity` | Create entity (auto-detects context) |
| `create_observation` | Add observation (auto-detects context) |
| `search_memories` | Search with optional context filter |
| `get_current_context` | Get detected context + cwd |

## Example Memory Structure

```json
{
  "entities": {
    "org": {
      "name": "org",
      "type": "namespace",
      "observations": ["Use conventional commits"]
    },
    "legalai:api": {
      "name": "api",
      "type": "system",
      "context": "legalai",
      "observations": ["tRPC routers in src/server/routers/"]
    }
  },
  "observations": [
    {
      "content": "Use conventional commits",
      "context": "org",
      "timestamp": "2026-02-09T00:00:00Z"
    }
  ]
}
```

## Comparison

| Feature | Official MCP Memory | Smart Memory |
|---------|---------------------|--------------|
| **Context detection** | ❌ Manual | ✅ Automatic |
| **Namespacing** | ❌ No | ✅ Yes |
| **Extra typing** | ⚠️ "Remember for legalai:" | ✅ "Remember:" |
| **Maintenance** | ✅ Anthropic | ⚠️ You maintain |

## When to Use

**Use Smart Memory if:**
- ✅ You have 3+ projects
- ✅ Team forgets to add context prefixes
- ✅ You want automatic organization

**Use Official Memory if:**
- ✅ Simple setup preferred
- ✅ Only 1-2 projects
- ✅ Manual control preferred
