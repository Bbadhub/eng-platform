# Contribute a Tool Back to eng-platform

**Copy the text between the lines below and paste into Claude Code:**

---

I want to contribute a tool from this project to eng-platform.

Tool name: [YOUR_TOOL_NAME]
Tool type: [MCP server / config / script / pattern / workflow]
Location in my project: [PATH_TO_TOOL]
What it does: [BRIEF_DESCRIPTION]

Please:
1. Extract the tool from my project
2. Remove any project-specific code (URLs, names, hardcoded values)
3. Make it configurable with environment variables or config files
4. Determine the right location in eng-platform:
   - MCP servers → mcp-servers/[tool-name]/
   - Configs → configs/[tool-name]/
   - Scripts → scripts/[tool-name].js
   - Patterns → docs/patterns/Pattern-[NAME]-001.md
   - Workflows → workflows/[workflow-name].yml
5. Add it to tools-registry.json if it's a tool
6. Create a README.md with usage instructions
7. Commit the changes to eng-platform repo
8. Create a PR with description

Show me what you're changing as you go, and ask if you're unsure about anything.

---

**Example:**

I want to contribute a tool from this project to eng-platform.

Tool name: database-validator
Tool type: MCP server
Location in my project: mcp-servers/db-validator/
What it does: Validates database migrations against schema rules to prevent bad migrations

---

**That's it - just copy everything between the lines above and fill in your details.**
