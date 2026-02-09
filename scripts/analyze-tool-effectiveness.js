#!/usr/bin/env node
/**
 * Tool Effectiveness Analyzer
 *
 * Generates reports comparing tool effectiveness across the team.
 *
 * Usage:
 *   node scripts/analyze-tool-effectiveness.js linting
 *   node scripts/analyze-tool-effectiveness.js ide --format table
 *   node scripts/analyze-tool-effectiveness.js all --output report.md
 */

const fs = require('fs');
const path = require('path');

const TOOLS_REGISTRY = path.join(__dirname, '../tools-registry.json');
const ENGINEER_PROFILES = path.join(__dirname, '../mcp-servers/team-analytics/data/engineer-tool-profiles.json');

// Load data
function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Calculate average metrics for engineers using a specific tool
function calculateToolMetrics(engineers, toolId, category) {
  const usersWithTool = engineers.filter(eng =>
    eng.tool_stack?.[category] === toolId
  );

  if (usersWithTool.length === 0) {
    return null;
  }

  // Get metrics from tool_history
  const metricsArray = usersWithTool.map(eng => {
    const toolHistory = eng.tool_history?.find(h => h.tool_id === toolId);
    return toolHistory?.metrics_after || {};
  });

  // Calculate averages
  const avg = {};
  const metricKeys = ['code_quality_score', 'velocity_commits_per_week', 'pr_approval_rate', 'bug_rate', 'satisfaction_score'];

  metricKeys.forEach(key => {
    const values = metricsArray.map(m => m[key]).filter(v => v !== undefined);
    if (values.length > 0) {
      avg[key] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }
  });

  return {
    tool_id: toolId,
    user_count: usersWithTool.length,
    users: usersWithTool.map(u => u.engineer_name),
    metrics: avg
  };
}

// Analyze single category
function analyzeCategory(category, registry, profiles) {
  const categoryData = registry.categories[category];
  if (!categoryData) {
    console.error(`❌ Category '${category}' not found`);
    return null;
  }

  const results = [];

  for (const tool of categoryData.options) {
    const metrics = calculateToolMetrics(profiles.engineers, tool.id, category);

    if (metrics) {
      results.push({
        tool_id: tool.id,
        name: tool.name,
        status: tool.status,
        user_count: metrics.user_count,
        users: metrics.users,
        code_quality: metrics.metrics.code_quality_score || 0,
        velocity: metrics.metrics.velocity_commits_per_week || 0,
        pr_approval: metrics.metrics.pr_approval_rate || 0,
        bug_rate: metrics.metrics.bug_rate || 0,
        satisfaction: metrics.metrics.satisfaction_score || 0
      });
    }
  }

  // Sort by code quality (descending)
  results.sort((a, b) => b.code_quality - a.code_quality);

  return {
    category,
    tools: results,
    winner: results[0]?.tool_id || null,
    baseline: results.find(t => t.status === 'standard')?.tool_id || null
  };
}

// Format as table
function formatTable(analysis) {
  if (!analysis || analysis.tools.length === 0) {
    return `No data available for category: ${analysis.category}`;
  }

  let output = `\n╔═══════════════════════════════════════════════════════════════╗\n`;
  output += `║  Tool Effectiveness: ${analysis.category.toUpperCase().padEnd(42)}║\n`;
  output += `╚═══════════════════════════════════════════════════════════════╝\n\n`;

  // Table header
  output += `${'Tool'.padEnd(20)} | ${'Users'.padEnd(6)} | ${'Quality'.padEnd(8)} | ${'Velocity'.padEnd(9)} | ${'PR Rate'.padEnd(8)} | ${'Satisfaction'.padEnd(12)}\n`;
  output += `${'-'.repeat(20)}-+-${'-'.repeat(6)}-+-${'-'.repeat(8)}-+-${'-'.repeat(9)}-+-${'-'.repeat(8)}-+-${'-'.repeat(12)}\n`;

  // Table rows
  analysis.tools.forEach((tool, index) => {
    const icon = index === 0 ? '🏆 ' : tool.status === 'standard' ? '⭐ ' : '   ';
    const name = `${icon}${tool.name}`.padEnd(20);
    const users = String(tool.user_count).padEnd(6);
    const quality = tool.code_quality.toFixed(1).padEnd(8);
    const velocity = tool.velocity.toFixed(1).padEnd(9);
    const prRate = (tool.pr_approval * 100).toFixed(0).padEnd(8);
    const satisfaction = `${tool.satisfaction.toFixed(1)}/5.0`.padEnd(12);

    output += `${name} | ${users} | ${quality} | ${velocity} | ${prRate}% | ${satisfaction}\n`;
  });

  output += `\n`;

  // Analysis
  const winner = analysis.tools[0];
  const baseline = analysis.tools.find(t => t.status === 'standard') || analysis.tools[1];

  if (winner && baseline && winner.tool_id !== baseline.tool_id) {
    const improvement = ((winner.code_quality - baseline.code_quality) / baseline.code_quality * 100).toFixed(1);
    output += `📊 Analysis:\n`;
    output += `   Winner: ${winner.name} (${winner.code_quality.toFixed(1)} quality)\n`;
    output += `   Baseline: ${baseline.name} (${baseline.code_quality.toFixed(1)} quality)\n`;
    output += `   Improvement: ${improvement > 0 ? '+' : ''}${improvement}%\n\n`;

    if (improvement >= 10 && winner.user_count >= 3) {
      output += `✅ Recommendation: PROMOTE ${winner.name} to standard\n`;
      output += `   - Statistically significant improvement (${improvement}%)\n`;
      output += `   - Sufficient users (${winner.user_count})\n`;
      output += `   - High satisfaction (${winner.satisfaction}/5.0)\n`;
    } else if (improvement >= 5) {
      output += `⚠️  Recommendation: Continue monitoring ${winner.name}\n`;
      output += `   - Shows promise but needs more data\n`;
    } else {
      output += `ℹ️  Recommendation: Keep current standard (${baseline.name})\n`;
      output += `   - Insufficient improvement to justify migration\n`;
    }
  }

  output += `\n`;
  return output;
}

// Format as markdown
function formatMarkdown(analysis) {
  if (!analysis || analysis.tools.length === 0) {
    return `## ${analysis.category}\n\nNo data available.\n\n`;
  }

  let output = `## ${analysis.category.charAt(0).toUpperCase() + analysis.category.slice(1)}\n\n`;
  output += `| Tool | Users | Quality | Velocity | PR Rate | Satisfaction |\n`;
  output += `|------|-------|---------|----------|---------|-------------|\n`;

  analysis.tools.forEach((tool, index) => {
    const icon = index === 0 ? '🏆 ' : tool.status === 'standard' ? '⭐ ' : '';
    const name = `${icon}${tool.name}`;
    const users = tool.user_count;
    const quality = tool.code_quality.toFixed(1);
    const velocity = tool.velocity.toFixed(1);
    const prRate = (tool.pr_approval * 100).toFixed(0) + '%';
    const satisfaction = `${tool.satisfaction.toFixed(1)}/5`;

    output += `| ${name} | ${users} | ${quality} | ${velocity} | ${prRate} | ${satisfaction} |\n`;
  });

  output += `\n`;

  // Analysis
  const winner = analysis.tools[0];
  const baseline = analysis.tools.find(t => t.status === 'standard') || analysis.tools[1];

  if (winner && baseline && winner.tool_id !== baseline.tool_id) {
    const improvement = ((winner.code_quality - baseline.code_quality) / baseline.code_quality * 100).toFixed(1);
    output += `**Winner:** ${winner.name} (${winner.code_quality.toFixed(1)} quality)  \n`;
    output += `**Baseline:** ${baseline.name} (${baseline.code_quality.toFixed(1)} quality)  \n`;
    output += `**Improvement:** ${improvement > 0 ? '+' : ''}${improvement}%\n\n`;

    if (improvement >= 10 && winner.user_count >= 3) {
      output += `✅ **Recommendation:** PROMOTE ${winner.name} to standard\n\n`;
    } else if (improvement >= 5) {
      output += `⚠️ **Recommendation:** Continue monitoring ${winner.name}\n\n`;
    } else {
      output += `ℹ️ **Recommendation:** Keep current standard (${baseline.name})\n\n`;
    }
  }

  return output;
}

// Main CLI
const args = process.argv.slice(2);
const category = args[0];
const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'table';
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

if (!category) {
  console.log(`
Tool Effectiveness Analyzer

Usage:
  node scripts/analyze-tool-effectiveness.js <category> [options]

Categories:
  linting, testing, git_workflow, ide, commit_style, code_review, ai_assistant, all

Options:
  --format <table|markdown>   Output format (default: table)
  --output <file>             Write to file instead of stdout

Examples:
  node scripts/analyze-tool-effectiveness.js linting
  node scripts/analyze-tool-effectiveness.js ide --format markdown
  node scripts/analyze-tool-effectiveness.js all --output report.md
  `);
  process.exit(0);
}

// Load data
const registry = loadJSON(TOOLS_REGISTRY);
const profiles = loadJSON(ENGINEER_PROFILES);

// Analyze
let output = '';

if (category === 'all') {
  const categories = Object.keys(registry.categories);

  if (format === 'markdown') {
    output += `# Tool Effectiveness Report\n\n`;
    output += `**Generated:** ${new Date().toISOString()}\n`;
    output += `**Engineers:** ${profiles.engineers.length}\n\n`;
    output += `---\n\n`;
  } else {
    output += `\n╔════════════════════════════════════════════════════╗\n`;
    output += `║  TOOL EFFECTIVENESS REPORT                         ║\n`;
    output += `╚════════════════════════════════════════════════════╝\n`;
    output += `\nGenerated: ${new Date().toISOString()}\n`;
    output += `Engineers: ${profiles.engineers.length}\n`;
  }

  categories.forEach(cat => {
    const analysis = analyzeCategory(cat, registry, profiles);
    if (analysis && analysis.tools.length > 0) {
      output += format === 'markdown'
        ? formatMarkdown(analysis)
        : formatTable(analysis);
    }
  });
} else {
  const analysis = analyzeCategory(category, registry, profiles);
  if (analysis) {
    output = format === 'markdown'
      ? formatMarkdown(analysis)
      : formatTable(analysis);
  }
}

// Output
if (outputFile) {
  fs.writeFileSync(outputFile, output);
  console.log(`✅ Report written to: ${outputFile}`);
} else {
  console.log(output);
}
