#!/usr/bin/env node

/**
 * Claude Code PreToolUse Hook: Protection Guard
 *
 * Runs automatically before every Edit/Write operation in Claude Code.
 * Blocks modifications to HANDS OFF areas and @protected files.
 *
 * How it works:
 * - Receives JSON on stdin with { tool_name, tool_input }
 * - Extracts file_path from tool_input
 * - Checks overrides file for approved exceptions
 * - Checks against HANDS OFF patterns (instant, no I/O)
 * - Checks file for protection markers (reads first 50 lines)
 * - Exit 0 = allow, Exit 2 = block
 *
 * Override system:
 * - Create .claude/hooks/protection-overrides.json to approve specific files
 * - Each override requires: file (path or pattern), task (ID), approver, expires (ISO date)
 * - Expired overrides are ignored automatically
 * - Override file is NOT committed to git (.gitignore it) — each session creates its own
 *
 * Configuration: .claude/settings.json → hooks.PreToolUse
 */

const fs = require("fs");
const path = require("path");

// HANDS OFF patterns — files that cannot be modified by AI
// Add your project-specific critical files here
const HANDS_OFF_PATTERNS = [
  // Examples (uncomment and customize for your project):
  //   "src/components/CriticalFeature.tsx",
  //   "src/services/PaymentProcessor/",
  //   "lib/security/Authentication.ts",
];

// Self-protection: the guard cannot be modified by the agent it polices
const SELF_PROTECTED_PATTERNS = [
  ".claude/hooks/",
  ".claude/settings.json",
  ".ai-code-protection.md",
];

// Protection markers that require approval before modification
const PROTECTION_MARKERS = [
  "@protected",
  "@immutable",
  "@maintainable",
  "AI-PROTECTED CODE",
  "DO NOT MODIFY WITHOUT APPROVAL",
];

// Path to overrides file (session-specific, not committed to git)
const OVERRIDES_FILE = path.join(__dirname, "protection-overrides.json");

/**
 * Load active overrides from protection-overrides.json
 *
 * Format:
 * [
 *   {
 *     "file": "src/components/CriticalComponent.tsx",
 *     "task": "BUG-042",
 *     "approver": "Your Name",
 *     "reason": "Fix crash on edge case",
 *     "expires": "2026-02-10T00:00:00Z"
 *   }
 * ]
 */
function loadOverrides() {
  try {
    if (!fs.existsSync(OVERRIDES_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(OVERRIDES_FILE, "utf-8");
    const overrides = JSON.parse(raw);
    if (!Array.isArray(overrides)) return [];

    const now = new Date();
    // Filter out expired overrides
    return overrides.filter((o) => {
      if (!o.file || !o.task || !o.approver || !o.expires) return false;
      return new Date(o.expires) > now;
    });
  } catch {
    return [];
  }
}

function isOverridden(filePath, overrides) {
  const normalized = normalizeFilePath(filePath);
  for (const override of overrides) {
    const overrideNorm = normalizeFilePath(override.file);
    // Match exact path or pattern (override "src/components/Feature/" matches any file under it)
    if (normalized.includes(overrideNorm) || normalized === overrideNorm) {
      return override;
    }
  }
  return null;
}

function normalizeFilePath(filePath) {
  // Normalize to forward slashes for consistent matching
  return filePath.replace(/\\/g, "/");
}

function isSelfProtected(filePath) {
  const normalized = normalizeFilePath(filePath);
  for (const pattern of SELF_PROTECTED_PATTERNS) {
    if (normalized.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

function isHandsOff(filePath) {
  const normalized = normalizeFilePath(filePath);
  for (const pattern of HANDS_OFF_PATTERNS) {
    if (normalized.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

function hasProtectionMarker(filePath) {
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return null; // New file, no markers to check
    }

    const content = fs.readFileSync(resolved, "utf-8");
    const firstLines = content.split("\n").slice(0, 50).join("\n");

    for (const marker of PROTECTION_MARKERS) {
      if (firstLines.includes(marker)) {
        return marker;
      }
    }
  } catch {
    // File unreadable — allow (don't block on errors)
  }
  return null;
}

async function main() {
  let input = "";

  // Read JSON from stdin
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    // Can't parse input — allow to avoid blocking on hook errors
    process.exit(0);
  }

  const toolInput = data.tool_input || {};
  const filePath = toolInput.file_path;

  if (!filePath) {
    // No file path (e.g., non-file tool) — allow
    process.exit(0);
  }

  // Check 0: Self-protection — ALWAYS block, no overrides possible
  // The agent must never modify its own guardrails
  const selfMatch = isSelfProtected(filePath);
  if (selfMatch) {
    process.stdout.write(
      `BLOCKED: Guardrail self-protection\n` +
        `File: ${filePath}\n` +
        `Pattern: ${selfMatch}\n` +
        `The AI agent cannot modify its own enforcement system.\n` +
        `These files must be edited by a human directly in their editor.\n`
    );
    process.exit(2);
  }

  // Load approved overrides (session-specific)
  let overrides = [];
  let activeOverride = null;
  try {
    overrides = loadOverrides();
    activeOverride = isOverridden(filePath, overrides);
  } catch {
    // Override loading failed — continue without overrides (fail-closed for HANDS OFF)
  }

  // Check 1: HANDS OFF areas (instant, no I/O)
  // FAIL-CLOSED: if anything errors during a HANDS OFF check, block anyway
  let handsOffMatch = null;
  try {
    handsOffMatch = isHandsOff(filePath);
  } catch {
    // Path check failed — if we can't verify, block it
    process.stdout.write(
      `BLOCKED: Unable to verify file safety\n` +
        `File: ${filePath}\n` +
        `The path check encountered an error. Blocking to be safe.\n`
    );
    process.exit(2);
  }
  if (handsOffMatch) {
    if (activeOverride) {
      process.stdout.write(
        `OVERRIDE ACTIVE — HANDS OFF bypass approved\n` +
          `File: ${filePath}\n` +
          `Task: ${activeOverride.task}\n` +
          `Approver: ${activeOverride.approver}\n` +
          `Reason: ${activeOverride.reason || "N/A"}\n` +
          `Expires: ${activeOverride.expires}\n` +
          `Proceeding with caution — do NOT modify unrelated code in this file.\n`
      );
      process.exit(0);
    }
    process.stdout.write(
      `BLOCKED: HANDS OFF area\n` +
        `File: ${filePath}\n` +
        `Pattern: ${handsOffMatch}\n` +
        `These files are owned by dedicated engineers and cannot be modified by AI.\n` +
        `See CLAUDE.md "HANDS OFF Areas" for details.\n\n` +
        `To approve an override, create .claude/hooks/protection-overrides.json:\n` +
        `[\n` +
        `  {\n` +
        `    "file": "${handsOffMatch}",\n` +
        `    "task": "TASK-ID",\n` +
        `    "approver": "Your Name",\n` +
        `    "reason": "Why this change is needed",\n` +
        `    "expires": "${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]}T23:59:59Z"\n` +
        `  }\n` +
        `]\n`
    );
    process.exit(2);
  }

  // Check 2: Protection markers (reads file, but only first 50 lines)
  const marker = hasProtectionMarker(filePath);
  if (marker) {
    if (activeOverride) {
      process.stdout.write(
        `OVERRIDE ACTIVE — @protected bypass approved\n` +
          `File: ${filePath}\n` +
          `Task: ${activeOverride.task}\n` +
          `Approver: ${activeOverride.approver}\n` +
          `Reason: ${activeOverride.reason || "N/A"}\n` +
          `Expires: ${activeOverride.expires}\n` +
          `Proceeding with caution — minimize changes to protected sections.\n`
      );
      process.exit(0);
    }
    process.stdout.write(
      `BLOCKED: Protected code\n` +
        `File: ${filePath}\n` +
        `Marker: ${marker}\n` +
        `This file contains protection markers and requires owner approval before modification.\n` +
        `Check .ai-code-protection.md for the owner and get approval first.\n\n` +
        `To approve an override, create .claude/hooks/protection-overrides.json:\n` +
        `[\n` +
        `  {\n` +
        `    "file": "${normalizeFilePath(filePath)}",\n` +
        `    "task": "TASK-ID",\n` +
        `    "approver": "Your Name",\n` +
        `    "reason": "Why this change is needed",\n` +
        `    "expires": "${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]}T23:59:59Z"\n` +
        `  }\n` +
        `]\n`
    );
    process.exit(2);
  }

  // All checks passed — allow
  process.exit(0);
}

main();
