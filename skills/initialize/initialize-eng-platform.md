# Initialize eng-platform Skill - Implementation

**This is the prompt Claude uses when engineer types `/initialize`**

---

## 🎯 Task

Set up eng-platform in the current project with full automation.

---

## 📋 Step-by-Step Instructions

### **Step 1: Gather Requirements**

Ask the engineer:

**Question 1:** What type of project is this?
- A) Frontend (React/Next.js/Vue)
- B) Backend (Node/Express/tRPC/API)
- C) Fullstack (Frontend + Backend)
- D) Other (describe)

**Question 2:** What installation mode?
- A) Minimal (configs only, 5 min)
- B) Recommended (configs + MCP servers, 10 min)
- C) Full (everything, 15 min)
- D) Custom (I'll choose components)

**Question 3:** Do you already have eng-platform?
- A) No, add it now
- B) Yes, already added as submodule
- C) Yes, as sibling directory

---

### **Step 2: Verify Prerequisites**

Check and report:

```bash
# Check git
git --version

# Check Node.js
node --version

# Check if already initialized
test -d .eng-platform && echo "EXISTS" || echo "NEW"

# Check if Beads installed (optional)
which bd || echo "NOT_INSTALLED"
```

Report to engineer what's available.

---

### **Step 3: Add eng-platform**

**If not already added:**

```bash
# Option A: Git Submodule (Recommended)
git submodule add https://github.com/Bbadhub/eng-platform.git .eng-platform
git submodule update --init --recursive

# Option B: Sibling Directory
cd ..
git clone https://github.com/Bbadhub/eng-platform.git
cd -
```

---

### **Step 4: Install Configs (All Modes)**

**ESLint:**
```bash
# Create .eslintrc.js
cat > .eslintrc.js << 'EOF'
module.exports = {
  extends: [
    './.eng-platform/configs/eslint/base.js',
    './.eng-platform/configs/eslint/typescript.js',
  ],
  parserOptions: {
    project: './tsconfig.json',
  },
};
EOF
```

**Prettier:**
```bash
cp .eng-platform/configs/prettier/.prettierrc.json ./
```

**TypeScript:**
```bash
cp .eng-platform/configs/typescript/tsconfig.base.json ./tsconfig.json
```

**commitlint:**
```bash
cp .eng-platform/configs/commitlint/commitlint.config.js ./
```

**Git Hooks:**
```bash
# Install husky
npm install --save-dev husky lint-staged @commitlint/cli

# Initialize husky
npx husky init

# Copy hooks
cp .eng-platform/configs/husky/.husky/* .husky/

# Configure lint-staged in package.json
npm pkg set 'lint-staged["*.{ts,tsx,js,jsx}"]'='["eslint --fix", "prettier --write"]'
npm pkg set 'lint-staged["*.{json,md}"]'='["prettier --write"]'
```

**CLAUDE.md:**
```bash
cp .eng-platform/templates/CLAUDE.md ./
# Engineer should edit this later
```

---

### **Step 5: MCP Servers (Recommended/Full Modes)**

**Create .mcp.json:**

```bash
# Minimal mode: Skip

# Recommended mode:
cat > .mcp.json << 'EOF'
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
EOF

# Full mode: Add all 11 MCP servers
# (research-swarm, basin-analyzer, etc.)
```

**Install MCP dependencies:**
```bash
cd .eng-platform/mcp-servers/beads-integration && npm install && cd -
cd .eng-platform/mcp-servers/team-analytics && npm install && cd -
```

---

### **Step 6: Initialize Beads**

```bash
# Check if Beads is installed
if which bd > /dev/null; then
  bd init
  echo "✅ Beads initialized"
else
  echo "⚠️  Beads not installed. Install with: npm install -g beads"
  echo "   Or skip for now (you can add later)"
fi
```

---

### **Step 7: Setup Sprint Structure**

```bash
# Create sprints directory
mkdir -p sprints

# Create first sprint template
cat > sprints/sprint-1.toml << 'EOF'
[sprint]
id = 1
version = "v1.0.0"
start_date = "2026-02-09"
end_date = "2026-02-23"
# github_issues = []  # Optional

[[tasks]]
title = "Setup project structure"
assignee = "human"
priority = "high"
labels = ["setup"]

[[tasks]]
title = "Implement first feature"
assignee = "agent-api"
depends_on = []
priority = "high"
labels = ["feature"]
EOF
```

---

### **Step 8: Setup Tool Tracking**

**Add engineer to profiles:**

```bash
# Get engineer name and email
ENGINEER_NAME=$(git config user.name)
ENGINEER_EMAIL=$(git config user.email)

# Add to engineer-tool-profiles.json
# (Check if file exists, create or update)
```

---

### **Step 9: CI/CD Workflows (Full Mode)**

```bash
mkdir -p .github/workflows

# Copy workflows
cp .eng-platform/workflows/nightly-e2e.yml .github/workflows/
cp .eng-platform/workflows/regression-tests.yml .github/workflows/
cp .eng-platform/workflows/database-validation.yml .github/workflows/

# Engineer should edit to match project
```

---

### **Step 10: Install Dependencies**

```bash
npm install
```

---

### **Step 11: Verify Installation**

Run these checks:

```bash
# Linting
npm run lint || echo "⚠️  Lint script not in package.json"

# Git hooks
git add . && git commit -m "chore: initialize eng-platform" --dry-run

# Beads
bd list || echo "⚠️  Beads not initialized"

# MCP servers (if Claude Code running)
# Claude will auto-detect
```

---

### **Step 12: Report Success**

Tell engineer:

```
✅ eng-platform initialized successfully!

📦 What was installed:
- ESLint, Prettier, TypeScript configs
- Git hooks (commitlint, lint-staged)
- Beads task management
- MCP servers: beads, team-analytics
- Sprint structure (sprints/)
- Tool tracking profile

🎯 Available commands:
- /sprint-plan create sprint-1 v1.0.0 "Description"
- /sprint-execute start sprint-1
- /protect (annotate protected code)
- bd list (Beads task management)

📋 Next steps:
1. Edit CLAUDE.md with your project context
2. Create your first sprint: /sprint-plan create sprint-1
3. Or start coding - all tools ready!

📚 Documentation:
- apply-to-existing-project.md (sync strategies)
- tool-experimentation-guide.md (A/B testing)
- add-mcp-tool-quick-guide.md (add more tools)
```

---

## 🐛 Error Handling

If any step fails:
1. Report exactly what failed
2. Show the error message
3. Suggest fixes
4. Offer to:
   - Skip that component
   - Retry
   - Show manual commands

**Example:**
```
❌ Failed to initialize Beads: command 'bd' not found

This means Beads CLI is not installed.

Options:
1. Install now: npm install -g beads
2. Skip Beads (can add later)
3. Show manual installation guide

Which would you like? (1/2/3)
```

---

## 💡 Pro Tips for Claude

1. **Check before creating:** Don't overwrite existing configs
2. **Preserve customizations:** If file exists, ask before replacing
3. **Install progressively:** Show progress after each step
4. **Validate everything:** Check each step worked
5. **Provide rollback:** If engineer wants to undo

---

## 🎯 Success Criteria

After initialization, verify:
- [ ] .eng-platform exists (submodule or sibling)
- [ ] Config files created (.eslintrc.js, .prettierrc.json, etc.)
- [ ] Git hooks working (test with dummy commit)
- [ ] MCP servers configured (check .mcp.json)
- [ ] Beads initialized (check .beads/ directory)
- [ ] Sprint structure created (sprints/ directory)
- [ ] Engineer added to tool profiles
- [ ] npm install completed successfully

All ✅ = Ready for development!

---

## 🚀 Usage in Claude Code

Engineer types:
```
/initialize
```

Claude automatically executes all steps above, asking questions only when needed.

**Time:** 5-15 minutes depending on mode
**Result:** Fully configured eng-platform
