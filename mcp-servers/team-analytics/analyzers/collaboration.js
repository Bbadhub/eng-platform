/**
 * Collaboration Analyzer
 *
 * Scoring model aligned to AdHub's actual workflow:
 *   dev (direct push) → staging (PR required) → main (PR required)
 *
 * Collaboration signals measured:
 *   1. Staging/main PRs authored — promoting work through the gate
 *   2. PR reviews given on staging/main PRs — code review at the gate
 *   3. Cross-file collaboration — committing to files other engineers own
 *   4. Issue activity — creating/commenting on GitHub issues (testing process)
 *
 * NOT penalized: lack of PR reviews on dev (direct push is by design)
 */

import { execSync } from 'child_process';

export class CollaborationAnalyzer {
  constructor(githubConfig, repoPath) {
    this.owner = githubConfig?.owner || 'F9-Global';
    this.repo = githubConfig?.repo || 'adhub';
    this.repoPath = repoPath;
  }

  async analyze(githubUsername, timeframe = 30, engineerEmail = null, allEmails = []) {
    try {
      if (!githubUsername) {
        return this.neutralScore('no_github_username');
      }

      const ghAvailable = this.isGhAvailable();
      const sinceDate = this.getSinceDate(timeframe);

      // Git-based signals (always available, no API needed)
      const crossFileScore = this.getCrossFileCollaboration(allEmails, timeframe);

      // GitHub API signals (only if gh CLI is authenticated)
      let stagingPRs = 0;
      let prReviews = 0;
      let issueActivity = 0;
      let prComments = 0;

      if (ghAvailable) {
        stagingPRs = this.getStagingMainPRs(githubUsername, sinceDate);
        prReviews = this.getReviewsOnStagingPRs(githubUsername, sinceDate);
        prComments = this.getReviewComments(githubUsername, sinceDate);
        issueActivity = this.getIssueActivity(githubUsername, sinceDate);
      }

      // Scoring model:
      // - Staging/main PRs authored: 12 pts each (target: 3-5/month = 36-60)
      // - PR reviews given: 10 pts each (target: 3-5/month)
      // - PR review comments: 3 pts each
      // - Issue activity (create/comment): 4 pts each (testing process)
      // - Cross-file collaboration: 0-25 pts (git-based, always available)
      let score =
        (stagingPRs * 12) +
        (prReviews * 10) +
        (prComments * 3) +
        (issueActivity * 4) +
        crossFileScore;

      score = Math.max(0, Math.min(100, Math.round(score)));

      const trending = ghAvailable
        ? this.calculateTrend(githubUsername, timeframe)
        : 'stable';

      return {
        score,
        metrics: {
          staging_main_prs: stagingPRs,
          pr_reviews_given: prReviews,
          pr_comments: prComments,
          issue_activity: issueActivity,
          cross_file_score: crossFileScore,
          gh_available: ghAvailable
        },
        trending
      };
    } catch (error) {
      console.error('Collaboration analysis error:', error.message);
      return this.neutralScore('error');
    }
  }

  neutralScore(reason) {
    return {
      score: 50,
      metrics: { reason },
      trending: 'insufficient_data'
    };
  }

  isGhAvailable() {
    try {
      execSync('gh auth status', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return true;
    } catch {
      return false;
    }
  }

  getSinceDate(timeframeDays) {
    const date = new Date();
    date.setDate(date.getDate() - timeframeDays);
    return date.toISOString().split('T')[0];
  }

  /**
   * PRs authored targeting staging or main (the real collaboration gate)
   */
  getStagingMainPRs(username, sinceDate) {
    try {
      // PRs to staging
      const staging = execSync(
        `gh api "search/issues?q=repo:${this.owner}/${this.repo}+is:pr+author:${username}+base:staging+created:>=${sinceDate}&per_page=1" --jq ".total_count"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 15000 }
      ).trim();

      // PRs to main
      const main = execSync(
        `gh api "search/issues?q=repo:${this.owner}/${this.repo}+is:pr+author:${username}+base:main+created:>=${sinceDate}&per_page=1" --jq ".total_count"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 15000 }
      ).trim();

      return (parseInt(staging) || 0) + (parseInt(main) || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Reviews given on any PR (staging/main PRs are the ones that exist)
   */
  getReviewsOnStagingPRs(username, sinceDate) {
    try {
      // Get recent PRs targeting staging or main
      const output = execSync(
        `gh api "repos/${this.owner}/${this.repo}/pulls?state=all&per_page=50&sort=updated&direction=desc" --jq "[.[] | select(.updated_at >= \\"${sinceDate}\\" and (.base.ref == \\"staging\\" or .base.ref == \\"main\\")) | .number]"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 30000 }
      ).trim();

      if (!output || output === '[]') return 0;

      const prNumbers = JSON.parse(output);
      let reviewCount = 0;

      for (const prNum of prNumbers.slice(0, 20)) {
        try {
          const reviews = execSync(
            `gh api "repos/${this.owner}/${this.repo}/pulls/${prNum}/reviews" --jq "[.[] | select(.user.login == \\"${username}\\")] | length"`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000 }
          ).trim();
          reviewCount += parseInt(reviews) || 0;
        } catch {
          // Skip individual PR errors
        }
      }

      return reviewCount;
    } catch {
      return 0;
    }
  }

  /**
   * Review comments on PRs
   */
  getReviewComments(username, sinceDate) {
    try {
      const output = execSync(
        `gh api "repos/${this.owner}/${this.repo}/pulls/comments?since=${sinceDate}&per_page=100&sort=created&direction=desc" --jq "[.[] | select(.user.login == \\"${username}\\")] | length"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 30000 }
      ).trim();

      return parseInt(output) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Issue activity — creating issues, commenting on issues
   * This captures testing process collaboration (Ralph Loop creates issues,
   * engineers triage and respond)
   */
  getIssueActivity(username, sinceDate) {
    try {
      // Issues created
      const created = execSync(
        `gh api "search/issues?q=repo:${this.owner}/${this.repo}+is:issue+author:${username}+created:>=${sinceDate}&per_page=1" --jq ".total_count"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 15000 }
      ).trim();

      // Issue comments (triaging, responding to test failures)
      const comments = execSync(
        `gh api "repos/${this.owner}/${this.repo}/issues/comments?since=${sinceDate}&per_page=100&sort=created&direction=desc" --jq "[.[] | select(.user.login == \\"${username}\\")] | length"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 15000 }
      ).trim();

      return (parseInt(created) || 0) + (parseInt(comments) || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Cross-file collaboration — how many files does this engineer touch
   * that other engineers also commit to? Measures shared ownership.
   * Pure git analysis, no API needed.
   */
  getCrossFileCollaboration(emails, timeframe) {
    if (!this.repoPath || emails.length === 0) return 0;

    try {
      const since = `${timeframe}.days.ago`;
      const email = emails[0];

      // Files this engineer touched
      const myFiles = execSync(
        `git log --author="${email}" --since="${since}" --name-only --pretty=format:"" -- "*.ts" "*.tsx" "*.js" "*.jsx"`,
        { cwd: this.repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim().split('\n').filter(Boolean);

      const uniqueMyFiles = [...new Set(myFiles)];
      if (uniqueMyFiles.length === 0) return 0;

      // Files ANY other engineer touched
      const allOtherFiles = execSync(
        `git log --since="${since}" --name-only --pretty=format:"" -- "*.ts" "*.tsx" "*.js" "*.jsx"`,
        { cwd: this.repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim().split('\n').filter(Boolean);

      // Count how many of my files were also touched by others
      // (simplified: files that appear more times than my commits to them)
      const fileCounts = {};
      for (const f of allOtherFiles) {
        fileCounts[f] = (fileCounts[f] || 0) + 1;
      }

      const sharedFiles = uniqueMyFiles.filter(f => (fileCounts[f] || 0) > 1);
      const sharedRatio = sharedFiles.length / uniqueMyFiles.length;

      // 0-25 pts: >50% shared files = 25pts, 25% = 12pts, <10% = 5pts
      if (sharedRatio >= 0.5) return 25;
      if (sharedRatio >= 0.25) return Math.round(12 + (sharedRatio - 0.25) * 52);
      if (sharedRatio >= 0.1) return Math.round(5 + (sharedRatio - 0.1) * 47);
      return Math.round(sharedRatio * 50);
    } catch {
      return 0;
    }
  }

  calculateTrend(username, timeframe) {
    try {
      const halfTime = Math.floor(timeframe / 2);
      const midDate = this.getSinceDate(halfTime);
      const startDate = this.getSinceDate(timeframe);

      const recentComments = this.getReviewComments(username, midDate);
      const totalComments = this.getReviewComments(username, startDate);
      const olderComments = totalComments - recentComments;

      if (olderComments === 0 && recentComments === 0) return 'stable';
      if (olderComments === 0) return 'improving';
      const change = (recentComments - olderComments) / olderComments;

      if (change > 0.2) return 'improving';
      if (change < -0.2) return 'declining';
      return 'stable';
    } catch {
      return 'stable';
    }
  }
}
