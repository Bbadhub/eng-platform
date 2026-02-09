# Apply eng-platform to Existing Project

**Time:** 15-30 minutes
**Goal:** Add eng-platform standards to an existing repository and keep it synced

---

## 🎯 Decision Tree: What to Install vs Not Install

### **Option 1: Lightweight (Configs Only)**
**Use When:** You want standards without infrastructure
**Install:**
- ✅ Configs (ESLint, Prettier, TypeScript)
- ✅ Git hooks (Husky, commitlint)
- ✅ CI/CD workflows
- ✅ CLAUDE.md template

**Don't Install:**
- ❌ MCP servers (too heavy for simple projects)
- ❌ Skills (AI workflow automation - optional)
- ❌ Scripts (metrics, team-sync - org-level only)

### **Option 2: Full Stack (Everything)**
**Use When:** You want full platform capabilities
**Install:**
- ✅ Everything from Option 1
- ✅ MCP servers (research-swarm, team-analytics, etc.)
- ✅ Skills (protect, sprint-plan, code-analyze)
- ✅ Scripts (DORA metrics, team-sync-check)

### **Option 3: Custom (Pick & Choose)**
**Use When:** You know exactly what you need
**Install:** See checklist below

---

## 🚀 Quick Start: Add to New Repo

### **Step 1: Choose Your Sync Strategy**

#### **Strategy A: Git Submodule (Recommended)**
**Pros:** Always synced, single source of truth
**Cons:** Requires git submodule understanding

```bash
cd /path/to/your-project

# Add eng-platform as submodule
git submodule add https://github.com/Bbadhub/eng-platform.git .eng-platform

# Update to latest
git submodule update --remote .eng-platform

# Commit
git add .gitmodules .eng-platform
git commit -m "chore: add eng-platform as submodule"
```

#### **Strategy B: Copy Files (Simple)**
**Pros:** No submodule complexity
**Cons:** Manual sync required

```bash
cd /path/to/your-project

# Clone eng-platform to sibling directory
cd ..
git clone https://github.com/Bbadhub/eng-platform.git
cd your-project

# Copy what you need (see Step 2)
```

#### **Strategy C: npm Packages (Future)**
**Status:** Planned for v0.4.0
**Pros:** npm handles updates automatically
**Cons:** Not available yet

```bash
# Coming soon:
npm install @your-org/eslint-config-base
npm install @your-org/prettier-config
```

---

## 📦 Step 2: Install Components

### **Configs (Always Install)**

```bash
# ESLint
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

# Prettier
cp .eng-platform/configs/prettier/.prettierrc.json ./

# TypeScript
cp .eng-platform/configs/typescript/tsconfig.base.json ./tsconfig.json

# commitlint
cp .eng-platform/configs/commitlint/commitlint.config.js ./
```

### **Git Hooks (Highly Recommended)**

```bash
# Install husky
npm install --save-dev husky lint-staged @commitlint/cli

# Copy hooks
cp -r .eng-platform/configs/husky/.husky ./

# Configure lint-staged
npm pkg set lint-staged="{ \"*.{ts,tsx,js,jsx}\": [\"eslint --fix\", \"prettier --write\"], \"*.{json,md}\": [\"prettier --write\"] }"
```

### **CI/CD Workflows (Recommended)**

```bash
# Copy workflows
mkdir -p .github/workflows
cp .eng-platform/workflows/nightly-e2e.yml .github/workflows/
cp .eng-platform/workflows/regression-tests.yml .github/workflows/
cp .eng-platform/workflows/database-validation.yml .github/workflows/

# Edit workflows to match your project:
# - Update database URLs
# - Update project name
# - Adjust test paths
```

### **CLAUDE.md (Always Install)**

```bash
# Copy template
cp .eng-platform/templates/CLAUDE.md ./CLAUDE.md

# Edit to add project-specific context:
# - Project name
# - Architecture overview
# - Domain-specific patterns
# - Protected code locations
```

### **MCP Servers (Optional)**

```bash
# Option A: Reference from submodule
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "team-analytics": {
      "command": "node",
      "args": ["${workspaceFolder}/.eng-platform/mcp-servers/team-analytics/server.js"]
    },
    "research-swarm": {
      "command": "node",
      "args": ["${workspaceFolder}/.eng-platform/mcp-servers/research-swarm/server.js"]
    }
  }
}
EOF

# Option B: Copy and customize
cp -r .eng-platform/mcp-servers/team-analytics ./mcp-servers/
cd mcp-servers/team-analytics && npm install
# Edit config.json with your team info
```

### **Skills (Optional - AI Workflows)**

```bash
# Copy skills to .claude/skills/
mkdir -p .claude/skills
cp -r .eng-platform/skills/* .claude/skills/

# Skills available:
# - /protect - Annotate code with protection levels
# - /sprint-plan - Create structured sprint plans
# - /code-analyze - Pattern analysis
# - /protection-audit - Compliance reporting
```

### **Scripts (Optional - Org-Level Tools)**

```bash
# DORA metrics (for org-level tracking)
cp .eng-platform/scripts/metrics/engineering-velocity.js ./scripts/

# Team sync check (for environment validation)
cp .eng-platform/scripts/team-sync-check.js ./scripts/

# Determinism gate (for anti-hallucination testing)
cp .eng-platform/scripts/test-determinism-gate.js ./scripts/
```

---

## 🔄 Step 3: Keep in Sync

### **Strategy A: Git Submodule Updates**

```bash
# Weekly sync (recommended)
git submodule update --remote .eng-platform
git add .eng-platform
git commit -m "chore: update eng-platform to latest"

# Or automate with GitHub Actions:
cat > .github/workflows/sync-platform.yml << 'EOF'
name: Sync eng-platform
on:
  schedule:
    - cron: '0 0 * * 1'  # Every Monday
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
      - name: Update submodule
        run: |
          git submodule update --remote .eng-platform
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .eng-platform
          git diff --staged --quiet || git commit -m "chore: update eng-platform to latest"
          git push
EOF
```

### **Strategy B: Manual File Sync**

```bash
# Create sync script
cat > scripts/sync-from-eng-platform.sh << 'EOF'
#!/bin/bash
# Sync configs from eng-platform

ENG_PLATFORM="../eng-platform"

echo "Syncing configs..."
cp $ENG_PLATFORM/configs/prettier/.prettierrc.json ./
cp $ENG_PLATFORM/configs/commitlint/commitlint.config.js ./

echo "✅ Sync complete. Review changes and commit."
EOF

chmod +x scripts/sync-from-eng-platform.sh

# Run monthly
./scripts/sync-from-eng-platform.sh
```

### **Strategy C: npm Package Updates (Future)**

```bash
# Coming in v0.4.0:
npm update @your-org/eslint-config-base
npm update @your-org/prettier-config

# Or with Dependabot (automated PRs)
```

---

## 📋 Checklist: What Did You Install?

**Configs**
- [ ] ESLint config
- [ ] Prettier config
- [ ] TypeScript config
- [ ] commitlint config

**Git Hooks**
- [ ] Husky hooks
- [ ] lint-staged

**CI/CD**
- [ ] Nightly E2E workflow
- [ ] Regression tests workflow
- [ ] Database validation workflow
- [ ] Engineering metrics workflow

**Templates**
- [ ] CLAUDE.md
- [ ] PR_TEMPLATE.md

**MCP Servers**
- [ ] team-analytics (if org-level tracking)
- [ ] research-swarm (if research-heavy project)
- [ ] smart-memory (if team knowledge sharing)
- [ ] Other: ___________

**Skills**
- [ ] /protect
- [ ] /sprint-plan
- [ ] /code-analyze
- [ ] Other: ___________

**Scripts**
- [ ] DORA metrics
- [ ] Team sync check
- [ ] Determinism gate
- [ ] Other: ___________

---

## 🎯 Recommended Setup by Project Type

### **Frontend React App**
```bash
✅ Configs: ESLint, Prettier, TypeScript
✅ Git Hooks: Husky + commitlint
✅ CI/CD: nightly-e2e.yml, regression-tests.yml
✅ MCP: None (or team-analytics if team-level)
✅ Skills: /protect, /code-analyze
```

### **Backend API**
```bash
✅ Configs: ESLint, Prettier, TypeScript
✅ Git Hooks: Husky + commitlint
✅ CI/CD: regression-tests.yml, database-validation.yml
✅ MCP: team-analytics (for health monitoring)
✅ Skills: /protect, /sprint-plan
```

### **Fullstack Monorepo**
```bash
✅ Configs: All configs
✅ Git Hooks: Husky + commitlint
✅ CI/CD: All workflows
✅ MCP: team-analytics, research-swarm, smart-memory
✅ Skills: All skills
✅ Scripts: All scripts (DORA, team-sync, determinism)
```

---

## 🐛 Troubleshooting

### **"ESLint can't find config file"**
```bash
# If using submodule, paths should be relative:
# .eslintrc.js should reference .eng-platform/configs/eslint/base.js

# If using sibling directory:
# .eslintrc.js should reference ../eng-platform/configs/eslint/base.js
```

### **"MCP server not starting"**
```bash
# Check path in .mcp.json
# Ensure npm install was run in MCP server directory
cd .eng-platform/mcp-servers/team-analytics
npm install

# Check logs
node server.js  # Should print "Team Analytics MCP Server running..."
```

### **"Git submodule not updating"**
```bash
# Force update
git submodule update --init --recursive --remote

# If still stuck, remove and re-add
git submodule deinit -f .eng-platform
git rm -f .eng-platform
git submodule add https://github.com/Bbadhub/eng-platform.git .eng-platform
```

---

## 📚 Next Steps

1. **Verify Setup**
   ```bash
   npm run lint
   npm test
   git add .
   git commit -m "chore: add eng-platform standards"  # Should trigger hooks
   ```

2. **Configure Team Analytics** (if installed)
   ```bash
   cd .eng-platform/mcp-servers/team-analytics
   # Edit config.json with your team members
   ```

3. **Document Your Choices**
   ```markdown
   # Add to your project README:
   ## Engineering Standards
   This project uses [eng-platform](https://github.com/Bbadhub/eng-platform) for:
   - Linting, formatting, TypeScript configs
   - Git hooks (commitlint, lint-staged)
   - CI/CD workflows for testing and validation
   ```

4. **Train Your Team**
   - Share this guide with team
   - Run `./scripts/team-sync-check.js` to verify everyone's setup
   - Set up weekly submodule updates (if using Strategy A)

---

## 🔄 Sync Schedule Recommendation

**Weekly:**
- Update git submodule (if using Strategy A)
- Review new patterns in docs/patterns/

**Monthly:**
- Check for breaking changes in CHANGELOG.md
- Update workflows if needed
- Review tool registry for new experimental tools

**Quarterly:**
- Evaluate adoption of eng-platform features
- Contribute improvements back to eng-platform
- Attend eng-platform sync meeting (if applicable)

---

## 🤝 Contributing Back

Found a bug or want to add a pattern?

```bash
cd .eng-platform
git checkout -b fix/my-improvement
# Make changes
git commit -m "fix: improve XYZ"
git push origin fix/my-improvement
# Open PR at https://github.com/Bbadhub/eng-platform
```

---

**Questions?** Check [CONTRIBUTING.md](../../CONTRIBUTING.md) or open an issue.
