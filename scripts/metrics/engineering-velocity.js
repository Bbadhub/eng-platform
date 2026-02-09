/**
 * Engineering Velocity & DORA Metrics Collector
 *
 * Collects DORA metrics and engineering velocity data from git history,
 * GitHub PRs, and sprint TOML files. Outputs JSON + Markdown reports.
 *
 * DORA Metrics:
 *   - Deployment Frequency: merges to main per week
 *   - Lead Time for Changes: first commit to main merge (median)
 *   - Change Failure Rate: % of merges followed by revert/hotfix within 48h
 *   - MTTR: time between failure and recovery on main
 *
 * Velocity Metrics:
 *   - Commits per week per author (dev branch)
 *   - Commit type distribution (conventional commits)
 *   - Lines added/removed per week
 *   - PR merge frequency + avg time to merge
 *   - Sprint completion rates (from TOML files)
 *
 * Run: node scripts/metrics/engineering-velocity.js
 *      node scripts/metrics/engineering-velocity.js --weeks=8
 *      node scripts/metrics/engineering-velocity.js --output-dir=./custom
 *      node scripts/metrics/engineering-velocity.js --dora-only
 *      node scripts/metrics/engineering-velocity.js --velocity-only
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      args[key] = val === undefined ? true : val;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Git Helper
// ---------------------------------------------------------------------------

function git(cmd, opts = {}) {
  try {
    return execSync(`git ${cmd}`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      cwd: opts.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    if (opts.ignoreError) return "";
    throw e;
  }
}

function gh(cmd, opts = {}) {
  try {
    return execSync(`gh ${cmd}`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      cwd: opts.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Date Helpers
// ---------------------------------------------------------------------------

function isoWeek(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function weeksAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().split("T")[0];
}

function hoursBetwee(a, b) {
  return Math.abs(new Date(b) - new Date(a)) / (1000 * 60 * 60);
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// DORA Rating Thresholds
// ---------------------------------------------------------------------------

const DORA_THRESHOLDS = {
  deploymentFrequency: { elite: 7, high: 1, medium: 0.25 }, // per week
  leadTimeHours: { elite: 1, high: 24, medium: 168 }, // hours
  changeFailureRate: { elite: 5, high: 10, medium: 15 }, // percent
  mttrHours: { elite: 1, high: 24, medium: 168 }, // hours
};

function rateMetric(value, thresholds, lowerIsBetter = true) {
  if (lowerIsBetter) {
    if (value <= thresholds.elite) return "Elite";
    if (value <= thresholds.high) return "High";
    if (value <= thresholds.medium) return "Medium";
    return "Low";
  }
  if (value >= thresholds.elite) return "Elite";
  if (value >= thresholds.high) return "High";
  if (value >= thresholds.medium) return "Medium";
  return "Low";
}

// ---------------------------------------------------------------------------
// Main Collector Class
// ---------------------------------------------------------------------------

class EngineeringVelocityTracker {
  constructor(options = {}) {
    const args = parseArgs();
    this.weeks = parseInt(args.weeks || options.weeks || "4", 10);
    this.outputDir =
      args["output-dir"] || options.outputDir || "./docs/metrics";
    this.doraOnly = !!args["dora-only"];
    this.velocityOnly = !!args["velocity-only"];
    this.since = weeksAgo(this.weeks);
    this.today = new Date().toISOString().split("T")[0];
    this.report = {
      generatedAt: new Date().toISOString(),
      period: { start: this.since, end: this.today, weeks: this.weeks },
      dora: {},
      velocity: {},
      sprintCompletion: [],
      team: {},
    };
  }

  async run() {
    console.log("📊 Engineering Velocity & DORA Metrics");
    console.log("=".repeat(60));
    console.log(`Period: ${this.since} → ${this.today} (${this.weeks} weeks)`);
    console.log(`Output: ${this.outputDir}`);
    console.log("");

    if (!this.velocityOnly) {
      console.log("🔄 Collecting DORA metrics...");
      this.collectDeploymentFrequency();
      this.collectLeadTime();
      this.collectChangeFailureRate();
      this.collectMTTR();
    }

    if (!this.doraOnly) {
      console.log("📈 Collecting velocity metrics...");
      this.collectCommitsPerWeek();
      this.collectCommitTypeDistribution();
      this.collectLinesChanged();
      this.collectPRMetrics();
      this.collectSprintCompletion();
      this.collectTeamSummary();
    }

    this.writeReports();
    console.log("");
    console.log("✅ Reports generated successfully");
  }

  // =========================================================================
  // DORA: Deployment Frequency
  // =========================================================================

  collectDeploymentFrequency() {
    // Count merge commits to main per week
    const log = git(
      `log main --merges --format="%aI" --after="${this.since}"`,
      { ignoreError: true },
    );

    const merges = log ? log.split("\n").filter(Boolean) : [];
    const byWeek = {};

    for (const date of merges) {
      const week = isoWeek(date);
      byWeek[week] = (byWeek[week] || 0) + 1;
    }

    // Fill empty weeks with 0
    const weekly = [];
    const d = new Date(this.since);
    while (d <= new Date()) {
      const week = isoWeek(d);
      if (!weekly.find((w) => w.week === week)) {
        weekly.push({ week, count: byWeek[week] || 0 });
      }
      d.setDate(d.getDate() + 7);
    }

    const counts = weekly.map((w) => w.count);
    const avg = counts.length
      ? counts.reduce((a, b) => a + b, 0) / counts.length
      : 0;

    // Trend: compare first half to second half
    const mid = Math.floor(counts.length / 2);
    const firstHalf = counts.slice(0, mid);
    const secondHalf = counts.slice(mid);
    const firstAvg = firstHalf.length
      ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      : 0;
    const secondAvg = secondHalf.length
      ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      : 0;
    const trend =
      secondAvg > firstAvg * 1.1
        ? "improving"
        : secondAvg < firstAvg * 0.9
          ? "declining"
          : "stable";

    const rating = rateMetric(avg, DORA_THRESHOLDS.deploymentFrequency, false);

    this.report.dora.deploymentFrequency = {
      weekly,
      average: Math.round(avg * 10) / 10,
      trend,
      rating,
      total: merges.length,
    };
    console.log(`  Deployment Frequency: ${avg.toFixed(1)}/week (${rating})`);
  }

  // =========================================================================
  // DORA: Lead Time for Changes
  // =========================================================================

  collectLeadTime() {
    // For each merge to main, find time from first commit on branch to merge
    const log = git(
      `log main --merges --format="%H|%aI" --after="${this.since}"`,
      { ignoreError: true },
    );

    const merges = log ? log.split("\n").filter(Boolean) : [];
    const leadTimes = [];

    for (const line of merges) {
      const [mergeHash, mergeDate] = line.split("|");
      try {
        // Get second parent (the branch tip)
        const branchTip = git(`rev-parse ${mergeHash}^2`, {
          ignoreError: true,
        });
        if (!branchTip) continue;

        // Find merge base
        const mergeBase = git(`merge-base main ${branchTip}`, {
          ignoreError: true,
        });
        if (!mergeBase) continue;

        // Get first commit on the branch after merge base
        const firstCommit = git(
          `log --reverse --format="%aI" ${mergeBase}..${branchTip}`,
          { ignoreError: true },
        );
        if (!firstCommit) continue;

        const firstDate = firstCommit.split("\n")[0];
        const hours = hoursBetwee(firstDate, mergeDate);
        if (hours >= 0 && hours < 720) {
          // Cap at 30 days to exclude stale branches
          leadTimes.push(hours);
        }
      } catch {
        // Skip problematic merges
      }
    }

    const med = Math.round(median(leadTimes) * 10) / 10;
    const p90 = Math.round(percentile(leadTimes, 90) * 10) / 10;
    const rating = rateMetric(med, DORA_THRESHOLDS.leadTimeHours);

    this.report.dora.leadTime = {
      medianHours: med,
      p90Hours: p90,
      fastest: leadTimes.length
        ? Math.round(Math.min(...leadTimes) * 10) / 10
        : 0,
      slowest: leadTimes.length
        ? Math.round(Math.max(...leadTimes) * 10) / 10
        : 0,
      samples: leadTimes.length,
      rating,
    };
    console.log(`  Lead Time: ${med}h median (${rating})`);
  }

  // =========================================================================
  // DORA: Change Failure Rate
  // =========================================================================

  collectChangeFailureRate() {
    // Get all commits on main (not just merges) in the period
    const log = git(`log main --format="%H|%aI|%s" --after="${this.since}"`, {
      ignoreError: true,
    });

    const commits = log
      ? log
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [hash, date, ...msgParts] = line.split("|");
            return { hash, date, message: msgParts.join("|") };
          })
      : [];

    // Count total deployable commits (merges or direct pushes)
    const mergeLog = git(
      `log main --merges --format="%H" --after="${this.since}"`,
      { ignoreError: true },
    );
    const totalMerges = mergeLog
      ? mergeLog.split("\n").filter(Boolean).length
      : 0;

    // Identify failures: reverts or hotfixes
    let failures = 0;
    for (const commit of commits) {
      const msg = commit.message.toLowerCase();
      if (
        msg.includes("revert") ||
        msg.startsWith("hotfix") ||
        msg.startsWith("fix!") ||
        msg.includes("emergency fix")
      ) {
        failures++;
      }
    }

    const total = Math.max(totalMerges, 1);
    const rate = Math.round((failures / total) * 1000) / 10;
    const rating = rateMetric(rate, DORA_THRESHOLDS.changeFailureRate);

    this.report.dora.changeFailureRate = {
      percentage: rate,
      failures,
      total: totalMerges,
      rating,
    };
    console.log(`  Change Failure Rate: ${rate}% (${rating})`);
  }

  // =========================================================================
  // DORA: Mean Time to Recovery
  // =========================================================================

  collectMTTR() {
    // Find pairs of failure → recovery on main
    const log = git(`log main --format="%H|%aI|%s" --after="${this.since}"`, {
      ignoreError: true,
    });

    const commits = log
      ? log
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [hash, date, ...msgParts] = line.split("|");
            return { hash, date, message: msgParts.join("|") };
          })
      : [];

    // Look for revert patterns that reference a specific commit
    const recoveryTimes = [];
    for (let i = 0; i < commits.length; i++) {
      const msg = commits[i].message.toLowerCase();
      if (
        msg.includes("revert") ||
        msg.startsWith("hotfix") ||
        msg.includes("emergency fix")
      ) {
        // The fix is this commit; the failure is approximately the previous merge
        // MTTR = time from prior commit to this fix
        if (i + 1 < commits.length) {
          const hours = hoursBetwee(commits[i + 1].date, commits[i].date);
          if (hours > 0 && hours < 168) {
            // Cap at 1 week
            recoveryTimes.push(hours);
          }
        }
      }
    }

    const med = Math.round(median(recoveryTimes) * 10) / 10;
    const rating = recoveryTimes.length
      ? rateMetric(med, DORA_THRESHOLDS.mttrHours)
      : "N/A";

    this.report.dora.mttr = {
      medianHours: med,
      incidents: recoveryTimes.length,
      rating,
    };
    console.log(`  MTTR: ${med}h median (${rating})`);
  }

  // =========================================================================
  // Velocity: Commits Per Week Per Author
  // =========================================================================

  collectCommitsPerWeek() {
    const log = git(`log dev --format="%aI|%aN" --after="${this.since}"`, {
      ignoreError: true,
    });

    const entries = log ? log.split("\n").filter(Boolean) : [];
    const byWeekAuthor = {};
    const authorTotals = {};

    for (const line of entries) {
      const [date, author] = line.split("|");
      const week = isoWeek(date);
      if (!byWeekAuthor[week]) byWeekAuthor[week] = {};
      byWeekAuthor[week][author] = (byWeekAuthor[week][author] || 0) + 1;
      authorTotals[author] = (authorTotals[author] || 0) + 1;
    }

    // Build weekly array sorted chronologically
    const weeks = Object.keys(byWeekAuthor).sort();
    const commitsPerWeek = weeks.map((week) => ({
      week,
      total: Object.values(byWeekAuthor[week]).reduce((a, b) => a + b, 0),
      byAuthor: byWeekAuthor[week],
    }));

    this.report.velocity.commitsPerWeek = commitsPerWeek;
    this.report.velocity.authorTotals = authorTotals;

    const totalCommits = entries.length;
    const avgPerWeek = this.weeks ? Math.round(totalCommits / this.weeks) : 0;
    console.log(`  Commits: ${totalCommits} total, ${avgPerWeek}/week avg`);
  }

  // =========================================================================
  // Velocity: Commit Type Distribution
  // =========================================================================

  collectCommitTypeDistribution() {
    const log = git(`log dev --format="%s" --after="${this.since}"`, {
      ignoreError: true,
    });

    const messages = log ? log.split("\n").filter(Boolean) : [];
    const types = {
      feat: 0,
      fix: 0,
      docs: 0,
      chore: 0,
      refactor: 0,
      test: 0,
      ci: 0,
      build: 0,
      style: 0,
      perf: 0,
      other: 0,
    };
    const typeRegex =
      /^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.*?\))?[!]?:/;

    for (const msg of messages) {
      const match = msg.match(typeRegex);
      if (match) {
        types[match[1]]++;
      } else {
        types.other++;
      }
    }

    // Remove zero-count types
    const filtered = {};
    for (const [k, v] of Object.entries(types)) {
      if (v > 0) filtered[k] = v;
    }

    this.report.velocity.commitTypes = filtered;
    const topType = Object.entries(filtered).sort((a, b) => b[1] - a[1])[0];
    console.log(
      `  Commit types: ${Object.keys(filtered).length} types, top: ${topType ? topType[0] : "n/a"}`,
    );
  }

  // =========================================================================
  // Velocity: Lines Changed
  // =========================================================================

  collectLinesChanged() {
    const log = git(
      `log dev --format="%aI" --shortstat --after="${this.since}"`,
      { ignoreError: true },
    );

    if (!log) {
      this.report.velocity.linesChanged = {
        added: 0,
        removed: 0,
        net: 0,
        byWeek: [],
      };
      return;
    }

    const lines = log.split("\n");
    let totalAdded = 0;
    let totalRemoved = 0;
    const byWeek = {};
    let currentWeek = null;

    for (const line of lines) {
      // Date line
      if (/^\d{4}-\d{2}-\d{2}/.test(line)) {
        currentWeek = isoWeek(line.trim());
        if (!byWeek[currentWeek])
          byWeek[currentWeek] = { added: 0, removed: 0 };
      }
      // Shortstat line
      const statMatch = line.match(/(\d+) insertion[s]?\(\+\)/);
      const delMatch = line.match(/(\d+) deletion[s]?\(-\)/);
      if (statMatch) {
        const added = parseInt(statMatch[1], 10);
        totalAdded += added;
        if (currentWeek && byWeek[currentWeek])
          byWeek[currentWeek].added += added;
      }
      if (delMatch) {
        const removed = parseInt(delMatch[1], 10);
        totalRemoved += removed;
        if (currentWeek && byWeek[currentWeek])
          byWeek[currentWeek].removed += removed;
      }
    }

    const weeklyArr = Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        added: data.added,
        removed: data.removed,
        net: data.added - data.removed,
      }));

    this.report.velocity.linesChanged = {
      added: totalAdded,
      removed: totalRemoved,
      net: totalAdded - totalRemoved,
      byWeek: weeklyArr,
    };
    console.log(
      `  Lines: +${totalAdded} -${totalRemoved} (net ${totalAdded - totalRemoved})`,
    );
  }

  // =========================================================================
  // Velocity: PR Metrics
  // =========================================================================

  collectPRMetrics() {
    const result = gh(
      `pr list --state merged --base main --json number,title,mergedAt,createdAt --limit 100`,
    );

    if (!result) {
      console.log("  PRs: gh CLI not available, skipping");
      this.report.velocity.prMetrics = null;
      return;
    }

    try {
      const prs = JSON.parse(result);
      const inRange = prs.filter(
        (pr) => pr.mergedAt && new Date(pr.mergedAt) >= new Date(this.since),
      );

      const timeToMerge = inRange
        .map((pr) => hoursBetwee(pr.createdAt, pr.mergedAt))
        .filter((h) => h > 0 && h < 720);

      const mergedPerWeek = this.weeks
        ? Math.round((inRange.length / this.weeks) * 10) / 10
        : 0;
      const avgTTM = Math.round(median(timeToMerge) * 10) / 10;

      this.report.velocity.prMetrics = {
        totalMerged: inRange.length,
        mergedPerWeek,
        avgTimeToMergeHours: avgTTM,
      };
      console.log(
        `  PRs: ${inRange.length} merged, ${mergedPerWeek}/week, ${avgTTM}h avg merge time`,
      );
    } catch {
      this.report.velocity.prMetrics = null;
      console.log("  PRs: failed to parse, skipping");
    }
  }

  // =========================================================================
  // Velocity: Sprint Completion
  // =========================================================================

  collectSprintCompletion() {
    const sprintDir = path.resolve(process.cwd(), "sprints");
    if (!fs.existsSync(sprintDir)) {
      this.report.sprintCompletion = [];
      return;
    }

    const files = fs
      .readdirSync(sprintDir)
      .filter((f) => f.startsWith("ACTIVE_SPRINT_") && f.endsWith(".toml"));
    let toml;
    try {
      toml = require("@iarna/toml");
    } catch {
      // Fallback: regex-based parsing
      toml = null;
    }

    for (const file of files) {
      const content = fs.readFileSync(path.join(sprintDir, file), "utf-8");
      let sprintName = file
        .replace("ACTIVE_SPRINT_", "")
        .replace(".toml", "")
        .replace(/_/g, " ");
      let sprintNumber = "";
      const tasks = {
        completed: 0,
        in_progress: 0,
        pending: 0,
        blocked: 0,
        total: 0,
      };

      if (toml) {
        try {
          const parsed = toml.parse(content);
          if (parsed.metadata) {
            sprintName = parsed.metadata.sprint_name || sprintName;
            sprintNumber = parsed.metadata.sprint_number || "";
          }
          if (parsed.tasks) {
            for (const task of Object.values(parsed.tasks)) {
              const status = task.status || "pending";
              tasks[status] = (tasks[status] || 0) + 1;
              tasks.total++;
            }
          }
        } catch {
          // Fall through to regex
        }
      }

      if (tasks.total === 0) {
        // Regex fallback
        const statusMatches = content.match(/status\s*=\s*"(\w+)"/g) || [];
        for (const match of statusMatches) {
          const status = match.match(/"(\w+)"/)[1];
          if (tasks[status] !== undefined) {
            tasks[status]++;
            tasks.total++;
          }
        }
        const nameMatch = content.match(/sprint_name\s*=\s*"([^"]+)"/);
        if (nameMatch) sprintName = nameMatch[1];
        const numMatch = content.match(/sprint_number\s*=\s*"?(\d+)"?/);
        if (numMatch) sprintNumber = numMatch[1];
      }

      if (tasks.total > 0) {
        this.report.sprintCompletion.push({
          sprint: sprintNumber,
          name: sprintName,
          ...tasks,
          rate: Math.round((tasks.completed / tasks.total) * 100),
        });
      }
    }

    const totalTasks = this.report.sprintCompletion.reduce(
      (a, s) => a + s.total,
      0,
    );
    const totalDone = this.report.sprintCompletion.reduce(
      (a, s) => a + s.completed,
      0,
    );
    console.log(
      `  Sprints: ${this.report.sprintCompletion.length} active, ${totalDone}/${totalTasks} tasks done`,
    );
  }

  // =========================================================================
  // Team Summary
  // =========================================================================

  collectTeamSummary() {
    const totals = this.report.velocity.authorTotals || {};
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

    this.report.team = {
      activeContributors: sorted.length,
      contributors: sorted.map(([name, commits]) => ({
        name,
        commits,
        percentage: Math.round(
          (commits / Object.values(totals).reduce((a, b) => a + b, 0)) * 100,
        ),
      })),
    };
    console.log(`  Team: ${sorted.length} active contributors`);
  }

  // =========================================================================
  // Report Generation
  // =========================================================================

  writeReports() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const jsonPath = path.join(this.outputDir, `velocity-${this.today}.json`);
    const mdPath = path.join(this.outputDir, `velocity-${this.today}.md`);
    const latestPath = path.join(this.outputDir, "LATEST.md");

    // JSON report
    fs.writeFileSync(jsonPath, JSON.stringify(this.report, null, 2));
    console.log(`  JSON: ${jsonPath}`);

    // Markdown report
    const md = this.generateMarkdown();
    fs.writeFileSync(mdPath, md);
    fs.writeFileSync(latestPath, md);
    console.log(`  Markdown: ${mdPath}`);
    console.log(`  Latest: ${latestPath}`);
  }

  generateMarkdown() {
    const r = this.report;
    const lines = [];
    const push = (...args) => lines.push(...args);

    push(`# Engineering Velocity Report`);
    push("");
    push(
      `> Generated: ${this.today} | Period: ${r.period.start} to ${r.period.end} (${r.period.weeks} weeks)`,
    );
    push("");

    // DORA Summary
    if (r.dora.deploymentFrequency) {
      const df = r.dora.deploymentFrequency;
      const lt = r.dora.leadTime || {};
      const cfr = r.dora.changeFailureRate || {};
      const mttr = r.dora.mttr || {};

      const trendArrow = { improving: "↑", declining: "↓", stable: "→" };

      push("## DORA Performance Summary");
      push("");
      push("| Metric | Value | Rating | Trend |");
      push("|--------|-------|--------|-------|");
      push(
        `| Deployment Frequency | ${df.average}/week | ${df.rating} | ${trendArrow[df.trend] || "→"} ${df.trend} |`,
      );
      push(
        `| Lead Time for Changes | ${lt.medianHours || 0}h median | ${lt.rating || "N/A"} | |`,
      );
      push(
        `| Change Failure Rate | ${cfr.percentage || 0}% | ${cfr.rating || "N/A"} | |`,
      );
      push(
        `| MTTR | ${mttr.medianHours || 0}h median | ${mttr.rating || "N/A"} | |`,
      );
      push("");

      push("### Rating Scale");
      push("| Level | Deploy Freq | Lead Time | Failure Rate | MTTR |");
      push("|-------|------------|-----------|--------------|------|");
      push("| Elite | daily+ | <1h | <5% | <1h |");
      push("| High | weekly | <1d | <10% | <1d |");
      push("| Medium | monthly | <1w | <15% | <1w |");
      push("| Low | <monthly | >1w | >15% | >1w |");
      push("");

      // Deployment frequency detail
      push("### Deployment Frequency (Last " + r.period.weeks + " Weeks)");
      push("");
      push("| Week | Merges to Main |");
      push("|------|---------------|");
      for (const w of df.weekly) {
        const bar = "█".repeat(Math.min(w.count, 20));
        push(`| ${w.week} | ${w.count} ${bar} |`);
      }
      push("");
      push(`**Average:** ${df.average}/week | **Trend:** ${df.trend}`);
      push("");

      // Lead time detail
      if (lt.samples) {
        push("### Lead Time for Changes");
        push("");
        push(`- **Median:** ${lt.medianHours} hours`);
        push(`- **P90:** ${lt.p90Hours} hours`);
        push(`- **Fastest:** ${lt.fastest} hours`);
        push(`- **Slowest:** ${lt.slowest} hours`);
        push(`- **Samples:** ${lt.samples} merges analyzed`);
        push("");
      }

      // Change failure rate detail
      push("### Change Failure Rate");
      push("");
      push(`- **Rate:** ${cfr.percentage}%`);
      push(`- **Failures:** ${cfr.failures} / ${cfr.total} merges`);
      push(`- **Detection:** Reverts/hotfixes within commit history`);
      push("");

      // MTTR detail
      push("### Mean Time to Recovery");
      push("");
      push(`- **Median:** ${mttr.medianHours} hours`);
      push(`- **Incidents:** ${mttr.incidents} in period`);
      push("");
    }

    push("---");
    push("");

    // Velocity
    if (r.velocity.commitsPerWeek) {
      push("## Engineering Velocity");
      push("");

      // Commits per week table
      push("### Commits Per Week");
      push("");
      const allAuthors = [
        ...new Set(
          r.velocity.commitsPerWeek.flatMap((w) => Object.keys(w.byAuthor)),
        ),
      ];
      const topAuthors = allAuthors
        .map((a) => [
          a,
          r.velocity.commitsPerWeek.reduce(
            (s, w) => s + (w.byAuthor[a] || 0),
            0,
          ),
        ])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map((a) => a[0]);

      push(`| Week | Total | ${topAuthors.join(" | ")} |`);
      push(`|------|-------| ${topAuthors.map(() => "---").join(" | ")} |`);
      for (const w of r.velocity.commitsPerWeek) {
        const authorCols = topAuthors
          .map((a) => w.byAuthor[a] || 0)
          .join(" | ");
        push(`| ${w.week} | ${w.total} | ${authorCols} |`);
      }
      push("");

      // Contributor breakdown
      if (r.team.contributors) {
        push("### Contributor Breakdown");
        push("");
        push("| Author | Commits | % of Total |");
        push("|--------|---------|------------|");
        for (const c of r.team.contributors) {
          push(`| ${c.name} | ${c.commits} | ${c.percentage}% |`);
        }
        push("");
      }

      // Commit types
      if (r.velocity.commitTypes) {
        const types = r.velocity.commitTypes;
        const total = Object.values(types).reduce((a, b) => a + b, 0);

        push("### Commit Type Distribution");
        push("");
        push("| Type | Count | % |");
        push("|------|-------|---|");
        for (const [type, count] of Object.entries(types).sort(
          (a, b) => b[1] - a[1],
        )) {
          push(
            `| ${type} | ${count} | ${Math.round((count / total) * 100)}% |`,
          );
        }
        push("");
      }

      // Lines changed
      if (r.velocity.linesChanged && r.velocity.linesChanged.byWeek) {
        push("### Code Churn");
        push("");
        push("| Week | Lines Added | Lines Removed | Net |");
        push("|------|-------------|---------------|-----|");
        for (const w of r.velocity.linesChanged.byWeek) {
          push(
            `| ${w.week} | +${w.added.toLocaleString()} | -${w.removed.toLocaleString()} | ${w.net >= 0 ? "+" : ""}${w.net.toLocaleString()} |`,
          );
        }
        push(
          `| **Total** | **+${r.velocity.linesChanged.added.toLocaleString()}** | **-${r.velocity.linesChanged.removed.toLocaleString()}** | **${r.velocity.linesChanged.net >= 0 ? "+" : ""}${r.velocity.linesChanged.net.toLocaleString()}** |`,
        );
        push("");
      }

      // PR metrics
      if (r.velocity.prMetrics) {
        push("### PR Metrics");
        push("");
        push(`- **PRs merged:** ${r.velocity.prMetrics.totalMerged}`);
        push(`- **PRs merged/week:** ${r.velocity.prMetrics.mergedPerWeek}`);
        push(
          `- **Avg time to merge:** ${r.velocity.prMetrics.avgTimeToMergeHours} hours`,
        );
        push("");
      }
    }

    // Sprint completion
    if (r.sprintCompletion.length) {
      push("---");
      push("");
      push("## Sprint Completion");
      push("");
      push("| Sprint | Name | Tasks | Done | In Progress | Pending | Rate |");
      push("|--------|------|-------|------|-------------|---------|------|");
      for (const s of r.sprintCompletion) {
        push(
          `| ${s.sprint} | ${s.name} | ${s.total} | ${s.completed} | ${s.in_progress} | ${s.pending} | ${s.rate}% |`,
        );
      }
      push("");
    }

    push("---");
    push("");
    push(
      "*Generated by `scripts/metrics/engineering-velocity.js` | " +
        new Date().toISOString() +
        "*",
    );
    push("");

    return lines.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const tracker = new EngineeringVelocityTracker();
tracker.run().catch((err) => {
  console.error("❌ Failed to collect metrics:", err.message);
  process.exit(1);
});
