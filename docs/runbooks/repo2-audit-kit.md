# Engineering Platform Audit Kit v2.0 (Repo #2)

**Purpose:** Audit your second major repository and consolidate findings with LegalAI_System (v0.2.0) to produce a unified v1.0.0 platform.

**Context:** You've already audited LegalAI_System and created v0.2.0 with:
- 9 custom MCP servers (research-swarm, basin-analyzer, etc.)
- ESLint/Prettier/TypeScript configs
- Protected code patterns (@protected annotations)
- Sprint-based development workflow
- MCP marketplace curation (Tier 1: 5 servers)

**Goal:** Find patterns/conflicts between Repo #2 and LegalAI, make opinionated decisions, generate v1.0.0.

---

## Phase 1: Project Engineering Audit (Enhanced)

Run this inside **Repo #2**. Compares against LegalAI baseline.

```
You are an engineering auditor performing a COMPARATIVE audit. You're analyzing Repo #2 to consolidate it with LegalAI_System (already audited) into a unified engineering platform.

**BASELINE CONTEXT (from LegalAI v0.2.0):**
- Stack: TypeScript, React, Node.js, tRPC, Prisma, Vite, Vitest, Docker, PostgreSQL, Elasticsearch
- Custom MCP Servers: research-swarm (ARE/QRE), basin-analyzer (context drift), constraint-validator (Z3 SMT), report-writer, ragflow, postgres, mysql, dropbox, mcp-saas-template
- Conventions: Conventional commits (documented), @protected annotations, TypeScript strict mode
- Anti-patterns: 433 console.log calls, unused MCP servers
- Testing: 1577 test cases, Vitest + Playwright

**YOUR TASK:** Analyze Repo #2 and produce a comparative audit that highlights:
1. Where Repo #2 differs from LegalAI
2. Which approach is better (if there's a conflict)
3. Whether Repo #2 has custom tooling LegalAI doesn't

---

### Scan the following:

#### 1. **Tooling Inventory** (Enhanced)
- All dependencies (package.json, requirements.txt, Cargo.toml, go.mod, Gemfile, etc.)
- CLI tools referenced in scripts, CI configs, or docs
- **Custom MCP servers** (search mcp-servers/ directory if it exists) — not just marketplace ones
  - Look for Python/Node.js servers with MCP tool definitions
  - Check for servers that solve domain-agnostic problems (research, validation, reporting)
- MCP servers configured (.claude.json, .claude/settings.json, mcp.json, .cursor/mcp.json)
- Editor extensions (.vscode/extensions.json, .cursor/extensions.json)
- Linters, formatters, type checkers
- Build tools (webpack, vite, rollup, turbopack, esbuild, etc.)
- Package managers + lock files

**COMPARE:** Does Repo #2 use different linters than LegalAI (ESLint)? Different build tools than Vite? Different test frameworks than Vitest?

#### 2. **Process & Configuration** (Enhanced)
- CI/CD pipelines — what do they check that LegalAI's CI doesn't?
- Testing setup: frameworks, coverage %, test locations, what's tested vs untested
- Git hooks (husky, lint-staged, pre-commit, lefthook)
- Environment management (.env, secrets handling)
- Branching strategy (from git history)
  - LegalAI uses: `feature/sprint-XX-description` on `master` branch
  - What does Repo #2 use?
- PR templates, issue templates, CODEOWNERS, GitHub Actions workflows
- Docker / containerization setup
- **Protected code markers** — does Repo #2 have stability annotations like @protected, @stable, @immutable?

**COMPARE:** Does Repo #2 enforce linting in CI while LegalAI doesn't? Does it have better test coverage?

#### 3. **Code Quality Signals** (Enhanced)
- Linters/formatters configured but not enforced in CI?
- Skipped tests, empty tests, outdated tests
- Dead code, unused dependencies, orphaned config files
- **TODOs/FIXMEs/HACKs** — count and categorize by severity
- **AI context files** — CLAUDE.md, .cursorrules, .clinerules, custom prompts
  - How does it compare to LegalAI's CLAUDE.md (Pattern-CONTEXT-002)?
- **Logging patterns** — structured logging (winston/pino) or console.log spam?
- **Error handling patterns** — try/catch everywhere, or defensive coding?

**COMPARE:** LegalAI has 433 console.log calls (anti-pattern). How many does Repo #2 have?

#### 4. **Custom Infrastructure** (NEW)
- **Custom MCP servers** — does Repo #2 have its own?
  - Search for mcp-servers/, tools/, scripts/ with MCP tool definitions
  - Look for Python servers with @server.call_tool decorators
  - Look for Node.js servers with server.setRequestHandler("tools/call")
- **Research/analysis tools** — anything solving universal problems like:
  - Context drift detection
  - Confidence scoring
  - Multi-step research orchestration
  - Constraint validation
  - Report generation
- **Automation scripts** — custom tooling that could be generalized

**COMPARE:** Are there overlaps with LegalAI's research-swarm or basin-analyzer? Are there gaps that Repo #2 fills?

#### 5. **What's Working Well**
- Tools and processes actively used, consistently applied, adding value
- Patterns that should override LegalAI patterns in v1.0.0

#### 6. **What's Missing or Broken**
- Tools installed but not used
- Processes documented but not enforced
- Gaps: no testing, no linting, no CI, no type checking, no security scanning
- Inconsistencies with LegalAI standards

#### 7. **MCP Server Analysis** (Enhanced)
- List every MCP server configured
- **Custom vs Marketplace** — which are custom-built, which are from mcp.so?
- For each: name, purpose, actively used?, useful?, overlaps with LegalAI servers?
- Suggest MCP servers from LegalAI that Repo #2 should adopt
- Suggest MCP servers from Repo #2 that LegalAI should adopt

---

### OUTPUT FORMAT — JSON with comparison annotations:

{
  "project_name": "Repo #2",
  "project_path": "",
  "language_stack": [],
  "audit_date": "2026-02-08",
  "comparison_baseline": "LegalAI_System v0.2.0",

  "tooling": {
    "dependencies": { "production": [], "development": [] },
    "cli_tools": [],
    "mcp_servers": [
      {
        "name": "",
        "type": "custom|marketplace",
        "source": "",
        "status": "active|configured_unused|missing_recommended",
        "overlap_with_legalai": "none|partial|duplicate",
        "should_consolidate": true,
        "notes": ""
      }
    ],
    "custom_mcp_servers": [
      {
        "name": "",
        "path": "",
        "domain_agnostic": true,
        "capabilities": [],
        "overlap_with_legalai": "",
        "promote_to_platform": true,
        "notes": ""
      }
    ],
    "editor_extensions": [],
    "linters_formatters": [
      {
        "tool": "",
        "configured": true,
        "enforced_in_ci": true,
        "differs_from_legalai": false,
        "better_than_legalai": false,
        "notes": ""
      }
    ],
    "build_tools": [],
    "package_manager": ""
  },

  "processes": {
    "ci_cd": {
      "platform": "",
      "pipelines": [],
      "gaps": [],
      "stricter_than_legalai": false,
      "checks_legalai_lacks": []
    },
    "testing": {
      "framework": "",
      "coverage_configured": true,
      "coverage_percent": 0,
      "test_locations": [],
      "untested_areas": [],
      "skipped_tests": 0,
      "better_than_legalai": false
    },
    "git_hooks": [],
    "env_management": {
      "method": "",
      "has_example": true,
      "secrets_in_repo": false
    },
    "branching_strategy": "",
    "differs_from_legalai": false,
    "pr_template": true,
    "docker": { "present": true, "compose": true, "notes": "" }
  },

  "code_quality": {
    "console_log_count": 0,
    "structured_logging": false,
    "dead_code_detected": false,
    "unused_dependencies": [],
    "orphaned_configs": [],
    "todo_count": 0,
    "fixme_count": 0,
    "hack_count": 0,
    "protected_code_annotations": {
      "present": false,
      "pattern": "",
      "same_as_legalai": false
    },
    "ai_context_file": {
      "present": true,
      "filename": "",
      "pattern": "",
      "quality": "better|same|worse than LegalAI"
    }
  },

  "working_well": [
    {
      "item": "",
      "should_override_legalai": false,
      "reason": ""
    }
  ],

  "missing_or_broken": [
    {
      "item": "",
      "legalai_has_this": false,
      "priority": "high|medium|low"
    }
  ],

  "recommendations": {
    "adopt_from_legalai": [],
    "keep_from_repo2": [],
    "conflicts_to_resolve": [
      {
        "area": "",
        "legalai_approach": "",
        "repo2_approach": "",
        "recommended_winner": "",
        "reason": ""
      }
    ]
  }
}
```

---

## Phase 2: MCP Ecosystem Scan (Skip if Done)

**SKIP THIS** — You already ran Phase 2 for LegalAI. Use the existing [phase2-mcp-scan.md](../../audits/legalai-system/phase2-mcp-scan.md).

**UNLESS** Repo #2 uses a different domain where new MCP servers are relevant (e.g., if Repo #2 is a Python data science project and needs Jupyter/pandas MCP servers).

If needed, run the original Phase 2 prompt with this addition:

```
CONTEXT: I already evaluated MCP servers for a TypeScript/React/Node.js stack (LegalAI).
Now I'm auditing a [DESCRIBE REPO #2 STACK] project.

Focus on MCP servers DIFFERENT from these already-evaluated ones:
- postgres, github, cccmemory, filesystem, playwright (Tier 1)
- elasticsearch, aws, kubernetes, slack, sentry, docker (Tier 2)

Look for domain-specific servers relevant to [REPO #2 DOMAIN].
```

---

## Phase 3: Process & Standards Extraction (Enhanced)

Run this inside **Repo #2**. Extracts standards and compares to LegalAI.

```
You are a senior engineering consultant doing a COMPARATIVE process audit. Analyze Repo #2 and extract every engineering standard, convention, and process — then compare to LegalAI_System.

**BASELINE CONTEXT (from LegalAI):**
- Commit convention: Conventional commits (feat:, fix:, docs:, etc.) — documented but not enforced
- Branch strategy: feature/sprint-XX-description on master branch
- Code style: TypeScript strict, PascalCase for components, camelCase for functions
- Protected code: @protected comments with PRE-FLIGHT checklists (implicit enforcement)
- Testing: Vitest for unit, Playwright for E2E, 1577 test cases
- Logging: Mostly console.log (anti-pattern), should use winston/pino
- Error handling: try/catch with tRPC error wrappers
- CI/CD: GitHub Actions (lint, test, security scan) — exists but not enforced via branch protection

---

### Examine:

- README, CONTRIBUTING, CLAUDE.md, docs/, .cursorrules, .clinerules
- CI/CD pipeline definitions
- Code style patterns (naming, file organization, module structure)
- Test patterns (naming, organization, mocking, fixtures)
- Error handling patterns
- Logging patterns (structured logging vs console.log)
- API design patterns (REST, GraphQL, tRPC, gRPC)
- Database patterns (migrations, queries, ORM usage, connection pooling)
- **Commit message patterns** (analyze last 100 commits)
  - Do they follow Conventional Commits like LegalAI?
  - Are they enforced with commitlint?
- Dependency management approach (lock files, security audits, update strategy)
- Config handling (env vars, config files, feature flags, secrets management)
- **Protected code patterns** — stability annotations (@protected, @stable, @immutable)
- **AI context patterns** — how is Claude/Cursor/Copilot guided?

---

### For each finding, classify it as:

- **CODIFIED**: Written down and enforced (eslint rule, CI check, pre-commit hook)
- **DOCUMENTED**: Written down but not enforced (in README but no CI validation)
- **IMPLICIT**: Not written but consistently followed (inferred from code patterns)
- **INCONSISTENT**: Sometimes followed, sometimes not
- **ABSENT**: Should exist but doesn't

---

### OUTPUT FORMAT:

{
  "project_name": "Repo #2",
  "comparison_baseline": "LegalAI_System",
  "audit_date": "2026-02-08",

  "standards": [
    {
      "category": "code_style|testing|git|api|error_handling|logging|config|security|documentation|ai_guidance",
      "standard": "Description of the standard or convention",
      "status": "codified|documented|implicit|inconsistent|absent",
      "evidence": "Where you observed this (file:line or commit pattern)",
      "legalai_equivalent": "How LegalAI handles this (same, different, better, worse, absent)",
      "conflict": false,
      "recommended_approach": "If conflict, which approach to use in v1.0.0",
      "promote_to_platform": true,
      "notes": ""
    }
  ],

  "commit_analysis": {
    "samples_analyzed": 100,
    "conventional_commits_percent": 0,
    "common_types": ["feat", "fix", "docs", "refactor", "test", "chore"],
    "scope_usage": "consistent|inconsistent|absent",
    "enforced_with_commitlint": false,
    "differs_from_legalai": false
  },

  "protected_code_patterns": {
    "present": false,
    "annotation_style": "@protected|@stable|@immutable|none",
    "enforcement": "linter|ci|manual|none",
    "same_as_legalai": false,
    "better_than_legalai": false
  },

  "best_practices_to_promote": [
    {
      "practice": "",
      "why": "",
      "override_legalai": false
    }
  ],

  "anti_patterns_to_fix": [
    {
      "pattern": "",
      "severity": "high|medium|low",
      "also_in_legalai": false
    }
  ],

  "cross_project_conflicts": [
    {
      "area": "",
      "legalai_approach": "",
      "repo2_approach": "",
      "winner": "legalai|repo2|merge|new_approach",
      "rationale": ""
    }
  ]
}
```

---

## Phase 4: Consolidation & v1.0.0 Generation (Enhanced)

Run this AFTER collecting Phase 1 and Phase 3 from **both** LegalAI and Repo #2.

```
You are an engineering platform architect performing a MERGE CONSOLIDATION. You're creating v1.0.0 of the eng-platform by consolidating findings from TWO audited repositories.

**YOUR INPUTS:**

1. **LegalAI_System Phase 1-3 audits** (already in eng-platform v0.2.0):
   - [PASTE c:\Users\Brett\Documents\GitHub\eng-platform\audits\legalai-system\phase1-audit.json]
   - [PASTE phase3-standards.json]

2. **Repo #2 Phase 1 audit** (NEW):
   - [PASTE REPO #2 PHASE 1 OUTPUT]

3. **Repo #2 Phase 3 audit** (NEW):
   - [PASTE REPO #2 PHASE 3 OUTPUT]

4. **Existing eng-platform v0.2.0 contents**:
   - 9 custom MCP servers (research-swarm, basin-analyzer, constraint-validator, report-writer, ragflow, postgres, mysql, dropbox, mcp-saas-template)
   - ESLint configs (base, typescript, react)
   - Prettier, TypeScript configs
   - MCP curation (Tier 1: elasticsearch, github, cccmemory, filesystem, playwright)
   - Protected code process documentation
   - CLAUDE.md template

---

### YOUR TASK — Produce v1.0.0:

#### 1. **CONFLICT ANALYSIS**
For every area where LegalAI and Repo #2 differ, create an ADR (Architecture Decision Record):

| Conflict | LegalAI Approach | Repo #2 Approach | Decision | Rationale |
|----------|------------------|------------------|----------|-----------|
| Linter | ESLint | ??? | ??? | ??? |
| Test framework | Vitest | ??? | ??? | ??? |
| Branch strategy | feature/sprint-XX | ??? | ??? | ??? |
| Commit enforcement | None | ??? | ??? | ??? |
| Logging | console.log | ??? | ??? | ??? |
| Protected code | @protected comments | ??? | ??? | ??? |

**OUTPUT FORMAT:** Create `docs/decisions/ADR-XXX-{topic}.md` for each conflict using the [ADR template](../../docs/decisions/ADR-template.md).

---

#### 2. **CUSTOM MCP SERVER CONSOLIDATION**
- Which custom servers from Repo #2 should join eng-platform/mcp-servers/?
- Do any Repo #2 servers overlap with LegalAI servers?
- If overlap, which implementation is better? Document in ADR.
- Update `mcp-servers/README.md` with consolidated server catalog

**Example conflict:**
```
LegalAI has: basin-analyzer (Python, Voyage embeddings)
Repo #2 has: context-monitor (Node.js, OpenAI embeddings)
Both do: Context drift detection

DECISION: Keep basin-analyzer, document why in ADR-005-context-drift-server.md
```

---

#### 3. **OPINIONATED DECISIONS** (One approach for everything)

| Area | v1.0.0 Standard | Source | Exceptions |
|------|-----------------|--------|------------|
| **Linter** | ??? | LegalAI \| Repo #2 \| New | None \| By language |
| **Formatter** | ??? | ??? | ??? |
| **Test Framework** | ??? | ??? | ??? |
| **Git Hooks** | ??? | ??? | ??? |
| **CI/CD Template** | ??? | ??? | ??? |
| **Commit Convention** | Conventional Commits + commitlint | LegalAI (upgrade) | None |
| **Branch Strategy** | ??? | ??? | ??? |
| **Protected Code** | ??? | ??? | ??? |
| **MCP Server Stack** | Consolidated list | Both + curation | By project domain |
| **CLAUDE.md Template** | ??? | ??? | ??? |
| **PR Template** | ??? | ??? | ??? |

---

#### 4. **UPDATE EXISTING v0.2.0 FILES** (Don't recreate, MERGE)

Update these existing files:

1. **README.md** → v1.0.0 header, add Repo #2 context
2. **CHANGELOG.md** → Add v1.0.0 section with:
   - Repo #2 audit integration
   - ADRs documenting conflicts (list them)
   - Consolidated MCP servers (new count)
   - New configs/standards adopted from Repo #2
3. **configs/** → Add/update configs based on conflicts
   - If Repo #2 uses Biome instead of ESLint, add configs/biome/ ?
   - If Repo #2 uses Ruff for Python, add configs/python/ruff.toml ?
4. **mcp-servers/** → Add Repo #2 custom servers (if any)
5. **docs/decisions/** → Create ADR-001 through ADR-NNN for each conflict

---

#### 5. **CREATE NEW FILES** (Only if needed)

If Repo #2 introduces new domains:

- `configs/[new-language]/` for language-specific configs
- `mcp-servers/[new-server]/` for Repo #2 custom servers
- `templates/[new-template]` if Repo #2 has better templates
- `scripts/migrate-repo2.sh` for applying v1.0.0 to Repo #2

---

#### 6. **LIVING SYSTEM UPDATES**

Update these process docs:

1. **docs/runbooks/new-project-setup.md** → Add steps for both LegalAI-type and Repo #2-type projects
2. **mcp/evaluation-log.md** → Document new servers from Repo #2, decisions made
3. **mcp/mcp-servers.json** → Consolidated server list with version pins
4. **scripts/check-compliance.sh** → Add checks for Repo #2 standards

---

### OUTPUT STRUCTURE:

Generate the following:

1. **Summary Report** (Markdown)
   ```markdown
   # v1.0.0 Consolidation Summary

   ## Repos Audited
   - LegalAI_System (TypeScript/React/Node.js)
   - Repo #2 ([STACK])

   ## Key Findings
   - [X] conflicts resolved via ADRs
   - [X] custom MCP servers consolidated
   - [X] configs unified
   - [X] anti-patterns documented

   ## Breaking Changes
   - (List any changes that require project updates)

   ## Migration Path
   - LegalAI → v1.0.0: [steps]
   - Repo #2 → v1.0.0: [steps]
   ```

2. **ADRs for ALL Conflicts** (using ADR-template.md)
   - ADR-001: Linter Choice (ESLint vs ???)
   - ADR-002: Test Framework (Vitest vs ???)
   - ADR-003: Commit Convention Enforcement
   - ADR-004: Protected Code Pattern
   - ADR-005: Context Drift Server Consolidation
   - ... (one per conflict)

3. **Updated File Contents**
   - README.md (v1.0.0 header + Repo #2 context)
   - CHANGELOG.md (v1.0.0 section)
   - mcp-servers/README.md (consolidated catalog)
   - mcp/mcp-servers.json (merged server list)

4. **New File Contents** (if needed)
   - configs/[new-configs]
   - mcp-servers/[new-servers]
   - scripts/migrate-repo2.sh

5. **Version Tag Command**
   ```bash
   cd eng-platform
   git add .
   git commit -m "feat: consolidate Repo #2 audit findings into v1.0.0"
   git tag v1.0.0 -a -m "v1.0.0: Unified platform from LegalAI + Repo #2"
   git push origin master --tags
   ```

---

### DECISION PHILOSOPHY:

When choosing between conflicting approaches:

1. **Enforced > Documented** (CI checks > README mentions)
2. **Codified > Implicit** (Linter rules > code review comments)
3. **Modern > Legacy** (Vitest > Jest, if both work)
4. **Domain-Agnostic > Domain-Specific** (Generic tools > project-specific)
5. **Proven > Experimental** (Battle-tested > shiny new thing)
6. **Least Context Cost** (Fewer MCP servers > more MCP servers)

If equal, prefer the approach that's **easier to enforce** and **easier to onboard**.

---

Be ruthless. I want ONE opinionated way of doing things, not "choose your own adventure."
```

---

## Phase 5: Ongoing MCP Marketplace Monitoring (Same)

Use the original Phase 5 prompt, but update the baseline:

```
I maintain a curated engineering platform with these currently installed MCP servers:

[PASTE eng-platform/mcp/mcp-servers.json v1.0.0]

(Include both marketplace servers AND custom servers from LegalAI + Repo #2)
```

---

## Enhanced Usage Workflow

```
┌─────────────────────────────────────────────┐
│     INITIAL SETUP (LegalAI + Repo #2)      │
├─────────────────────────────────────────────┤
│                                             │
│  ✅ DONE (v0.2.0):                          │
│    ├── LegalAI Phase 1 (Audit)              │
│    ├── LegalAI Phase 2 (MCP Scan)           │
│    ├── LegalAI Phase 3 (Standards)          │
│    └── Generated v0.2.0 platform            │
│                                             │
│  🔄 NOW (v1.0.0):                           │
│    ├── Repo #2 Phase 1 (Comparative Audit) │
│    ├── Repo #2 Phase 3 (Comparative Standards) │
│    └── Phase 4 Enhanced (Consolidation)     │
│         → Merges with v0.2.0                │
│         → Generates ADRs for conflicts      │
│         → Produces v1.0.0                   │
│                                             │
├─────────────────────────────────────────────┤
│           ONGOING (Post v1.0.0)             │
├─────────────────────────────────────────────┤
│                                             │
│  Monthly:                                   │
│    └── Phase 5 (MCP Monitoring)             │
│                                             │
│  Quarterly:                                 │
│    ├── Re-run Phase 1 on both projects      │
│    ├── Run compliance checks                │
│    └── Update platform repo                 │
│                                             │
│  On new project:                            │
│    ├── Determine type (LegalAI-like vs Repo #2-like) │
│    └── Run appropriate onboard script       │
│                                             │
│  On tool/process change:                    │
│    ├── Create new ADR                       │
│    ├── Update platform                      │
│    └── Propagate to projects               │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Key Enhancements vs Original Prompt

| Enhancement | Why |
|-------------|-----|
| **Comparative Audit** | Repo #2 audit explicitly compares to LegalAI baseline |
| **Custom MCP Server Discovery** | Detects custom-built servers, not just marketplace |
| **ADR Generation** | Every conflict gets an Architecture Decision Record |
| **Protected Code Detection** | Looks for stability annotations like @protected |
| **Merge-Aware Phase 4** | Updates v0.2.0 files instead of recreating from scratch |
| **Commit Analysis** | Analyzes 100 commits to detect actual patterns vs docs |
| **Logging Pattern Detection** | console.log vs structured logging (winston/pino) |
| **Domain-Agnostic Filter** | Flags tools that solve universal problems, not project-specific |

---

## Success Criteria for v1.0.0

- [ ] All conflicts between LegalAI and Repo #2 resolved with ADRs
- [ ] ONE opinionated approach for each tool/process
- [ ] Custom MCP servers consolidated (no duplicates)
- [ ] Anti-patterns from both repos documented and fixed
- [ ] Migration scripts for applying v1.0.0 to both projects
- [ ] Compliance checks pass on both repos
- [ ] CHANGELOG.md documents v1.0.0 changes
- [ ] README.md reflects unified platform
- [ ] Both projects can adopt v1.0.0 without breaking changes

---

## Next Steps

1. **Run Phase 1 Enhanced** on Repo #2 → Save output as `audits/repo2/phase1-audit.json`
2. **Run Phase 3 Enhanced** on Repo #2 → Save output as `audits/repo2/phase3-standards.json`
3. **Run Phase 4 Enhanced** with ALL four audit files → Generates v1.0.0
4. **Review generated ADRs** for conflicts
5. **Test v1.0.0** on one project first (LegalAI or Repo #2)
6. **Tag and push** v1.0.0 to GitHub

---

**Remember:** The goal is ONE unified platform, not two separate ones. Be opinionated. Choose winners. Document why.
