# Add eng-platform to Existing Project

✅ **Validated in production:** Successfully integrated into adhub project (established codebase with 15+ active sprints, existing configs) on 2026-02-09. Clean integration, no overwrites.

**Copy the text between the lines below and paste into Claude Code:**

---

I want to add eng-platform to this existing project as a git submodule.

Repository: https://github.com/Bbadhub/eng-platform.git
Location: .eng-platform/

This is an established project with existing code, so be careful:

1. First, analyze what's already here:
   - Check for existing .eslintrc, .prettierrc, tsconfig.json
   - Check for existing git hooks in .husky/ or .git/hooks/
   - Check for existing .mcp.json
   - Check for existing CLAUDE.md
   - List what you find

2. Add the git submodule:
   - Run: git submodule add https://github.com/Bbadhub/eng-platform.git .eng-platform
   - Run: git submodule update --init --recursive

3. Set up MCP servers by creating or updating .mcp.json:

   **Core AI Enhancement Servers (always add):**
   - beads-integration - BEADS task management
   - team-analytics - Engineer profiles & metrics
   - research-swarm - AI research with confidence tracking
   - basin-analyzer - Context drift detection (validates AI outputs)
   - report-writer - Automated report generation
   - constraint-validator - Logic validation and conflict detection

   **Database Servers (add if detected):**
   - postgres - If project uses PostgreSQL (check for pg, postgres, or Prisma with postgresql)
   - mysql - If project uses MySQL (check for mysql2, mysql, or Prisma with mysql)

   **Optional Servers (prompt before adding):**
   - smart-memory - Auto-detects project context (recommended if 3+ projects in parent directory)
     * Configure MEMORY_FILE_PATH to use .shared/team-memory.json
     * This enables team-wide memory sharing across projects

   If .mcp.json exists, merge with existing servers. If it doesn't exist, create it.

4. Create sprints/ directory if it doesn't exist

5. Initialize shared team memory (for smart-memory MCP server):
   - Create .shared/ directory if it doesn't exist
   - If .shared/team-memory.json doesn't exist:
     * Copy structure from .eng-platform/.shared/team-memory-structure-example.json
     * Get current project name from package.json or directory name
     * Add current project to entities with detected tech stack
     * Set last_updated to current timestamp
   - If .shared/team-memory.json exists:
     * Validate structure (has entities, relations, observations)
     * Add current project if not already present
     * Keep existing data intact

6. If CLAUDE.md doesn't exist, copy the template from .eng-platform/templates/CLAUDE.md

7. Add me to engineer profiles:
   - Get my name and email from git config
   - Add me to .eng-platform/mcp-servers/team-analytics/data/engineer-tool-profiles.json
   - Set tool_stack by detecting what I currently use (ESLint, Prettier, IDE, etc.)
   - Initialize my metrics tracking

8. Install MCP server dependencies:

   **Node.js servers:**
   - cd .eng-platform/mcp-servers/beads-integration && npm install
   - cd .eng-platform/mcp-servers/team-analytics && npm install
   - cd .eng-platform/mcp-servers/research-swarm && npm install
   - cd .eng-platform/mcp-servers/report-writer && npm install
   - cd .eng-platform/mcp-servers/postgres && npm install (if added)
   - cd .eng-platform/mcp-servers/mysql && npm install (if added)
   - cd .eng-platform/mcp-servers/smart-memory && npm install (if added)

   **Python servers (check if Python 3.8+ is installed):**
   - cd .eng-platform/mcp-servers/basin-analyzer && pip install -r requirements.txt
   - cd .eng-platform/mcp-servers/constraint-validator && pip install -r requirements.txt

   Report any installation issues

9. Show me a summary of:
   - What was added
   - What already existed (and was kept)
   - Which MCP servers were configured (core, database, optional)
   - Team memory initialization status (.shared/team-memory.json)
   - Any conflicts or issues
   - Environment variables needed (VOYAGE_API_KEY, DEEPSEEK_API_KEY for basin-analyzer)
   - Next steps I should take

Do NOT overwrite my existing configs (ESLint, Prettier, TypeScript) unless I explicitly ask you to. Just add the submodule and MCP servers.

---

## 🤖 What These MCP Servers Do

**Core AI Enhancement Servers:**
- **beads-integration**: Task decomposition and subtask management
- **team-analytics**: Engineer profiles, metrics, and tool recommendations
- **research-swarm**: Multi-step research with confidence tracking (prevents hallucinations)
- **basin-analyzer**: Detects AI output drift and validates consistency (AI quality control)
- **report-writer**: Structured report generation with quality scoring
- **constraint-validator**: Logic validation and conflict detection (catches contradictions)

**Database Servers:**
- **postgres/mysql**: Direct database access for schema inspection and queries

**Optional:**
- **smart-memory**: Auto-detects project context and namespaces memories (useful if you have 3+ projects)

These servers enhance AI agent reliability, research quality, and output validation - like having ESLint/Prettier/Jest for AI agents.

---

**That's it - just copy everything between the lines above.**
