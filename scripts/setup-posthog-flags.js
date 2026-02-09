#!/usr/bin/env node
/**
 * PostHog Feature Flags Setup Script
 *
 * Creates all required feature flags in PostHog.
 * Run once to initialize flags for the project.
 *
 * Usage:
 *   POSTHOG_PERSONAL_API_KEY=phx_xxx node scripts/setup-posthog-flags.js
 *
 * Or set the key in .env.local and run:
 *   node scripts/setup-posthog-flags.js
 *
 * Get your Personal API Key from:
 *   PostHog → Settings → Personal API keys → Create key
 */

require("dotenv").config(); // Load from .env

// Note: API host is different from ingest host (us.posthog.com vs us.i.posthog.com)
const POSTHOG_HOST = "https://us.posthog.com";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID || "232321";
const PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PERSONAL_API_KEY) {
  console.error("❌ POSTHOG_PERSONAL_API_KEY is required");
  console.error("");
  console.error("Get your Personal API Key from:");
  console.error("  PostHog → Settings → Personal API keys → Create key");
  console.error("");
  console.error("Then run:");
  console.error(
    "  POSTHOG_PERSONAL_API_KEY=phx_xxx node scripts/setup-posthog-flags.js",
  );
  process.exit(1);
}

// Feature flags to create
// Add your project-specific feature flags here
const FLAGS = [
  // Example flag structure (uncomment and customize for your project):
  // {
  //   key: "env-merge-enabled",
  //   name: "Master Switch - All Features",
  //   description:
  //     "Master switch for all features. Must be enabled for any other flags to work.",
  //   active: false, // Start disabled
  //   filters: { groups: [{ properties: [], rollout_percentage: 100 }] },
  // },
  // {
  //   key: "FF_TOKEN_ECONOMY_ENABLED",
  //   name: "Token Economy - Core",
  //   description:
  //     "Enables token economy system (balance tracking, ledger entries).",
  //   active: false,
  //   filters: { groups: [{ properties: [], rollout_percentage: 100 }] },
  // },
  // {
  //   key: "FF_TOKEN_DEDUCTION",
  //   name: "Token Economy - Deduction",
  //   description:
  //     "Enables token deduction after operations. Requires FF_TOKEN_ECONOMY_ENABLED.",
  //   active: false,
  //   filters: { groups: [{ properties: [], rollout_percentage: 100 }] },
  // },
];

// Flag dependencies (child flag requires parent flag to be enabled)
// eslint-disable-next-line no-unused-vars
const FLAG_DEPENDENCIES = {
  // Example dependency structure (uncomment and customize):
  // FF_TOKEN_DEDUCTION: ["FF_TOKEN_ECONOMY_ENABLED"],
  // FF_COLLISION_DETECTION: ["FF_GCL_TRACKING"],
  // FF_REFINE_V2: ["FF_WAREHOUSE_METADATA_SUPABASE"],
};

async function createFlag(flag) {
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERSONAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(flag),
    });

    if (response.status === 201) {
      console.log(`✅ Created: ${flag.key}`);
      return { success: true, key: flag.key };
    }

    if (response.status === 400) {
      const error = await response.json();
      // Check if already exists
      if (
        error.detail?.includes("already exists") ||
        error.key?.[0]?.includes("already exists")
      ) {
        console.log(`⏭️  Exists: ${flag.key}`);
        return { success: true, key: flag.key, exists: true };
      }
      console.error(`❌ Failed: ${flag.key}`, error);
      return { success: false, key: flag.key, error };
    }

    const error = await response.text();
    console.error(`❌ Failed: ${flag.key} (${response.status})`, error);
    return { success: false, key: flag.key, error };
  } catch (err) {
    console.error(`❌ Error: ${flag.key}`, err.message);
    return { success: false, key: flag.key, error: err.message };
  }
}

async function listFlags() {
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list flags: ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

async function enableFlag(flagId, flagKey) {
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/${flagId}/`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active: true }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to enable ${flagKey}: ${response.status} - ${error}`,
    );
  }

  return await response.json();
}

async function main() {
  const mode = process.argv[2] || "enable"; // 'create' or 'enable'

  console.log("");
  console.log("🚀 PostHog Feature Flags Setup");
  console.log("================================");
  console.log(`Project ID: ${POSTHOG_PROJECT_ID}`);
  console.log(`Host: ${POSTHOG_HOST}`);
  console.log(`Mode: ${mode}`);
  console.log("");

  if (mode === "create") {
    // Create flags
    const results = [];
    for (const flag of FLAGS) {
      const result = await createFlag(flag);
      results.push(result);
    }

    console.log("");
    console.log("================================");
    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`✅ Success: ${success}/${FLAGS.length}`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed}/${FLAGS.length}`);
    }
  } else if (mode === "enable") {
    // Enable all flags
    console.log("📋 Fetching existing flags...");
    const existingFlags = await listFlags();
    console.log(`   Found ${existingFlags.length} flags\n`);

    // Create map
    const flagMap = {};
    existingFlags.forEach((f) => {
      flagMap[f.key] = f;
    });

    // Enable each flag
    const flagKeys = FLAGS.map((f) => f.key);

    for (const flagKey of flagKeys) {
      const existing = flagMap[flagKey];

      if (!existing) {
        console.log(
          `⚠️  ${flagKey}: NOT FOUND - run 'node scripts/setup-posthog-flags.js create' first`,
        );
        continue;
      }

      if (existing.active) {
        console.log(`✅ ${flagKey}: Already ENABLED`);
        continue;
      }

      try {
        await enableFlag(existing.id, flagKey);
        console.log(`✅ ${flagKey}: ENABLED`);
      } catch (err) {
        console.error(`❌ ${flagKey}: ${err.message}`);
      }
    }

    console.log("");
    console.log("================================");
    console.log("✅ All flags enabled!");
  } else {
    console.log("Usage:");
    console.log(
      "  node scripts/setup-posthog-flags.js enable  # Enable all flags (default)",
    );
    console.log(
      "  node scripts/setup-posthog-flags.js create  # Create flags if missing",
    );
  }

  console.log("");
}

main().catch(console.error);
