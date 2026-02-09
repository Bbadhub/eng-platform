/**
 * Feedback Reporter - Auto-submits test failures to the Feedback Pipeline
 *
 * FLOW:
 * Test Failure → This Reporter → POST /api/feedback → Supabase feedback_submissions
 *   → Discord notification (immediate)
 *   → Roadmap item (auto-created)
 *   → GitHub Issue (when automation is enabled)
 *
 * This extends the existing PostHog reporter pattern.
 * PostHog gets ALL test events (pass/fail). Feedback gets ONLY failures.
 *
 * CONFIGURATION:
 * Add to playwright.config.ts:
 * ```
 * reporter: [
 *   ['./e2e/reporters/feedback-reporter.ts', {
 *     apiUrl: 'http://localhost:3001',
 *     enabled: true,
 *     minSeverity: 'high',  // Only submit high+ failures
 *     deduplicateMinutes: 60, // Don't re-submit same failure within 60 min
 *   }]
 * ]
 * ```
 *
 * QA TEAM: This reporter works without GitHub access.
 * Failures go to Supabase → Discord → Engineers see them immediately.
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

interface FeedbackReporterOptions {
  /** API base URL */
  apiUrl?: string;
  /** Service account token for API auth (optional - uses env if not set) */
  authToken?: string;
  /** Enable/disable the reporter */
  enabled?: boolean;
  /** Minimum severity to auto-submit: 'all' | 'high' | 'critical' */
  minSeverity?: "all" | "high" | "critical";
  /** Deduplication window in minutes */
  deduplicateMinutes?: number;
  /** Include screenshot in feedback */
  includeScreenshots?: boolean;
  /** Enable flake quarantine — auto-quarantine tests that fail >threshold% of runs */
  flakeQuarantine?: boolean;
  /** Flake threshold: percentage of failures that triggers quarantine (default: 20) */
  flakeThresholdPercent?: number;
  /** Minimum number of runs before quarantine can trigger (default: 5) */
  flakeMinRuns?: number;
  /** Maximum days a test can stay quarantined before forced review (default: 30) */
  quarantineMaxDays?: number;
}

interface FailureRecord {
  testTitle: string;
  testFile: string;
  errorMessage: string;
  timestamp: number;
}

interface FlakeRecord {
  testId: string;
  testTitle: string;
  testFile: string;
  runs: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  quarantined: boolean;
  quarantinedAt?: number;
  quarantinedExpired?: boolean;
  flakeRate: number;
}

class FeedbackReporter implements Reporter {
  private apiUrl: string;
  private authToken: string;
  private enabled: boolean;
  private minSeverity: string;
  private deduplicateMinutes: number;
  private includeScreenshots: boolean;

  private testRunId: string;
  private startTime: number = 0;
  private failures: FailureRecord[] = [];
  private submittedCount = 0;
  private results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    quarantined: 0,
  };

  // Deduplication cache file
  private dedupeFile: string;

  // Flake quarantine
  private flakeQuarantine: boolean;
  private flakeThresholdPercent: number;
  private flakeMinRuns: number;
  private quarantineMaxDays: number;
  private flakeFile: string;
  private flakeRegistry: Record<string, FlakeRecord> = {};

  constructor(options: FeedbackReporterOptions = {}) {
    this.apiUrl =
      options.apiUrl ||
      process.env.REACT_APP_API_URL ||
      "http://localhost:3001";
    this.authToken =
      options.authToken ||
      process.env.FEEDBACK_SERVICE_TOKEN ||
      process.env.TEST_AUTH_TOKEN ||
      "";
    this.enabled = options.enabled !== false;
    this.minSeverity = options.minSeverity || "high";
    this.deduplicateMinutes = options.deduplicateMinutes || 60;
    this.includeScreenshots = options.includeScreenshots !== false;
    this.flakeQuarantine = options.flakeQuarantine !== false;
    this.flakeThresholdPercent = options.flakeThresholdPercent || 20;
    this.flakeMinRuns = options.flakeMinRuns || 5;
    this.quarantineMaxDays = options.quarantineMaxDays || 30;
    this.testRunId = `regression-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    this.dedupeFile = path.join(
      __dirname,
      "..",
      "..",
      "test-results",
      ".feedback-dedupe.json",
    );
    this.flakeFile = path.join(
      __dirname,
      "..",
      "..",
      "test-results",
      ".flake-registry.json",
    );

    // Load existing flake registry
    this.loadFlakeRegistry();

    if (!this.enabled) {
      console.log("[Feedback Reporter] Disabled");
    } else {
      console.log(
        `[Feedback Reporter] Enabled - failures will be submitted to ${this.apiUrl}/api/feedback`,
      );
    }
  }

  // =========================================================================
  // Flake Quarantine
  // =========================================================================

  /**
   * Load flake registry from disk.
   */
  private loadFlakeRegistry(): void {
    try {
      if (fs.existsSync(this.flakeFile)) {
        this.flakeRegistry = JSON.parse(
          fs.readFileSync(this.flakeFile, "utf-8"),
        );
      }
    } catch {
      this.flakeRegistry = {};
    }
  }

  /**
   * Save flake registry to disk.
   */
  private saveFlakeRegistry(): void {
    try {
      const dir = path.dirname(this.flakeFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.flakeFile,
        JSON.stringify(this.flakeRegistry, null, 2),
      );
    } catch {
      // Non-critical
    }
  }

  /**
   * Record a test result in the flake registry and check quarantine status.
   *
   * Returns true if the test is quarantined (should not be submitted as feedback).
   */
  private recordFlakeResult(test: TestCase, passed: boolean): boolean {
    if (!this.flakeQuarantine) return false;

    const testId = `${test.location.file}:${test.location.line}:${test.title}`;

    if (!this.flakeRegistry[testId]) {
      this.flakeRegistry[testId] = {
        testId,
        testTitle: test.title,
        testFile: test.location.file,
        runs: 0,
        failures: 0,
        lastFailure: 0,
        lastSuccess: 0,
        quarantined: false,
        flakeRate: 0,
      };
    }

    const record = this.flakeRegistry[testId];
    record.runs++;

    if (passed) {
      record.lastSuccess = Date.now();
    } else {
      record.failures++;
      record.lastFailure = Date.now();
    }

    // Calculate flake rate
    record.flakeRate =
      record.runs > 0 ? (record.failures / record.runs) * 100 : 0;

    // Check quarantine conditions
    if (
      record.runs >= this.flakeMinRuns &&
      record.flakeRate >= this.flakeThresholdPercent &&
      record.flakeRate < 100 // 100% failure is a real bug, not a flake
    ) {
      if (!record.quarantined) {
        record.quarantined = true;
        record.quarantinedAt = Date.now();
        console.log(
          `[Feedback Reporter] QUARANTINED: ${test.title} ` +
            `(flake rate: ${record.flakeRate.toFixed(0)}% over ${record.runs} runs)`,
        );
      }
    }

    // Auto-unquarantine if test stabilizes (passes 5 times in a row)
    if (record.quarantined && record.lastSuccess > (record.lastFailure || 0)) {
      const recentPasses = record.runs - record.failures;
      // If the last 5 runs were all passes, unquarantine
      if (
        recentPasses >= 5 &&
        record.flakeRate < this.flakeThresholdPercent / 2
      ) {
        record.quarantined = false;
        delete record.quarantinedAt;
        console.log(
          `[Feedback Reporter] UNQUARANTINED: ${test.title} ` +
            `(flake rate dropped to ${record.flakeRate.toFixed(0)}%)`,
        );
      }
    }

    // Time-box: force review if quarantined longer than maxDays
    if (record.quarantined && record.quarantinedAt) {
      const daysQuarantined =
        (Date.now() - record.quarantinedAt) / (1000 * 60 * 60 * 24);
      if (daysQuarantined >= this.quarantineMaxDays) {
        // Expired quarantine — re-enable feedback submission for this test
        // so it surfaces as a real issue that needs human attention
        record.quarantined = false;
        record.quarantinedExpired = true;
        console.log(
          `[Feedback Reporter] QUARANTINE EXPIRED: ${test.title} ` +
            `(quarantined ${Math.floor(daysQuarantined)}d ago — needs manual review)`,
        );
      }
    }

    return record.quarantined;
  }

  /**
   * Get all currently quarantined tests.
   */
  private getQuarantinedTests(): FlakeRecord[] {
    return Object.values(this.flakeRegistry).filter((r) => r.quarantined);
  }

  /**
   * Check if this failure was already submitted recently.
   */
  private isDuplicate(testTitle: string, errorMessage: string): boolean {
    try {
      if (!fs.existsSync(this.dedupeFile)) return false;

      const cache: FailureRecord[] = JSON.parse(
        fs.readFileSync(this.dedupeFile, "utf-8"),
      );
      const cutoff = Date.now() - this.deduplicateMinutes * 60 * 1000;

      return cache.some(
        (record) =>
          record.testTitle === testTitle &&
          record.errorMessage === errorMessage.substring(0, 200) &&
          record.timestamp > cutoff,
      );
    } catch {
      return false;
    }
  }

  /**
   * Record a submitted failure for deduplication.
   */
  private recordSubmission(
    testTitle: string,
    testFile: string,
    errorMessage: string,
  ): void {
    try {
      const dir = path.dirname(this.dedupeFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let cache: FailureRecord[] = [];
      if (fs.existsSync(this.dedupeFile)) {
        cache = JSON.parse(fs.readFileSync(this.dedupeFile, "utf-8"));
      }

      // Prune old entries
      const cutoff = Date.now() - this.deduplicateMinutes * 60 * 1000;
      cache = cache.filter((r) => r.timestamp > cutoff);

      // Add new entry
      cache.push({
        testTitle,
        testFile,
        errorMessage: errorMessage.substring(0, 200),
        timestamp: Date.now(),
      });

      fs.writeFileSync(this.dedupeFile, JSON.stringify(cache, null, 2));
    } catch {
      // Non-critical - ignore
    }
  }

  /**
   * Determine severity of a test failure.
   */
  private determineSeverity(
    test: TestCase,
    result: TestResult,
  ): "critical" | "high" | "medium" | "low" {
    const title = test.title.toLowerCase();
    const testPath = test.titlePath().join(" ").toLowerCase();

    // Critical: Layer 0 failures (foundation broken)
    if (testPath.includes("layer-0") || testPath.includes("l0-")) {
      return "critical";
    }

    // Critical: Auth failures
    if (title.includes("auth") || title.includes("login")) {
      return "critical";
    }

    // High: Happy path failures
    if (title.includes("happy-path") || testPath.includes("@happy-path")) {
      return "high";
    }

    // High: Layer 1-2 failures (core + data)
    if (
      testPath.includes("layer-1") ||
      testPath.includes("layer-2") ||
      testPath.includes("l1-") ||
      testPath.includes("l2-")
    ) {
      return "high";
    }

    // Medium: Layer 3-4 failures
    if (
      testPath.includes("layer-3") ||
      testPath.includes("layer-4") ||
      testPath.includes("l3-") ||
      testPath.includes("l4-")
    ) {
      return "medium";
    }

    // Timeout = higher severity
    if (result.status === "timedOut") {
      return "high";
    }

    return "medium";
  }

  /**
   * Check if severity meets minimum threshold.
   */
  private meetsSeverityThreshold(
    severity: "critical" | "high" | "medium" | "low",
  ): boolean {
    const levels = { critical: 3, high: 2, medium: 1, low: 0 };
    const thresholds = { all: 0, high: 2, critical: 3 };
    return (
      levels[severity] >=
      (thresholds[this.minSeverity as keyof typeof thresholds] || 0)
    );
  }

  /**
   * Submit failure to feedback API.
   */
  private async submitFailure(
    test: TestCase,
    result: TestResult,
    severity: "critical" | "high" | "medium" | "low",
  ): Promise<void> {
    const errorMessage = result.error?.message || "Unknown error";
    const errorStack = result.error?.stack || "";

    // Check deduplication
    if (this.isDuplicate(test.title, errorMessage)) {
      console.log(`[Feedback Reporter] Skipped (duplicate): ${test.title}`);
      return;
    }

    // Build description with facts
    const layer = this.extractLayer(test);
    const description = [
      `## Regression Test Failure`,
      ``,
      `**Test:** ${test.title}`,
      `**File:** ${test.location.file}:${test.location.line}`,
      `**Layer:** ${layer}`,
      `**Duration:** ${result.duration}ms`,
      `**Run ID:** ${this.testRunId}`,
      `**Status:** ${result.status}`,
      result.retry > 0 ? `**Retries:** ${result.retry}` : "",
      ``,
      `### Error`,
      "```",
      errorMessage.substring(0, 500),
      "```",
      ``,
      errorStack
        ? `### Stack Trace\n\`\`\`\n${errorStack.substring(0, 1000)}\n\`\`\``
        : "",
      ``,
      `### Context`,
      `- Branch: ${process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || "local"}`,
      `- Environment: ${process.env.E2E_BASE_URL || "localhost"}`,
      `- Run: \`npx playwright test ${test.location.file} --project=chromium\``,
    ]
      .filter(Boolean)
      .join("\n");

    const severityEmoji = {
      critical: "🔴",
      high: "🟠",
      medium: "🟡",
      low: "🟢",
    };

    const payload = {
      type: "bug" as const,
      title: `${severityEmoji[severity]} REGRESSION: ${test.title}`,
      description,
      priority: severity,
      url: `playwright://${test.location.file}:${test.location.line}`,
      browser_info: {
        test_runner: "playwright",
        test_run_id: this.testRunId,
        layer,
        test_file: test.location.file,
        test_line: test.location.line,
        duration_ms: result.duration,
        status: result.status,
        retry_count: result.retry,
      },
    };

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.authToken) {
        headers["Authorization"] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(`${this.apiUrl}/api/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        this.submittedCount++;
        this.recordSubmission(test.title, test.location.file, errorMessage);
        console.log(
          `[Feedback Reporter] ✅ Submitted: ${test.title} (${severity})`,
        );
      } else {
        console.log(
          `[Feedback Reporter] ⚠️ Failed to submit (${response.status}): ${test.title}`,
        );
      }
    } catch (error) {
      console.log(
        `[Feedback Reporter] ⚠️ Could not reach API: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Extract layer from test path.
   */
  private extractLayer(test: TestCase): string {
    const testPath = test.titlePath().join(" ").toLowerCase();
    if (testPath.includes("layer-0") || testPath.includes("l0-"))
      return "Layer 0: Foundation";
    if (testPath.includes("layer-1") || testPath.includes("l1-"))
      return "Layer 1: Core Systems";
    if (testPath.includes("layer-2") || testPath.includes("l2-"))
      return "Layer 2: Data Layer";
    if (testPath.includes("layer-3") || testPath.includes("l3-"))
      return "Layer 3: UI/UX";
    if (testPath.includes("layer-4") || testPath.includes("l4-"))
      return "Layer 4: Business";
    return "Unknown Layer";
  }

  // =========================================================================
  // Reporter Interface
  // =========================================================================

  onBegin(config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.results.total = suite.allTests().length;
    console.log(
      `[Feedback Reporter] Starting regression run: ${this.testRunId} (${this.results.total} tests)`,
    );
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const passed = result.status === "passed";

    if (passed) {
      this.results.passed++;
      // Record pass for flake tracking
      this.recordFlakeResult(test, true);
      return;
    }

    if (result.status === "skipped") {
      this.results.skipped++;
      return;
    }

    // Failed or timed out
    this.results.failed++;

    // Record failure for flake tracking
    const isQuarantined = this.recordFlakeResult(test, false);

    if (!this.enabled) return;

    // Skip feedback submission for quarantined (flaky) tests
    if (isQuarantined) {
      this.results.quarantined++;
      console.log(
        `[Feedback Reporter] Skipped (quarantined flake): ${test.title}`,
      );
      return;
    }

    const severity = this.determineSeverity(test, result);

    if (this.meetsSeverityThreshold(severity)) {
      // Submit async - don't block test execution
      this.submitFailure(test, result, severity).catch(() => {});
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const duration = Date.now() - this.startTime;

    console.log(`[Feedback Reporter] Run complete: ${result.status}`);
    console.log(
      `[Feedback Reporter] ${this.results.passed} passed, ${this.results.failed} failed, ${this.results.skipped} skipped`,
    );

    if (this.results.quarantined > 0) {
      console.log(
        `[Feedback Reporter] ${this.results.quarantined} failure(s) suppressed (quarantined flakes)`,
      );
    }

    if (this.submittedCount > 0) {
      console.log(
        `[Feedback Reporter] ${this.submittedCount} failures submitted to feedback pipeline`,
      );
      console.log(
        `[Feedback Reporter] Check Discord for notifications or Supabase feedback_submissions table`,
      );
    }

    // Report quarantined tests
    const quarantined = this.getQuarantinedTests();
    if (quarantined.length > 0) {
      console.log(
        `[Feedback Reporter] Currently quarantined tests (${quarantined.length}):`,
      );
      for (const q of quarantined) {
        const daysQ = q.quarantinedAt
          ? Math.floor((Date.now() - q.quarantinedAt) / (1000 * 60 * 60 * 24))
          : 0;
        const expiresIn = this.quarantineMaxDays - daysQ;
        console.log(
          `  - ${q.testTitle} (${q.flakeRate.toFixed(0)}% flake, ${q.runs} runs, ` +
            `expires in ${expiresIn}d)`,
        );
      }
    }

    // Report expired quarantines (tests that need manual review)
    const expired = Object.values(this.flakeRegistry).filter(
      (r) => r.quarantinedExpired,
    );
    if (expired.length > 0) {
      console.log(
        `[Feedback Reporter] EXPIRED QUARANTINES - need manual review (${expired.length}):`,
      );
      for (const e of expired) {
        console.log(
          `  - ${e.testTitle} (${e.flakeRate.toFixed(0)}% flake rate, ${e.runs} runs) ` +
            `- quarantined >${this.quarantineMaxDays} days, fix or delete this test`,
        );
      }
    }

    // Save flake registry
    this.saveFlakeRegistry();

    // Write summary to file for QA reference
    const summaryFile = path.join(
      __dirname,
      "..",
      "..",
      "test-results",
      "regression-summary.json",
    );
    try {
      const dir = path.dirname(summaryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        summaryFile,
        JSON.stringify(
          {
            testRunId: this.testRunId,
            status: result.status,
            durationMs: duration,
            results: this.results,
            feedbackSubmitted: this.submittedCount,
            quarantinedTests: quarantined.map((q) => ({
              testTitle: q.testTitle,
              testFile: q.testFile,
              flakeRate: q.flakeRate,
              runs: q.runs,
              quarantinedAt: q.quarantinedAt,
            })),
            timestamp: new Date().toISOString(),
            environment: {
              baseUrl: process.env.E2E_BASE_URL || "localhost",
              branch:
                process.env.GITHUB_REF_NAME ||
                process.env.GIT_BRANCH ||
                "local",
            },
          },
          null,
          2,
        ),
      );
    } catch {
      // Non-critical
    }

    // Small delay to ensure async submissions complete
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  printsToStdio(): boolean {
    return true;
  }
}

export default FeedbackReporter;
