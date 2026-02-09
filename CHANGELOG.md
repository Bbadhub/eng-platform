# Changelog

All notable changes to the Engineering Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Placeholder for upcoming changes

---

## [0.2.0] - 2026-02-08

### Added
- **9 Custom MCP Servers** extracted from LegalAI_System
  - **research-swarm** (Port 3012) - Adaptive Research Engine with ARE/QRE algorithms
    - Formula-based confidence scoring
    - Entity extraction and pattern detection
    - Circuit breaker and rate limiting (STAB-004: 50 saves/sec)
    - Mode routing (discovery, validation, synthesis)
  - **basin-analyzer** (Port 9383) - Context drift detection
    - Epsilon metric (0-1) for output stability
    - Basin clustering (n_basins count)
    - Coherence scoring and confidence levels (HIGH/MEDIUM/LOW)
    - Query type classification (FACTUAL/INTERPRETIVE/COUNTERFACTUAL)
  - **constraint-validator** (Port 9385) - Z3 SMT solver
    - Logical constraint validation
    - Conflict detection and explanation
    - Consistency checking across entities
  - **report-writer** (Port 9386) - Automated report generation
    - Structured report generation from research
    - Quality assessment (completeness, coherence, citations)
    - Template-based formatting (PDF, Markdown, HTML)
  - **ragflow** (Port 3010) - RAG orchestration
    - Hybrid search (keyword + semantic)
    - Multi-KB federation
    - Works with any Elasticsearch instance
  - **postgres** (Port 9384) - Generic PostgreSQL MCP
  - **mysql** (Port 9385) - Generic MySQL MCP
  - **dropbox** (Port 9387) - File storage integration
  - **mcp-saas-template** - Production MCP server template
- Comprehensive MCP servers documentation (mcp-servers/README.md)
  - ARE/QRE architecture diagram
  - Server catalog with use cases
  - Performance benchmarks
  - Quick start guide

### Notes
- All servers are **domain-agnostic** - work in medical, financial, technical domains
- Servers solve universal AI challenges: context drift, confidence scoring, multi-step research
- Production-ready with Docker, health checks, rate limiting

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
- Quarterly MCP marketplace updates
- ESLint plugin for @protected enforcement
- Migration scripts for existing projects
- Storybook config template
- Publish MCP servers as standalone npm packages

### Planned for v2.0.0
- Breaking changes (if needed)
- CI gates for protected code
- Performance budgets
- Monorepo tooling (Turborepo/Nx templates)

---

[Unreleased]: https://github.com/Bbadhub/eng-platform/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Bbadhub/eng-platform/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Bbadhub/eng-platform/releases/tag/v0.1.0
