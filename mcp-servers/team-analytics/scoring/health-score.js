/**
 * Health Score Engine
 * Combines all analyzer scores into overall engineer health
 */

import { KnowledgeAnalyzer } from '../analyzers/knowledge.js';
import { CodeQualityAnalyzer } from '../analyzers/code-quality.js';
import { VelocityAnalyzer } from '../analyzers/velocity.js';
import { CollaborationAnalyzer } from '../analyzers/collaboration.js';

export class HealthScoreEngine {
  constructor(config) {
    this.memoryPath = config.memoryPath;
    this.repoPath = config.repoPath;

    this.knowledgeAnalyzer = new KnowledgeAnalyzer(this.memoryPath);
    this.codeQualityAnalyzer = new CodeQualityAnalyzer(this.repoPath);
    this.velocityAnalyzer = new VelocityAnalyzer(this.repoPath);
    this.collaborationAnalyzer = new CollaborationAnalyzer(config.github, this.repoPath);

    // Score weights — use config if provided, otherwise defaults
    this.weights = config.scoring_weights || {
      code_quality: 0.35,
      knowledge_sharing: 0.25,
      velocity: 0.25,
      collaboration: 0.15
    };
  }

  async calculateEngineerHealth(engineer, timeframe = 30) {
    try {
      // Build email list for git queries (primary + aliases)
      const allEmails = [engineer.email, ...(engineer.email_aliases || [])];

      // Run all analyzers in parallel
      const [knowledge, codeQuality, velocity, collaboration] = await Promise.all([
        this.knowledgeAnalyzer.analyze(engineer.name, timeframe),
        this.aggregateGitAnalysis(this.codeQualityAnalyzer, allEmails, timeframe),
        this.aggregateGitAnalysis(this.velocityAnalyzer, allEmails, timeframe),
        this.collaborationAnalyzer.analyze(engineer.github_username, timeframe, engineer.email, allEmails)
      ]);

      // Calculate weighted overall score
      const overall = Math.round(
        (codeQuality.score * this.weights.code_quality) +
        (knowledge.score * this.weights.knowledge_sharing) +
        (velocity.score * this.weights.velocity) +
        (collaboration.score * this.weights.collaboration)
      );

      // Determine overall trend
      const trends = [knowledge.trending, codeQuality.trending, velocity.trending];
      const improvingCount = trends.filter(t => t === 'improving').length;
      const decliningCount = trends.filter(t => t === 'declining').length;

      let overallTrend = 'stable';
      if (improvingCount >= 2) overallTrend = 'improving';
      else if (decliningCount >= 2) overallTrend = 'declining';

      return {
        engineer: engineer.name,
        overall_score: overall,
        breakdown: {
          code_quality: codeQuality.score,
          knowledge_sharing: knowledge.score,
          velocity: velocity.score,
          collaboration: collaboration.score
        },
        detailed_metrics: {
          code_quality: codeQuality.metrics,
          knowledge_sharing: knowledge.metrics,
          velocity: velocity.metrics,
          collaboration: collaboration.metrics
        },
        trending: overallTrend,
        needs_support: overall < 65,
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Health score calculation error for ${engineer.name}:`, error.message);
      return {
        engineer: engineer.name,
        overall_score: 50,
        breakdown: {},
        detailed_metrics: {},
        trending: 'error',
        needs_support: false,
        error: error.message
      };
    }
  }

  async calculateTeamHealth(engineers, timeframe = 30) {
    // Calculate health for all engineers
    const healthScores = await Promise.all(
      engineers.map(e => this.calculateEngineerHealth(e, timeframe))
    );

    // Calculate team averages
    const avgOverall = Math.round(
      healthScores.reduce((sum, h) => sum + h.overall_score, 0) / healthScores.length
    );

    const avgCodeQuality = Math.round(
      healthScores.reduce((sum, h) => sum + (h.breakdown.code_quality || 0), 0) / healthScores.length
    );

    const avgKnowledgeSharing = Math.round(
      healthScores.reduce((sum, h) => sum + (h.breakdown.knowledge_sharing || 0), 0) / healthScores.length
    );

    const avgVelocity = Math.round(
      healthScores.reduce((sum, h) => sum + (h.breakdown.velocity || 0), 0) / healthScores.length
    );

    // Identify at-risk engineers
    const atRisk = healthScores
      .filter(h => h.needs_support)
      .sort((a, b) => a.overall_score - b.overall_score);

    // Identify high performers
    const highPerformers = healthScores
      .filter(h => h.overall_score >= 85)
      .sort((a, b) => b.overall_score - a.overall_score);

    return {
      team_size: engineers.length,
      avg_overall: avgOverall,
      avg_breakdown: {
        code_quality: avgCodeQuality,
        knowledge_sharing: avgKnowledgeSharing,
        velocity: avgVelocity
      },
      health_distribution: {
        healthy: healthScores.filter(h => h.overall_score >= 75).length,
        watch: healthScores.filter(h => h.overall_score >= 65 && h.overall_score < 75).length,
        needs_help: healthScores.filter(h => h.overall_score < 65).length
      },
      at_risk: atRisk.map(h => ({
        engineer: h.engineer,
        score: h.overall_score,
        primary_concerns: this.identifyPrimaryConcerns(h.breakdown)
      })),
      high_performers: highPerformers.map(h => ({
        engineer: h.engineer,
        score: h.overall_score,
        strengths: this.identifyStrengths(h.breakdown)
      })),
      individual_scores: healthScores,
      last_updated: new Date().toISOString()
    };
  }

  identifyPrimaryConcerns(breakdown) {
    const concerns = [];
    if (breakdown.code_quality < 60) concerns.push('code_quality');
    if (breakdown.knowledge_sharing < 50) concerns.push('knowledge_sharing');
    if (breakdown.velocity < 60) concerns.push('velocity');
    if (breakdown.collaboration < 60) concerns.push('collaboration');
    return concerns;
  }

  identifyStrengths(breakdown) {
    const strengths = [];
    if (breakdown.code_quality >= 85) strengths.push('code_quality');
    if (breakdown.knowledge_sharing >= 85) strengths.push('knowledge_sharing');
    if (breakdown.velocity >= 85) strengths.push('velocity');
    if (breakdown.collaboration >= 85) strengths.push('collaboration');
    return strengths;
  }

  /**
   * Aggregate git-based analyzer results across multiple email aliases.
   * Engineers often commit from different emails (GitHub noreply, work email, etc).
   * This combines metrics from all aliases into a single result.
   */
  async aggregateGitAnalysis(analyzer, emails, timeframe) {
    if (emails.length <= 1) {
      return analyzer.analyze(emails[0], timeframe);
    }

    // Analyze each email alias
    const results = await Promise.all(
      emails.map(email => analyzer.analyze(email, timeframe))
    );

    // Pick the result with the most commits (most active email)
    const best = results.reduce((a, b) => {
      const aCommits = a.metrics?.commits || 0;
      const bCommits = b.metrics?.commits || 0;
      return bCommits > aCommits ? b : a;
    });

    // Sum commit counts across all aliases for accurate totals
    const totalCommits = results.reduce((sum, r) => sum + (r.metrics?.commits || 0), 0);
    if (best.metrics && totalCommits > (best.metrics.commits || 0)) {
      best.metrics.commits = totalCommits;
      best.metrics.emails_analyzed = emails.length;
    }

    return best;
  }
}
