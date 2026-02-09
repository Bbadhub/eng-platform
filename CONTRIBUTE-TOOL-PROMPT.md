# Contribute a Tool to eng-platform - LLM Prompt

**When you discover a great tool/pattern/MCP server in your project and want to share it with eng-platform**

---

## 🚀 Quick Prompt

```
I want to contribute [tool-name] to eng-platform.

It's a [MCP server / config / script / pattern] that does [brief description].

Location in my project: [path]

Please:
1. Extract it and make it domain-agnostic
2. Add it to eng-platform in the right location
3. Update tools-registry.json (if it's a tool)
4. Add documentation
5. Create a PR to eng-platform repo

Let me know what information you need.
```

---

## 📋 What Claude Will Ask

**Question 1:** What type is it?
- A) MCP Server (new capability)
- B) Config (ESLint rule, prettier, etc.)
- C) Script (automation tool)
- D) Pattern (design pattern/ADR)
- E) Workflow (GitHub Action)
- F) Other

**Question 2:** Where should it go?
- Auto-suggests based on type
- You can override

**Question 3:** Does it have project-specific code?
- Reviews code for domain-specific references
- Shows what needs to be cleaned/templated
- You approve changes

---

## 🎯 Example: Contributing an MCP Server

```
Engineer: "I want to contribute the database-schema-validator MCP server
I built. It's in mcp-servers/db-validator/ and validates migrations against
schema rules. Really useful for preventing bad migrations."

Claude:
📦 Analyzing database-schema-validator...

Found:
- server.js (428 lines)
- package.json
- README.md
- config.json

Detected project-specific code:
⚠️ Line 42: const DB_URL = "postgresql://localhost/myproject"
⚠️ Line 156: const SCHEMA = "./schema/myproject.prisma"
⚠️ config.json: Has hardcoded project name

I can clean this up:
1. Replace hardcoded DB_URL with env var: ${DATABASE_URL}
2. Make schema path configurable
3. Remove project name from config
4. Add template config.example.json

Proceed? (yes/no)

Engineer: yes

Claude:
✅ Cleaned db-validator for domain-agnostic use
✅ Added to .eng-platform/mcp-servers/db-validator/
✅ Updated tools-registry.json:
   {
     "id": "db-validator",
     "name": "Database Schema Validator",
     "category": "database",
     "status": "experimental"
   }
✅ Added comprehensive README.md
✅ Created PR: "feat: add database-schema-validator MCP server"

PR URL: https://github.com/Bbadhub/eng-platform/pull/123

Next steps:
1. Review PR
2. Merge when ready
3. Update submodule in other projects: git submodule update --remote
```

---

## 🔧 Workflow Steps

### **1. Detection & Extraction**
Claude will:
- Locate the tool in your project
- Copy relevant files
- Detect dependencies

### **2. Domain-Agnostic Cleanup**
Claude will:
- Find project-specific references (URLs, names, paths)
- Suggest replacements (env vars, config options, templates)
- Show you the changes
- Get your approval

### **3. Integration**
Claude will:
- Move to appropriate location in .eng-platform/
- Update tools-registry.json (if applicable)
- Add to appropriate category
- Set status: "experimental" (you can test before promoting)

### **4. Documentation**
Claude will:
- Create/update README
- Add usage examples
- Document configuration options
- Add to eng-platform docs if needed

### **5. PR Creation**
Claude will:
- Commit changes in .eng-platform/
- Push to a branch
- Create PR with description
- Tag it appropriately

---

## 📦 What Can Be Contributed?

### **MCP Servers** (Most Common)
```
Location: mcp-servers/[tool-name]/
Example: Database validator, code analyzer, deployment helper
```

### **Configs** (Shared Standards)
```
Location: configs/[tool-name]/
Example: New ESLint rules, custom Prettier config, tsconfig variation
```

### **Scripts** (Automation)
```
Location: scripts/[script-name].js
Example: Custom metrics, validation, migration tools
```

### **Patterns** (Design Patterns)
```
Location: docs/patterns/Pattern-[NAME]-001.md
Example: API design pattern, state management, testing strategy
```

### **Workflows** (GitHub Actions)
```
Location: workflows/[workflow-name].yml
Example: Custom CI/CD, deployment automation
```

### **Skills** (Claude Code Skills)
```
Location: skills/[skill-name]/
Example: Custom workflow skill, validation skill
```

---

## 🎯 Example: Contributing a Config

```
Engineer: "I created a custom ESLint rule set for API projects.
It's in .eslintrc-api.js and has great rules for REST/tRPC APIs."

Claude:
📦 Analyzing .eslintrc-api.js...

Found 23 custom rules for:
- API endpoint naming
- Error handling patterns
- Request/response validation
- Security headers

No project-specific code detected ✅

Where should this go?
1. configs/eslint/api.js (recommended)
2. configs/eslint/react-api.js
3. Custom location

Engineer: 1

Claude:
✅ Added configs/eslint/api.js
✅ Updated tools-registry.json (linting category)
✅ Added usage instructions to README
✅ Created PR: "feat(eslint): add API-specific rules"

PR: https://github.com/Bbadhub/eng-platform/pull/124

Other projects can now use:
module.exports = {
  extends: ['./.eng-platform/configs/eslint/api.js']
}
```

---

## 🚀 Quick Contribution Types

### **Found a Great Tool**
```
"I want to contribute [npm-package-name] to tools-registry.json"
```

### **Built Custom MCP Server**
```
"Extract my [mcp-server-name] and contribute it to eng-platform"
```

### **Created Useful Pattern**
```
"Document my [pattern-name] as a pattern in eng-platform"
```

### **Made Workflow Improvement**
```
"Add my [workflow-name].yml to eng-platform workflows"
```

---

## ✅ Auto-Cleanup Checklist

Claude automatically checks:
- [ ] Remove project-specific URLs
- [ ] Remove hardcoded credentials/API keys
- [ ] Replace absolute paths with relative/configurable
- [ ] Remove project names from code/configs
- [ ] Add configuration examples
- [ ] Add README with setup instructions
- [ ] Add to tools-registry.json (if tool)
- [ ] Create tests if applicable
- [ ] Document dependencies

---

## 📊 Contribution Workflow

```
Your Project (discovers tool)
       ↓
"Contribute [tool] to eng-platform"
       ↓
Claude extracts & cleans
       ↓
Review changes
       ↓
Claude creates PR to eng-platform
       ↓
You review PR on GitHub
       ↓
Merge when ready
       ↓
Update submodules in other projects
       ↓
Tool available everywhere!
```

---

## 🎓 Best Practices

**Before Contributing:**
1. Test tool works in your project
2. Ensure it's generally useful (not project-specific)
3. Have basic documentation

**Claude Will:**
1. Clean up project-specific code
2. Make it configurable
3. Add comprehensive docs
4. Create proper PR

**After Merge:**
1. Update submodule: `git submodule update --remote .eng-platform`
2. Test in another project
3. Promote to "standard" if widely adopted

---

## 💡 Pro Tips

**Contribute Early:**
Don't wait for "perfect" - contribute when it works. Others can improve it.

**Iterate:**
Start as "experimental", promote to "standard" after testing.

**Document Why:**
Include why you built it and what problem it solves.

**Share Results:**
After others use it, share effectiveness data for promotion decisions.

---

## 🎯 Success Story

```
Week 1: Alice builds db-validator MCP in her project
Week 2: Alice contributes to eng-platform with one prompt
Week 3: Bob adopts it in his project (git submodule update)
Week 4: Charlie uses it too
Week 5: Analytics show 30% fewer migration failures
Week 6: Promoted to "standard" based on data
Week 7: All projects using it automatically via platform updates

Result: One engineer's innovation → entire team benefits
```

---

**Time:** 5-10 minutes to contribute
**Benefit:** Share innovations across all projects
**Impact:** Compound improvements via shared platform
