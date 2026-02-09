/**
 * PostHog Playwright Reporter
 *
 * Sends test results to PostHog for automated feedback loop.
 * Links test failures to session replays for debugging.
 *
 * EVENTS SENT:
 * - playwright_test_started: When a test begins
 * - playwright_test_completed: When a test finishes (pass/fail/skip)
 * - playwright_suite_completed: When all tests finish
 *
 * USAGE:
 * Add to playwright.config.ts:
 * reporter: [['./e2e/reporters/posthog-reporter.ts', { apiKey: 'phc_...' }]]
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

interface PostHogReporterOptions {
  apiKey?: string;
  apiHost?: string;
  projectId?: string;
  enabled?: boolean;
}

interface TestEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, any>;
  timestamp?: string;
}

class PostHogReporter implements Reporter {
  private apiKey: string;
  private apiHost: string;
  private projectId: string;
  private enabled: boolean;
  private testRunId: string;
  private startTime: number = 0;
  private results: {
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
  } = { passed: 0, failed: 0, skipped: 0, flaky: 0 };

  constructor(options: PostHogReporterOptions = {}) {
    this.apiKey = options.apiKey || process.env.POSTHOG_API_KEY || process.env.REACT_APP_POSTHOG_KEY || '';
    this.apiHost = options.apiHost || process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
    this.projectId = options.projectId || process.env.PROJECT_NAME || 'project';
    this.enabled = options.enabled !== false && !!this.apiKey;
    this.testRunId = `test-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!this.enabled) {
      console.log('[PostHog Reporter] Disabled - no API key configured');
    }
  }

  private async sendEvent(event: TestEvent): Promise<void> {
    if (!this.enabled) return;

    try {
      const response = await fetch(`${this.apiHost}/capture/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          ...event,
        }),
      });

      if (!response.ok) {
        console.error(`[PostHog Reporter] Failed to send event: ${response.status}`);
      }
    } catch (error) {
      console.error('[PostHog Reporter] Error sending event:', error);
    }
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    console.log(`[PostHog Reporter] Starting test run: ${this.testRunId}`);
    console.log(`[PostHog Reporter] Total tests: ${suite.allTests().length}`);

    this.sendEvent({
      event: 'playwright_suite_started',
      distinct_id: this.testRunId,
      properties: {
        test_run_id: this.testRunId,
        project: this.projectId,
        total_tests: suite.allTests().length,
        workers: config.workers,
        retries: config.projects[0]?.retries ?? 0,
        base_url: config.projects[0]?.use?.baseURL,
        browser: config.projects[0]?.name,
        ci: !!process.env.CI,
        branch: process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || 'local',
        commit: process.env.GITHUB_SHA || process.env.GIT_COMMIT || 'local',
      },
    });
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.sendEvent({
      event: 'playwright_test_started',
      distinct_id: this.testRunId,
      properties: {
        test_run_id: this.testRunId,
        project: this.projectId,
        test_id: test.id,
        test_title: test.title,
        test_file: test.location.file,
        test_line: test.location.line,
        test_path: test.titlePath().join(' > '),
        retry_count: result.retry,
      },
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Track results
    if (result.status === 'passed') {
      this.results.passed++;
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      this.results.failed++;
    } else if (result.status === 'skipped') {
      this.results.skipped++;
    }

    // Check if flaky (passed on retry)
    if (result.retry > 0 && result.status === 'passed') {
      this.results.flaky++;
    }

    // Extract error info if failed
    let errorMessage: string | undefined;
    let errorStack: string | undefined;
    if (result.error) {
      errorMessage = result.error.message;
      errorStack = result.error.stack;
    }

    // Build session replay URL hint
    // The actual session ID is captured client-side, but we can include test metadata
    const sessionHint = `Test: ${test.title} | File: ${test.location.file}:${test.location.line}`;

    const properties: Record<string, any> = {
      test_run_id: this.testRunId,
      project: this.projectId,
      test_id: test.id,
      test_title: test.title,
      test_file: test.location.file,
      test_line: test.location.line,
      test_path: test.titlePath().join(' > '),
      status: result.status,
      duration_ms: result.duration,
      retry_count: result.retry,
      is_flaky: result.retry > 0 && result.status === 'passed',

      // For linking to session replay
      session_hint: sessionHint,

      // Attachments info
      has_screenshot: result.attachments.some(a => a.name === 'screenshot'),
      has_video: result.attachments.some(a => a.name === 'video'),
      has_trace: result.attachments.some(a => a.name === 'trace'),
    };

    // Add error info for failures
    if (errorMessage) {
      properties.error_message = errorMessage.substring(0, 1000); // Truncate long errors
      properties.error_stack = errorStack?.substring(0, 2000);
    }

    // Add screenshot/video paths for debugging
    const screenshot = result.attachments.find(a => a.name === 'screenshot');
    const video = result.attachments.find(a => a.name === 'video');
    const trace = result.attachments.find(a => a.name === 'trace');

    if (screenshot?.path) properties.screenshot_path = screenshot.path;
    if (video?.path) properties.video_path = video.path;
    if (trace?.path) properties.trace_path = trace.path;

    this.sendEvent({
      event: 'playwright_test_completed',
      distinct_id: this.testRunId,
      properties,
    });

    // Log failures for visibility
    if (result.status === 'failed' || result.status === 'timedOut') {
      console.log(`[PostHog Reporter] ❌ FAILED: ${test.title}`);
      if (errorMessage) {
        console.log(`[PostHog Reporter]    Error: ${errorMessage.substring(0, 200)}`);
      }
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const duration = Date.now() - this.startTime;

    console.log(`[PostHog Reporter] Test run completed: ${result.status}`);
    console.log(`[PostHog Reporter] Results: ${this.results.passed} passed, ${this.results.failed} failed, ${this.results.skipped} skipped`);
    if (this.results.flaky > 0) {
      console.log(`[PostHog Reporter] ⚠️ Flaky tests: ${this.results.flaky}`);
    }

    await this.sendEvent({
      event: 'playwright_suite_completed',
      distinct_id: this.testRunId,
      properties: {
        test_run_id: this.testRunId,
        project: this.projectId,
        status: result.status,
        duration_ms: duration,
        total_passed: this.results.passed,
        total_failed: this.results.failed,
        total_skipped: this.results.skipped,
        total_flaky: this.results.flaky,
        pass_rate: this.results.passed / (this.results.passed + this.results.failed) || 0,
        ci: !!process.env.CI,
        branch: process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || 'local',
        commit: process.env.GITHUB_SHA || process.env.GIT_COMMIT || 'local',
      },
    });

    // Small delay to ensure event is sent
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  printsToStdio(): boolean {
    return true;
  }
}

export default PostHogReporter;
