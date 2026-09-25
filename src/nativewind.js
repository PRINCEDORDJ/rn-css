"use strict";

const path = require("path");
const { install } = require("./packageManager");
const { logger, runCommand, readJsonFile } = require("./utils");

// ---------------------------------------------------------------------------
// Version management
// ---------------------------------------------------------------------------

/**
 * Pinned versions for packages that are NOT tied to the Expo SDK.
 * These are plain JS packages, so a fixed range is safe across SDKs.
 */
const VERSIONS = {
  nativewind: "4.2.7",
  tailwindcss: "^3.4.17",
  prettierPluginTailwind: "^0.5.11",
  prettier: "^3.0.0",
};

/**
 * Fallback pins for SDK-coupled native packages.
 *
 * These are only used when `npx expo install` is unavailable — the expo CLI
 * is the source of truth for these versions because they must match the
 * scaffolded Expo SDK (react-native-reanimated 3.x works for NativeWind v4
 * across current SDKs; safe-area-context is kept on the 5.x line).
 */
const VERSIONS_FALLBACK = {
  "react-native-reanimated": "~3.19.5",
  "react-native-safe-area-context": "~5.10.0",
};

// ---------------------------------------------------------------------------
// Install helpers
// ---------------------------------------------------------------------------

/**
 * Installs packages through `npx expo install` so the versions match the
 * project's Expo SDK. Falls back to pinned versions (VERSIONS_FALLBACK) when
 * the expo CLI cannot be run.
 *
 * @param {string}                    cwd      - project directory
 * @param {"npm"|"yarn"|"pnpm"|"bun"} pm       - package manager
 * @param {string[]}                  packages - bare package names
 * @returns {boolean} true if successful
 */
function installSdkPackages(cwd, pm, packages) {
  logger.step(
    `Installing ${packages.join(", ")} via the Expo CLI (SDK-matched versions)...`
  );

  // --yes: never let npx prompt interactively if the local expo CLI is missing.
  const result = runCommand(
    "npx",
    ["--yes", "expo", "install", ...packages],
    { cwd }
  );

  if (!result.error && result.exitCode === 0) {
    return true;
  }

  logger.warn(
    "The Expo CLI could not be used — falling back to pinned versions."
  );

  const specs = [];
  for (const pkg of packages) {
    const pin = VERSIONS_FALLBACK[pkg];
    if (!pin) {
      logger.error(`No fallback pin defined for "${pkg}".`);
      logger.info(`Try manually: ${pm} add ${pkg}`);
      return false;
    }
    specs.push(`${pkg}@${pin}`);
  }

  return install(specs, { cwd, pm, dev: false });
}

/**
 * Reads the babel-preset-expo version range required by the installed expo
 * package, so the preset always matches the SDK.
 *
 * @param {string} cwd - project directory
 * @returns {string|null} e.g. "babel-preset-expo@~54.0.0" or null
 */
function resolveBabelPresetExpoSpec(cwd) {
  // Preferred: the range declared by the project's expo dependency.
  const expoPkg = readJsonFile(path.join(cwd, "node_modules", "expo", "package.json"));
  const declared =
    expoPkg && expoPkg.dependencies && expoPkg.dependencies["babel-preset-expo"];
  if (declared) return `babel-preset-expo@${declared}`;

  // Next best: whatever version is already resolvable in node_modules.
  const installed = readJsonFile(
    path.join(cwd, "node_modules", "babel-preset-expo", "package.json")
  );
  if (installed && installed.version) {
    return `babel-preset-expo@${installed.version}`;
  }

  return null;
}

/**
 * Reanimated 4 (Expo SDK 54+) requires react-native-worklets. Installs it
 * only when a v4+ reanimated is actually present.
 *
 * @param {string} cwd - project directory
 * @returns {boolean} true if successful (or not needed)
 */
function ensureReanimatedWorklets(cwd, pm) {
  const reanimated = readJsonFile(
    path.join(cwd, "node_modules", "react-native-reanimated", "package.json")
  );
  if (!reanimated || !reanimated.version) return true;

  const major = parseInt(reanimated.version, 10);
  if (!Number.isFinite(major) || major < 4) return true;

  logger.info(
    `react-native-reanimated ${reanimated.version} detected — react-native-worklets is required.`
  );

  const result = runCommand(
    "npx",
    ["--yes", "expo", "install", "react-native-worklets"],
    { cwd }
  );

  if (result.error || result.exitCode !== 0) {
    logger.warn(
      "Could not install react-native-worklets. Install it manually if you use Reanimated:"
    );
    logger.info(`  ${pm} add react-native-worklets`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public install steps
// ---------------------------------------------------------------------------

/**
 * Installs NativeWind runtime dependencies into the project.
 *
 * - nativewind: plain JS package, installed with the project's package manager.
 * - react-native-reanimated / react-native-safe-area-context: native packages,
 *   installed with `npx expo install` so they match the project's Expo SDK.
 *
 * @param {string}                     cwd - project directory
 * @param {"npm"|"yarn"|"pnpm"|"bun"}  pm  - package manager to use
 * @returns {boolean} true if successful
 */
function installNativeWind(cwd, pm) {
  logger.step("Installing NativeWind runtime dependencies...");

  const ok = install([`nativewind@${VERSIONS.nativewind}`], {
    cwd,
    pm,
    dev: false,
  });

  if (!ok) {
    logger.error("Failed to install NativeWind.");
    logger.info("You can retry manually:");
    logger.info(`  ${pm} add nativewind@${VERSIONS.nativewind}`);
    process.exit(1);
  }

  const sdkOk = installSdkPackages(cwd, pm, [
    "react-native-reanimated",
    "react-native-safe-area-context",
  ]);

  if (!sdkOk) {
    logger.error("Failed to install native runtime dependencies.");
    logger.info("You can retry manually:");
    logger.info(`  ${pm} add react-native-reanimated react-native-safe-area-context`);
    process.exit(1);
  }

  ensureReanimatedWorklets(cwd, pm);

  logger.success("NativeWind runtime dependencies installed.");
  return true;
}

/**
 * Installs Tailwind and Babel dev dependencies into the project.
 *
 * - tailwindcss / prettier / prettier-plugin-tailwindcss: plain JS packages,
 *   installed with the project's package manager.
 * - babel-preset-expo: pinned to the range required by the installed expo
 *   package (never `latest`, which can drift from the SDK).
 *
 * @param {string}                     cwd - project directory
 * @param {"npm"|"yarn"|"pnpm"|"bun"}  pm  - package manager to use
 * @returns {boolean} true if successful
 */
function installTailwindDeps(cwd, pm) {
  logger.step("Installing Tailwind + Babel dev dependencies...");

  const packages = [
    `tailwindcss@${VERSIONS.tailwindcss}`,
    `prettier@${VERSIONS.prettier}`,
    `prettier-plugin-tailwindcss@${VERSIONS.prettierPluginTailwind}`,
  ];

  const babelSpec = resolveBabelPresetExpoSpec(cwd);
  if (babelSpec) {
    packages.push(babelSpec);
  } else {
    logger.warn(
      "Could not determine the babel-preset-expo version required by your Expo SDK."
    );
    logger.info("Installing latest available version — run `npx expo install babel-preset-expo` if it mismatches.");
    packages.push("babel-preset-expo@latest");
  }

  const ok = install(packages, { cwd, pm, dev: true });

  if (!ok) {
    logger.error("Failed to install Tailwind dev dependencies.");
    logger.info("You can retry manually:");
    logger.info(`  ${pm} add --dev ${packages.join(" ")}`);
    process.exit(1);
  }

  logger.success("Tailwind dev dependencies installed.");
  return true;
}

module.exports = {
  installNativeWind,
  installTailwindDeps,
  installSdkPackages,
  resolveBabelPresetExpoSpec,
  VERSIONS,
  VERSIONS_FALLBACK,
};
