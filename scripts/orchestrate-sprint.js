#!/usr/bin/env node
/**
 * Sprint Workflow Orchestrator
 *
 * Enforces proper workflow:
 * 1. Multiple GitHub Issues → Sprint (TOML + Release Version)
 * 2. Preflight Checks
 * 3. Beads Subtask Decomposition
 * 4. Multi-Agent Execution
 * 5. Progress Monitoring
 *
 * Usage:
 *   node scripts/orchestrate-sprint.js start sprint-19
 *   node scripts/orchestrate-sprint.js status sprint-19
 *   node scripts/orchestrate-sprint.js complete sprint-19
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SPRINTS_DIR = path.join(__dirname, '../sprints');
const SPRINT_STATE_FILE = path.join(__dirname, '../.sprint-state.json');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', ...options }).trim();
  } catch (error) {
    throw new Error(`Command failed: ${cmd}\n${error.message}`);
  }
}

// Load sprint state
function loadSprintState() {
  if (!fs.existsSync(SPRINT_STATE_FILE)) {
    return { sprints: {} };
  }
  return JSON.parse(fs.readFileSync(SPRINT_STATE_FILE, 'utf8'));
}

// Save sprint state
function saveSprintState(state) {
  fs.writeFileSync(SPRINT_STATE_FILE, JSON.stringify(state, null, 2));
}

// Parse sprint TOML
function parseSprintTOML(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract sprint info
  const sprint = {};
  const sprintMatch = content.match(/\[sprint\]([\s\S]*?)(?=\[\[|$)/);
  if (sprintMatch) {
    const sprintBlock = sprintMatch[1];
    sprint.id = sprintBlock.match(/id\s*=\s*(\d+)/)?.[1];
    sprint.version = sprintBlock.match(/version\s*=\s*"([^"]+)"/)?.[1];
    sprint.start_date = sprintBlock.match(/start_date\s*=\s*"([^"]+)"/)?.[1];
    sprint.end_date = sprintBlock.match(/end_date\s*=\s*"([^"]+)"/)?.[1];

    const issuesMatch = sprintBlock.match(/github_issues\s*=\s*\[([^\]]+)\]/);
    if (issuesMatch) {
      sprint.github_issues = issuesMatch[1].split(',').map(n => parseInt(n.trim()));
    }
  }

  // Extract tasks
  const tasks = [];
  const taskBlocks = content.split(/\[\[tasks?\]\]/g).slice(1);

  taskBlocks.forEach(block => {
    const task = {};
    task.title = block.match(/title\s*=\s*"([^"]+)"/)?.[1];
    task.assignee = block.match(/assignee\s*=\s*"([^"]+)"/)?.[1];
    task.priority = block.match(/priority\s*=\s*"([^"]+)"/)?.[1];

    const labelsMatch = block.match(/labels\s*=\s*\[([^\]]+)\]/);
    if (labelsMatch) {
      task.labels = labelsMatch[1].split(',').map(l => l.trim().replace(/"/g, ''));
    }

    const dependsMatch = block.match(/depends_on\s*=\s*\[([^\]]+)\]/);
    if (dependsMatch) {
      task.depends_on = dependsMatch[1].split(',').map(d => d.trim().replace(/"/g, ''));
    }

    if (task.title) {
      tasks.push(task);
    }
  });

  return { sprint, tasks };
}

// Step 1: Validate GitHub Issues
function validateGitHubIssues(issues) {
  log('\n📋 Step 1: Validating GitHub Issues...', 'cyan');

  if (!issues || issues.length === 0) {
    throw new Error('No GitHub issues specified in sprint TOML');
  }

  log(`   Found ${issues.length} GitHub issues: #${issues.join(', #')}`, 'blue');

  // Check if gh CLI is available
  try {
    exec('gh --version');
  } catch (error) {
    log('   ⚠️  GitHub CLI (gh) not found - skipping issue validation', 'yellow');
    return;
  }

  // Validate each issue exists
  const validIssues = [];
  for (const issueNum of issues) {
    try {
      const issue = exec(`gh issue view ${issueNum} --json title,state`);
      const issueData = JSON.parse(issue);
      validIssues.push(issueNum);
      log(`   ✅ Issue #${issueNum}: ${issueData.title} (${issueData.state})`, 'green');
    } catch (error) {
      log(`   ❌ Issue #${issueNum}: Not found or inaccessible`, 'red');
      throw new Error(`GitHub issue #${issueNum} is invalid`);
    }
  }

  return validIssues;
}

// Step 2: Run Preflight Checks
function runPreflightChecks() {
  log('\n🔍 Step 2: Running Preflight Checks...', 'cyan');

  const checks = [
    {
      name: 'Git Status',
      command: 'git status --porcelain',
      validator: (output) => {
        if (output) {
          log('   ⚠️  Warning: Uncommitted changes detected', 'yellow');
          log(`   ${output}`, 'yellow');
          return true; // Allow but warn
        }
        log('   ✅ Working directory clean', 'green');
        return true;
      }
    },
    {
      name: 'Git Branch',
      command: 'git branch --show-current',
      validator: (output) => {
        log(`   📌 Current branch: ${output}`, 'blue');
        return true;
      }
    },
    {
      name: 'Dependencies',
      command: 'npm ls --depth=0',
      validator: () => {
        log('   ✅ Dependencies installed', 'green');
        return true;
      }
    },
    {
      name: 'Beads Initialized',
      command: 'test -d .beads && echo "yes" || echo "no"',
      validator: (output) => {
        if (output === 'no') {
          log('   ❌ Beads not initialized', 'red');
          log('   Run: bd init', 'yellow');
          return false;
        }
        log('   ✅ Beads initialized', 'green');
        return true;
      }
    }
  ];

  for (const check of checks) {
    try {
      const output = exec(check.command);
      if (!check.validator(output)) {
        throw new Error(`Preflight check failed: ${check.name}`);
      }
    } catch (error) {
      if (check.name === 'Dependencies') {
        log(`   ⚠️  Could not verify dependencies`, 'yellow');
      } else {
        throw error;
      }
    }
  }
}

// Step 3: Decompose into Beads Subtasks
function decomposeIntoBeads(sprintFile, sprintData) {
  log('\n🎯 Step 3: Decomposing Sprint into Beads Subtasks...', 'cyan');

  // Create parent task
  const parentTitle = `Sprint ${sprintData.sprint.id}: ${sprintData.sprint.version}`;
  log(`   Creating parent task: ${parentTitle}`, 'blue');

  try {
    const parentOutput = exec(`bd new "${parentTitle}" --label sprint --label "version:${sprintData.sprint.version}"`);
    log(`   ✅ ${parentOutput}`, 'green');
  } catch (error) {
    log(`   ❌ Failed to create parent task: ${error.message}`, 'red');
    throw error;
  }

  // Create subtasks
  const createdTasks = [];
  log(`\n   Creating ${sprintData.tasks.length} subtasks...`, 'blue');

  sprintData.tasks.forEach((task, index) => {
    try {
      let cmd = `bd new "${task.title}" --label subtask`;

      if (task.assignee) {
        cmd += ` --label "assignee:${task.assignee}"`;
      }
      if (task.priority) {
        cmd += ` --label "priority:${task.priority}"`;
      }
      if (task.labels) {
        task.labels.forEach(label => {
          cmd += ` --label "${label}"`;
        });
      }

      const output = exec(cmd);
      const taskIdMatch = output.match(/bd-[a-f0-9]+/);
      const taskId = taskIdMatch ? taskIdMatch[0] : null;

      createdTasks.push({
        title: task.title,
        id: taskId,
        assignee: task.assignee
      });

      log(`   ${index + 1}. ✅ ${task.title} → ${taskId}`, 'green');
    } catch (error) {
      log(`   ${index + 1}. ❌ Failed: ${task.title}`, 'red');
      throw error;
    }
  });

  log(`\n   📊 Created ${createdTasks.length} subtasks successfully`, 'green');
  return createdTasks;
}

// Start Sprint
function startSprint(sprintName) {
  log(`\n╔═══════════════════════════════════════════════════════╗`, 'cyan');
  log(`║  Starting Sprint: ${sprintName.padEnd(35)}║`, 'cyan');
  log(`╚═══════════════════════════════════════════════════════╝`, 'cyan');

  // Load sprint TOML
  const sprintFile = path.join(SPRINTS_DIR, `${sprintName}.toml`);
  if (!fs.existsSync(sprintFile)) {
    log(`\n❌ Sprint file not found: ${sprintFile}`, 'red');
    log(`\nCreate sprint with: /sprint-plan create ${sprintName}`, 'yellow');
    process.exit(1);
  }

  log(`\n📄 Loading sprint: ${sprintFile}`, 'blue');
  const sprintData = parseSprintTOML(sprintFile);

  log(`\n📋 Sprint Details:`, 'cyan');
  log(`   ID: ${sprintData.sprint.id}`, 'blue');
  log(`   Version: ${sprintData.sprint.version}`, 'blue');
  log(`   Duration: ${sprintData.sprint.start_date} → ${sprintData.sprint.end_date}`, 'blue');
  log(`   GitHub Issues: #${sprintData.sprint.github_issues?.join(', #') || 'none'}`, 'blue');
  log(`   Tasks: ${sprintData.tasks.length}`, 'blue');

  // Step 1: Validate GitHub Issues
  validateGitHubIssues(sprintData.sprint.github_issues);

  // Step 2: Preflight Checks
  runPreflightChecks();

  // Step 3: Decompose into Beads
  const createdTasks = decomposeIntoBeads(sprintFile, sprintData);

  // Save sprint state
  const state = loadSprintState();
  state.sprints[sprintName] = {
    id: sprintData.sprint.id,
    version: sprintData.sprint.version,
    started_at: new Date().toISOString(),
    status: 'in-progress',
    github_issues: sprintData.sprint.github_issues,
    beads_tasks: createdTasks
  };
  saveSprintState(state);

  log(`\n✅ Sprint ${sprintName} started successfully!`, 'green');
  log(`\n📋 Next steps:`, 'cyan');
  log(`   1. Check ready tasks: bd list --status ready`, 'blue');
  log(`   2. Assign agents to tasks`, 'blue');
  log(`   3. Monitor progress: node scripts/orchestrate-sprint.js status ${sprintName}`, 'blue');
}

// Sprint Status
function sprintStatus(sprintName) {
  log(`\n╔═══════════════════════════════════════════════════════╗`, 'cyan');
  log(`║  Sprint Status: ${sprintName.padEnd(37)}║`, 'cyan');
  log(`╚═══════════════════════════════════════════════════════╝`, 'cyan');

  const state = loadSprintState();
  const sprint = state.sprints[sprintName];

  if (!sprint) {
    log(`\n❌ Sprint ${sprintName} not found or not started`, 'red');
    process.exit(1);
  }

  log(`\n📋 Sprint Info:`, 'cyan');
  log(`   Version: ${sprint.version}`, 'blue');
  log(`   Started: ${new Date(sprint.started_at).toLocaleString()}`, 'blue');
  log(`   Status: ${sprint.status}`, 'blue');

  // Get Beads progress
  try {
    const tasksOutput = exec('bd list --json');
    const tasks = JSON.parse(tasksOutput);

    const sprintTasks = tasks.filter(t =>
      t.labels?.some(l => l.includes('sprint') || l.includes('subtask'))
    );

    const stats = {
      total: sprintTasks.length,
      done: sprintTasks.filter(t => t.status === 'done').length,
      'in-progress': sprintTasks.filter(t => t.status === 'in-progress').length,
      blocked: sprintTasks.filter(t => t.status === 'blocked').length,
      ready: sprintTasks.filter(t => t.status === 'ready').length
    };

    const completion = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

    log(`\n📊 Progress:`, 'cyan');
    log(`   Total Tasks: ${stats.total}`, 'blue');
    log(`   ✅ Done: ${stats.done}`, 'green');
    log(`   🔄 In Progress: ${stats['in-progress']}`, 'yellow');
    log(`   ⛔ Blocked: ${stats.blocked}`, 'red');
    log(`   📝 Ready: ${stats.ready}`, 'blue');
    log(`   📈 Completion: ${completion}%`, completion >= 80 ? 'green' : 'yellow');

    // Show in-progress tasks
    const inProgress = sprintTasks.filter(t => t.status === 'in-progress');
    if (inProgress.length > 0) {
      log(`\n🔄 Currently Working On:`, 'cyan');
      inProgress.forEach(task => {
        const assignee = task.labels?.find(l => l.startsWith('assignee:'))?.split(':')[1] || 'unassigned';
        log(`   - ${task.id}: ${task.title} (${assignee})`, 'yellow');
      });
    }

    // Show ready tasks
    const ready = sprintTasks.filter(t => t.status === 'ready');
    if (ready.length > 0) {
      log(`\n📝 Ready to Start:`, 'cyan');
      ready.forEach(task => {
        const assignee = task.labels?.find(l => l.startsWith('assignee:'))?.split(':')[1] || 'unassigned';
        log(`   - ${task.id}: ${task.title} (${assignee})`, 'blue');
      });
    }

    // Show blocked tasks
    const blocked = sprintTasks.filter(t => t.status === 'blocked');
    if (blocked.length > 0) {
      log(`\n⛔ Blocked Tasks:`, 'cyan');
      blocked.forEach(task => {
        log(`   - ${task.id}: ${task.title}`, 'red');
      });
    }

  } catch (error) {
    log(`\n⚠️  Could not fetch Beads tasks: ${error.message}`, 'yellow');
  }
}

// Complete Sprint
function completeSprint(sprintName) {
  log(`\n╔═══════════════════════════════════════════════════════╗`, 'cyan');
  log(`║  Completing Sprint: ${sprintName.padEnd(33)}║`, 'cyan');
  log(`╚═══════════════════════════════════════════════════════╝`, 'cyan');

  const state = loadSprintState();
  const sprint = state.sprints[sprintName];

  if (!sprint) {
    log(`\n❌ Sprint ${sprintName} not found`, 'red');
    process.exit(1);
  }

  // Check completion
  try {
    const tasksOutput = exec('bd list --json');
    const tasks = JSON.parse(tasksOutput);

    const sprintTasks = tasks.filter(t =>
      t.labels?.some(l => l.includes('sprint') || l.includes('subtask'))
    );

    const stats = {
      total: sprintTasks.length,
      done: sprintTasks.filter(t => t.status === 'done').length,
      incomplete: sprintTasks.filter(t => t.status !== 'done').length
    };

    log(`\n📊 Final Stats:`, 'cyan');
    log(`   Total: ${stats.total}`, 'blue');
    log(`   Completed: ${stats.done}`, 'green');
    log(`   Incomplete: ${stats.incomplete}`, stats.incomplete > 0 ? 'yellow' : 'green');

    if (stats.incomplete > 0) {
      log(`\n⚠️  Warning: Sprint has ${stats.incomplete} incomplete tasks`, 'yellow');
    }

    // Update state
    sprint.status = 'completed';
    sprint.completed_at = new Date().toISOString();
    sprint.final_stats = stats;
    saveSprintState(state);

    log(`\n✅ Sprint ${sprintName} marked as complete!`, 'green');
    log(`\n📋 Next steps:`, 'cyan');
    log(`   1. Create release: git tag ${sprint.version}`, 'blue');
    log(`   2. Close GitHub issues: #${sprint.github_issues?.join(', #')}`, 'blue');
    log(`   3. Archive sprint: bd archive --label sprint`, 'blue');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Main CLI
const [,, command, sprintName] = process.argv;

if (!command || !sprintName) {
  console.log(`
Sprint Workflow Orchestrator

Usage:
  node scripts/orchestrate-sprint.js start <sprint-name>     Start new sprint
  node scripts/orchestrate-sprint.js status <sprint-name>    Check sprint status
  node scripts/orchestrate-sprint.js complete <sprint-name>  Complete sprint

Examples:
  node scripts/orchestrate-sprint.js start sprint-19
  node scripts/orchestrate-sprint.js status sprint-19
  node scripts/orchestrate-sprint.js complete sprint-19

Workflow:
  1. Multiple GitHub Issues → Sprint TOML + Release Version
  2. Preflight Checks (git, dependencies, beads)
  3. Beads Subtask Decomposition (with dependencies)
  4. Multi-Agent Execution (coordinated)
  5. Progress Monitoring & Completion
  `);
  process.exit(0);
}

try {
  switch (command) {
    case 'start':
      startSprint(sprintName);
      break;
    case 'status':
      sprintStatus(sprintName);
      break;
    case 'complete':
      completeSprint(sprintName);
      break;
    default:
      log(`\n❌ Unknown command: ${command}`, 'red');
      process.exit(1);
  }
} catch (error) {
  log(`\n❌ Error: ${error.message}`, 'red');
  process.exit(1);
}
