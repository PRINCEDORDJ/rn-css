"use strict";

const fs = require("fs");
const path = require("path");
const {
  logger,
  backup,
  fileContains,
  ensureDir,
  readJsonFile,
} = require("./utils");

// ---------------------------------------------------------------------------
// tailwind.config.*
// ---------------------------------------------------------------------------

const TAILWIND_BODY = `  content: [
    "./App.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
`;

/** Config extensions Tailwind v3 resolves, in resolution order. */
const TAILWIND_EXTS = ["js", "cjs", "mjs", "ts", "cts", "mts"];

/** Renders a fresh NativeWind tailwind config (ESM or CJS syntax). */
function renderTailwindConfig(esm) {
  const header = "/** @type {import('tailwindcss').Config} */\n";
  const body = TAILWIND_BODY;
  return esm
    ? `${header}export default {\n${body}};\n`
    : `${header}module.exports = {\n${body}};\n`;
}

/** Finds an existing tailwind config of any supported extension. */
function findTailwindConfig(dir) {
  for (const ext of TAILWIND_EXTS) {
    const candidate = path.join(dir, `tailwind.config.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Merges `presets: [require("nativewind/preset")]` into an existing tailwind
 * config source. Returns the merged source, or null when no merge anchor is
 * found (caller decides on a fallback).
 *
 * @param {string} source
 * @returns {string|null}
 */
function mergeTailwindPreset(source) {
  if (source.includes("nativewind/preset")) return source;

  // Config already declares presets — prepend the NativeWind preset.
  if (/presets\s*:\s*\[/.test(source)) {
    return source.replace(
      /presets\s*:\s*\[/,
      'presets: [\n    require("nativewind/preset"),'
    );
  }

  // `module.exports = { ... }` or `export default { ... }` — insert at top.
  const objAnchor = /(module\.exports\s*=\s*\{|export\s+default\s*\{)/;
  if (objAnchor.test(source)) {
    return source.replace(
      objAnchor,
      '$1\n  presets: [require("nativewind/preset")],'
    );
  }

  // `const config: Config = { ... }; export default config;` (common in TS) —
  // resolve the exported variable and insert into its declaration.
  const exported =
    source.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;/) ||
    source.match(/module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;/);
  if (exported) {
    const decl = new RegExp(
      `((?:const|let|var)\\s+${exported[1]}\\s*(?::[^=]+)?=\\s*)\\{`
    );
    if (decl.test(source)) {
      return source.replace(
        decl,
        '$1{\n  presets: [require("nativewind/preset")],'
      );
    }
  }

  return null;
}

/**
 * Writes (or merges into) the project's tailwind config.
 * - No config yet: creates tailwind.config.js.
 * - Existing config already has nativewind/preset: skips.
 * - Existing config of any extension (.ts, .cjs, ...): merges in place so it
 *   is never shadowed by a second config file.
 * - Unmergeable config: backs up and rewrites the same file (never a sibling
 *   that would shadow the original).
 *
 * @param {string} dir - project directory
 */
function writeTailwindConfig(dir) {
  const existing = findTailwindConfig(dir);

  if (existing && fileContains(existing, "nativewind/preset")) {
    logger.success(
      `${path.basename(existing)} already configured for NativeWind — skipping.`
    );
    return;
  }

  if (!existing) {
    const filePath = path.join(dir, "tailwind.config.js");
    fs.writeFileSync(filePath, renderTailwindConfig(false), "utf8");
    logger.success("Created tailwind.config.js");
    return;
  }

  const source = fs.readFileSync(existing, "utf8");
  const merged = mergeTailwindPreset(source);

  if (merged === null) {
    backup(existing);
    logger.warn(
      `${path.basename(existing)} could not be merged automatically — replacing it (timestamped backup kept).`
    );
    fs.writeFileSync(
      existing,
      renderTailwindConfig(/export\s+default/.test(source)),
      "utf8"
    );
    logger.success(`Configured ${path.basename(existing)} for NativeWind`);
    return;
  }

  backup(existing);
  fs.writeFileSync(existing, merged, "utf8");
  logger.success(`Merged nativewind/preset into ${path.basename(existing)}`);
}

// ---------------------------------------------------------------------------
// global.css
// ---------------------------------------------------------------------------

const GLOBAL_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

/**
 * Writes global.css. Skips if already contains @tailwind directives.
 *
 * @param {string} dir - project directory
 */
function writeGlobalCss(dir) {
  const filePath = path.join(dir, "global.css");

  if (fileContains(filePath, "@tailwind")) {
    logger.success("global.css already has Tailwind directives — skipping.");
    return;
  }

  fs.writeFileSync(filePath, GLOBAL_CSS, "utf8");
  logger.success("Created global.css");
}

// ---------------------------------------------------------------------------
// babel.config.js
// ---------------------------------------------------------------------------

const BABEL_CONFIG = `module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
`;

// Matches an array-style preset entry: ["babel-preset-expo", { ... }]
const BABEL_EXPO_ARRAY_ENTRY = /\[\s*["']babel-preset-expo["']\s*,\s*\{[^}]*\}\s*\]/;
// Matches a bare preset entry: "babel-preset-expo"
const BABEL_EXPO_BARE_ENTRY = /["']babel-preset-expo["']/;

/** Appends "nativewind/babel" after the babel-preset-expo entry (or the presets array). */
function insertNwBabel(source) {
  if (source.includes("nativewind/babel")) return source;
  if (BABEL_EXPO_ARRAY_ENTRY.test(source)) {
    return source.replace(
      BABEL_EXPO_ARRAY_ENTRY,
      (m) => `${m},\n      "nativewind/babel"`
    );
  }
  if (BABEL_EXPO_BARE_ENTRY.test(source)) {
    return source.replace(
      BABEL_EXPO_BARE_ENTRY,
      (m) => `${m},\n      "nativewind/babel"`
    );
  }
  if (/presets\s*:\s*\[/.test(source)) {
    return source.replace(
      /presets\s*:\s*\[/,
      'presets: [\n      "nativewind/babel",'
    );
  }
  return null;
}

/**
 * Merges NativeWind settings into an existing babel config source.
 * Returns the merged source, or null when the config has no recognizable
 * `presets: [` array (caller decides on a fallback).
 *
 * @param {string} source
 * @returns {string|null}
 */
function mergeBabelConfig(source) {
  if (source.includes("nativewind/babel")) return source;
  if (!/presets\s*:\s*\[/.test(source)) return null;

  // jsxImportSource already configured — only the preset entry is missing.
  if (/jsxImportSource\s*:\s*["']nativewind["']/.test(source)) {
    return insertNwBabel(source);
  }

  let out = source;

  if (BABEL_EXPO_ARRAY_ENTRY.test(out)) {
    // Array entry with an options object — add/replace jsxImportSource, then
    // append the nativewind/babel preset right after it (documented order).
    out = out.replace(BABEL_EXPO_ARRAY_ENTRY, (entry) => {
      let fixed = entry;
      if (/jsxImportSource\s*:/.test(fixed)) {
        fixed = fixed.replace(
          /jsxImportSource\s*:\s*["'][^"']*["']/,
          'jsxImportSource: "nativewind"'
        );
      } else {
        fixed = fixed.replace(
          /\{\s*([^}]*?)\s*\}/,
          (_, body) => `{ ${body}${body ? ", " : ""}jsxImportSource: "nativewind" }`
        );
      }
      return `${fixed},\n      "nativewind/babel"`;
    });
  } else if (BABEL_EXPO_BARE_ENTRY.test(out)) {
    // Bare string entry — upgrade it to the configured array form.
    out = out.replace(
      BABEL_EXPO_BARE_ENTRY,
      '["babel-preset-expo", { jsxImportSource: "nativewind" }],\n      "nativewind/babel"'
    );
  } else {
    // No babel-preset-expo at all — add both entries in documented order.
    out = out.replace(
      /presets\s*:\s*\[/,
      'presets: [\n      ["babel-preset-expo", { jsxImportSource: "nativewind" }],\n      "nativewind/babel",'
    );
  }

  return out;
}

/**
 * Writes or merges babel.config.js with NativeWind settings.
 * - If file doesn't exist: creates it fresh.
 * - If file already has nativewind/babel: skips.
 * - Otherwise: smart-merges into the existing config (preserving plugins,
 *   presets and custom options) after taking a timestamped backup.
 * - Only when no `presets: [` array can be found does it fall back to
 *   backup + replace, with an explicit warning.
 *
 * @param {string} dir - project directory
 */
function writeBabelConfig(dir) {
  const filePath = path.join(dir, "babel.config.js");

  if (fileContains(filePath, "nativewind/babel")) {
    logger.success("babel.config.js already configured for NativeWind — skipping.");
    return;
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, BABEL_CONFIG, "utf8");
    logger.success("Created babel.config.js");
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const merged = mergeBabelConfig(source);

  if (merged === null) {
    const backupPath = backup(filePath);
    logger.warn(
      `Existing babel.config.js has no recognizable presets array — replacing it (backup: ${path.basename(
        backupPath || filePath
      )}).`
    );
    logger.info("Custom babel configuration was NOT merged. Check the backup if you need it.");
    fs.writeFileSync(filePath, BABEL_CONFIG, "utf8");
    logger.success("Configured babel.config.js for NativeWind");
    return;
  }

  backup(filePath);
  fs.writeFileSync(filePath, merged, "utf8");
  logger.success("Merged NativeWind settings into babel.config.js");
}

// ---------------------------------------------------------------------------
// metro.config.js
// ---------------------------------------------------------------------------

const METRO_CONFIG_TEMPLATE = `const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
});
`;

/** Wrapper that preserves a user's existing metro config as a base module. */
const metroWrapper = (baseName) => `const { withNativeWind } = require("nativewind/metro");
const baseConfig = require("./${baseName}");

module.exports = withNativeWind(baseConfig, {
  input: "./global.css",
});
`;

/**
 * Writes metro.config.js.
 * - If file doesn't exist: creates it fresh.
 * - If file already has withNativeWind: skips.
 * - Otherwise: preserves the existing config as `metro.config.base.js`
 *   (plus a timestamped backup) and writes a wrapper that applies
 *   withNativeWind on top of it — the user's config is never lost.
 * - ESM configs (`export default`) cannot be required from a CJS wrapper, so
 *   those fall back to backup + replace with an explicit warning.
 *
 * @param {string} dir - project directory
 */
function writeMetroConfig(dir) {
  const filePath = path.join(dir, "metro.config.js");

  if (fileContains(filePath, "withNativeWind")) {
    logger.success("metro.config.js already has withNativeWind — skipping.");
    return;
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, METRO_CONFIG_TEMPLATE, "utf8");
    logger.success("Created metro.config.js");
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");

  if (/export\s+default/.test(source)) {
    const backupPath = backup(filePath);
    logger.warn(
      `metro.config.js uses ESM syntax, which cannot be wrapped from CommonJS — replacing it (backup: ${path.basename(
        backupPath || filePath
      )}).`
    );
    logger.info("Re-apply your custom metro settings inside the new metro.config.js if needed.");
    fs.writeFileSync(filePath, METRO_CONFIG_TEMPLATE, "utf8");
    logger.success("Configured metro.config.js for NativeWind");
    return;
  }

  // Preserve the user's config as a base module and wrap it.
  backup(filePath);
  let baseName = "metro.config.base.js";
  if (fs.existsSync(path.join(dir, baseName))) {
    baseName = `metro.config.base.${Date.now()}.js`;
  }
  fs.renameSync(filePath, path.join(dir, baseName));
  logger.info(`Existing metro.config.js preserved as ${baseName} (timestamped backup also kept).`);

  fs.writeFileSync(filePath, metroWrapper(baseName), "utf8");
  logger.success("Wrapped existing metro.config.js with withNativeWind");
}

// ---------------------------------------------------------------------------
// nativewind-env.d.ts — TypeScript className support
// ---------------------------------------------------------------------------

const NATIVEWIND_ENV_DTS = `/// <reference types="nativewind/types" />

// Allow side-effect imports of CSS files (e.g. \`import "./global.css"\`)
declare module "*.css";
`;

/**
 * Writes nativewind-env.d.ts so `className` props type-check in TypeScript
 * projects. Skips if it already references nativewind/types.
 *
 * @param {string} dir - project directory
 */
function writeNativeWindTypes(dir) {
  const filePath = path.join(dir, "nativewind-env.d.ts");

  if (
    fileContains(filePath, "nativewind/types") &&
    fileContains(filePath, "*.css")
  ) {
    logger.success("nativewind-env.d.ts already present — skipping.");
    return;
  }

  if (fs.existsSync(filePath)) {
    backup(filePath);
  }

  fs.writeFileSync(filePath, NATIVEWIND_ENV_DTS, "utf8");
  logger.success("Created nativewind-env.d.ts (TypeScript className types)");
}

// ---------------------------------------------------------------------------
// .prettierrc — makes prettier-plugin-tailwindcss actually take effect
// ---------------------------------------------------------------------------

const PRETTIER_CONFIG_NAMES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yml",
  ".prettierrc.yaml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.ts",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
];

/**
 * Ensures a Prettier config exists and lists prettier-plugin-tailwindcss.
 * Without a config the installed plugin never runs, so class sorting is dead.
 *
 * - Existing prettier config found: leaves it alone (only notes it).
 * - No config and no `prettier` key in package.json: writes .prettierrc.
 *
 * @param {string} dir - project directory
 */
function writePrettierConfig(dir) {
  const plugin = "prettier-plugin-tailwindcss";
  const pkgPath = path.join(dir, "package.json");
  const pkg = readJsonFile(pkgPath);

  if (pkg && pkg.prettier) {
    if (JSON.stringify(pkg.prettier).includes(plugin)) {
      logger.success("Prettier already configured for Tailwind — skipping.");
    } else {
      logger.info(
        `package.json "prettier" config found — add "${plugin}" to it to enable class sorting.`
      );
    }
    return;
  }

  const existing = PRETTIER_CONFIG_NAMES.find((name) =>
    fs.existsSync(path.join(dir, name))
  );
  if (existing) {
    if (fileContains(path.join(dir, existing), plugin)) {
      logger.success("Prettier already configured for Tailwind — skipping.");
    } else {
      logger.info(
        `Existing ${existing} — add "${plugin}" to its plugins to enable class sorting.`
      );
    }
    return;
  }

  fs.writeFileSync(
    path.join(dir, ".prettierrc"),
    JSON.stringify({ plugins: [plugin] }, null, 2) + "\n",
    "utf8"
  );
  logger.success("Created .prettierrc (Tailwind class sorting enabled)");
}

// ---------------------------------------------------------------------------
// App.tsx — NEW PROJECTS ONLY
// ---------------------------------------------------------------------------

const APP_TSX = (projectName) => `import "./global.css";

import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-950 px-6">
      <StatusBar style="light" />

      <Text className="text-center text-3xl font-bold text-white">
        ${projectName}
      </Text>

      <Text className="mt-4 text-center text-lg text-blue-400">
        React Native + NativeWind ✓
      </Text>

      <View className="mt-8 rounded-2xl bg-blue-600 px-6 py-4">
        <Text className="font-semibold text-white">
          NativeWind is working!
        </Text>
      </View>
    </View>
  );
}
`;

/**
 * Writes App.tsx for a NEW project only.
 *
 * For existing projects this function is NOT called — the user's
 * App.tsx / App.js is never touched.
 *
 * If App.tsx already imports global.css the function skips.
 *
 * @param {string} dir         - project directory
 * @param {string} projectName - used in the welcome text
 */
function writeAppTsx(dir, projectName) {
  const filePath = path.join(dir, "App.tsx");

  if (fileContains(filePath, "global.css")) {
    logger.success("App.tsx already imports global.css — skipping.");
    return;
  }

  // For brand-new projects created by create-expo-app the file exists but
  // does not import global.css yet — back it up and replace.
  if (fs.existsSync(filePath)) {
    backup(filePath);
  }

  fs.writeFileSync(filePath, APP_TSX(projectName), "utf8");
  logger.success("Created starter App.tsx with NativeWind");
}

/**
 * Ensures the components/ directory exists (creates if missing).
 *
 * @param {string} dir - project directory
 */
function ensureComponentsDir(dir) {
  const componentsDir = path.join(dir, "components");
  if (!fs.existsSync(componentsDir)) {
    ensureDir(componentsDir);
    logger.success("Created components/ directory");
  }
}

module.exports = {
  writeTailwindConfig,
  writeGlobalCss,
  writeBabelConfig,
  writeMetroConfig,
  writeNativeWindTypes,
  writePrettierConfig,
  writeAppTsx,
  ensureComponentsDir,
  // Exported for tests
  findTailwindConfig,
  mergeTailwindPreset,
  mergeBabelConfig,
};
