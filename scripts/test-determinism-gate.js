#!/usr/bin/env node
/**
 * Determinism Gate — Sprint 13 TEST-001
 *
 * Identifies Playwright regression tests that would pass even when the backend
 * is down ("hallucinating tests"). Two modes:
 *
 *   1. Static analysis (default) — scans spec files for known anti-patterns
 *   2. Runtime mode (--runtime)  — runs tests with all API routes blocked
 *
 * Usage:
 *   node scripts/test-determinism-gate.js                    # Static analysis only
 *   node scripts/test-determinism-gate.js --runtime          # Static + runtime
 *   node scripts/test-determinism-gate.js --output custom.md # Custom output path
 *   node scripts/test-determinism-gate.js --json             # Also write JSON
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Configuration ──────────────────────────────────────────────────────────

const REGRESSION_DIR = path.join(__dirname, "..", "e2e", "regression");
const DEFAULT_OUTPUT = path.join(
  __dirname,
  "..",
  "docs",
  "qa",
  "HALLUCINATING_TESTS.md",
);
const JSON_OUTPUT = path.join(
  __dirname,
  "..",
  "test-results",
  "determinism-report.json",
);

const ANTI_PATTERNS = [
  {
    id: "CATCH_SWALLOW",
    name: "Error swallowing via .catch()",
    severity: "CRITICAL",
    regex:
      /\.catch\s*\(\s*\(\s*\)\s*=>\s*(?:false|null|undefined|{[\s\S]{0,20}})\s*\)/g,
    description:
      "Test catches assertion/network errors and returns falsy value, silently passing",
    fix: "Remove .catch() — let the error propagate and fail the test",
  },
  {
    id: "MULTI_STATUS",
    name: "Multi-status acceptance",
    severity: "HIGH",
    regex:
      /expect\s*\(\s*\[[\d,\s]+\]\s*\)\s*\.toContain\s*\(\s*(?:status|response\.status)/g,
    description:
      "Accepts multiple HTTP status codes (e.g., 200, 404, 503) — test passes on errors",
    fix: "Assert specific expected status: expect(status).toBe(200)",
  },
  {
    id: "MULTI_SELECTOR",
    name: "Multi-selector fallback",
    severity: "HIGH",
    regex: /locator\s*\(\s*['"`](?:[^'"`]*,\s*){2,}[^'"`]*['"`]\s*\)/g,
    description:
      "Uses OR selectors (A, B, C, D) — matches generic elements like nav/header on any page",
    fix: "Use single data-testid selector: locator('[data-testid=\"specific-element\"]')",
  },
  {
    id: "CONDITIONAL_ASSERT",
    name: "Conditional assertion (silent pass)",
    severity: "HIGH",
    regex:
      /if\s*\(\s*(?:await\s+)?(?:flag|enabled|visible|response|result|data|body|element)/gi,
    description:
      "Wraps assertions in if-check — when condition is falsy, test passes with zero assertions",
    fix: "Always assert: if flag should be on, assert it IS on, then check UI",
  },
  {
    id: "IF_VISIBLE_GUARD",
    name: "If-visible guard clause",
    severity: "HIGH",
    regex: /if\s*\(\s*await\s+\w+(?:\.first\(\))?\s*\.isVisible\s*\(\s*\)/g,
    description:
      "Guards assertion with isVisible() check — if element is missing, no assertion runs",
    fix: "Use expect(locator).toBeVisible() directly — it fails if missing",
  },
  {
    id: "FIXTURE_ONLY",
    name: "Fixture-only validation",
    severity: "MEDIUM",
    regex:
      /test\s*\(\s*['"`].*(?:criteria|defined|configured|persona).*['"`]/gi,
    description:
      "Test validates fixture/metadata, not app behavior — passes without any server",
    fix: "Move to unit test file or add real app interaction after metadata check",
  },
  {
    id: "CATCH_EMPTY",
    name: "Empty catch block",
    severity: "HIGH",
    regex: /\.catch\s*\(\s*\(\s*\)\s*=>\s*{\s*\/\/[^}]*}\s*\)/g,
    description:
      "Catches error with empty block or comment-only body — failure is invisible",
    fix: "Remove .catch() or add explicit failure: .catch(() => { throw new Error('Expected to succeed') })",
  },
  {
    id: "RESPONSE_CATCH_NULL",
    name: "Request with .catch(() => null)",
    severity: "CRITICAL",
    regex:
      /\.(?:get|post|put|delete|patch|fetch)\s*\([^)]*\)\s*\.catch\s*\(\s*\(\s*\)\s*=>\s*null\s*\)/g,
    description:
      "HTTP request catches network error and returns null — test proceeds as if no response is OK",
    fix: "Let network errors fail the test, or explicitly assert response exists",
  },
  {
    id: "OR_TRUTHINESS",
    name: "OR-chain truthiness check",
    severity: "HIGH",
    regex: /expect\s*\(\s*\w+\s*(?:\|\|\s*\w+\s*){2,}\)\s*\.toBeTruthy/g,
    description:
      "Chains multiple conditions with || — any single truthy value passes the whole assertion",
    fix: "Assert each condition independently or use specific value check",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function findSpecFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSpecFiles(fullPath));
    } else if (entry.name.endsWith(".spec.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

function getRelativePath(filePath) {
  return path
    .relative(path.join(__dirname, ".."), filePath)
    .replace(/\\/g, "/");
}

function getLayerFromPath(filePath) {
  const rel = getRelativePath(filePath);
  if (rel.includes("layer-0")) return "L0-Foundation";
  if (rel.includes("layer-1")) return "L1-Core";
  if (rel.includes("layer-2")) return "L2-Data";
  if (rel.includes("layer-3")) return "L3-UI";
  if (rel.includes("layer-4")) return "L4-Business";
  if (rel.includes("journeys")) return "Journeys";
  return "Unknown";
}

function extractTestNames(content) {
  const tests = [];
  const regex = /test\s*\(\s*['"`](.*?)['"`]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tests.push({
      name: match[1],
      line: content.substring(0, match.index).split("\n").length,
    });
  }
  return tests;
}

function getLineNumber(content, charIndex) {
  return content.substring(0, charIndex).split("\n").length;
}

// ── Static Analysis ────────────────────────────────────────────────────────

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const relativePath = getRelativePath(filePath);
  const layer = getLayerFromPath(filePath);
  const tests = extractTestNames(content);
  const findings = [];

  for (const pattern of ANTI_PATTERNS) {
    // Reset regex lastIndex for each file
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const line = getLineNumber(content, match.index);
      const snippet = match[0].substring(0, 80);

      // Find which test this match belongs to
      let owningTest = null;
      for (let i = tests.length - 1; i >= 0; i--) {
        if (tests[i].line <= line) {
          owningTest = tests[i].name;
          break;
        }
      }

      findings.push({
        pattern: pattern.id,
        patternName: pattern.name,
        severity: pattern.severity,
        file: relativePath,
        layer,
        line,
        snippet: snippet.trim(),
        test: owningTest || "(file-level)",
        description: pattern.description,
        fix: pattern.fix,
      });
    }
  }

  return { file: relativePath, layer, tests, findings };
}

function runStaticAnalysis() {
  const specFiles = findSpecFiles(REGRESSION_DIR);
  console.log(`Scanning ${specFiles.length} spec files for anti-patterns...\n`);

  const results = [];
  let totalFindings = 0;

  for (const file of specFiles) {
    const analysis = analyzeFile(file);
    results.push(analysis);
    totalFindings += analysis.findings.length;

    if (analysis.findings.length > 0) {
      console.log(
        `  ${analysis.layer} | ${path.basename(analysis.file)}: ${analysis.findings.length} findings`,
      );
    }
  }

  console.log(
    `\nTotal: ${totalFindings} anti-patterns across ${specFiles.length} files\n`,
  );
  return results;
}

// ── Report Generation ──────────────────────────────────────────────────────

function generateMarkdownReport(staticResults, runtimeResults) {
  const allFindings = staticResults.flatMap((r) => r.findings);
  const bySeverity = {};
  const byPattern = {};
  const byFile = {};
  const byLayer = {};

  for (const f of allFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byPattern[f.pattern] = (byPattern[f.pattern] || 0) + 1;
    byFile[f.file] = (byFile[f.file] || 0) + 1;
    byLayer[f.layer] = (byLayer[f.layer] || 0) + 1;
  }

  // Collect unique hallucinating tests (tests with at least 1 finding)
  const hallTests = new Map();
  for (const f of allFindings) {
    const key = `${f.file}::${f.test}`;
    if (!hallTests.has(key)) {
      hallTests.set(key, {
        file: f.file,
        test: f.test,
        layer: f.layer,
        patterns: [],
        maxSeverity: f.severity,
      });
    }
    const entry = hallTests.get(key);
    entry.patterns.push(f.pattern);
    if (
      f.severity === "CRITICAL" ||
      (f.severity === "HIGH" && entry.maxSeverity !== "CRITICAL")
    ) {
      entry.maxSeverity = f.severity;
    }
  }

  let md = `# Hallucinating Tests Report

**Generated:** ${new Date().toISOString().split("T")[0]}
**Sprint:** 13 — TEST-001 Determinism Gate
**Method:** Static analysis of ${staticResults.length} spec files
**Status:** ${allFindings.length} anti-patterns found across ${hallTests.size} tests

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Spec files scanned | ${staticResults.length} |
| Anti-patterns found | ${allFindings.length} |
| Tests with hallucination risk | ${hallTests.size} |
| CRITICAL severity | ${bySeverity["CRITICAL"] || 0} |
| HIGH severity | ${bySeverity["HIGH"] || 0} |
| MEDIUM severity | ${bySeverity["MEDIUM"] || 0} |

### By Layer

| Layer | Findings |
|-------|----------|
${Object.entries(byLayer)
  .sort((a, b) => b[1] - a[1])
  .map(([layer, count]) => `| ${layer} | ${count} |`)
  .join("\n")}

### By Anti-Pattern

| Pattern | ID | Count | Severity |
|---------|-----|-------|----------|
${ANTI_PATTERNS.filter((p) => byPattern[p.id])
  .sort((a, b) => (byPattern[b.id] || 0) - (byPattern[a.id] || 0))
  .map(
    (p) => `| ${p.name} | ${p.id} | ${byPattern[p.id] || 0} | ${p.severity} |`,
  )
  .join("\n")}

---

## Anti-Pattern Definitions

${ANTI_PATTERNS.map(
  (p) => `### ${p.id}: ${p.name} (${p.severity})

**What:** ${p.description}

**Fix:** ${p.fix}
`,
).join("\n")}

---

## Findings by File

`;

  // Group findings by file
  const fileGroups = {};
  for (const f of allFindings) {
    if (!fileGroups[f.file]) fileGroups[f.file] = [];
    fileGroups[f.file].push(f);
  }

  for (const [file, findings] of Object.entries(fileGroups).sort()) {
    const layer = findings[0].layer;
    md += `### ${file} (${layer})\n\n`;
    md += `| Line | Test | Pattern | Severity | Snippet |\n`;
    md += `|------|------|---------|----------|---------|\n`;

    for (const f of findings.sort((a, b) => a.line - b.line)) {
      const testShort =
        f.test.length > 40 ? f.test.substring(0, 37) + "..." : f.test;
      const snipShort =
        f.snippet.length > 50 ? f.snippet.substring(0, 47) + "..." : f.snippet;
      md += `| ${f.line} | ${testShort} | ${f.pattern} | ${f.severity} | \`${snipShort}\` |\n`;
    }
    md += "\n";
  }

  // Runtime results section
  if (runtimeResults) {
    md += `---

## Runtime Determinism Results

**Method:** Ran regression suite with all API routes returning 503.
**Tests that passed with backend down are hallucinating.**

| Result | Count |
|--------|-------|
| Total tests run | ${runtimeResults.total} |
| Passed (hallucinating) | ${runtimeResults.passed} |
| Failed (correct behavior) | ${runtimeResults.failed} |
| Skipped | ${runtimeResults.skipped} |
| Hallucination rate | ${((runtimeResults.passed / runtimeResults.total) * 100).toFixed(1)}% |

### Hallucinating Tests (Passed with Backend Down)

${
  runtimeResults.hallucinatingTests.length > 0
    ? runtimeResults.hallucinatingTests
        .map((t) => `- \`${t.file}\`: **${t.name}**`)
        .join("\n")
    : "_No runtime results available_"
}
`;
  }

  md += `---

## Next Steps (TEST-002)

1. Fix CRITICAL findings first (error swallowing, request catch-null)
2. Fix HIGH findings (multi-status, conditional assertions, multi-selectors)
3. Convert MEDIUM findings (fixture-only tests) to unit tests
4. Re-run determinism gate to verify fixes
5. Target: 0 CRITICAL, 0 HIGH findings

---

_Generated by \`scripts/test-determinism-gate.js\` — Sprint 13 TEST-001_
`;

  return md;
}

function generateJsonReport(staticResults, runtimeResults) {
  const allFindings = staticResults.flatMap((r) => r.findings);
  return {
    generated: new Date().toISOString(),
    sprint: 13,
    task: "TEST-001",
    method: "static-analysis",
    summary: {
      files_scanned: staticResults.length,
      total_findings: allFindings.length,
      by_severity: allFindings.reduce((acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      }, {}),
      by_pattern: allFindings.reduce((acc, f) => {
        acc[f.pattern] = (acc[f.pattern] || 0) + 1;
        return acc;
      }, {}),
      by_layer: allFindings.reduce((acc, f) => {
        acc[f.layer] = (acc[f.layer] || 0) + 1;
        return acc;
      }, {}),
    },
    findings: allFindings,
    runtime: runtimeResults || null,
  };
}

// ── Runtime Mode ───────────────────────────────────────────────────────────

function runRuntimeGate() {
  console.log(
    "Runtime determinism gate: running tests with API routes blocked...\n",
  );
  console.log(
    "Setting DETERMINISM_GATE=1 to activate route blocking in fixtures.\n",
  );

  try {
    // Run with determinism gate env var — tests should use this to block API routes
    const result = execSync(
      "npx playwright test --project=regression-all --reporter=json",
      {
        cwd: path.join(__dirname, ".."),
        env: {
          ...process.env,
          DETERMINISM_GATE: "1",
          // Force fresh server start
          PW_TEST_REUSE_CONTEXT: "false",
        },
        timeout: 300000, // 5 minute timeout
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const jsonResult = JSON.parse(result);
    const suites = jsonResult.suites || [];
    const tests = [];

    function extractTests(suite) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          tests.push({
            name: spec.title,
            file: suite.file || "",
            status: test.status,
          });
        }
      }
      for (const child of suite.suites || []) {
        extractTests(child);
      }
    }
    suites.forEach(extractTests);

    const passed = tests.filter((t) => t.status === "expected");
    const failed = tests.filter(
      (t) => t.status === "unexpected" || t.status === "flaky",
    );
    const skipped = tests.filter((t) => t.status === "skipped");

    return {
      total: tests.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
      hallucinatingTests: passed.map((t) => ({
        name: t.name,
        file: t.file,
      })),
    };
  } catch (error) {
    // Playwright exits non-zero when tests fail — this is expected
    console.log("Runtime gate completed (some tests failed as expected).\n");

    // Try to parse JSON from stdout
    try {
      const stdout = error.stdout || "";
      const jsonStart = stdout.indexOf("{");
      if (jsonStart >= 0) {
        const jsonResult = JSON.parse(stdout.substring(jsonStart));
        const tests = [];

        function extractTests(suite) {
          for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
              tests.push({
                name: spec.title,
                file: suite.file || "",
                status: test.status,
              });
            }
          }
          for (const child of suite.suites || []) {
            extractTests(child);
          }
        }
        (jsonResult.suites || []).forEach(extractTests);

        const passed = tests.filter((t) => t.status === "expected");
        const failed = tests.filter(
          (t) => t.status === "unexpected" || t.status === "flaky",
        );
        const skipped = tests.filter((t) => t.status === "skipped");

        return {
          total: tests.length,
          passed: passed.length,
          failed: failed.length,
          skipped: skipped.length,
          hallucinatingTests: passed.map((t) => ({
            name: t.name,
            file: t.file,
          })),
        };
      }
    } catch {
      // JSON parse failed
    }

    console.log(
      "Could not parse runtime results. Run manually with:\n" +
        "  DETERMINISM_GATE=1 npx playwright test --project=regression-all\n",
    );
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const doRuntime = args.includes("--runtime");
  const doJson = args.includes("--json");
  const outputIdx = args.indexOf("--output");
  const outputPath =
    outputIdx >= 0 && args[outputIdx + 1]
      ? path.resolve(args[outputIdx + 1])
      : DEFAULT_OUTPUT;

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Determinism Gate — TEST-001 (Sprint 13)    ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Phase 1: Static analysis
  console.log("Phase 1: Static Analysis\n");
  const staticResults = runStaticAnalysis();

  // Phase 2: Runtime (optional)
  let runtimeResults = null;
  if (doRuntime) {
    console.log("Phase 2: Runtime Determinism Gate\n");
    runtimeResults = runRuntimeGate();
  }

  // Phase 3: Generate reports
  console.log("Generating reports...\n");

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const mdReport = generateMarkdownReport(staticResults, runtimeResults);
  fs.writeFileSync(outputPath, mdReport, "utf-8");
  console.log(`  Markdown report: ${getRelativePath(outputPath)}`);

  if (doJson) {
    const jsonReport = generateJsonReport(staticResults, runtimeResults);
    const jsonPath =
      outputIdx >= 0 ? outputPath.replace(/\.md$/, ".json") : JSON_OUTPUT;
    const jsonDir = path.dirname(jsonPath);
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), "utf-8");
    console.log(`  JSON report: ${getRelativePath(jsonPath)}`);
  }

  // Summary
  const totalFindings = staticResults.reduce(
    (sum, r) => sum + r.findings.length,
    0,
  );
  const critical = staticResults.reduce(
    (sum, r) =>
      sum + r.findings.filter((f) => f.severity === "CRITICAL").length,
    0,
  );
  const high = staticResults.reduce(
    (sum, r) => sum + r.findings.filter((f) => f.severity === "HIGH").length,
    0,
  );

  console.log("\n══════════════════════════════════════════════");
  console.log(`  TOTAL: ${totalFindings} anti-patterns found`);
  console.log(
    `  CRITICAL: ${critical}  |  HIGH: ${high}  |  MEDIUM: ${totalFindings - critical - high}`,
  );
  if (runtimeResults) {
    console.log(
      `  RUNTIME: ${runtimeResults.passed}/${runtimeResults.total} tests hallucinating (${((runtimeResults.passed / runtimeResults.total) * 100).toFixed(1)}%)`,
    );
  }
  console.log("══════════════════════════════════════════════\n");

  // Exit with non-zero if critical findings exist
  if (critical > 0) {
    console.log(
      "EXIT 1: CRITICAL anti-patterns found. Fix before trusting test results.\n",
    );
    process.exit(1);
  }
}

main();
