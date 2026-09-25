"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { getInstallCmd } = require("../src/packageManager");

test("getInstallCmd: npm runtime install", () => {
  assert.deepStrictEqual(getInstallCmd("npm", ["a", "b"], false), {
    cmd: "npm",
    args: ["install", "a", "b"],
  });
});

test("getInstallCmd: npm dev install", () => {
  assert.deepStrictEqual(getInstallCmd("npm", ["a"], true), {
    cmd: "npm",
    args: ["install", "--save-dev", "a"],
  });
});

test("getInstallCmd: yarn runtime / dev", () => {
  assert.deepStrictEqual(getInstallCmd("yarn", ["a"], false), {
    cmd: "yarn",
    args: ["add", "a"],
  });
  assert.deepStrictEqual(getInstallCmd("yarn", ["a"], true), {
    cmd: "yarn",
    args: ["add", "--dev", "a"],
  });
});

test("getInstallCmd: pnpm runtime / dev", () => {
  assert.deepStrictEqual(getInstallCmd("pnpm", ["a"], false), {
    cmd: "pnpm",
    args: ["add", "a"],
  });
  assert.deepStrictEqual(getInstallCmd("pnpm", ["a"], true), {
    cmd: "pnpm",
    args: ["add", "--save-dev", "a"],
  });
});

test("getInstallCmd: bun runtime / dev", () => {
  assert.deepStrictEqual(getInstallCmd("bun", ["a"], false), {
    cmd: "bun",
    args: ["add", "a"],
  });
  assert.deepStrictEqual(getInstallCmd("bun", ["a"], true), {
    cmd: "bun",
    args: ["add", "--dev", "a"],
  });
});

test("getInstallCmd: unknown pm falls back to npm", () => {
  const { cmd } = getInstallCmd("unknown-pm", ["a"], false);
  assert.strictEqual(cmd, "npm");
});
