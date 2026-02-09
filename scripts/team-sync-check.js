/**
 * Team Sync Verification Script
 * Sprint 13 — SYNC-001
 *
 * Verifies that a developer's local environment matches team requirements.
 * Checks: Node version, git hooks, MCP servers, env vars, sprint context.
 *
 * Run: npm run team:check
 * Or:  node scripts/team-sync-check.js
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks failed (advisory — does NOT break npm install)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

class TeamSyncChecker {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.warned = 0;
    this.failed = 0;
  }

  pass(category, message) {
    this.results.push({ status: "PASS", category, message });
    this.passed++;
  }

  warn(category, message, fix) {
    this.results.push({ status: "WARN", category, message, fix });
    this.warned++;
  }

  fail(category, message, fix) {
    this.results.push({ status: "FAIL", category, message, fix });
    this.failed++;
  }

  // ── Node.js version ──────────────────────────────────────────────────
  checkNodeVersion() {
    const version = process.version;
    const major = parseInt(version.slice(1).split(".")[0], 10);
    if (major >= 20) {
      this.pass("Node.js", `Version ${version} (>= 20 required)`);
    } else {
      this.fail(
        "Node.js",
        `Version ${version} — Node 20+ required`,
        "Install Node 20+ via nvm: nvm install 20 && nvm use 20",
      );
    }
  }

  // ── Git hooks ────────────────────────────────────────────────────────
  checkGitHooks() {
    const huskyDir = path.join(ROOT, ".husky");
    const preCommit = path.join(huskyDir, "pre-commit");
    const commitMsg = path.join(huskyDir, "commit-msg");

    if (fs.existsSync(preCommit) && fs.existsSync(commitMsg)) {
      this.pass("Git Hooks", "pre-commit and commit-msg hooks installed");
    } else {
      this.fail(
        "Git Hooks",
        "Husky hooks missing — commits won't be linted",
        "Run: npm install (husky auto-installs via prepare script)",
      );
    }
  }

  // ── Protection guard hook ────────────────────────────────────────────
  checkProtectionGuard() {
    const hookScript = path.join(
      ROOT,
      ".claude",
      "hooks",
      "protection-guard.js",
    );
    const settingsFile = path.join(ROOT, ".claude", "settings.json");

    if (fs.existsSync(hookScript) && fs.existsSync(settingsFile)) {
      this.pass("Protection Guard", "Hook script and settings.json present");
    } else if (!fs.existsSync(hookScript)) {
      this.fail(
        "Protection Guard",
        "protection-guard.js missing — HANDS OFF files unprotected",
        "Run: git pull origin dev (hook is committed to repo)",
      );
    } else {
      this.fail(
        "Protection Guard",
        "settings.json missing — hook won't fire",
        "Run: git pull origin dev (settings.json is committed to repo)",
      );
    }
  }

  // ── MCP servers ──────────────────────────────────────────────────────
  checkMcpServers() {
    const mcpFile = path.join(ROOT, ".mcp.json");
    if (!fs.existsSync(mcpFile)) {
      this.warn(
        "MCP Servers",
        ".mcp.json not found — Cubic codebase intelligence unavailable",
        "Copy from TEAM_SETUP_GUIDE.md Section 4: MCP Server Configuration",
      );
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
      const servers = config.mcpServers || {};

      if (servers.cubic) {
        this.pass("MCP Servers", "Cubic MCP server configured");
      } else {
        this.warn(
          "MCP Servers",
          "Cubic MCP server not in .mcp.json",
          "Add cubic config per TEAM_SETUP_GUIDE.md Section 4",
        );
      }
    } catch {
      this.warn(
        "MCP Servers",
        ".mcp.json exists but is not valid JSON",
        "Check .mcp.json syntax",
      );
    }
  }

  // ── Environment variables ────────────────────────────────────────────
  checkEnvVars() {
    const envFile = path.join(ROOT, ".env");
    if (!fs.existsSync(envFile)) {
      this.fail(
        "Environment",
        ".env file missing",
        "Copy .env.example to .env and fill in values",
      );
      return;
    }

    const envContent = fs.readFileSync(envFile, "utf8");

    // Required vars that must have real values (not placeholder text)
    // Add your project-specific required environment variables here
    const required = [
      // Example required vars (uncomment and customize for your project):
      // { key: "DATABASE_URL", placeholder: "your_database" },
      // { key: "API_KEY", placeholder: "your_api_key" },
      // { key: "SECRET_KEY", placeholder: "your_secret" },
    ];

    // E2E test vars — warn if missing (not required for dev)
    // Add your project-specific test credentials here
    const e2eVars = [
      // Example E2E vars (uncomment and customize for your project):
      // { key: "TEST_USER_EMAIL", placeholder: "your_test" },
      // { key: "TEST_USER_PASSWORD", placeholder: "your_test" },
    ];

    let missingRequired = [];
    for (const { key, placeholder } of required) {
      const regex = new RegExp(`^${key}=(.+)$`, "m");
      const match = envContent.match(regex);
      if (!match || match[1].includes(placeholder)) {
        missingRequired.push(key);
      }
    }

    if (missingRequired.length === 0) {
      this.pass("Environment", "All required env vars configured");
    } else {
      this.fail(
        "Environment",
        `Missing/placeholder env vars: ${missingRequired.join(", ")}`,
        "Update .env with real values (see .env.example for guidance)",
      );
    }

    // E2E vars — advisory only
    let missingE2e = [];
    for (const { key, placeholder } of e2eVars) {
      const regex = new RegExp(`^${key}=(.+)$`, "m");
      const match = envContent.match(regex);
      if (!match || match[1].includes(placeholder)) {
        missingE2e.push(key);
      }
    }

    if (missingE2e.length > 0) {
      this.warn(
        "Environment (E2E)",
        `E2E test vars not set: ${missingE2e.join(", ")}`,
        "Set E2E test credentials for Playwright tests",
      );
    } else {
      this.pass("Environment (E2E)", "E2E test credentials configured");
    }
  }

  // ── Sprint context ───────────────────────────────────────────────────
  checkSprintContext() {
    const sprintDir = path.join(ROOT, "sprints");
    if (!fs.existsSync(sprintDir)) {
      this.warn("Sprint", "sprints/ directory not found");
      return;
    }

    const files = fs
      .readdirSync(sprintDir)
      .filter((f) => f.startsWith("ACTIVE_SPRINT_"));
    if (files.length === 0) {
      this.warn(
        "Sprint",
        "No active sprint TOML found",
        "Check sprints/ directory for ACTIVE_SPRINT_*.toml files",
      );
      return;
    }

    // Find highest sprint number (numeric sort, not alphabetical)
    const latest = files
      .sort((a, b) => {
        const numA = parseInt(a.match(/ACTIVE_SPRINT_(\d+)/)?.[1] || "0", 10);
        const numB = parseInt(b.match(/ACTIVE_SPRINT_(\d+)/)?.[1] || "0", 10);
        return numA - numB;
      })
      .pop();
    this.pass("Sprint", `Active sprint: ${latest.replace(".toml", "")}`);
  }

  // ── Git branch ───────────────────────────────────────────────────────
  checkGitBranch() {
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();

      const behindMain = this.getBehindCount("main");
      const behindDev = this.getBehindCount("dev");

      this.pass("Git Branch", `Current: ${branch}`);

      if (behindDev !== null && behindDev > 50) {
        this.warn(
          "Git Branch",
          `${behindDev} commits behind dev — consider rebasing`,
          `Run: git pull origin dev`,
        );
      }
    } catch {
      this.warn("Git Branch", "Could not determine git branch");
    }
  }

  getBehindCount(remoteBranch) {
    try {
      const output = execSync(
        `git rev-list --count HEAD..origin/${remoteBranch}`,
        { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
      return parseInt(output, 10);
    } catch {
      return null;
    }
  }

  // ── Node modules ─────────────────────────────────────────────────────
  checkNodeModules() {
    const nodeModules = path.join(ROOT, "node_modules");
    if (fs.existsSync(nodeModules)) {
      this.pass("Dependencies", "node_modules present");
    } else {
      this.fail("Dependencies", "node_modules missing", "Run: npm install");
    }
  }

  // ── Run all checks ───────────────────────────────────────────────────
  run() {
    console.log("\n  Team Sync Check\n  ================\n");

    this.checkNodeVersion();
    this.checkNodeModules();
    this.checkGitHooks();
    this.checkProtectionGuard();
    this.checkMcpServers();
    this.checkEnvVars();
    this.checkSprintContext();
    this.checkGitBranch();

    // Print results
    for (const r of this.results) {
      const icon =
        r.status === "PASS"
          ? "  [PASS]"
          : r.status === "WARN"
            ? "  [WARN]"
            : "  [FAIL]";
      console.log(`${icon} ${r.category}: ${r.message}`);
      if (r.fix) {
        console.log(`         Fix: ${r.fix}`);
      }
    }

    // Summary
    console.log(
      `\n  Summary: ${this.passed} passed, ${this.warned} warnings, ${this.failed} failed\n`,
    );

    if (this.failed > 0) {
      console.log(
        "  Action required: fix FAIL items above before starting work.\n",
      );
      return 1;
    }
    if (this.warned > 0) {
      console.log(
        "  Warnings are advisory — environment is functional but not optimal.\n",
      );
      return 0;
    }
    console.log("  Environment is fully configured.\n");
    return 0;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
const checker = new TeamSyncChecker();
const exitCode = checker.run();
process.exit(exitCode);
