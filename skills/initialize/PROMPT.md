# Initialize eng-platform - LLM Prompt

**Engineer Types:** `/initialize` or "Add eng-platform to my project"

---

## 🚀 What This Does

Automatically sets up the **entire eng-platform** in your project:

1. ✅ Adds eng-platform as git submodule
2. ✅ Copies and configures all necessary files
3. ✅ Sets up MCP servers (Beads, team-analytics, etc.)
4. ✅ Configures linting, testing, git hooks
5. ✅ Initializes Beads for task management
6. ✅ Sets up tool tracking
7. ✅ Creates initial sprint structure
8. ✅ Configures CI/CD workflows

**Time:** 5 minutes, fully automated

---

## 📋 Usage

### **Option 1: Simple Command**
```
Engineer: /initialize

Claude will ask:
- Project type? (frontend, backend, fullstack)
- What to install? (minimal, recommended, full)
```

### **Option 2: Natural Language**
```
"Add eng-platform to my project"
"Setup eng-platform with full stack"
"Initialize eng-platform with minimal config"
```

### **Option 3: Specific**
```
/initialize --type fullstack --mode recommended
```

---

## 🎯 What Gets Installed

### **Minimal (5 min)**
- Git submodule
- ESLint, Prettier, TypeScript configs
- Git hooks (commitlint, lint-staged)
- CLAUDE.md template

### **Recommended (10 min)**
Everything in Minimal, plus:
- CI/CD workflows
- Beads for task management
- Team-analytics MCP server
- Tool tracking setup

### **Full (15 min)**
Everything in Recommended, plus:
- All MCP servers (research-swarm, basin-analyzer, etc.)
- All skills (protect, code-analyze, sprint-plan, etc.)
- Sprint workflow automation
- Tool experimentation framework

---

## 🔧 What the LLM Does

When engineer types `/initialize`:

```javascript
// Claude automatically:
1. Checks if eng-platform already exists
2. Adds as git submodule or clones
3. Copies config files with smart defaults
4. Creates .mcp.json with appropriate servers
5. Initializes Beads (bd init)
6. Creates sprints/ directory
7. Sets up tool tracking profile
8. Runs npm install
9. Configures git hooks
10. Validates everything works
11. Reports status with next steps
```

---

## 📊 Example Session

```
Engineer: /initialize

Claude:
🚀 Initializing eng-platform...

✅ Added eng-platform as submodule
✅ Copied ESLint, Prettier, TypeScript configs
✅ Set up git hooks (commitlint, husky)
✅ Configured MCP servers: beads, team-analytics
✅ Initialized Beads task management
✅ Created sprints/ directory
✅ Added you to engineer profiles (tool tracking)
✅ Installed dependencies

📋 Your eng-platform setup is complete!

What's Available:
- /sprint-plan - Create sprints
- /sprint-execute - Run multi-agent workflows
- /protect - Annotate protected code
- Beads - Task management (bd commands)
- Tool tracking - Measure effectiveness

Next Steps:
1. Create your first sprint: /sprint-plan create sprint-1 v1.0.0
2. Or start coding - all tools are ready!
```

---

## 🎓 Customization

The LLM asks questions to customize:

```
Claude: What type of project?
1. Frontend (React/Next.js)
2. Backend (Node/Express/tRPC)
3. Fullstack (All of the above)
4. Custom

Claude: Which MCP servers do you want?
1. Minimal (Just Beads for tasks)
2. Recommended (Beads + team-analytics)
3. Full (All 11 MCP servers)
4. Custom (I'll choose)

Claude: Tool preferences?
[Detects your IDE, linter, test framework and sets defaults]
```

---

## 🔄 Updates

To update eng-platform later:

```
Engineer: "Update eng-platform"

Claude:
✅ Updating git submodule...
✅ Checking for config changes...
⚠️  New MCP server available: xyz-analyzer
   Add it? (yes/no)
✅ Updated to latest version
```

---

## 🐛 Troubleshooting

If something fails, the LLM:
1. Reports exactly what failed
2. Suggests fixes
3. Can retry automatically
4. Provides manual fallback commands

```
Claude:
❌ Failed to initialize Beads

This is likely because 'bd' is not installed.

I can:
1. Guide you through installing Beads
2. Skip Beads for now (you can add later)
3. Try alternative task manager

Which would you like?
```

---

## 📚 What the Engineer Sees

**Before `/initialize`:**
- Empty project or existing code
- No tooling configured
- Manual setup required

**After `/initialize`:**
- Full eng-platform integrated
- All tools working
- Sprint workflow ready
- Multi-agent coordination setup
- Tool effectiveness tracking active

**Time saved:** ~2 hours of manual configuration

---

## 🎯 Success Criteria

After `/initialize`, engineer should be able to:
- ✅ Run `/sprint-plan create` immediately
- ✅ Use Beads for task management (`bd list`)
- ✅ Lint and format code (hooks work)
- ✅ See tool tracking (tracked in profiles)
- ✅ Start sprint execution with agents

---

## 💡 Pro Tips

1. **Run in clean directory:** Best results in new or clean projects
2. **Commit first:** Initialize commits before adding eng-platform
3. **Review configs:** Check generated configs match your style
4. **Customize:** Edit tool-stack in your engineer profile

---

## 🚀 Future: One-Command Everything

**Vision:**
```
Engineer: "Setup new fullstack project with eng-platform"

Claude:
✅ Created project directory
✅ Initialized git
✅ Added eng-platform
✅ Set up Next.js + tRPC + Prisma
✅ Configured all tooling
✅ Created first sprint
✅ Decomposed into subtasks
✅ Ready for multi-agent execution

Your project is ready in 5 minutes!
```
