"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  verify,
  findGlobalCssImporter,
  findTailwindConfigs,
} = require("../src/verification");
const { mkTmpDir, rmTmpDir, writeFile, quietly } = require("./helpers");

function withTmp(fn) {
  const dir = mkTmpDir();
  try {
    return fn(dir);
  } finally {
    rmTmpDir(dir);
  }
}

/** Builds a fully configured project directory. */
function makeProject(dir, { typescript = false, entry = "App.tsx" } = {}) {
  writeFile(dir, "package.json", JSON.stringify({ name: "fixture" }));
  if (typescript) writeFile(dir, "tsconfig.json", "{}");

  fs.mkdirSync(path.join(dir, "node_modules", "nativewind"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, "node_modules", "tailwindcss"), {
    recursive: true,
  });

  writeFile(
    dir,
    "tailwind.config.js",
    `module.exports = {\n  presets: [require("nativewind/preset")],\n};\n`
  );
  writeFile(dir, "global.css", "@tailwind base;\n");
  writeFile(dir, entry, 'import "./global.css";\nexport default function App() {}\n');
  writeFile(
    dir,
    "babel.config.js",
    `module.exports = { presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"] };\n`
  );
  writeFile(dir, "metro.config.js", "module.exports = withNativeWind({}, {});\n");

  if (typescript) {
    writeFile(
      dir,
      "nativewind-env.d.ts",
      '/// <reference types="nativewind/types" />\n'
    );
  }
}

test("verify: fully configured JS project passes", () => {
  withTmp((dir) => {
    makeProject(dir);
    const result = quietly(() => verify(dir));
    assert.deepStrictEqual(result.issues, []);
    assert.strictEqual(result.passed, true);
  });
});

test("verify: missing global.css import in entry is reported", () => {
  withTmp((dir) => {
    makeProject(dir);
    writeFile(path.join(dir), "App.tsx", "export default function App() {}\n");
    const result = quietly(() => verify(dir));
    assert.strictEqual(result.passed, false);
    assert.ok(
      result.issues.includes("entry file imports global.css"),
      JSON.stringify(result.issues)
    );
  });
});

test("verify: router layout import counts as the entry import", () => {
  withTmp((dir) => {
    makeProject(dir, { entry: "app/_layout.tsx" });
    assert.strictEqual(findGlobalCssImporter(dir), "app/_layout.tsx");
    const result = quietly(() => verify(dir));
    assert.strictEqual(result.passed, true);
  });
});

test("verify: TypeScript project requires nativewind-env.d.ts", () => {
  withTmp((dir) => {
    makeProject(dir, { typescript: true });
    fs.rmSync(path.join(dir, "nativewind-env.d.ts"));

    const result = quietly(() => verify(dir));
    assert.strictEqual(result.passed, false);
    assert.ok(
      result.issues.includes("nativewind-env.d.ts present (TypeScript)"),
      JSON.stringify(result.issues)
    );
  });
});

test("verify: JS project does not require nativewind-env.d.ts", () => {
  withTmp((dir) => {
    makeProject(dir, { typescript: false });
    const result = quietly(() => verify(dir));
    assert.ok(!result.issues.some((i) => i.includes("nativewind-env.d.ts")));
    assert.strictEqual(result.passed, true);
  });
});

test("verify: a second shadowing tailwind config is reported", () => {
  withTmp((dir) => {
    makeProject(dir);
    writeFile(dir, "tailwind.config.ts", "export default {};\n");

    assert.strictEqual(findTailwindConfigs(dir).length, 2);
    const result = quietly(() => verify(dir));
    assert.strictEqual(result.passed, false);
    assert.ok(
      result.issues.includes("only one tailwind config present (no shadowing)"),
      JSON.stringify(result.issues)
    );
  });
});

test("verify: missing packages and configs are reported", () => {
  withTmp((dir) => {
    writeFile(dir, "package.json", "{}");
    const result = quietly(() => verify(dir));
    assert.strictEqual(result.passed, false);
    assert.ok(result.issues.length >= 6, JSON.stringify(result.issues));
  });
});
