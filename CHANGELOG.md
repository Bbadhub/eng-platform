# Changelog

All notable changes to the Engineering Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added - Tool Experimentation & Analytics (v1.1.0)

**Tool Tracking Infrastructure:**
1. **tools-registry.json** - Comprehensive tool catalog
   - 7 categories: linting, testing, git_workflow, ide, commit_style, code_review, ai_assistant
   - Tool options with status tracking (standard, experimental, deprecated)
   - Metric definitions for each category
   - Promotion criteria for standardization

2. **Experiment Framework** (experiments/)
   - A/B testing system for controlled tool experiments
   - Experiment schema with treatment/control cohorts
   - Weekly checkpoint tracking
   - Statistical significance calculations
   - Success criteria definitions

3. **Tool Tracking Schema** (mcp-servers/team-analytics/schemas/)
   - Engineer tool profiles (who uses what)
   - Tool history tracking (before/after metrics)
   - Experiment participation tracking
   - Satisfaction score collection

4. **Experiment Management Script** (scripts/manage-experiments.js)
   - CLI for starting, checkpointing, and completing experiments
   - Automated result analysis
   - Report generation

**Bidirectional Sync Infrastructure:**
5. **Root package.json**
   - npm workspace setup for publishing configs as packages
   - Scripts for publishing to npm registry
   - Future: Automated dependency updates via Dependabot

6. **Apply to Project Guide** (docs/runbooks/apply-to-existing-project.md)
   - 3 sync strategies (git submodule, copy files, npm packages)
   - Decision tree: what to install vs not install
   - Automated sync workflows
   - Troubleshooting guide

**Documentation:**
7. **Tool Experimentation Guide** (docs/runbooks/tool-experimentation-guide.md)
   - Complete workflow for running A/B tests
   - Experiment templates (linting, IDE, git workflow)
   - Statistical significance interpretation
   - Best practices and common pitfalls

### Changed
- README.md updated with tool experimentation features
- Structure section updated with experiments/ and tools-registry.json
- Quick Start section includes experiment management examples

### Planned for v0.3.0
- eng-platform-mcp meta server (Port 9500)
- AI-orchestrated workflows (audit, compliance, extract, publish)
- Self-documenting platform operations
- Publish configs as npm packages
- Automated PR creation for standards updates

---

## [1.0.0] - 2026-02-09

### Added - AdHub Consolidation

**11 AdHub Innovations** integrated from AdHub repository:

1. **Protection Guard Hook** (templates/protection-guard-hook/)
   - PreToolUse hook for automatic code protection enforcement
   - Real-time blocking vs post-modification detection
   - Override system with time-based expiration
   - Self-protection prevents agent from modifying guardrails
   - Domain-agnostic template with example patterns

2. **ÆtherLight Skills System** (skills/)
   - **code-analyze** - Codebase pattern analysis with enforcement standards
   - **protect** - Annotate code with protection levels (@protected/@immutable/@maintainable)
   - **protection-audit** - Audit protected files and generate compliance reports
   - **validate-protection** - Validate protection enforcement via pre-commit hooks
   - **sprint-plan** - Structured sprint planning with automated Git workflow
   - **bug-report** - Standardized bug reporting with context gathering
   - **feature-request** - Feature request templates with impact analysis
   - **initialize** - Initialize ÆtherLight in new repositories

3. **Determinism Gate** (scripts/test-determinism-gate.js)
   - Anti-hallucination detection for Playwright tests
   - Detects AI-generated phantom tests (always-pass, no-op assertions)
   - Validates test authenticity before execution
   - Prevents false confidence from hallucinated tests

4. **DORA Metrics Collection** (scripts/metrics/engineering-velocity.js)
   - Deployment Frequency, Lead Time, Change Failure Rate, MTTR
   - Automated git history analysis
   - GitHub PR integration
   - Weekly/monthly trend reporting

5. **5-Layer Regression Testing** (workflows/regression-tests.yml)
   - Layer 0: Foundation (auth, routing, health checks)
   - Layer 1: Core (database, API, business logic)
   - Layer 2: Data (ingestion, validation, transformations)
   - Layer 3: UI/UX (components, accessibility, responsiveness)
   - Layer 4: Business (end-to-end workflows)
   - Test impact analysis for selective runs

6. **PostHog Feature Flag Architecture** (scripts/setup-posthog-flags.js)
   - Dependency graph architecture with master switch pattern
   - Automated flag creation and enablement
   - Template for project-specific feature flags
   - Server-side flag evaluation patterns

7. **commitlint Enforcement** (configs/commitlint/)
   - 100% conventional commits compliance
   - Husky hooks for pre-commit and commit-msg
   - lint-staged integration
   - Automated enforcement via CI/CD

8. **Team Sync Check** (scripts/team-sync-check.js)
   - Environment validation (Node version, dependencies, hooks)
   - MCP server configuration verification
   - Sprint context validation
   - Git branch health checks

9. **CI/CD Workflow Suite** (workflows/)
   - **nightly-e2e.yml** - Cross-browser E2E testing (Chromium, Firefox, WebKit)
   - **nightly-drift-check.yml** - Environment drift detection across dev/staging/prod
   - **database-validation.yml** - Schema validation, RLS testing, tenant isolation
   - **engineering-metrics.yml** - DORA metrics collection with GitHub issues
   - **regression-tests.yml** - Layered regression with test impact analysis

10. **Playwright Reporters** (configs/playwright-reporters/)
    - **posthog-reporter.ts** - PostHog integration for test observability
    - **feedback-reporter.ts** - Test feedback aggregation

11. **ADRs (Architecture Decision Records)** (audits/adhub/decisions/)
    - **ADR-001-migrate-to-vitest.md** - Jest → Vitest migration rationale
    - **ADR-002-protection-guard-hook.md** - Protection Guard design decisions
    - **ADR-003-keep-rest-api-design.md** - REST vs tRPC trade-offs
    - Preserved as AdHub case studies with real-world examples

### Documentation
- **MCP Orchestration Vision** (docs/architecture/mcp-orchestration-vision.md)
  - Roadmap for eng-platform-mcp (meta MCP server)
  - Bidirectional sync strategies (npm packages, GitHub Actions, MCP orchestration)
  - Tool definitions for platform operations (audit, compliance, extract, publish, sync)
  - Implementation phases: v0.3.0 (MCP server), v0.4.0 (npm configs), v0.5.0 (MCP packages)
- **Repo #2 Audit Kit** (docs/runbooks/repo2-audit-kit.md)
  - Enhanced audit for multi-repo consolidation
  - Comparative audits against LegalAI baseline
  - ADR generation for conflict resolution
  - Custom MCP server detection
- **npm Publishing Guide** (docs/runbooks/publish-npm-packages.md)
  - Restructure configs as npm packages
  - Automated publishing with GitHub Actions
  - Dependabot integration for auto-updates

### Changed
- All AdHub files cleaned to be domain-agnostic
- Removed project-specific references (URLs, feature flags, file paths)
- Added placeholder templates with example comments
- Protection Guard Hook: Empty HANDS_OFF_PATTERNS with usage examples
- PostHog flags script: Empty FLAGS array with structure template
- Workflows: Parameterized URLs (localhost defaults)

### Notes
- **v1.0.0 Milestone**: Consolidated innovations from LegalAI (v0.1-0.2) + AdHub
- All 11 AdHub innovations are production-tested and domain-agnostic
- ADRs preserved as case studies showing real-world decision-making
- Protection Guard Hook provides automatic enforcement superior to manual checklists
- ÆtherLight Skills enable AI-native workflow automation
- 5-layer regression testing organizes tests by dependency depth
- DORA metrics provide engineering velocity visibility

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

[Unreleased]: https://github.com/Bbadhub/eng-platform/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Bbadhub/eng-platform/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/Bbadhub/eng-platform/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Bbadhub/eng-platform/releases/tag/v0.1.0
