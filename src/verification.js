"use strict";

const fs = require("fs");
const path = require("path");
const { logger, fileContains } = require("./utils");

/** Entry files that must import "./global.css" for styles to load. */
const ENTRY_FILES = [
  "App.tsx",
  "App.ts",
  "App.jsx",
  "App.js",
  "app/_layout.tsx",
  "app/_layout.ts",
  "app/_layout.jsx",
  "app/_layout.js",
  "src/app/_layout.tsx",
  "src/app/_layout.ts",
  "src/app/_layout.jsx",
  "src/app/_layout.js",
];

/** All extensions Tailwind v3 may resolve a config from. */
const TAILWIND_EXTS = ["js", "cjs", "mjs", "ts", "cts", "mts"];

/** Returns the tailwind config files present in a directory. */
function findTailwindConfigs(dir) {
  return TAILWIND_EXTS.map((ext) =>
    path.join(dir, `tailwind.config.${ext}`)
  ).filter((p) => fs.existsSync(p));
}

/**
 * Returns true when a known entry file imports global.css.
 *
 * @param {string} dir
 * @returns {string|null} relative path of the entry that imports it, or null
 */
function findGlobalCssImporter(dir) {
  for (const rel of ENTRY_FILES) {
    const abs = path.join(dir, rel);
    if (fs.existsSync(abs) && fileContains(abs, "global.css")) return rel;
  }
  return null;
}

/** True when the project is TypeScript (tsconfig present). */
function isTypeScriptProject(dir) {
  return fs.existsSync(path.join(dir, "tsconfig.json"));
}

/**
 * Runs post-install verification checks on the configured project directory.
 *
 * @param {string} dir - project directory to verify
 * @returns {{ passed: boolean, issues: string[] }}
 */
function verify(dir) {
  const checks = [
    {
      name: "nativewind installed",
      pass: () =>
        fs.existsSync(path.join(dir, "node_modules", "nativewind")),
    },
    {
      name: "tailwindcss installed",
      pass: () =>
        fs.existsSync(path.join(dir, "node_modules", "tailwindcss")),
    },
    {
      name: "tailwind config exists",
      pass: () => findTailwindConfigs(dir).length > 0,
    },
    {
      name: "tailwind config has nativewind/preset",
      pass: () =>
        findTailwindConfigs(dir).some((p) =>
          fileContains(p, "nativewind/preset")
        ),
    },
    {
      name: "only one tailwind config present (no shadowing)",
      pass: () => findTailwindConfigs(dir).length <= 1,
    },
    {
      name: "global.css exists",
      pass: () => fs.existsSync(path.join(dir, "global.css")),
    },
    {
      name: "global.css has @tailwind directives",
      pass: () => fileContains(path.join(dir, "global.css"), "@tailwind"),
    },
    {
      name: "entry file imports global.css",
      pass: () => findGlobalCssImporter(dir) !== null,
    },
    {
      name: "babel.config.js has nativewind/babel",
      pass: () =>
        fileContains(path.join(dir, "babel.config.js"), "nativewind/babel"),
    },
    {
      name: "metro.config.js has withNativeWind",
      pass: () =>
        fileContains(path.join(dir, "metro.config.js"), "withNativeWind"),
    },
  ];

  // TypeScript-only check: className props must type-check.
  if (isTypeScriptProject(dir)) {
    checks.push({
      name: "nativewind-env.d.ts present (TypeScript)",
      pass: () =>
        fileContains(path.join(dir, "nativewind-env.d.ts"), "nativewind/types"),
    });
  }

  const issues = [];
  const results = [];

  for (const check of checks) {
    let passed;
    try {
      passed = check.pass();
    } catch {
      passed = false;
    }
    results.push({ name: check.name, passed });
    if (!passed) issues.push(check.name);
  }

  // Print table
  logger.blank();
  console.log("  Verification results:");
  console.log("  " + "─".repeat(48));
  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    const label = r.passed ? `\x1b[32m${icon}\x1b[0m` : `\x1b[31m${icon}\x1b[0m`;
    console.log(`  ${label}  ${r.name}`);
  }
  console.log("  " + "─".repeat(48));
  logger.blank();

  return { passed: issues.length === 0, issues };
}

module.exports = {
  verify,
  // Exported for tests
  ENTRY_FILES,
  findTailwindConfigs,
  findGlobalCssImporter,
  isTypeScriptProject,
};
