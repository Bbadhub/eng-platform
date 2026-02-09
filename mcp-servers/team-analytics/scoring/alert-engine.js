/**
 * Alert Engine
 * Generates proactive alerts and training recommendations
 */

export class AlertEngine {
  constructor() {
    this.thresholds = {
      critical: {
        code_quality: 50,
        velocity_drop: -0.30,
        bug_rate: 0.25,
        overall_score: 50
      },
      warning: {
        code_quality: 65,
        velocity_drop: -0.20,
        bug_rate: 0.18,
        knowledge_sharing: 40,
        overall_score: 65
      },
      positive: {
        code_quality_gain: 0.15,
        high_collaboration: 85,
        mentor_potential: 90
      }
    };
  }

  generateAlerts(healthScore) {
    const alerts = [];

    // Critical alerts
    if (healthScore.overall_score < this.thresholds.critical.overall_score) {
      alerts.push({
        severity: 'critical',
        category: 'overall_health',
        message: `Overall health critically low (${healthScore.overall_score}/100)`,
        recommendation: 'Schedule immediate 1-on-1, assign mentor, review workload',
        priority: 1
      });
    }

    if (healthScore.breakdown.code_quality < this.thresholds.critical.code_quality) {
      const bugRate = healthScore.detailed_metrics.code_quality?.bug_fix_ratio || 0;
      alerts.push({
        severity: 'critical',
        category: 'code_quality',
        message: `Code quality critically low (${healthScore.breakdown.code_quality}/100, bug rate: ${Math.round(bugRate * 100)}%)`,
        recommendation: 'Pair programming sessions, TDD workshop, code review mentoring',
        priority: 1
      });
    }

    // Warning alerts
    if (healthScore.breakdown.code_quality >= this.thresholds.critical.code_quality &&
        healthScore.breakdown.code_quality < this.thresholds.warning.code_quality) {
      alerts.push({
        severity: 'warning',
        category: 'code_quality',
        message: `Code quality declining (${healthScore.breakdown.code_quality}/100)`,
        recommendation: 'Review code review best practices, pair with senior engineer',
        priority: 2
      });
    }

    if (healthScore.breakdown.velocity < this.thresholds.warning.overall_score) {
      const velocityTrend = healthScore.detailed_metrics.velocity?.velocity_trend || 0;
      if (velocityTrend < this.thresholds.warning.velocity_drop) {
        alerts.push({
          severity: 'warning',
          category: 'velocity',
          message: `Velocity declining (${Math.round(velocityTrend * 100)}%)`,
          recommendation: 'Check for blockers, review task sizing, assess workload',
          priority: 2
        });
      }
    }

    if (healthScore.breakdown.knowledge_sharing < this.thresholds.warning.knowledge_sharing) {
      alerts.push({
        severity: 'warning',
        category: 'knowledge_sharing',
        message: `Low knowledge sharing (${healthScore.breakdown.knowledge_sharing}/100)`,
        recommendation: 'Encourage team-memory contributions, documentation workshops',
        priority: 3
      });
    }

    // Positive alerts
    if (healthScore.overall_score >= this.thresholds.positive.mentor_potential) {
      alerts.push({
        severity: 'positive',
        category: 'performance',
        message: `High performer (${healthScore.overall_score}/100) - mentor potential`,
        recommendation: 'Consider for mentorship program, team lead opportunities',
        priority: 4
      });
    }

    if (healthScore.trending === 'improving') {
      alerts.push({
        severity: 'positive',
        category: 'improvement',
        message: 'Showing consistent improvement across metrics',
        recommendation: 'Acknowledge progress in 1-on-1, share success patterns with team',
        priority: 4
      });
    }

    return alerts.sort((a, b) => a.priority - b.priority);
  }

  generateTrainingRecommendations(healthScores) {
    const recommendations = [];
    const trainingGroups = {};

    for (const score of healthScores) {
      const alerts = this.generateAlerts(score);
      const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'warning');

      for (const alert of criticalAlerts) {
        if (alert.category === 'code_quality') {
          if (!trainingGroups['TDD Workshop']) {
            trainingGroups['TDD Workshop'] = {
              topic: 'Test-Driven Development',
              attendees: [],
              urgency: 'high',
              reason: 'Low code quality scores'
            };
          }
          trainingGroups['TDD Workshop'].attendees.push(score.engineer);
        }

        if (alert.category === 'knowledge_sharing') {
          if (!trainingGroups['Documentation']) {
            trainingGroups['Documentation'] = {
              topic: 'Documentation & Knowledge Sharing',
              attendees: [],
              urgency: 'medium',
              reason: 'Low team-memory contributions'
            };
          }
          trainingGroups['Documentation'].attendees.push(score.engineer);
        }

        if (alert.category === 'velocity') {
          if (!trainingGroups['Productivity']) {
            trainingGroups['Productivity'] = {
              topic: 'Task Management & Productivity',
              attendees: [],
              urgency: 'medium',
              reason: 'Declining velocity'
            };
          }
          trainingGroups['Productivity'].attendees.push(score.engineer);
        }
      }
    }

    return Object.values(trainingGroups);
  }

  generateMentoringPairs(healthScores) {
    const pairs = [];

    // Find high performers (potential mentors)
    const mentors = healthScores.filter(s => s.overall_score >= 85);

    // Find those needing support
    const mentees = healthScores.filter(s => s.needs_support);

    for (const mentee of mentees) {
      // Find primary concern
      const concerns = Object.entries(mentee.breakdown)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);

      for (const [skill, score] of concerns) {
        // Find mentor strong in this skill
        const mentor = mentors.find(m =>
          m.breakdown[skill] >= 85 &&
          !pairs.find(p => p.mentor === m.engineer) // Not already assigned
        );

        if (mentor) {
          pairs.push({
            mentor: mentor.engineer,
            mentee: mentee.engineer,
            focus: skill,
            mentor_score: mentor.breakdown[skill],
            mentee_score: score,
            estimated_impact: 'high'
          });
          break; // One mentor per mentee for now
        }
      }
    }

    return pairs;
  }

  generateDailySummary(teamHealth) {
    const critical = teamHealth.at_risk.filter(e => {
      const score = teamHealth.individual_scores.find(s => s.engineer === e.engineer);
      return score && score.overall_score < 50;
    });

    const warnings = teamHealth.at_risk.filter(e => {
      const score = teamHealth.individual_scores.find(s => s.engineer === e.engineer);
      return score && score.overall_score >= 50 && score.overall_score < 65;
    });

    const positives = teamHealth.individual_scores.filter(s => s.trending === 'improving');

    return {
      date: new Date().toISOString().split('T')[0],
      team_health: teamHealth.avg_overall,
      critical_alerts: critical.length,
      warnings: warnings.length,
      positive_trends: positives.length,
      focus_areas: this.identifyFocusAreas(teamHealth),
      training_recommendations: this.generateTrainingRecommendations(teamHealth.individual_scores),
      mentoring_pairs: this.generateMentoringPairs(teamHealth.individual_scores),
      critical: critical.map(c => ({
        engineer: c.engineer,
        score: c.score,
        concerns: c.primary_concerns,
        action: 'Schedule 1-on-1 today'
      })),
      warnings: warnings.map(w => ({
        engineer: w.engineer,
        score: w.score,
        concerns: w.primary_concerns,
        action: 'Monitor closely, check in standup'
      })),
      positives: positives.map(p => ({
        engineer: p.engineer,
        score: p.overall_score,
        message: 'Showing improvement'
      }))
    };
  }

  identifyFocusAreas(teamHealth) {
    const areas = [];

    if (teamHealth.avg_breakdown.code_quality < 70) {
      areas.push('Code quality needs team-wide attention');
    }

    if (teamHealth.avg_breakdown.knowledge_sharing < 60) {
      areas.push('Team knowledge sharing below target');
    }

    if (teamHealth.avg_breakdown.velocity < 70) {
      areas.push('Team velocity declining - check for blockers');
    }

    return areas;
  }
}
