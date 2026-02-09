# Add eng-platform to Existing Project

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
   - Add beads-integration MCP server
   - Add team-analytics MCP server
   - If .mcp.json exists, merge with existing servers
   - If it doesn't exist, create it

4. Create sprints/ directory if it doesn't exist

5. If CLAUDE.md doesn't exist, copy the template from .eng-platform/templates/CLAUDE.md

6. Show me a summary of:
   - What was added
   - What already existed (and was kept)
   - Any conflicts or issues
   - Next steps I should take

Do NOT overwrite my existing configs (ESLint, Prettier, TypeScript) unless I explicitly ask you to. Just add the submodule and MCP servers.

---

**That's it - just copy everything between the lines above.**
