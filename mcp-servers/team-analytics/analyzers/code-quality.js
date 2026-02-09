/**
 * Code Quality Analyzer
 * Analyzes git commit history and patterns
 */

import { execSync } from 'child_process';

export class CodeQualityAnalyzer {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  async analyze(engineerEmail, timeframe = 30) {
    try {
      const since = `${timeframe}.days.ago`;

      // Get commits for this engineer
      const commits = this.getCommits(engineerEmail, since);

      if (commits.length === 0) {
        return {
          score: 50, // Neutral score if no commits
          metrics: {
            commits: 0,
            bug_fix_ratio: 0,
            avg_commit_size: 0,
            clean_commits_ratio: 0,
            reverted_commits: 0
          },
          trending: 'insufficient_data'
        };
      }

      // Calculate metrics
      const bugFixCommits = commits.filter(c => this.isBugFix(c.message)).length;
      const bugFixRatio = bugFixCommits / commits.length;

      const avgCommitSize = commits.reduce((sum, c) => sum + c.linesChanged, 0) / commits.length;
      const cleanCommitsRatio = commits.filter(c => c.linesChanged < 200).length / commits.length;

      const revertedCommits = this.getRevertedCommits(engineerEmail, since);

      // Calculate score (0-100)
      const score = Math.max(0, Math.min(100,
        80 - // Start at 80
        (bugFixRatio * 100) - // Subtract bug fix ratio %
        (revertedCommits.length * 5) + // -5 per reverted commit
        (cleanCommitsRatio * 20) // +20 for clean commits
      ));

      return {
        score: Math.round(score),
        metrics: {
          commits: commits.length,
          bug_fix_ratio: Math.round(bugFixRatio * 100) / 100,
          avg_commit_size: Math.round(avgCommitSize),
          clean_commits_ratio: Math.round(cleanCommitsRatio * 100) / 100,
          reverted_commits: revertedCommits.length
        },
        trending: this.calculateTrend(engineerEmail, timeframe)
      };
    } catch (error) {
      console.error('Code quality analysis error:', error.message);
      return {
        score: 50,
        metrics: {},
        trending: 'error'
      };
    }
  }

  getCommits(engineerEmail, since) {
    try {
      const output = execSync(
        `git log --author="${engineerEmail}" --since="${since}" --pretty=format:"%H|%s" --numstat`,
        {
          cwd: this.repoPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        }
      ).trim();

      if (!output) return [];

      const commits = [];
      const lines = output.split('\n');
      let currentCommit = null;

      for (const line of lines) {
        if (line.includes('|')) {
          // Commit header
          const [hash, message] = line.split('|');
          if (currentCommit) {
            commits.push(currentCommit);
          }
          currentCommit = {
            hash,
            message,
            linesChanged: 0
          };
        } else if (line.trim() && currentCommit) {
          // Numstat line: additions deletions filename
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const additions = parseInt(parts[0]) || 0;
            const deletions = parseInt(parts[1]) || 0;
            currentCommit.linesChanged += additions + deletions;
          }
        }
      }

      if (currentCommit) {
        commits.push(currentCommit);
      }

      return commits;
    } catch (error) {
      return [];
    }
  }

  isBugFix(message) {
    const bugKeywords = ['fix', 'bug', 'hotfix', 'patch', 'resolve', 'correct'];
    const lowerMessage = message.toLowerCase();
    return bugKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  getRevertedCommits(engineerEmail, since) {
    try {
      const output = execSync(
        `git log --author="${engineerEmail}" --since="${since}" --grep="Revert" --pretty=format:"%H"`,
        {
          cwd: this.repoPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        }
      ).trim();

      return output ? output.split('\n') : [];
    } catch (error) {
      return [];
    }
  }

  calculateTrend(engineerEmail, timeframe) {
    try {
      const recentCommits = this.getCommits(engineerEmail, `${Math.floor(timeframe / 2)}.days.ago`);
      const olderCommits = this.getCommits(engineerEmail, `${timeframe}.days.ago`).filter(c => {
        const recentHashes = recentCommits.map(rc => rc.hash);
        return !recentHashes.includes(c.hash);
      });

      const recentBugRatio = recentCommits.length > 0
        ? recentCommits.filter(c => this.isBugFix(c.message)).length / recentCommits.length
        : 0;

      const olderBugRatio = olderCommits.length > 0
        ? olderCommits.filter(c => this.isBugFix(c.message)).length / olderCommits.length
        : 0;

      if (olderBugRatio === 0) return 'stable';
      const change = (recentBugRatio - olderBugRatio) / olderBugRatio;

      // Lower bug ratio is better (improving)
      if (change < -0.2) return 'improving';
      if (change > 0.2) return 'declining';
      return 'stable';
    } catch (error) {
      return 'stable';
    }
  }
}
