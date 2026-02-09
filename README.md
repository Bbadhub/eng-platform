# Engineering Platform v0.2.0

> Unified engineering standards, tools, and templates for all projects.

**Status:** Alpha - LegalAI configs + Custom MCP servers
**Next:** Add Repo #2 audit → Consolidate to v1.0.0

---

## 🎯 Purpose

This repository contains:
- **Shared configs** - ESLint, Prettier, TypeScript, Git hooks
- **Templates** - CLAUDE.md, PR templates, CI workflows
- **Custom MCP servers** - ARE/QRE engines, basin analysis, constraint validation
- **MCP curation** - Evaluated marketplace servers with version control
- **Automation scripts** - Audit, compliance checking, migration
- **Process docs** - Code review, protected code, sprint workflow

---

## 📦 Quick Start

### For New Projects
```bash
# Clone platform
git clone https://github.com/YOUR-ORG/eng-platform

# Copy templates
cp eng-platform/templates/CLAUDE.md ./
cp eng-platform/templates/github/PR_TEMPLATE.md ./.github/
cp -r eng-platform/templates/ci/ ./.github/workflows/

# Install configs
npm install --save-dev \
  eslint prettier typescript \
  @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Extend configs
echo 'module.exports = require("./eng-platform/configs/eslint/react")' > .eslintrc.js
```

### For Existing Projects
```bash
# Run audit
./eng-platform/scripts/audit-project.sh

# Check compliance
./eng-platform/scripts/check-compliance.sh

# Apply standards
./eng-platform/scripts/migrate-to-platform.sh
```

---

## 📁 Structure

```
eng-platform/
├── audits/                  # Historical audit results
│   └── legalai-system/      # Phase 1-3 audit outputs
├── configs/                 # Shared ESLint, Prettier, TS configs
├── templates/               # PR templates, CLAUDE.md, CI workflows
├── mcp-servers/             # Custom-built MCP servers (9 servers)
│   ├── research-swarm/      # ARE/QRE research engine
│   ├── basin-analyzer/      # Context drift detection
│   ├── constraint-validator/ # Z3 SMT solver
│   ├── report-writer/       # Report generation
│   ├── ragflow/            # RAG orchestration
│   └── ...                 # + 4 more
├── mcp/                     # MCP marketplace curation
├── scripts/                 # Automation tools
└── docs/                    # Process documentation
```

---

## 🔧 Contents

### Configs
- [ESLint Base](configs/eslint/base.js) - Core linting rules
- [ESLint TypeScript](configs/eslint/typescript.js) - TS-specific rules
- [ESLint React](configs/eslint/react.js) - React/JSX rules
- [Prettier](configs/prettier/.prettierrc.json) - Code formatting
- [TypeScript](configs/typescript/tsconfig.base.json) - Shared TS config
- [Git Hooks](configs/git-hooks/) - Pre-commit, commit-msg hooks

### Templates
- [CLAUDE.md Template](templates/CLAUDE.md) - AI context file structure
- [PR Template](templates/github/PR_TEMPLATE.md) - Pull request template
- [CI Workflows](templates/ci/) - GitHub Actions templates

### Custom MCP Servers (NEW in v0.2.0)
- **[9 Domain-Agnostic Servers](mcp-servers/README.md)** - Production-ready MCP implementations
- **[research-swarm](mcp-servers/research-swarm/)** - ARE/QRE multi-step research engine
- **[basin-analyzer](mcp-servers/basin-analyzer/)** - Context drift detection & confidence scoring
- **[constraint-validator](mcp-servers/constraint-validator/)** - Z3 SMT solver for conflict detection
- **[report-writer](mcp-servers/report-writer/)** - Automated report generation
- + 5 more (ragflow, postgres, mysql, dropbox, mcp-saas-template)

### MCP Marketplace Curation
- [Curated List](mcp/mcp-servers.json) - Tier 1/2/3 marketplace servers
- [Evaluation Criteria](mcp/evaluation-criteria.md) - How to evaluate new servers
- [Evaluation Log](mcp/evaluation-log.md) - Decision history

### Scripts
- [Audit Project](scripts/audit-project.sh) - Run Phase 1-3 audit
- [Check Compliance](scripts/check-compliance.sh) - Validate against standards
- [Migrate to Platform](scripts/migrate-to-platform.sh) - Apply standards

### Documentation
- [Processes](docs/processes/) - Code review, protected code, testing
- [Runbooks](docs/runbooks/) - New project setup, machine setup
- [Decisions](docs/decisions/) - Architecture Decision Records (ADRs)

---

## 📊 Version History

### v0.2.0 (2026-02-08) - Custom MCP Servers
- **9 domain-agnostic MCP servers** extracted from LegalAI
- **research-swarm** - ARE/QRE research engine with formula scoring
- **basin-analyzer** - Context drift detection (epsilon metric, basin clustering)
- **constraint-validator** - Z3 SMT solver for logical conflicts
- **report-writer** - Automated report generation
- **ragflow** - RAG orchestration with Elasticsearch
- + postgres, mysql, dropbox, mcp-saas-template

### v0.1.0 (2026-02-08) - Initial Release
- Generated from LegalAI_System audit (Phase 1-3)
- Base configs for ESLint, Prettier, TypeScript
- CLAUDE.md template with protected code pattern
- MCP marketplace curation (Tier 1: 5 servers)
- Audit & compliance scripts

### Coming in v1.0.0
- Repo #2 audit integration
- Consolidated patterns from both repos
- ADRs documenting conflict resolutions
- Tested on both repos

---

## 🚀 Roadmap

- [x] Phase 1-3: Audit LegalAI_System
- [x] Generate v0.1.0 from LegalAI audit
- [x] Extract custom MCP servers → v0.2.0
- [ ] Phase 1-3: Audit Repo #2
- [ ] Consolidate findings → v1.0.0
- [ ] Apply to both repos
- [ ] Quarterly MCP reviews
- [ ] Publish MCP servers as standalone packages
- [ ] Publish configs as npm packages

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose new standards.

---

## 📄 License

MIT - Internal use for [YOUR-ORG] projects
