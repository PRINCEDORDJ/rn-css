"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

/** Creates a unique temp directory. */
function mkTmpDir(prefix = "rn-css-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Recursively removes a temp directory (ignores missing). */
function rmTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Writes a file (creating parent dirs) and returns its absolute path. */
function writeFile(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return p;
}

/** Lists timestamped backup files (*.bak.*) in a directory. */
function listBackups(dir) {
  return fs.readdirSync(dir).filter((f) => f.includes(".bak."));
}

/** Runs fn with console.log/error silenced (for functions that print tables). */
function quietly(fn) {
  const origLog = console.log;
  const origErr = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

module.exports = { mkTmpDir, rmTmpDir, writeFile, listBackups, quietly };
