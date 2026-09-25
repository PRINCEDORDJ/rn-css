"use strict";

const path = require("path");
const fs = require("fs");
const { Command } = require("commander");

const { logger, readJsonFile, fileContains } = require("./utils");
const { detectProject, detectPackageManager } = require("./projectDetector");
const { createExpoProject } = require("./expo");
const { installNativeWind, installTailwindDeps } = require("./nativewind");
const {
  writeTailwindConfig,
  writeGlobalCss,
  writeBabelConfig,
  writeMetroConfig,
  writeNativeWindTypes,
  writePrettierConfig,
  writeAppTsx,
  ensureComponentsDir,
} = require("./configuration");
const { verify } = require("./verification");
const { confirm } = require("./prompts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when a project name is valid (npm-ish rules, letters allowed to start). */
function isValidName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/** Validates a React Native project name. */
function validateName(name) {
  if (!isValidName(name)) {
    logger.error(
      "Invalid project name. It must start with a letter or number and contain only letters, numbers, hyphens, underscores or dots."
    );
    process.exit(1);
  }
}

/**
 * Decides whether the CLI argument targets an existing project or should
 * scaffold a new one.
 *
 * @param {string} nameOrPath
 * @param {string} [cwd] - working directory to resolve against
 * @returns {"existing" | "new"}
 */
function classifyTarget(nameOrPath, cwd = process.cwd()) {
  const isExistingPath =
    nameOrPath === "." ||
    nameOrPath.startsWith("./") ||
    nameOrPath.startsWith("../") ||
    (fs.existsSync(path.resolve(cwd, nameOrPath)) &&
      fs.existsSync(path.join(path.resolve(cwd, nameOrPath), "package.json")));

  return isExistingPath ? "existing" : "new";
}

/** Root-layout candidates used for Expo Router projects. */
const ROUTER_LAYOUTS = [
  "app/_layout.tsx",
  "app/_layout.ts",
  "app/_layout.jsx",
  "app/_layout.js",
  "src/app/_layout.tsx",
  "src/app/_layout.ts",
  "src/app/_layout.jsx",
  "src/app/_layout.js",
];

/** Classic entry-file candidates (non-router projects). */
const APP_ENTRY_FILES = ["App.tsx", "App.ts", "App.jsx", "App.js"];

/**
 * Prints the `global.css` import the user must add to their entry file —
 * we never edit app/ or the user's own App file, so we instruct instead.
 *
 * @param {string} dir - project directory
 * @param {string[]} candidates - relative entry files to look for
 */
function printCssImportHint(dir, candidates) {
  const entry = candidates.map((rel) => path.join(dir, rel)).find((p) =>
    fs.existsSync(p)
  );

  if (entry && fileContains(entry, "global.css")) return; // already wired

  const cssPath = path.join(dir, "global.css");
  const relImport = entry
    ? path
        .relative(path.dirname(entry), cssPath)
        .replace(/\\/g, "/")
        .replace(/^(?!\.)/, "./")
    : "./global.css";
  const where = entry
    ? path.relative(dir, entry).replace(/\\/g, "/")
    : candidates[0];

  logger.blank();
  logger.warn(
    "Styles won't load until global.css is imported by your entry file."
  );
  logger.info("Add this line at the top of it:");
  logger.blank();
  logger.info(`    // ${where}`);
  logger.info(`    import "${relImport}";`);
  logger.blank();
}

/** Prints the final "next steps" block after a successful run. */
function showNextSteps(projectName, isNew) {
  logger.blank();
  console.log("\x1b[36m" + "═".repeat(50) + "\x1b[0m");
  console.log("\x1b[32m\x1b[1m  ✓  Setup complete!\x1b[0m");
  console.log("\x1b[36m" + "═".repeat(50) + "\x1b[0m");
  logger.blank();

  if (isNew) {
    console.log("  Next steps:");
    console.log(`\x1b[33m    cd ${projectName}\x1b[0m`);
    console.log("\x1b[33m    npx expo start\x1b[0m");
  } else {
    console.log("  NativeWind has been configured in this project.");
    console.log("  Next steps:");
    console.log("\x1b[33m    npx expo start\x1b[0m");
  }

  logger.blank();
  console.log("  Docs: https://www.nativewind.dev");
  logger.blank();
}

// ---------------------------------------------------------------------------
// New project flow
// ---------------------------------------------------------------------------

async function runNewProjectFlow(projectName, options) {
  validateName(projectName);

  const parentDir = process.cwd();
  const targetDir = path.resolve(parentDir, projectName);

  // Guard: directory already exists
  if (fs.existsSync(targetDir)) {
    const pkg = path.join(targetDir, "package.json");
    if (fs.existsSync(pkg)) {
      // Has package.json → treat as existing project
      logger.warn(
        `"${projectName}" already exists and has a package.json.`
      );
      logger.info(
        `To configure NativeWind in an existing project, run:\n\n    cd ${projectName}\n    npx rn-css .\n`
      );
      process.exit(1);
    }

    if (!options.force) {
      logger.error(
        `Directory "${projectName}" already exists. Use --force to overwrite.`
      );
      process.exit(1);
    }

    // --force: the directory exists (without a package.json) — clear it so
    // create-expo-app can scaffold into a clean location.
    logger.warn(`--force: removing existing directory "${targetDir}"...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  logger.header("rn-css");
  logger.info(`Project  : ${projectName}`);
  logger.info(`Location : ${targetDir}`);
  logger.blank();

  // 1. Create Expo project
  const projectDir = createExpoProject(projectName, parentDir);

  // 2. Detect package manager
  const pm = detectPackageManager(projectDir);
  logger.info(`Package manager: ${pm}`);

  // 3. Install NativeWind
  installNativeWind(projectDir, pm);

  // 4. Install Tailwind dev deps
  installTailwindDeps(projectDir, pm);

  // 5. Write config files
  logger.step("Writing configuration files...");
  writeTailwindConfig(projectDir);
  writeGlobalCss(projectDir);
  writeBabelConfig(projectDir);
  writeMetroConfig(projectDir);
  writeNativeWindTypes(projectDir);
  writePrettierConfig(projectDir);
  writeAppTsx(projectDir, projectName);
  ensureComponentsDir(projectDir);

  // 6. Verify
  logger.step("Verifying setup...");
  const { passed, issues } = verify(projectDir);

  if (!passed) {
    logger.warn(`${issues.length} check(s) did not pass:`);
    for (const issue of issues) logger.warn(`  - ${issue}`);
    logger.info("The project was created but may need manual attention.");
  }

  // 7. Next steps
  showNextSteps(projectName, true);
}

// ---------------------------------------------------------------------------
// Existing project flow
// ---------------------------------------------------------------------------

async function runExistingProjectFlow(targetDir, options) {
  logger.header("rn-css — Configure Existing Project");

  // Resolve "." or "./SomePath"
  const resolvedDir = path.resolve(process.cwd(), targetDir);

  if (!fs.existsSync(resolvedDir)) {
    logger.error(`Directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  const pkgPath = path.join(resolvedDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    logger.error(`No package.json found in: ${resolvedDir}`);
    logger.info("This directory does not appear to be a Node.js project.");
    process.exit(1);
  }

  if (!readJsonFile(pkgPath)) {
    logger.error(`Invalid package.json (could not parse JSON): ${pkgPath}`);
    logger.info("Fix the JSON syntax and run rn-css again.");
    process.exit(1);
  }

  // Detect project
  const project = detectProject(resolvedDir);
  const dirName = path.basename(resolvedDir);

  logger.info(`Directory : ${resolvedDir}`);
  logger.info(`Type      : ${project.type}`);
  logger.info(`TypeScript: ${project.typescript ? "yes" : "no"}`);
  logger.info(`PM        : ${project.packageManager}`);
  if (project.router) logger.info("Expo Router: detected");
  logger.blank();

  // Guard: unsupported project
  if (project.type !== "expo") {
    logger.error(
      `This tool only supports Expo projects. Detected type: "${project.type}".`
    );
    logger.info(
      "Make sure your project has expo in its dependencies."
    );
    process.exit(1);
  }

  // Guard: already configured
  if (project.nativewind && !options.force) {
    logger.warn("NativeWind is already in this project's dependencies.");
    logger.info("Use --force to reconfigure anyway.");
    process.exit(0);
  }

  // Confirm
  if (!options.force) {
    logger.blank();
    const ok = await confirm(
      `Configure NativeWind in "${dirName}"?`
    );
    if (!ok) {
      logger.info("Aborted.");
      process.exit(0);
    }
  }

  const pm = project.packageManager;

  // 1. Install NativeWind
  installNativeWind(resolvedDir, pm);

  // 2. Install Tailwind dev deps
  installTailwindDeps(resolvedDir, pm);

  // 3. Write config files (all safe-merge)
  logger.step("Writing configuration files...");
  writeTailwindConfig(resolvedDir);
  writeGlobalCss(resolvedDir);
  writeBabelConfig(resolvedDir);
  writeMetroConfig(resolvedDir);
  writeNativeWindTypes(resolvedDir);
  writePrettierConfig(resolvedDir);
  // NOTE: writeAppTsx is intentionally NOT called for existing projects.
  ensureComponentsDir(resolvedDir);

  // 4. Verify
  logger.step("Verifying setup...");
  const { passed, issues } = verify(resolvedDir);

  if (!passed) {
    logger.warn(`${issues.length} check(s) did not pass:`);
    for (const issue of issues) logger.warn(`  - ${issue}`);
  }

  // The entry must import global.css — we never edit app/ or the user's own
  // App file, so print the exact instruction instead (router layouts first).
  if (issues.includes("entry file imports global.css")) {
    printCssImportHint(
      resolvedDir,
      project.router ? ROUTER_LAYOUTS : APP_ENTRY_FILES
    );
  }

  // 5. Next steps
  showNextSteps(".", false);
}

// ---------------------------------------------------------------------------
// Commander setup
// ---------------------------------------------------------------------------

function run() {
  const program = new Command();

  program
    .name("rn-css")
    .description(
      "Create or configure a React Native Expo project with NativeWind and TypeScript"
    )
    .version("1.0.0")
    .argument(
      "<name-or-path>",
      'Project name (new) or "." / "./path" (existing project)'
    )
    .option(
      "--force",
      "Skip safety prompts; for a new project, delete an existing target directory (a directory containing package.json is never deleted)"
    )
    .action(async (nameOrPath, options) => {
      if (classifyTarget(nameOrPath) === "existing") {
        await runExistingProjectFlow(nameOrPath, options);
      } else {
        await runNewProjectFlow(nameOrPath, options);
      }
    });

  program.parseAsync(process.argv).catch((err) => {
    logger.error(err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  run,
  // Exported for tests
  classifyTarget,
  isValidName,
  validateName,
  ROUTER_LAYOUTS,
  APP_ENTRY_FILES,
};
