# Sprint Execute Skill

**Purpose:** Launch and orchestrate multi-agent sprint execution workflow

**Command:** `/sprint-execute <sprint-name>`

---

## 🎯 What This Skill Does

Orchestrates the full sprint workflow in one command:
1. Loads sprint TOML (with optional GitHub issues)
2. Runs preflight checks
3. Decomposes into Beads subtasks with dependencies
4. Coordinates multi-agent execution
5. Monitors progress

---

## 📋 Usage

### **Start Sprint Execution**
```
/sprint-execute start sprint-19
```

### **Check Sprint Status**
```
/sprint-execute status sprint-19
```

### **Complete Sprint**
```
/sprint-execute complete sprint-19
```

---

## 🔧 Sprint TOML Format

**Flexible:** GitHub issues are optional

### **With GitHub Issues:**
```toml
[sprint]
id = 19
version = "v2.1.0"
github_issues = [123, 124, 125]  # Optional

[[tasks]]
title = "Implement feature X"
assignee = "agent-api"
```

### **Without GitHub Issues:**
```toml
[sprint]
id = 19
version = "v2.1.0"
source = "Product requirements doc"  # Or anything else

[[tasks]]
title = "Implement feature X"
assignee = "agent-api"
```

---

## 🤖 Multi-Agent Coordination

The skill automatically:
- ✅ Creates Beads tasks with dependencies
- ✅ Assigns tasks to agents
- ✅ Ensures agents don't start until dependencies are done
- ✅ Monitors progress in real-time
- ✅ Reports blockers

---

## 📊 Example Workflow

```
Engineer: /sprint-execute start sprint-19

Claude:
✅ Sprint loaded: v2.1.0
✅ Preflight checks passed
✅ Created 8 subtasks in Beads
✅ Ready tasks: 3 (API auth, UI setup, DB schema)

You can now:
- Assign agents to ready tasks
- Start multi-agent execution
- Monitor with: /sprint-execute status sprint-19
```

---

## 🎓 Integration

Works with:
- Sprint Planning skill (`/sprint-plan`)
- Beads MCP server (subtask management)
- Team Analytics (progress tracking)
- Protection Guard (code safety)
