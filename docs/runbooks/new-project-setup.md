# New Project Setup Runbook

**Time:** 30-60 minutes
**Audience:** Developers starting a new project
**Goal:** Bootstrap project with platform standards

---

## 📋 Prerequisites

- [ ] Node.js 20+ installed
- [ ] Git installed
- [ ] GitHub CLI (`gh`) installed (optional)
- [ ] Access to eng-platform repo

---

## 🚀 Quick Start (5 min)

```bash
# 1. Create project directory
mkdir my-new-project
cd my-new-project

# 2. Initialize git
git init
git branch -M main

# 3. Clone eng-platform (as sibling or submodule)
cd ..
git clone https://github.com/YOUR-ORG/eng-platform
cd my-new-project

# 4. Copy templates
cp ../eng-platform/templates/CLAUDE.md ./
cp ../eng-platform/templates/github/PR_TEMPLATE.md .github/
cp -r ../eng-platform/templates/ci/ .github/workflows/

# 5. Initialize package.json
npm init -y
```

---

## ⚙️ Step-by-Step Setup

### Step 1: Initialize TypeScript Project (10 min)

```bash
# Install dependencies
npm install --save-dev \
  typescript \
  @types/node \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  prettier \
  vitest \
  @vitest/coverage-v8

# Copy TypeScript config
cp ../eng-platform/configs/typescript/tsconfig.base.json ./tsconfig.json

# Edit tsconfig.json to customize for your project
```

### Step 2: Configure Linting (5 min)

```bash
# Copy ESLint config
cat > .eslintrc.js << 'EOF'
module.exports = {
  extends: [
    '../eng-platform/configs/eslint/base.js',
    '../eng-platform/configs/eslint/typescript.js',
  ],
  parserOptions: {
    project: './tsconfig.json',
  },
};
EOF

# Copy Prettier config
cp ../eng-platform/configs/prettier/.prettierrc.json ./

# Add lint scripts to package.json
npm pkg set scripts.lint="eslint ."
npm pkg set scripts.lint:fix="eslint . --fix"
npm pkg set scripts.format="prettier --write \"src/**/*.{ts,tsx,js,jsx,json,md}\""
npm pkg set scripts.format:check="prettier --check \"src/**/*.{ts,tsx,js,jsx,json,md}\""
```

### Step 3: Configure Testing (5 min)

```bash
# Create vitest config
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts'],
    },
  },
});
EOF

# Add test scripts
npm pkg set scripts.test="vitest"
npm pkg set scripts.test:run="vitest run"
npm pkg set scripts.test:coverage="vitest run --coverage"

# Create test directory
mkdir -p src/__tests__
```

### Step 4: Configure Git Hooks (5 min)

```bash
# Install husky
npm install --save-dev husky lint-staged
npx husky init

# Configure pre-commit hook
cat > .husky/pre-commit << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
EOF

chmod +x .husky/pre-commit

# Add lint-staged config to package.json
npm pkg set lint-staged="{ \"*.{ts,tsx,js,jsx}\": [\"eslint --fix\", \"prettier --write\"], \"*.{json,md}\": [\"prettier --write\"] }"
```

### Step 5: Customize CLAUDE.md (10 min)

```bash
# Edit CLAUDE.md
code CLAUDE.md

# Replace placeholders:
# - [PROJECT_NAME] → Your project name
# - [DATE] → Today's date
# - [URL] → Your project URLs
# - Add project-specific context
```

### Step 6: Setup CI/CD (5 min)

```bash
# Copy CI workflows
mkdir -p .github/workflows
cp ../eng-platform/templates/ci/lint-and-test.yml .github/workflows/
cp ../eng-platform/templates/ci/security-scan.yml .github/workflows/

# Edit workflows to match your project structure
```

### Step 7: Create .gitignore (2 min)

```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/

# Build output
dist/
build/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# Testing
coverage/
.nyc_output/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
EOF
```

### Step 8: Initialize README.md (5 min)

```bash
cat > README.md << 'EOF'
# My New Project

Brief description of what this project does.

## Setup

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
npm run test:coverage
```

## Linting

```bash
npm run lint
npm run format
```

## Architecture

See [CLAUDE.md](CLAUDE.md) for detailed context.
EOF
```

---

## ✅ Verification Checklist

Run these commands to verify setup:

```bash
# Linting works
npm run lint

# Formatting works
npm run format:check

# Tests run
npm test

# Build works (if applicable)
npm run build

# Git hooks work
git add .
git commit -m "chore: initial setup"  # Should trigger pre-commit hook

# Compliance check
../eng-platform/scripts/check-compliance.sh
```

---

## 🎯 Next Steps

1. **Create GitHub repo:**
   ```bash
   gh repo create YOUR-ORG/my-new-project --private
   git remote add origin https://github.com/YOUR-ORG/my-new-project
   git push -u origin main
   ```

2. **Setup branch protection:**
   - Require PR reviews
   - Require status checks (CI)
   - Require up-to-date branch

3. **Invite team members**

4. **Start development!**

---

## 🐛 Troubleshooting

### ESLint not finding config
- Ensure eng-platform is cloned as sibling directory
- Check relative path in .eslintrc.js

### Husky hooks not running
```bash
npx husky install
chmod +x .husky/pre-commit
```

### TypeScript errors
- Check tsconfig.json paths
- Run `npm install` again
- Verify @types packages installed

---

## 📚 Related Docs

- [CLAUDE.md Template](../../templates/CLAUDE.md)
- [Protected Code Process](../processes/protected-code.md)
- [Check Compliance Script](../../scripts/check-compliance.sh)
