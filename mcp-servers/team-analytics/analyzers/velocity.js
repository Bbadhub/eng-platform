/**
 * Velocity Analyzer
 * Analyzes productivity trends
 */

import { execSync } from 'child_process';

export class VelocityAnalyzer {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  async analyze(engineerEmail, timeframe = 30) {
    try {
      const since = `${timeframe}.days.ago`;

      // Get commit count
      const commits = this.getCommitCount(engineerEmail, since);

      // Get lines changed
      const linesChanged = this.getLinesChanged(engineerEmail, since);

      // Calculate weekly metrics
      const weeks = Math.ceil(timeframe / 7);
      const commitsPerWeek = commits / weeks;
      const linesPerWeek = linesChanged / weeks;

      // Calculate trend (compare first half vs second half)
      const velocityTrend = this.calculateVelocityTrend(engineerEmail, timeframe);

      // Calculate score (0-100)
      // Base score on commits per week (target: 10-15 commits/week = 100)
      let score = Math.min(100, (commitsPerWeek / 12) * 100);

      // Adjust for trend
      if (velocityTrend < -0.3) score *= 0.7; // Significant decline
      else if (velocityTrend < -0.2) score *= 0.85; // Moderate decline
      else if (velocityTrend > 0.2) score *= 1.15; // Improving

      score = Math.max(0, Math.min(100, score));

      return {
        score: Math.round(score),
        metrics: {
          commits: commits,
          commits_per_week: Math.round(commitsPerWeek * 10) / 10,
          lines_changed: linesChanged,
          lines_per_week: Math.round(linesPerWeek),
          velocity_trend: Math.round(velocityTrend * 100) / 100
        },
        trending: velocityTrend > 0.15 ? 'improving' :
                  velocityTrend < -0.15 ? 'declining' : 'stable'
      };
    } catch (error) {
      console.error('Velocity analysis error:', error.message);
      return {
        score: 50,
        metrics: {},
        trending: 'error'
      };
    }
  }

  getCommitCount(engineerEmail, since) {
    try {
      const output = execSync(
        `git log --author="${engineerEmail}" --since="${since}" --oneline`,
        {
          cwd: this.repoPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        }
      ).trim();

      return output ? output.split('\n').length : 0;
    } catch (error) {
      return 0;
    }
  }

  getLinesChanged(engineerEmail, since) {
    try {
      const output = execSync(
        `git log --author="${engineerEmail}" --since="${since}" --numstat --pretty=format:""`,
        {
          cwd: this.repoPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        }
      ).trim();

      if (!output) return 0;

      let total = 0;
      const lines = output.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const additions = parseInt(parts[0]) || 0;
          const deletions = parseInt(parts[1]) || 0;
          total += additions + deletions;
        }
      }

      return total;
    } catch (error) {
      return 0;
    }
  }

  calculateVelocityTrend(engineerEmail, timeframe) {
    try {
      const halfTime = Math.floor(timeframe / 2);

      // Recent half
      const recentCommits = this.getCommitCount(engineerEmail, `${halfTime}.days.ago`);

      // Older half
      const totalCommits = this.getCommitCount(engineerEmail, `${timeframe}.days.ago`);
      const olderCommits = totalCommits - recentCommits;

      if (olderCommits === 0) return 0;

      // Return % change
      return (recentCommits - olderCommits) / olderCommits;
    } catch (error) {
      return 0;
    }
  }
}
