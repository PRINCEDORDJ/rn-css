#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const spawn = require("cross-spawn");

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ANSI color helpers (chalk v5 is ESM-only; use raw codes in CommonJS)
// ---------------------------------------------------------------------------

const ANSI = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
};

const c = {
  red:    (s) => `${ANSI.red}${s}${ANSI.reset}`,
  green:  (s) => `${ANSI.green}${s}${ANSI.reset}`,
  yellow: (s) => `${ANSI.yellow}${s}${ANSI.reset}`,
  cyan:   (s) => `${ANSI.cyan}${s}${ANSI.reset}`,
  white:  (s) => `${ANSI.white}${s}${ANSI.reset}`,
  gray:   (s) => `${ANSI.gray}${s}${ANSI.reset}`,
  bold:   (s) => `${ANSI.bold}${s}${ANSI.reset}`,
  cyanBold: (s) => `${ANSI.cyan}${ANSI.bold}${s}${ANSI.reset}`,
};

const logger = {
  step(msg)    { console.log(c.cyan(`\n→ ${msg}`)); },
  success(msg) { console.log(c.green(`✓ ${msg}`)); },
  warn(msg)    { console.log(c.yellow(`⚠ ${msg}`)); },
  error(msg)   { console.error(c.red(`✗ ${msg}`)); },
  info(msg)    { console.log(c.white(`  ${msg}`)); },
  dim(msg)     { console.log(c.gray(`  ${msg}`)); },
  blank()      { console.log(""); },
  header(title) {
    const line = "═".repeat(50);
    console.log(c.cyan(`\n${line}`));
    console.log(c.cyanBold(`  ${title}`));
    console.log(c.cyan(`${line}\n`));
  },
};

// ---------------------------------------------------------------------------
// Cross-platform spawn
// ---------------------------------------------------------------------------

/**
 * Spawns a command and returns exit code.
 * Uses cross-spawn so npx/npm resolve to .cmd on Windows automatically.
 *
 * @param {string}   cmd        - command name (e.g. "npx", "npm")
 * @param {string[]} args       - argument list
 * @param {object}   opts       - options
 * @param {string}   opts.cwd   - working directory
 * @param {boolean}  opts.quiet - suppress stdio (default: false → inherit)
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runCommand(cmd, args = [], opts = {}) {
  const { cwd = process.cwd(), quiet = false, env = {} } = opts;

  const result = spawn.sync(cmd, args, {
    cwd,
    stdio: quiet ? "pipe" : "inherit",
    env: { ...process.env, ...env },
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ? result.stdout.toString() : "",
    stderr: result.stderr ? result.stderr.toString() : "",
    error: result.error || null,
  };
}

// ---------------------------------------------------------------------------
// Backup utility
// ---------------------------------------------------------------------------

/**
 * Creates a timestamped backup of a file before it is modified.
 * e.g. babel.config.js → babel.config.js.bak.1700000000000
 *
 * @param {string} filePath - absolute path to the file to back up
 * @returns {string|null} path to backup file, or null if original didn't exist
 */
function backup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.bak.${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  logger.dim(`Backed up ${path.basename(filePath)} → ${path.basename(backupPath)}`);
  return backupPath;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/**
 * Reads a file and checks whether it contains a substring.
 *
 * @param {string} filePath
 * @param {string} substring
 * @returns {boolean}
 */
function fileContains(filePath, substring) {
  if (!fs.existsSync(filePath)) return false;
  try {
    return fs.readFileSync(filePath, "utf8").includes(substring);
  } catch {
    return false;
  }
}

/**
 * Safely reads and parses a JSON file.
 *
 * @param {string} filePath
 * @returns {object|null}
 */
function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Writes an object to a JSON file with 2-space indentation.
 *
 * @param {string} filePath
 * @param {object} obj
 */
function writeJsonFile(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/**
 * Ensures a directory exists (mkdir -p).
 *
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  logger,
  runCommand,
  backup,
  fileContains,
  readJsonFile,
  writeJsonFile,
  ensureDir,
};
