# Quick Commands & Shortcuts

**Goal:** Fast access to common engineering tasks

---

## ⚡ Ultra-Fast Skills (Most Common)

### **Setup & Initialization**
```bash
/init                    # Setup eng-platform in project (alias for /initialize)
/sync                    # Sync eng-platform to latest version
```

### **Sprint Workflow**
```bash
/sprint start            # Start current sprint
/sprint status           # Check sprint progress
/sprint complete         # Complete sprint
/sp start                # Short alias
```

### **Task Management (Beads)**
```bash
/ready                   # Show all ready tasks
/ready agent-api         # Show ready tasks for specific agent
/task bd-a1b2            # Get task details
/done bd-a1b2            # Mark task as done
/blocked bd-a1b2         # Mark task as blocked
```

### **Tool Analysis**
```bash
/tools                   # Show all tool effectiveness
/tools linting           # Compare linting tools
/tools ide              # Compare IDEs
/winner linting          # Show winning tool in category
```

### **Experiments**
```bash
/experiment start exp-001    # Start experiment
/experiment status exp-001   # Check experiment progress
/exp checkpoint              # Record weekly checkpoint (current experiment)
```

### **Team Analytics**
```bash
/health                  # My health score
/health Alice            # Alice's health score
/team                    # Team health overview
/velocity                # Team velocity metrics
```

---

## 💬 Natural Language Shortcuts

### **Instead of typing commands, just ask:**

#### **Sprint Management**
```
"Start sprint 19"
"What's the sprint progress?"
"Show sprint status"
"Complete the sprint"
"How many tasks left?"
```

#### **Task Management**
```
"What tasks are ready?"
"Show ready tasks for the API agent"
"What should I work on next?"
"Mark bd-a1b2 as done"
"Show dependency graph"
"What's blocking bd-x7y8?"
```

#### **Tool Comparison**
```
"Which linter is better?"
"Compare Cursor vs VS Code"
"What IDE has the best quality scores?"
"Should we promote eslint-strict?"
"Is Biome faster than ESLint?"
```

#### **Experiments**
```
"Start the Cursor vs VS Code experiment"
"How's the linting experiment going?"
"Record this week's checkpoint"
"Show experiment results"
"Is the experiment statistically significant?"
```

#### **Team Health**
```
"How's the team doing?"
"Show my health score"
"Who needs help?"
"Which engineers are blocked?"
"Show top performers"
```

#### **Setup & Config**
```
"Add eng-platform to this project"
"Add the PostgreSQL MCP server"
"Update eng-platform"
"What MCP servers are available?"
```

---

## 🎯 Context-Aware Shortcuts

**Claude understands context:**

```
Engineer: /sprint start

Claude: Which sprint?
  1. sprint-19 (v2.1.0) - Ready to start
  2. sprint-20 (v2.2.0) - Planned

Engineer: 1

Claude: ✅ Starting sprint-19...
```

**Or:**
```
Engineer: "start the sprint"

Claude:
✅ Detected sprint-19.toml in sprints/
✅ Starting sprint-19 (v2.1.0)...
```

---

## 📊 Quick Reference Card

**Print this or add to your IDE:**

```
╔══════════════════════════════════════════════════════════╗
║  ENG-PLATFORM QUICK COMMANDS                             ║
╠══════════════════════════════════════════════════════════╣
║  SETUP                                                   ║
║    /init                  Setup eng-platform             ║
║    "add eng-platform"     Natural language              ║
║                                                          ║
║  SPRINTS                                                 ║
║    /sprint start          Start sprint                   ║
║    /sprint status         Check progress                 ║
║    "sprint progress?"     Natural language              ║
║                                                          ║
║  TASKS                                                   ║
║    /ready                 Show ready tasks               ║
║    /done bd-xxx           Mark done                      ║
║    "what's ready?"        Natural language              ║
║                                                          ║
║  TOOLS                                                   ║
║    /tools linting         Compare tools                  ║
║    /winner ide            Show best tool                 ║
║    "which IDE wins?"      Natural language              ║
║                                                          ║
║  TEAM                                                    ║
║    /health                My health score                ║
║    /team                  Team overview                  ║
║    "how's the team?"      Natural language              ║
╚══════════════════════════════════════════════════════════╝
```

---

## 🔧 Implementation: Alias Skills

Create simple alias skills that wrap complex commands:

### **/ready** skill
```markdown
# Ready Tasks Skill

When engineer types: /ready [agent]

Claude executes:
1. Query Beads: bd list --status ready --json
2. Filter by agent if specified
3. Format output nicely
4. Show dependencies
```

### **/tools** skill
```markdown
# Tool Analysis Skill

When engineer types: /tools [category]

Claude executes:
1. Run: node scripts/analyze-tool-effectiveness.js [category]
2. Format as table
3. Show winner
4. Provide recommendation
```

### **/sprint** skill
```markdown
# Sprint Management Skill

When engineer types: /sprint [action]

Actions:
- start: Run orchestrate-sprint.js start
- status: Run orchestrate-sprint.js status
- complete: Run orchestrate-sprint.js complete
```

---

## 💡 Smart Defaults

**Claude should infer what you mean:**

```
Engineer: /sprint

Claude: (detects context)
You're currently in sprint-19 (in-progress)

Quick actions:
1. /sprint status  - Check progress
2. /sprint complete - Mark complete
3. /ready - Show ready tasks

What would you like?
```

---

## 🎓 Discoverability

### **Help Commands**
```
/help              # Show all available commands
/commands          # List quick commands
/shortcuts         # Show natural language examples
/?                 # Quick help
```

### **Command Suggestions**
```
Engineer: "I want to check on the sprint"

Claude: Did you mean:
  /sprint status  - Check sprint progress
  /team - Check team health
  /ready - Show ready tasks
```

---

## 🚀 Examples in Action

### **Morning Standup**
```
Engineer: "what's ready?"

Claude:
📝 Ready Tasks (3):
1. bd-a1b2: Implement login API (agent-api)
2. bd-c3d4: Add test coverage (agent-test)
3. bd-e5f6: Update docs (human)

Blocked: 1 task (waiting on bd-a1b2)
In Progress: 2 tasks
```

### **Check Tool Effectiveness**
```
Engineer: /tools

Claude:
🏆 Tool Winners by Category:
  Linting:  eslint-strict (83.5 quality, +7% vs base)
  IDE:      cursor (96 quality, +28% velocity)
  Testing:  vitest (standard)

📋 Recommendations:
  ✅ Promote: eslint-strict (4 users, 8 weeks data)
  ⚠️  Monitor: cursor (2 users, needs more data)
```

### **Start Next Task**
```
Engineer: "what should I work on?"

Claude:
🎯 Recommended for you (based on your skills):

  bd-a1b2: Implement authentication API
  Assignee: agent-api (matches your profile)
  Priority: high
  Estimated: 4 hours
  Dependencies: ✅ All satisfied

Ready to start? (yes/no)
```

---

## 🎯 Recommendation Summary

**Create these quick-access skills:**

1. ✅ `/init` - Setup (already have /initialize)
2. ✅ `/sprint` - Sprint management
3. ✅ `/ready` - Show ready tasks
4. ✅ `/done` - Mark task done
5. ✅ `/tools` - Tool comparison
6. ✅ `/winner` - Show best tool
7. ✅ `/health` - Engineer health
8. ✅ `/team` - Team overview
9. ✅ `/experiment` - Experiment management
10. ✅ `/sync` - Update platform

**Plus support natural language for all of them.**

---

**Want me to implement these quick-access skills?** They'd make eng-platform **way** faster to use! 🚀
