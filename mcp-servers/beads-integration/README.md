# Beads MCP Server - Multi-Agent Workflow Integration

**Purpose:** Orchestrate multi-agent workflows with dependency-tracked subtasks

---

## 🎯 Your Workflow (Automated)

```
Multiple GitHub Issues
  ↓
Sprint Planning (TOML + Release Version)
  ↓
Preflight Checks
  ↓
Beads Subtask Decomposition
  ↓
Multi-Agent Execution (Dependencies Tracked)
  ↓
Progress Monitoring
```

---

## 🚀 Installation

### **1. Install Beads CLI**
```bash
# Install Beads globally
npm install -g beads

# Or download binary from https://github.com/steveyegge/beads/releases
```

### **2. Install MCP Server**
```bash
cd mcp-servers/beads-integration
npm install
```

### **3. Add to Claude Code**
```json
// .mcp.json
{
  "mcpServers": {
    "beads": {
      "command": "node",
      "args": ["${workspaceFolder}/.eng-platform/mcp-servers/beads-integration/server.js"]
    }
  }
}
```

### **4. Initialize Beads in Project**
```bash
cd your-project
bd init
```

---

## 🔧 MCP Tools

### **1. beads_decompose_sprint**
Decompose sprint TOML into Beads subtasks with dependencies

```javascript
// Claude Code usage:
"Use beads to decompose sprint sprints/sprint-19.toml for GitHub issues #123, #124, #125"

// Creates:
// - Parent task: "Sprint 19: Release v2.1.0"
// - Subtasks from TOML with dependencies
// - Auto-assigns to agents
```

### **2. beads_create_subtask**
Create individual subtask with dependencies

```javascript
// Example:
"Create beads subtask: 'Implement API endpoint' depends on bd-a1b2 assigned to agent-api"
```

### **3. beads_list_ready**
List tasks ready to work on (dependencies satisfied)

```javascript
// Claude Code usage:
"Show me ready beads tasks for agent-api"

// Returns tasks where all dependencies are done
```

### **4. beads_get_task**
Get task details including dependencies

### **5. beads_update_status**
Update task status (ready/in-progress/blocked/done)

```javascript
"Mark beads task bd-a1b2 as done"
```

### **6. beads_dependency_graph**
Visualize task dependencies (JSON or Mermaid)

```javascript
"Show beads dependency graph in mermaid format"
```

### **7. beads_sprint_progress**
Get sprint progress summary

```javascript
"What's the beads sprint progress?"

// Returns:
// Total: 12, Completed: 8, In Progress: 2, Ready: 2
// Completion: 67%
```

---

## 📋 Workflow Guide

### **Step 1: Sprint Planning (TOML)**

Create sprint TOML with multiple GitHub issues:

```toml
# sprints/sprint-19.toml
[sprint]
id = 19
version = "v2.1.0"
start_date = "2026-02-09"
end_date = "2026-02-23"
github_issues = [123, 124, 125]

[[tasks]]
title = "Setup API authentication"
assignee = "agent-api"
labels = ["backend", "auth"]
priority = "high"

[[tasks]]
title = "Create login UI"
assignee = "agent-ui"
depends_on = ["bd-auth-setup"]  # Will be resolved after creation
labels = ["frontend", "auth"]

[[tasks]]
title = "Write integration tests"
assignee = "agent-test"
depends_on = ["bd-auth-setup", "bd-login-ui"]
labels = ["testing"]

[[tasks]]
title = "Deploy to staging"
assignee = "human"
depends_on = ["bd-integration-tests"]
labels = ["deployment"]
```

### **Step 2: Run Preflight Checks**

```bash
# Validate sprint TOML
node scripts/validate-sprint.js sprints/sprint-19.toml

# Check git status
git status

# Verify dependencies
npm install
```

### **Step 3: Decompose with Beads**

```javascript
// In Claude Code:
"Use beads to decompose sprint sprints/sprint-19.toml for release v2.1.0"

// MCP Server:
// 1. Reads sprint TOML
// 2. Creates parent task: "Sprint 19: v2.1.0"
// 3. Creates subtasks with dependencies
// 4. Returns task IDs for tracking
```

### **Step 4: Multi-Agent Execution**

```javascript
// Query ready tasks
"Show me ready beads tasks for agent-api"

// Agent starts work
"I'm starting work on bd-a1b2 (API authentication)"

// Update status
"Mark bd-a1b2 as in-progress"

// When done
"Mark bd-a1b2 as done"

// Next agent can start
"Show ready tasks for agent-ui"  // Now includes login UI (dependency satisfied)
```

### **Step 5: Monitor Progress**

```javascript
// Check overall progress
"What's the beads sprint progress?"

// View dependency graph
"Show beads dependency graph"

// Check blocked tasks
"Show blocked beads tasks"
```

---

## 🤖 Multi-Agent Coordination

### **Workflow Example:**

```javascript
// Agent 1 (API)
"Show ready tasks for agent-api"
// → bd-a1b2: Setup API authentication

"Start work on bd-a1b2"
// Agent 1 implements authentication

"Mark bd-a1b2 as done"

// Agent 2 (UI) - automatically unblocked
"Show ready tasks for agent-ui"
// → bd-c3d4: Create login UI (was waiting on bd-a1b2)

"Start work on bd-c3d4"
// Agent 2 builds UI using API from Agent 1

"Mark bd-c3d4 as done"

// Agent 3 (Test) - automatically unblocked
"Show ready tasks for agent-test"
// → bd-e5f6: Integration tests (was waiting on bd-a1b2 and bd-c3d4)
```

**Benefits:**
- ✅ No race conditions (dependencies enforced)
- ✅ Parallel work where possible
- ✅ Clear handoff points
- ✅ Progress visibility

---

## 📊 Sprint TOML Schema

```toml
[sprint]
id = 19                           # Sprint number
version = "v2.1.0"               # Release version
start_date = "2026-02-09"        # Sprint start
end_date = "2026-02-23"          # Sprint end (2 weeks)
github_issues = [123, 124, 125]  # Issues included in sprint

[[tasks]]
title = "Task name"              # Required
description = "Details"          # Optional
assignee = "agent-name"          # agent-api, agent-ui, agent-test, human
depends_on = ["bd-xxx"]          # Task IDs (or will be resolved)
labels = ["frontend", "backend"] # Categories
priority = "high"                # high, medium, low
estimated_hours = 4              # Estimation
```

---

## 🔄 Integration with Sprint Planning

The Beads MCP server integrates with the `sprint-plan` skill:

```javascript
// 1. Create sprint with skill
"/sprint-plan create sprint-19 v2.1.0 'Auth system + login UI'"

// 2. Decompose into Beads subtasks
"Decompose sprint-19 into beads subtasks"

// 3. Execute
"Show ready beads tasks"
```

---

## 🎯 Best Practices

### **1. Dependency Management**
```javascript
// ✅ Good: Clear dependencies
[[tasks]]
title = "API implementation"
assignee = "agent-api"

[[tasks]]
title = "UI that uses API"
depends_on = ["bd-api"]  // Explicit dependency
assignee = "agent-ui"

// ❌ Bad: Implicit dependencies
[[tasks]]
title = "UI"
// Missing dependency - might fail if API not ready
```

### **2. Agent Assignment**
```javascript
// Use consistent agent names
assignee = "agent-api"     // Backend work
assignee = "agent-ui"      // Frontend work
assignee = "agent-test"    // Testing
assignee = "agent-infra"   // Infrastructure
assignee = "human"         // Manual steps
```

### **3. Labels**
```javascript
// Use labels for filtering
labels = ["frontend", "auth", "critical"]
labels = ["backend", "database", "migration"]
labels = ["testing", "e2e"]
```

---

## 📈 Metrics & Tracking

### **Sprint Velocity**
```javascript
// After sprint completion
"Analyze beads sprint-19 metrics"

// Returns:
// - Total tasks: 12
// - Completed: 11
// - Completion rate: 92%
// - Average cycle time: 2.3 hours
// - Blocked time: 4 hours
```

### **Agent Performance**
```javascript
// Track individual agent effectiveness
"Show beads tasks completed by agent-api this sprint"

// Returns:
// - Tasks: 4
// - Avg cycle time: 2.1 hours
// - Quality score: 95% (based on downstream blocks)
```

---

## 🐛 Troubleshooting

### **"bd: command not found"**
```bash
# Install Beads
npm install -g beads

# Or add to PATH
export PATH="$PATH:/path/to/beads/bin"
```

### **"No .beads directory"**
```bash
# Initialize Beads in project
cd your-project
bd init
```

### **"Task dependencies not resolving"**
```javascript
// Check dependency graph
"Show beads dependency graph"

// Fix circular dependencies
// Update task with correct dependency
bd edit bd-a1b2 --depends bd-c3d4
```

---

## 🚀 Advanced: Workflow Automation Script

Create `scripts/orchestrate-sprint.js`:

```javascript
#!/usr/bin/env node
/**
 * Orchestrate full sprint workflow
 * Usage: node scripts/orchestrate-sprint.js sprint-19
 */

// 1. Validate sprint TOML
// 2. Run preflight checks
// 3. Decompose into Beads
// 4. Monitor execution
// 5. Report progress

// See implementation in ../../../scripts/orchestrate-sprint.js
```

---

## 📚 Related Documentation

- [Beads Official Docs](https://github.com/steveyegge/beads)
- [Sprint Planning Skill](../../skills/sprint-plan/)
- [Tool Experimentation Guide](../../docs/runbooks/tool-experimentation-guide.md)
- [Multi-Agent Patterns](../../docs/patterns/Pattern-AGENT-ROUTING-001.md)

---

**Questions?** Check [CONTRIBUTING.md](../../CONTRIBUTING.md) or open an issue.
