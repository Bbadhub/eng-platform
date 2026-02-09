#!/usr/bin/env node
/**
 * Tool Experiment Management Script
 *
 * Usage:
 *   node scripts/manage-experiments.js start exp-001
 *   node scripts/manage-experiments.js checkpoint exp-001
 *   node scripts/manage-experiments.js complete exp-001
 *   node scripts/manage-experiments.js report exp-001
 */

const fs = require('fs');
const path = require('path');

const EXPERIMENTS_FILE = path.join(__dirname, '../experiments/tool-experiments.json');
const ANALYTICS_FILE = path.join(__dirname, '../mcp-servers/team-analytics/data/tool-analytics.json');

// Load experiments
function loadExperiments() {
  if (!fs.existsSync(EXPERIMENTS_FILE)) {
    console.error('❌ Experiments file not found:', EXPERIMENTS_FILE);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(EXPERIMENTS_FILE, 'utf8'));
}

// Save experiments
function saveExperiments(data) {
  fs.writeFileSync(EXPERIMENTS_FILE, JSON.stringify(data, null, 2));
}

// Find experiment by ID
function findExperiment(experiments, expId) {
  let exp = experiments.active_experiments?.find(e => e.id === expId);
  if (!exp) {
    exp = experiments.completed_experiments?.find(e => e.id === expId);
  }
  return exp;
}

// Start experiment
function startExperiment(expId) {
  const data = loadExperiments();
  const exp = findExperiment(data, expId);

  if (!exp) {
    console.error(`❌ Experiment ${expId} not found`);
    process.exit(1);
  }

  if (exp.status !== 'planned') {
    console.error(`❌ Experiment ${expId} is already ${exp.status}`);
    process.exit(1);
  }

  exp.status = 'active';
  exp.start_date = new Date().toISOString().split('T')[0];

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (exp.duration_weeks * 7));
  exp.end_date = endDate.toISOString().split('T')[0];

  exp.weekly_checkpoints = [];

  saveExperiments(data);

  console.log(`✅ Experiment ${expId} started`);
  console.log(`📅 Duration: ${exp.duration_weeks} weeks (${exp.start_date} to ${exp.end_date})`);
  console.log(`🔬 Hypothesis: ${exp.hypothesis}`);
  console.log(`\n👥 Cohorts:`);
  console.log(`   Treatment (${exp.cohorts.treatment.tool_id}): ${exp.cohorts.treatment.engineers.join(', ')}`);
  console.log(`   Control (${exp.cohorts.control.tool_id}): ${exp.cohorts.control.engineers.join(', ')}`);
}

// Record weekly checkpoint
function recordCheckpoint(expId) {
  const data = loadExperiments();
  const exp = findExperiment(data, expId);

  if (!exp) {
    console.error(`❌ Experiment ${expId} not found`);
    process.exit(1);
  }

  if (exp.status !== 'active') {
    console.error(`❌ Experiment ${expId} is not active (status: ${exp.status})`);
    process.exit(1);
  }

  const weekNumber = (exp.weekly_checkpoints?.length || 0) + 1;
  const today = new Date().toISOString().split('T')[0];

  console.log(`📊 Recording Week ${weekNumber} checkpoint for ${expId}...`);
  console.log(`\nCollecting metrics from team-analytics...`);

  // In a real implementation, this would:
  // 1. Query team-analytics MCP server for actual metrics
  // 2. Filter by engineers in each cohort
  // 3. Calculate averages and deltas

  // For now, we'll create a template
  const checkpoint = {
    week: weekNumber,
    date: today,
    treatment_metrics: {
      code_quality_score: null, // TODO: Fetch from team-analytics
      velocity_commits_per_week: null,
      pr_approval_rate: null,
      bug_rate: null,
      developer_satisfaction: null,
      sample_size: exp.cohorts.treatment.engineers.length
    },
    control_metrics: {
      code_quality_score: null, // TODO: Fetch from team-analytics
      velocity_commits_per_week: null,
      pr_approval_rate: null,
      bug_rate: null,
      developer_satisfaction: null,
      sample_size: exp.cohorts.control.engineers.length
    },
    delta: {},
    observations: "TODO: Add qualitative observations"
  };

  if (!exp.weekly_checkpoints) {
    exp.weekly_checkpoints = [];
  }
  exp.weekly_checkpoints.push(checkpoint);

  saveExperiments(data);

  console.log(`✅ Week ${weekNumber} checkpoint created`);
  console.log(`\n⚠️  MANUAL STEPS REQUIRED:`);
  console.log(`1. Query team-analytics MCP for actual metrics`);
  console.log(`2. Update checkpoint in ${EXPERIMENTS_FILE}`);
  console.log(`3. Add qualitative observations`);
  console.log(`\n📝 Checkpoint location:`);
  console.log(`   experiments.active_experiments[].weekly_checkpoints[${weekNumber - 1}]`);
}

// Complete experiment and analyze results
function completeExperiment(expId) {
  const data = loadExperiments();
  const exp = findExperiment(data, expId);

  if (!exp) {
    console.error(`❌ Experiment ${expId} not found`);
    process.exit(1);
  }

  if (exp.status !== 'active') {
    console.error(`❌ Experiment ${expId} is not active`);
    process.exit(1);
  }

  exp.status = 'completed';
  exp.end_date = new Date().toISOString().split('T')[0];

  // Calculate results (simplified - real implementation would use statistical tests)
  console.log(`📊 Analyzing ${expId} results...`);

  const results = {
    conclusion: "inconclusive", // TODO: Calculate from checkpoints
    winner: null,
    statistical_significance: {
      p_value: null, // TODO: Calculate t-test or similar
      confidence_level: 0.95,
      effect_size: null
    },
    improvement_percent: null,
    meets_success_criteria: false,
    recommendation: "no_action",
    next_steps: [
      "Review weekly checkpoints",
      "Calculate statistical significance",
      "Survey participants for qualitative feedback",
      "Make promotion decision"
    ]
  };

  exp.results = results;

  // Move to completed_experiments
  const index = data.active_experiments.findIndex(e => e.id === expId);
  if (index >= 0) {
    data.active_experiments.splice(index, 1);
    if (!data.completed_experiments) {
      data.completed_experiments = [];
    }
    data.completed_experiments.push(exp);
  }

  saveExperiments(data);

  console.log(`✅ Experiment ${expId} completed`);
  console.log(`\n⚠️  MANUAL ANALYSIS REQUIRED:`);
  console.log(`1. Calculate statistical significance (t-test, p-value)`);
  console.log(`2. Determine winner based on success criteria`);
  console.log(`3. Update results in ${EXPERIMENTS_FILE}`);
  console.log(`4. Generate final report with recommendations`);
}

// Generate experiment report
function generateReport(expId) {
  const data = loadExperiments();
  const exp = findExperiment(data, expId);

  if (!exp) {
    console.error(`❌ Experiment ${expId} not found`);
    process.exit(1);
  }

  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  Experiment Report: ${exp.id.padEnd(30)}║`);
  console.log(`╚═══════════════════════════════════════════════════╝\n`);

  console.log(`📌 Name: ${exp.name}`);
  console.log(`📅 Duration: ${exp.start_date} to ${exp.end_date} (${exp.duration_weeks} weeks)`);
  console.log(`🎯 Status: ${exp.status.toUpperCase()}`);
  console.log(`🔬 Hypothesis: ${exp.hypothesis}\n`);

  console.log(`👥 Cohorts:`);
  console.log(`   Treatment: ${exp.cohorts.treatment.tool_id}`);
  console.log(`      Engineers: ${exp.cohorts.treatment.engineers.join(', ')}`);
  console.log(`   Control: ${exp.cohorts.control.tool_id}`);
  console.log(`      Engineers: ${exp.cohorts.control.engineers.join(', ')}\n`);

  if (exp.weekly_checkpoints && exp.weekly_checkpoints.length > 0) {
    console.log(`📊 Weekly Progress (${exp.weekly_checkpoints.length} checkpoints):\n`);

    exp.weekly_checkpoints.forEach(cp => {
      console.log(`   Week ${cp.week} (${cp.date}):`);
      if (cp.treatment_metrics.code_quality_score !== null) {
        console.log(`      Treatment: Quality ${cp.treatment_metrics.code_quality_score}, Velocity ${cp.treatment_metrics.velocity_commits_per_week}`);
        console.log(`      Control:   Quality ${cp.control_metrics.code_quality_score}, Velocity ${cp.control_metrics.velocity_commits_per_week}`);
        if (cp.delta.code_quality_score !== undefined) {
          const sign = cp.delta.code_quality_score > 0 ? '+' : '';
          console.log(`      Δ Quality: ${sign}${cp.delta.code_quality_score.toFixed(1)}%`);
        }
      } else {
        console.log(`      ⚠️  Metrics not yet recorded`);
      }
      if (cp.observations && cp.observations !== "TODO: Add qualitative observations") {
        console.log(`      💭 ${cp.observations}`);
      }
      console.log();
    });
  }

  if (exp.results) {
    console.log(`🎯 Results:\n`);
    console.log(`   Conclusion: ${exp.results.conclusion}`);
    console.log(`   Winner: ${exp.results.winner || 'TBD'}`);
    if (exp.results.improvement_percent !== null) {
      console.log(`   Improvement: ${exp.results.improvement_percent.toFixed(1)}%`);
    }
    if (exp.results.statistical_significance.p_value !== null) {
      console.log(`   P-value: ${exp.results.statistical_significance.p_value.toFixed(4)}`);
      console.log(`   Significant: ${exp.results.statistical_significance.p_value < 0.05 ? 'YES ✓' : 'NO ✗'}`);
    }
    console.log(`   Meets Criteria: ${exp.results.meets_success_criteria ? 'YES ✓' : 'NO ✗'}`);
    console.log(`\n📋 Recommendation: ${exp.results.recommendation}`);

    if (exp.results.next_steps && exp.results.next_steps.length > 0) {
      console.log(`\n📝 Next Steps:`);
      exp.results.next_steps.forEach(step => {
        console.log(`   • ${step}`);
      });
    }
  }

  console.log();
}

// Main CLI
const [,, command, expId] = process.argv;

if (!command || !expId) {
  console.log(`
Tool Experiment Manager

Usage:
  node scripts/manage-experiments.js start <exp-id>       Start an experiment
  node scripts/manage-experiments.js checkpoint <exp-id>  Record weekly checkpoint
  node scripts/manage-experiments.js complete <exp-id>    Complete and analyze experiment
  node scripts/manage-experiments.js report <exp-id>      Generate experiment report

Examples:
  node scripts/manage-experiments.js start exp-001-strict-linting
  node scripts/manage-experiments.js checkpoint exp-001-strict-linting
  node scripts/manage-experiments.js report exp-001-strict-linting
  `);
  process.exit(0);
}

switch (command) {
  case 'start':
    startExperiment(expId);
    break;
  case 'checkpoint':
    recordCheckpoint(expId);
    break;
  case 'complete':
    completeExperiment(expId);
    break;
  case 'report':
    generateReport(expId);
    break;
  default:
    console.error(`❌ Unknown command: ${command}`);
    process.exit(1);
}
