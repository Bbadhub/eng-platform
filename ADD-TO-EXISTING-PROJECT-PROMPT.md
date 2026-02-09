# Add eng-platform to Existing Project - LLM Prompt

**For established projects with existing tooling**

---

## 🎯 Copy This Prompt

```
I want to add eng-platform to this existing project.

This is an established project with existing configs, so:
1. Don't overwrite existing configs without asking
2. Analyze current setup first (ESLint, Prettier, TypeScript, git hooks)
3. Show me what conflicts and suggest merge strategy
4. Add eng-platform as git submodule at .eng-platform/
5. Set up MCP servers (.mcp.json) for:
   - beads-integration (task management)
   - team-analytics (tool effectiveness tracking)
6. Create sprints/ directory if it doesn't exist
7. Add CLAUDE.md if it doesn't exist
8. Show me what was added and what I need to review

Be careful - this is production code. Show me conflicts before making changes.
```

---

## 📋 What Claude Will Do

### **Step 1: Analyze Current Setup**
Claude will check:
- Existing ESLint config (.eslintrc.js, .eslintrc.json, etc.)
- Existing Prettier config
- Existing TypeScript config
- Existing git hooks (.husky/, .git/hooks/)
- Existing package.json scripts
- Existing MCP servers (.mcp.json)

### **Step 2: Report Conflicts**
Claude will show you:
```
📊 Current Setup Analysis:

ESLint: Found .eslintrc.json (extends @company/eslint-config)
Prettier: Found .prettierrc.json (custom rules)
Git Hooks: Found .husky/ with pre-commit
MCP Servers: None found

Recommendation:
- ESLint: Keep your config, optionally add eng-platform rules
- Prettier: Your config looks good, no changes needed
- Git Hooks: Merge with eng-platform hooks
- MCP Servers: Safe to add
```

### **Step 3: Add eng-platform (Safe)**
```bash
# Add as git submodule
git submodule add https://github.com/Bbadhub/eng-platform.git .eng-platform
git submodule update --init --recursive
```

### **Step 4: Selective Integration**
Claude will ask for each component:
- **Configs:** Merge or keep yours?
- **MCP Servers:** Add beads + team-analytics?
- **Sprint Structure:** Add sprints/ directory?
- **CLAUDE.md:** Add template?

### **Step 5: Install MCP Servers (Safe)**
Only adds new .mcp.json or merges with existing:
```json
{
  "mcpServers": {
    "beads": {
      "command": "node",
      "args": ["${workspaceFolder}/.eng-platform/mcp-servers/beads-integration/server.js"]
    },
    "team-analytics": {
      "command": "node",
      "args": ["${workspaceFolder}/.eng-platform/mcp-servers/team-analytics/server.js"]
    }
  }
}
```

### **Step 6: Summary Report**
```
✅ eng-platform added to existing project

What was added:
- Git submodule: .eng-platform/
- MCP servers: beads, team-analytics
- Sprint directory: sprints/

What was NOT changed:
- Your existing ESLint config (kept as-is)
- Your existing Prettier config (kept as-is)
- Your existing git hooks (kept as-is)

Optional next steps:
1. Review eng-platform configs: .eng-platform/configs/
2. Consider merging eng-platform ESLint rules (optional)
3. Install MCP dependencies: cd .eng-platform/mcp-servers/beads-integration && npm install
4. Try sprint workflow: Create sprints/sprint-1.toml
```

---

## 🔒 Safety Features

Claude will:
- ✅ Analyze before changing anything
- ✅ Show conflicts and ask permission
- ✅ Never overwrite existing configs without approval
- ✅ Create backups if modifying files
- ✅ Validate changes don't break existing setup
- ✅ Only add new files by default

---

## 💬 Alternative Versions

### **Minimal (Just MCP Servers)**
```
Add eng-platform to this project as a git submodule.
Only set up MCP servers (beads, team-analytics) - don't touch existing configs.
```

### **With Config Review**
```
Add eng-platform to this project and compare my current configs
(ESLint, Prettier, TypeScript) with eng-platform's recommended configs.
Show me differences and suggest improvements.
```

### **Full Analysis**
```
Add eng-platform to this established project.
Analyze my current tooling, show conflicts, and recommend
which eng-platform components would benefit this project.
Don't change anything without my approval.
```

---

## 🎯 Example: Established React Project

```
Engineer: "Add eng-platform to this project - it's an existing React app with custom ESLint and Prettier configs"

Claude:
📊 Analyzing current project...

Found:
- React 18.2.0
- ESLint 8.x with @company/eslint-config-react
- Prettier 3.x with custom rules
- Husky git hooks (pre-commit, commit-msg)
- No MCP servers
- No sprint structure

✅ Safe to add:
1. Git submodule at .eng-platform/
2. MCP servers (beads, team-analytics)
3. Sprint structure (sprints/)

⚠️  Would conflict:
- Your ESLint config vs eng-platform's (both valid)
- Your Prettier config vs eng-platform's (minor differences)

Recommendation:
✅ Add submodule + MCP servers (no conflicts)
📋 Keep your configs (they're good)
🔧 Optional: Review eng-platform patterns for ideas

Proceed? (yes/no)
```

---

## 🚀 Quick Decision Tree

**Q: Do you want to change your existing configs?**
- **No** → Use "Minimal" prompt (MCP servers only)
- **Maybe** → Use "With Config Review" prompt (see differences)
- **Yes** → Use main prompt (merge configs)

**Q: Is your project in active development?**
- **Yes** → Use main prompt (careful, asks permission)
- **Stable** → Can be more aggressive with changes

**Q: Do you already use git submodules?**
- **Yes** → Main prompt works great
- **No** → Claude will explain submodule workflow

---

## 🐛 Troubleshooting

**If Claude tries to overwrite your configs:**
```
"Stop - don't touch my existing configs. Only add the git submodule and MCP servers."
```

**If you want to see differences first:**
```
"Show me how eng-platform's ESLint config differs from mine before changing anything."
```

**If you want to try configs in isolation:**
```
"Create a test branch and show me what eng-platform configs would look like in this project."
```

---

## 📚 After Adding eng-platform

**Try these next:**

1. **Tool Experimentation:**
   ```
   "Show me which tools my team could experiment with using eng-platform's tracking system"
   ```

2. **Sprint Workflow:**
   ```
   "Help me create my first sprint using the eng-platform sprint structure"
   ```

3. **Review Configs:**
   ```
   "Compare my ESLint config with eng-platform's recommended config"
   ```

---

**Time:** 5-10 minutes
**Risk:** Low (asks permission before changes)
**Result:** eng-platform integrated without breaking existing setup
