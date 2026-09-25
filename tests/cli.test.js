"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { classifyTarget, isValidName } = require("../src/cli");
const { mkTmpDir, rmTmpDir, writeFile } = require("./helpers");

// ---------------------------------------------------------------------------
// classifyTarget (new vs. existing routing)
// ---------------------------------------------------------------------------

test('classifyTarget: "." / "./x" / "../x" are existing-project targets', () => {
  assert.strictEqual(classifyTarget("."), "existing");
  assert.strictEqual(classifyTarget("./Something"), "existing");
  assert.strictEqual(classifyTarget("../Something"), "existing");
});

test("classifyTarget: unknown plain name → new project", () => {
  assert.strictEqual(classifyTarget("definitely-not-a-real-dir-xyz"), "new");
});

test("classifyTarget: existing directory with package.json → existing", () => {
  const parent = mkTmpDir();
  try {
    const project = path.join(parent, "has-pkg");
    fs.mkdirSync(project);
    writeFile(project, "package.json", "{}");
    assert.strictEqual(classifyTarget("has-pkg", parent), "existing");
  } finally {
    rmTmpDir(parent);
  }
});

test("classifyTarget: existing directory without package.json → new", () => {
  const parent = mkTmpDir();
  try {
    fs.mkdirSync(path.join(parent, "no-pkg"));
    assert.strictEqual(classifyTarget("no-pkg", parent), "new");
  } finally {
    rmTmpDir(parent);
  }
});

// ---------------------------------------------------------------------------
// isValidName
// ---------------------------------------------------------------------------

test("isValidName accepts letters, numbers, hyphens, underscores, dots", () => {
  for (const name of ["MyApp", "my-app", "my_app", "2fa", "app.v2", "A1_b2-c3"]) {
    assert.strictEqual(isValidName(name), true, name);
  }
});

test("isValidName rejects invalid names", () => {
  for (const name of ["", "-app", "_app", ".app", "my app", "my/app", "app!"]) {
    assert.strictEqual(isValidName(name), false, JSON.stringify(name));
  }
});
