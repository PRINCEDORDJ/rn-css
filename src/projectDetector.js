"use strict";

const fs = require("fs");
const path = require("path");
const { readJsonFile } = require("./utils");

/**
 * Detects the project type and configuration from a directory.
 *
 * @param {string} dir - absolute path to the project directory
 * @returns {{
 *   type: "expo" | "react-native" | "unsupported" | "empty",
 *   typescript: boolean,
 *   router: boolean,
 *   nativewind: boolean,
 *   tailwind: boolean,
 *   packageManager: "npm" | "yarn" | "pnpm" | "bun",
 *   expoSdkVersion: string | null,
 *   name: string | null,
 *   error?: string
 * }}
 */
function detectProject(dir) {
  const pkgPath = path.join(dir, "package.json");

  // Default result
  const result = {
    type: "empty",
    typescript: false,
    router: false,
    nativewind: false,
    tailwind: false,
    packageManager: detectPackageManager(dir),
    expoSdkVersion: null,
    name: null,
    error: null,
  };

  if (!fs.existsSync(pkgPath)) {
    return result;
  }

  const pkg = readJsonFile(pkgPath);
  if (!pkg) {
    // Malformed JSON — the CLI reports this with a precise error before
    // detection, but stay robust when called directly.
    result.error = "Invalid package.json (could not parse JSON)";
    return result;
  }

  result.name = typeof pkg.name === "string" ? pkg.name : null;

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };

  // ── Project type ──────────────────────────────────────────────────────────
  if (allDeps["expo"]) {
    result.type = "expo";

    // Try to extract Expo SDK version (values may be "*", "workspace:*", ...)
    const expoVersion = allDeps["expo"];
    if (typeof expoVersion === "string") {
      const sdkMatch = expoVersion.match(/(\d+)/);
      if (sdkMatch) {
        result.expoSdkVersion = sdkMatch[1];
      }
    }
  } else if (allDeps["react-native"]) {
    result.type = "react-native";
  } else {
    result.type = "unsupported";
  }

  // ── TypeScript ────────────────────────────────────────────────────────────
  if (
    fs.existsSync(path.join(dir, "tsconfig.json")) ||
    allDeps["typescript"] ||
    allDeps["@types/react"]
  ) {
    result.typescript = true;
  }

  // ── Expo Router ───────────────────────────────────────────────────────────
  if (allDeps["expo-router"]) {
    result.router = true;
  }

  // ── NativeWind ────────────────────────────────────────────────────────────
  if (allDeps["nativewind"]) {
    result.nativewind = true;
  }

  // ── Tailwind ──────────────────────────────────────────────────────────────
  if (allDeps["tailwindcss"]) {
    result.tailwind = true;
  }

  return result;
}

/**
 * Detects the package manager used in a directory by inspecting lock files.
 *
 * @param {string} dir
 * @returns {"npm" | "yarn" | "pnpm" | "bun"}
 */
function detectPackageManager(dir) {
  if (
    fs.existsSync(path.join(dir, "bun.lock")) ||
    fs.existsSync(path.join(dir, "bun.lockb"))
  ) {
    return "bun";
  }
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(dir, "yarn.lock"))) {
    return "yarn";
  }
  // Default: npm (covers package-lock.json and no lock file)
  return "npm";
}

module.exports = { detectProject, detectPackageManager };
