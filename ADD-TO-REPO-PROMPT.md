# Add eng-platform to Your Repo - LLM Prompt

**Copy/paste this into Claude Code:**

---

```
Add eng-platform to this project with the following setup:

1. Add eng-platform as git submodule at .eng-platform/
   git submodule add https://github.com/Bbadhub/eng-platform.git .eng-platform

2. Copy essential configs:
   - ESLint (.eslintrc.js) - reference .eng-platform/configs/eslint/
   - Prettier (.prettierrc.json)
   - TypeScript (tsconfig.json)
   - commitlint (commitlint.config.js)

3. Setup git hooks:
   - Install husky and lint-staged
   - Copy .husky/ hooks from .eng-platform/configs/husky/
   - Configure lint-staged in package.json

4. Setup MCP servers in .mcp.json:
   - beads-integration (for task management)
   - team-analytics (for health tracking)

5. Initialize Beads:
   - Run: bd init (if Beads is installed)
   - If not installed, show installation instructions

6. Create sprint structure:
   - Create sprints/ directory
   - Add sample sprint-1.toml template

7. Add me to engineer profiles:
   - Update .eng-platform/mcp-servers/team-analytics/data/engineer-tool-profiles.json
   - Use my git config name/email
   - Set my tool stack (detect from project or ask)

8. Copy CLAUDE.md template to project root
   - I'll customize it later

Show me what was installed and next steps when done.
```

---

## 🎯 Alternative: Shorter Version

```
Add eng-platform to this project:
- Git submodule at .eng-platform/
- Copy configs (ESLint, Prettier, TypeScript, commitlint, git hooks)
- Setup MCP servers (beads, team-analytics) in .mcp.json
- Initialize Beads (bd init)
- Create sprints/ directory
- Add me to engineer profiles
- Copy CLAUDE.md template

Show results and next steps.
```

---

## 💬 Super Short: Natural Language

```
"Add eng-platform to my project with full setup"
```

or

```
"Setup eng-platform here - configs, MCP servers, Beads, everything"
```

---

## ✅ What It Does

Claude will:
1. ✅ Add git submodule
2. ✅ Create config files (.eslintrc.js, .prettierrc.json, etc.)
3. ✅ Setup git hooks (husky)
4. ✅ Create .mcp.json with Beads + team-analytics
5. ✅ Initialize Beads (if installed)
6. ✅ Create sprints/ directory with template
7. ✅ Add you to tool tracking
8. ✅ Copy CLAUDE.md
9. ✅ Report what was done

---

## 📋 Expected Output

```
✅ eng-platform added successfully!

What was installed:
- Git submodule: .eng-platform/
- Configs: ESLint, Prettier, TypeScript, commitlint
- Git hooks: Husky + lint-staged
- MCP servers: beads-integration, team-analytics
- Beads initialized: .beads/
- Sprint structure: sprints/sprint-1.toml
- Engineer profile: Added Brett with tool stack
- CLAUDE.md: Template copied

Next steps:
1. Edit CLAUDE.md with your project context
2. Install dependencies: npm install
3. Test linting: npm run lint
4. Create first sprint: /sprint-plan create sprint-1 v1.0.0
5. Or start coding - everything is ready!

📚 Docs: .eng-platform/docs/
```

---

## 🐛 If It Fails

Claude should:
1. Report exactly what failed
2. Show error message
3. Suggest fix or manual commands
4. Offer to retry

---

## 🚀 Quick Test After Install

```bash
# Verify git submodule
git submodule status

# Verify configs
ls -la .eslintrc.js .prettierrc.json tsconfig.json

# Verify MCP servers
cat .mcp.json

# Verify Beads
bd list

# Verify you're in profiles
cat .eng-platform/mcp-servers/team-analytics/data/engineer-tool-profiles.json | grep "your-name"
```

---

## 🔄 Contributing Back (Complete the Loop)

**After you've built something useful in your project:**

```
"I want to contribute [tool-name] to eng-platform"
```

See [CONTRIBUTE-TOOL-PROMPT.md](CONTRIBUTE-TOOL-PROMPT.md) for the complete two-way workflow.

**Examples of what to contribute:**
- Custom MCP servers you've built
- Useful scripts or automation
- New config variations (ESLint rules, etc.)
- Patterns or ADRs that worked well
- Workflow improvements

**The loop:**
1. Add eng-platform to your project (this prompt)
2. Build tools and find what works
3. Contribute them back (CONTRIBUTE-TOOL-PROMPT.md)
4. Everyone benefits via `git submodule update --remote`

---

## 💡 Pro Tip

**Before running:**
```bash
git status  # Make sure you're in a git repo
git commit -am "Checkpoint before adding eng-platform"
```

**Then:**
```
"Add eng-platform to my project"
```

**Takes:** 5-10 minutes
**Result:** Fully configured eng-platform ready to use
