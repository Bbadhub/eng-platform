/**
 * Tool Effectiveness MCP Tools
 *
 * These tools extend team-analytics to track which development tools
 * engineers use and measure their effectiveness.
 */

import fs from 'fs/promises';
import path from 'path';

export const toolEffectivenessTools = [
  {
    name: 'tool_effectiveness',
    description: 'Compare effectiveness of tools within a category (e.g., which linting tool works best)',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Tool category to analyze',
          enum: ['linting', 'testing', 'git_workflow', 'ide', 'commit_style', 'code_review', 'ai_assistant', 'all']
        },
        timeframe_days: {
          type: 'number',
          description: 'Days to analyze (default: 30)',
          default: 30
        },
        metric: {
          type: 'string',
          description: 'Primary metric for comparison',
          enum: ['code_quality_score', 'velocity_commits_per_week', 'pr_approval_rate', 'bug_rate', 'satisfaction'],
          default: 'code_quality_score'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'engineer_tool_profile',
    description: 'Get tool stack and history for a specific engineer',
    inputSchema: {
      type: 'object',
      properties: {
        engineer_name: {
          type: 'string',
          description: 'Engineer name'
        },
        include_history: {
          type: 'boolean',
          description: 'Include tool change history with before/after metrics',
          default: true
        }
      },
      required: ['engineer_name']
    }
  },
  {
    name: 'tool_adoption',
    description: 'Get adoption statistics for a specific tool across the team',
    inputSchema: {
      type: 'object',
      properties: {
        tool_id: {
          type: 'string',
          description: 'Tool identifier from tools-registry.json (e.g., eslint-strict, cursor)'
        }
      },
      required: ['tool_id']
    }
  },
  {
    name: 'recommend_tool_promotion',
    description: 'Analyze whether an experimental tool should be promoted to standard',
    inputSchema: {
      type: 'object',
      properties: {
        tool_id: {
          type: 'string',
          description: 'Tool identifier to evaluate for promotion'
        },
        min_users: {
          type: 'number',
          description: 'Minimum users required (default: 5)',
          default: 5
        },
        min_weeks: {
          type: 'number',
          description: 'Minimum weeks of data required (default: 8)',
          default: 8
        }
      },
      required: ['tool_id']
    }
  },
  {
    name: 'experiment_metrics',
    description: 'Get real-time metrics for an active experiment',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID (e.g., exp-001-strict-linting)'
        },
        week: {
          type: 'number',
          description: 'Optional: specific week number to query'
        }
      },
      required: ['experiment_id']
    }
  },
  {
    name: 'tool_satisfaction_survey',
    description: 'Get satisfaction scores for all tools or a specific category',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional: filter by category',
          enum: ['linting', 'testing', 'git_workflow', 'ide', 'commit_style', 'code_review', 'ai_assistant']
        },
        min_responses: {
          type: 'number',
          description: 'Minimum survey responses required (default: 3)',
          default: 3
        }
      }
    }
  }
];

/**
 * Tool Effectiveness Handlers
 */
export class ToolEffectivenessEngine {
  constructor(config) {
    this.config = config;
    this.toolsRegistryPath = path.join(config.platformRoot, 'tools-registry.json');
    this.experimentsPath = path.join(config.platformRoot, 'experiments/tool-experiments.json');
    this.engineerProfilesPath = path.join(config.dataDir, 'engineer-tool-profiles.json');
  }

  async loadToolsRegistry() {
    try {
      const content = await fs.readFile(this.toolsRegistryPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to load tools-registry.json:', error);
      return null;
    }
  }

  async loadExperiments() {
    try {
      const content = await fs.readFile(this.experimentsPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to load experiments:', error);
      return { active_experiments: [], completed_experiments: [] };
    }
  }

  async loadEngineerProfiles() {
    try {
      const content = await fs.readFile(this.engineerProfilesPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // Return empty if file doesn't exist yet
      return { engineers: [] };
    }
  }

  async saveEngineerProfiles(profiles) {
    await fs.writeFile(
      this.engineerProfilesPath,
      JSON.stringify(profiles, null, 2)
    );
  }

  /**
   * tool_effectiveness handler
   */
  async getToolEffectiveness(category, timeframeDays = 30, metric = 'code_quality_score') {
    const registry = await this.loadToolsRegistry();
    const profiles = await this.loadEngineerProfiles();

    if (!registry) {
      return {
        error: 'Tools registry not found',
        message: 'Ensure tools-registry.json exists at platform root'
      };
    }

    const categoryTools = category === 'all'
      ? Object.values(registry.categories).flatMap(cat => cat.options)
      : registry.categories[category]?.options || [];

    if (categoryTools.length === 0) {
      return {
        error: 'Category not found or has no tools',
        category,
        available_categories: Object.keys(registry.categories)
      };
    }

    // Calculate metrics for each tool
    const toolMetrics = {};

    for (const tool of categoryTools) {
      const usersWithTool = profiles.engineers.filter(eng =>
        eng.tool_stack?.[category] === tool.id
      );

      if (usersWithTool.length === 0) {
        toolMetrics[tool.id] = {
          tool_id: tool.id,
          name: tool.name,
          user_count: 0,
          status: tool.status,
          metrics: null,
          message: 'No users currently using this tool'
        };
        continue;
      }

      // Calculate average metrics for users of this tool
      // In production, this would query actual git/health data
      // For now, we'll use placeholder data from profiles
      const avgMetrics = this.calculateAverageMetrics(usersWithTool, timeframeDays);

      toolMetrics[tool.id] = {
        tool_id: tool.id,
        name: tool.name,
        user_count: usersWithTool.length,
        status: tool.status,
        users: usersWithTool.map(u => u.engineer_name),
        metrics: avgMetrics,
        primary_metric_value: avgMetrics[metric] || 0
      };
    }

    // Rank tools by primary metric
    const ranked = Object.values(toolMetrics)
      .filter(t => t.user_count > 0)
      .sort((a, b) => (b.primary_metric_value || 0) - (a.primary_metric_value || 0));

    // Determine winner
    const winner = ranked[0];
    const baseline = ranked.find(t => t.status === 'standard') || ranked[1];

    let improvement = null;
    if (winner && baseline && winner.tool_id !== baseline?.tool_id) {
      improvement = ((winner.primary_metric_value - baseline.primary_metric_value) / baseline.primary_metric_value * 100).toFixed(1);
    }

    return {
      category,
      metric,
      timeframe_days: timeframeDays,
      tools: ranked,
      winner: winner?.tool_id || null,
      baseline: baseline?.tool_id || null,
      improvement_percent: improvement ? parseFloat(improvement) : null,
      recommendation: this.getRecommendation(winner, baseline, improvement),
      timestamp: new Date().toISOString()
    };
  }

  calculateAverageMetrics(engineers, timeframeDays) {
    // In production, this would:
    // 1. Query git history for each engineer
    // 2. Calculate actual metrics
    // 3. Return real averages

    // For now, calculate from tool_history if available
    const allMetrics = engineers.map(eng => {
      const recentHistory = eng.tool_history?.filter(h => {
        const daysSince = (Date.now() - new Date(h.started_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= timeframeDays && h.metrics_after;
      });

      return recentHistory?.[0]?.metrics_after || {
        code_quality_score: 75,
        velocity_commits_per_week: 10,
        pr_approval_rate: 0.85,
        bug_rate: 0.12,
        satisfaction: 4.0
      };
    });

    // Calculate averages
    const avg = {};
    const metrics = Object.keys(allMetrics[0]);

    metrics.forEach(metric => {
      const sum = allMetrics.reduce((acc, m) => acc + (m[metric] || 0), 0);
      avg[metric] = sum / allMetrics.length;
    });

    return avg;
  }

  getRecommendation(winner, baseline, improvement) {
    if (!winner || !baseline) return 'need_more_data';
    if (winner.user_count < 3) return 'need_more_users';
    if (!improvement || improvement < 10) return 'keep_experimental';
    if (improvement >= 10 && winner.user_count >= 5) return 'promote_to_standard';
    return 'keep_experimental';
  }

  /**
   * engineer_tool_profile handler
   */
  async getEngineerToolProfile(engineerName, includeHistory = true) {
    const profiles = await this.loadEngineerProfiles();
    const engineer = profiles.engineers.find(e => e.engineer_name === engineerName);

    if (!engineer) {
      return {
        error: 'Engineer not found',
        engineer_name: engineerName,
        available_engineers: profiles.engineers.map(e => e.engineer_name)
      };
    }

    const result = {
      engineer_name: engineer.engineer_name,
      engineer_email: engineer.engineer_email,
      tool_stack: engineer.tool_stack,
      last_updated: engineer.last_updated || new Date().toISOString()
    };

    if (includeHistory && engineer.tool_history) {
      result.tool_history = engineer.tool_history.map(h => ({
        tool_id: h.tool_id,
        category: h.category,
        started_at: h.started_at,
        ended_at: h.ended_at,
        reason: h.reason,
        metrics_improvement: this.calculateImprovement(h.metrics_before, h.metrics_after),
        satisfaction_score: h.satisfaction_score,
        notes: h.notes
      }));
    }

    if (engineer.experiment_participation) {
      result.current_experiments = engineer.experiment_participation
        .filter(exp => exp.status === 'active');
    }

    return result;
  }

  calculateImprovement(before, after) {
    if (!before || !after) return null;

    const improvement = {};
    Object.keys(after).forEach(metric => {
      if (before[metric] !== undefined) {
        const delta = ((after[metric] - before[metric]) / before[metric] * 100).toFixed(1);
        improvement[metric] = parseFloat(delta);
      }
    });

    return improvement;
  }

  /**
   * tool_adoption handler
   */
  async getToolAdoption(toolId) {
    const registry = await this.loadToolsRegistry();
    const profiles = await this.loadEngineerProfiles();

    // Find tool in registry
    let toolInfo = null;
    let category = null;

    for (const [cat, catData] of Object.entries(registry.categories)) {
      const tool = catData.options.find(t => t.id === toolId);
      if (tool) {
        toolInfo = tool;
        category = cat;
        break;
      }
    }

    if (!toolInfo) {
      return {
        error: 'Tool not found',
        tool_id: toolId
      };
    }

    // Find all users
    const users = profiles.engineers.filter(eng =>
      eng.tool_stack?.[category] === toolId ||
      eng.tool_history?.some(h => h.tool_id === toolId && !h.ended_at)
    );

    const totalEngineers = profiles.engineers.length;
    const adoptionRate = totalEngineers > 0 ? (users.length / totalEngineers * 100).toFixed(1) : 0;

    return {
      tool_id: toolId,
      name: toolInfo.name,
      category,
      status: toolInfo.status,
      current_users: users.length,
      total_engineers: totalEngineers,
      adoption_rate_percent: parseFloat(adoptionRate),
      users: users.map(u => ({
        name: u.engineer_name,
        since: u.tool_history?.find(h => h.tool_id === toolId)?.started_at || 'unknown'
      }))
    };
  }

  /**
   * recommend_tool_promotion handler
   */
  async recommendToolPromotion(toolId, minUsers = 5, minWeeks = 8) {
    const adoption = await this.getToolAdoption(toolId);

    if (adoption.error) {
      return adoption;
    }

    // Get effectiveness data
    const effectiveness = await this.getToolEffectiveness(
      adoption.category,
      minWeeks * 7,
      'code_quality_score'
    );

    const toolMetrics = effectiveness.tools?.find(t => t.tool_id === toolId);

    if (!toolMetrics) {
      return {
        tool_id: toolId,
        recommendation: 'need_more_data',
        reason: 'No usage data available for this tool',
        criteria_met: {}
      };
    }

    // Check promotion criteria
    const criteria = {
      min_users: {
        required: minUsers,
        actual: adoption.current_users,
        met: adoption.current_users >= minUsers
      },
      min_weeks: {
        required: minWeeks,
        actual: minWeeks, // TODO: Calculate from actual data
        met: true // TODO: Check actual data age
      },
      satisfaction: {
        required: 4.0,
        actual: toolMetrics.metrics?.satisfaction || 0,
        met: (toolMetrics.metrics?.satisfaction || 0) >= 4.0
      },
      improvement: {
        required_percent: 10,
        actual_percent: effectiveness.improvement_percent,
        met: effectiveness.improvement_percent >= 10
      }
    };

    const allCriteriaMet = Object.values(criteria).every(c => c.met);

    return {
      tool_id: toolId,
      name: adoption.name,
      category: adoption.category,
      current_status: adoption.status,
      recommendation: allCriteriaMet ? 'promote_to_standard' : 'not_ready',
      criteria_met: criteria,
      all_criteria_met: allCriteriaMet,
      next_steps: this.getPromotionNextSteps(toolId, criteria, allCriteriaMet),
      timestamp: new Date().toISOString()
    };
  }

  getPromotionNextSteps(toolId, criteria, allMet) {
    if (allMet) {
      return [
        `Update tools-registry.json: Set ${toolId} status to "standard"`,
        'Create migration guide for remaining engineers',
        'Schedule training session',
        'Roll out to remaining projects',
        'Document decision in ADR'
      ];
    }

    const steps = [];
    if (!criteria.min_users.met) {
      steps.push(`Recruit ${criteria.min_users.required - criteria.min_users.actual} more engineers to try ${toolId}`);
    }
    if (!criteria.satisfaction.met) {
      steps.push('Gather feedback to understand satisfaction issues');
    }
    if (!criteria.improvement.met) {
      steps.push(`Tool needs ${criteria.improvement.required_percent - criteria.improvement.actual_percent}% more improvement`);
    }
    steps.push('Continue monitoring for another 2-4 weeks');

    return steps;
  }

  /**
   * experiment_metrics handler
   */
  async getExperimentMetrics(experimentId, week = null) {
    const experiments = await this.loadExperiments();
    const profiles = await this.loadEngineerProfiles();

    const exp = [...experiments.active_experiments, ...experiments.completed_experiments]
      .find(e => e.id === experimentId);

    if (!exp) {
      return {
        error: 'Experiment not found',
        experiment_id: experimentId
      };
    }

    // Get metrics for treatment cohort
    const treatmentEngineers = profiles.engineers.filter(eng =>
      exp.cohorts.treatment.engineers.includes(eng.engineer_name)
    );

    // Get metrics for control cohort
    const controlEngineers = profiles.engineers.filter(eng =>
      exp.cohorts.control.engineers.includes(eng.engineer_name)
    );

    const treatmentMetrics = this.calculateAverageMetrics(treatmentEngineers, 7); // Last week
    const controlMetrics = this.calculateAverageMetrics(controlEngineers, 7);

    // Calculate deltas
    const deltas = {};
    Object.keys(treatmentMetrics).forEach(metric => {
      if (controlMetrics[metric] !== undefined) {
        deltas[metric] = ((treatmentMetrics[metric] - controlMetrics[metric]) / controlMetrics[metric] * 100).toFixed(1);
      }
    });

    return {
      experiment_id: experimentId,
      name: exp.name,
      status: exp.status,
      week: week || Math.ceil((Date.now() - new Date(exp.start_date).getTime()) / (1000 * 60 * 60 * 24 * 7)),
      treatment: {
        tool: exp.cohorts.treatment.tool_id,
        engineers: exp.cohorts.treatment.engineers,
        metrics: treatmentMetrics
      },
      control: {
        tool: exp.cohorts.control.tool_id,
        engineers: exp.cohorts.control.engineers,
        metrics: controlMetrics
      },
      deltas,
      meets_success_criteria: this.checkSuccessCriteria(exp, deltas),
      timestamp: new Date().toISOString()
    };
  }

  checkSuccessCriteria(experiment, deltas) {
    const criteria = experiment.success_criteria;
    if (!criteria) return null;

    return {
      improvement: deltas.code_quality_score >= (criteria.min_improvement_percent || 0),
      velocity: deltas.velocity_commits_per_week >= -(criteria.max_velocity_loss_percent || 100),
      // Add more criteria checks as needed
    };
  }
}
