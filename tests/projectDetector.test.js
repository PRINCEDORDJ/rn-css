"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { detectProject, detectPackageManager } = require("../src/projectDetector");
const { mkTmpDir, rmTmpDir, writeFile } = require("./helpers");

function withTmp(fn) {
  const dir = mkTmpDir();
  try {
    return fn(dir);
  } finally {
    rmTmpDir(dir);
  }
}

// ---------------------------------------------------------------------------
// detectPackageManager
// ---------------------------------------------------------------------------

test("detectPackageManager defaults to npm with no lock file", () => {
  withTmp((dir) => assert.strictEqual(detectPackageManager(dir), "npm"));
});

test("detectPackageManager reads each lock file", () => {
  withTmp((dir) => {
    for (const [file, expected] of [
      ["bun.lock", "bun"],
      ["bun.lockb", "bun"],
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["package-lock.json", "npm"],
    ]) {
      const sub = mkTmpDir();
      try {
        writeFile(sub, file, "");
        assert.strictEqual(detectPackageManager(sub), expected, file);
      } finally {
        rmTmpDir(sub);
      }
    }
  });
});

test("detectPackageManager prefers pnpm over yarn", () => {
  withTmp((dir) => {
    writeFile(dir, "yarn.lock", "");
    writeFile(dir, "pnpm-lock.yaml", "");
    assert.strictEqual(detectPackageManager(dir), "pnpm");
  });
});

// ---------------------------------------------------------------------------
// detectProject
// ---------------------------------------------------------------------------

test("detectProject: missing package.json → empty", () => {
  withTmp((dir) => {
    const r = detectProject(dir);
    assert.strictEqual(r.type, "empty");
  });
});

test("detectProject: invalid JSON → no throw, error reported", () => {
  withTmp((dir) => {
    writeFile(dir, "package.json", "{ not json ");
    const r = detectProject(dir);
    assert.strictEqual(r.type, "empty");
    assert.match(r.error, /Invalid package\.json/);
  });
});

test("detectProject: expo project with SDK version and TypeScript", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "package.json",
      JSON.stringify({
        name: "my-app",
        dependencies: { expo: "~54.0.0", "react-native": "0.81.0" },
        devDependencies: { typescript: "~5.9.0" },
      })
    );
    const r = detectProject(dir);
    assert.strictEqual(r.type, "expo");
    assert.strictEqual(r.expoSdkVersion, "54");
    assert.strictEqual(r.typescript, true);
    assert.strictEqual(r.name, "my-app");
  });
});

test("detectProject: non-string expo version does not crash", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "package.json",
      JSON.stringify({ dependencies: { expo: "workspace:*" } })
    );
    const r = detectProject(dir);
    assert.strictEqual(r.type, "expo");
    assert.strictEqual(r.expoSdkVersion, null);
  });
});

test("detectProject: react-native without expo", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "package.json",
      JSON.stringify({ dependencies: { "react-native": "0.76.0" } })
    );
    assert.strictEqual(detectProject(dir).type, "react-native");
  });
});

test("detectProject: neither expo nor react-native → unsupported", () => {
  withTmp((dir) => {
    writeFile(dir, "package.json", JSON.stringify({ dependencies: { vue: "3" } }));
    assert.strictEqual(detectProject(dir).type, "unsupported");
  });
});

test("detectProject: router, nativewind, tailwind flags", () => {
  withTmp((dir) => {
    writeFile(
      dir,
      "package.json",
      JSON.stringify({
        dependencies: {
          expo: "54.0.0",
          "expo-router": "~5.0.0",
          nativewind: "4.2.7",
          tailwindcss: "^3.4.17",
        },
      })
    );
    const r = detectProject(dir);
    assert.strictEqual(r.router, true);
    assert.strictEqual(r.nativewind, true);
    assert.strictEqual(r.tailwind, true);
  });
});

test("detectProject: tsconfig.json marks TypeScript", () => {
  withTmp((dir) => {
    writeFile(dir, "package.json", JSON.stringify({ dependencies: { expo: "54.0.0" } }));
    writeFile(dir, "tsconfig.json", "{}");
    assert.strictEqual(detectProject(dir).typescript, true);
  });
});
