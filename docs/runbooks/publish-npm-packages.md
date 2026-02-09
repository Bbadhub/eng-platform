# Publishing eng-platform Packages to npm

**Goal:** Make configs available as installable npm packages for automatic syncing.

---

## Quick Setup (30 minutes)

### 1. Restructure eng-platform for Publishing

```bash
cd eng-platform

# Create packages directory
mkdir -p packages/{eslint-config-base,eslint-config-typescript,eslint-config-react,prettier-config,tsconfig-base}

# Move configs into packages
mv configs/eslint/base.js packages/eslint-config-base/index.js
mv configs/eslint/typescript.js packages/eslint-config-typescript/index.js
mv configs/eslint/react.js packages/eslint-config-react/index.js
mv configs/prettier/.prettierrc.json packages/prettier-config/index.json
mv configs/typescript/tsconfig.base.json packages/tsconfig-base/tsconfig.json
```

### 2. Add package.json to Each Package

**packages/eslint-config-base/package.json**
```json
{
  "name": "@your-org/eslint-config-base",
  "version": "1.0.0",
  "description": "Base ESLint configuration for all projects",
  "main": "index.js",
  "keywords": ["eslint", "eslintconfig"],
  "author": "Your Team",
  "license": "MIT",
  "peerDependencies": {
    "eslint": "^8.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Bbadhub/eng-platform.git",
    "directory": "packages/eslint-config-base"
  }
}
```

**packages/eslint-config-typescript/package.json**
```json
{
  "name": "@your-org/eslint-config-typescript",
  "version": "1.0.0",
  "description": "TypeScript ESLint configuration",
  "main": "index.js",
  "keywords": ["eslint", "typescript", "eslintconfig"],
  "author": "Your Team",
  "license": "MIT",
  "peerDependencies": {
    "eslint": "^8.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0"
  },
  "dependencies": {
    "@your-org/eslint-config-base": "^1.0.0"
  }
}
```

**packages/prettier-config/package.json**
```json
{
  "name": "@your-org/prettier-config",
  "version": "1.0.0",
  "description": "Shared Prettier configuration",
  "main": "index.json",
  "keywords": ["prettier"],
  "author": "Your Team",
  "license": "MIT"
}
```

### 3. Login to npm

```bash
# If publishing to public npm
npm login

# If using GitHub Packages (private, free for private repos)
npm login --registry=https://npm.pkg.github.com --scope=@your-org
# Username: your-github-username
# Password: <Personal Access Token with read:packages and write:packages>
```

### 4. Publish Packages

```bash
# Publish each package
cd packages/eslint-config-base && npm publish --access public && cd ../..
cd packages/eslint-config-typescript && npm publish --access public && cd ../..
cd packages/eslint-config-react && npm publish --access public && cd ../..
cd packages/prettier-config && npm publish --access public && cd ../..
cd packages/tsconfig-base && npm publish --access public && cd ../..
```

### 5. Use in Projects

**In LegalAI_System:**
```bash
cd LegalAI_System

# Install packages
npm install --save-dev \
  @your-org/eslint-config-base \
  @your-org/eslint-config-typescript \
  @your-org/eslint-config-react \
  @your-org/prettier-config

# Update .eslintrc.js
cat > .eslintrc.js << 'EOF'
module.exports = {
  extends: [
    '@your-org/base',
    '@your-org/typescript',
    '@your-org/react'
  ]
}
EOF

# Update package.json for prettier
npm pkg set prettier="@your-org/prettier-config"

# Update tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "extends": "@your-org/tsconfig-base/tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
EOF
```

---

## Automated Publishing with GitHub Actions

**eng-platform/.github/workflows/publish-packages.yml**
```yaml
name: Publish Packages

on:
  push:
    branches: [master]
    paths:
      - 'packages/**'
  workflow_dispatch:
    inputs:
      version_bump:
        description: 'Version bump type'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  publish:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package:
          - eslint-config-base
          - eslint-config-typescript
          - eslint-config-react
          - prettier-config
          - tsconfig-base

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Check if package changed
        id: changed
        run: |
          if git diff --name-only ${{ github.event.before }} ${{ github.sha }} | grep -q "packages/${{ matrix.package }}"; then
            echo "changed=true" >> $GITHUB_OUTPUT
          else
            echo "changed=false" >> $GITHUB_OUTPUT
          fi

      - name: Bump version
        if: steps.changed.outputs.changed == 'true' && github.event_name == 'workflow_dispatch'
        working-directory: packages/${{ matrix.package }}
        run: npm version ${{ github.event.inputs.version_bump }}

      - name: Publish to npm
        if: steps.changed.outputs.changed == 'true'
        working-directory: packages/${{ matrix.package }}
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Commit version bump
        if: steps.changed.outputs.changed == 'true' && github.event_name == 'workflow_dispatch'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add packages/${{ matrix.package }}/package.json
          git commit -m "chore: bump ${{ matrix.package }} to $(cat packages/${{ matrix.package }}/package.json | jq -r .version)"
          git push
```

---

## Updating Packages (For Maintainers)

### Manual Update
```bash
# 1. Make changes to package
cd packages/eslint-config-base
# Edit index.js

# 2. Test locally
cd ../../test-project
npm link ../eng-platform/packages/eslint-config-base
npm run lint  # Verify works

# 3. Bump version
cd ../eng-platform/packages/eslint-config-base
npm version patch  # or minor/major

# 4. Publish
npm publish

# 5. Commit version bump
git add package.json
git commit -m "chore: bump eslint-config-base to $(cat package.json | jq -r .version)"
git push
```

### Automated Update (GitHub Actions)
```bash
# Just push changes to packages/
git add packages/eslint-config-base/index.js
git commit -m "feat: add new rule to base config"
git push

# Or trigger manual workflow
gh workflow run publish-packages.yml -f version_bump=minor
```

---

## Projects Consuming Updates

### Auto-Update (Dependabot)
```yaml
# .github/dependabot.yml in LegalAI_System
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      eng-platform:
        patterns:
          - "@your-org/*"
```

**Result:** Dependabot creates PRs when platform packages update.

### Manual Update
```bash
# In LegalAI_System
npm outdated  # Check for updates
npm update @your-org/eslint-config-base
npm update @your-org/prettier-config
```

---

## Version Strategy

### Semantic Versioning
- **Patch (1.0.0 → 1.0.1):** Bug fixes, no breaking changes
- **Minor (1.0.0 → 1.1.0):** New features, backward compatible
- **Major (1.0.0 → 2.0.0):** Breaking changes (requires project updates)

### Examples
```bash
# Bug fix: ESLint rule had wrong severity
npm version patch

# New feature: Add new ESLint rule (non-breaking)
npm version minor

# Breaking change: Remove deprecated rule, change config structure
npm version major
```

---

## Migration Checklist

- [ ] Create packages/ directory structure
- [ ] Move configs into packages with package.json
- [ ] Test locally with `npm link`
- [ ] Publish to npm (or GitHub Packages)
- [ ] Update LegalAI_System to use packages
- [ ] Update Repo #2 to use packages
- [ ] Set up Dependabot for auto-updates
- [ ] Add GitHub Action for automated publishing
- [ ] Update eng-platform README with npm install instructions

---

## Benefits After Migration

✅ **Projects get updates automatically** (npm update or Dependabot PRs)
✅ **Single source of truth** (configs live in eng-platform only)
✅ **Version control** (pin to specific versions if needed)
✅ **No copy-paste drift** (impossible to have stale configs)
✅ **CI can enforce** ("must use @your-org/eslint-config-base@^1.0.0")

---

**Time to set up:** ~30 minutes
**Time saved per project per year:** ~5 hours (no manual syncing)
**Confidence level:** High (npm is battle-tested)
