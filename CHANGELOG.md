# Changelog

All notable changes to the Engineering Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Placeholder for upcoming changes

---

## [0.1.0] - 2026-02-08

### Added
- **Initial release** generated from LegalAI_System Phase 1-3 audit
- ESLint configs: base.js, typescript.js, react.js
- Prettier config: .prettierrc.json
- TypeScript configs: tsconfig.base.json, tsconfig.react.json
- CLAUDE.md template with protected code pattern
- PR_TEMPLATE.md for consistent pull requests
- CI/CD workflow templates: lint-and-test.yml, security-scan.yml
- MCP curation system:
  - mcp-servers.json (Tier 1: 5 servers)
  - evaluation-criteria.md (scoring rubric)
  - evaluation-log.md (historical record)
- Automation scripts:
  - check-compliance.sh (validates project standards)
- Documentation:
  - Protected Code Process
  - New Project Setup Runbook
- Audit results from LegalAI_System (Phase 1-3)
- README.md, CONTRIBUTING.md, CHANGELOG.md

### Notes
- This is an **alpha release** based on LegalAI_System only
- Repo #2 audit pending → will inform v1.0.0

---

## [Future Versions]

### Planned for v1.0.0
- Repo #2 audit integration
- Consolidated patterns from both repos
- ADRs documenting conflict resolutions
- Tested and applied to both repos
- npm packages for configs

### Planned for v1.1.0
- Quarterly MCP updates
- ESLint plugin for @protected enforcement
- Migration scripts for existing projects
- Storybook config template

### Planned for v2.0.0
- Breaking changes (if needed)
- CI gates for protected code
- Performance budgets
- Monorepo tooling (Turborepo/Nx templates)

---

[Unreleased]: https://github.com/YOUR-ORG/eng-platform/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YOUR-ORG/eng-platform/releases/tag/v0.1.0
