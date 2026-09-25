"use strict";

const { runCommand, logger } = require("./utils");
const { detectPackageManager } = require("./projectDetector");

/**
 * Returns the install command and arguments for the given package manager.
 *
 * @param {"npm"|"yarn"|"pnpm"|"bun"} pm
 * @param {string[]} packages
 * @param {boolean} dev
 * @returns {{ cmd: string, args: string[] }}
 */
function getInstallCmd(pm, packages, dev = false) {
  switch (pm) {
    case "yarn":
      return {
        cmd: "yarn",
        args: ["add", ...(dev ? ["--dev"] : []), ...packages],
      };
    case "pnpm":
      return {
        cmd: "pnpm",
        args: ["add", ...(dev ? ["--save-dev"] : []), ...packages],
      };
    case "bun":
      return {
        cmd: "bun",
        args: ["add", ...(dev ? ["--dev"] : []), ...packages],
      };
    case "npm":
    default:
      return {
        cmd: "npm",
        args: ["install", ...(dev ? ["--save-dev"] : []), ...packages],
      };
  }
}

/**
 * Installs packages in the given directory using the detected (or provided) PM.
 *
 * @param {string[]}                       packages  - list of package specs
 * @param {object}                         opts
 * @param {string}                         opts.cwd  - working directory
 * @param {boolean}                        opts.dev  - install as devDependency
 * @param {"npm"|"yarn"|"pnpm"|"bun"}      opts.pm   - override package manager
 * @returns {boolean} true if successful
 */
function install(packages, opts = {}) {
  const { cwd = process.cwd(), dev = false } = opts;
  const pm = opts.pm || detectPackageManager(cwd);
  const { cmd, args } = getInstallCmd(pm, packages, dev);

  // Fail fast (with a useful message) when the detected PM isn't installed —
  // otherwise spawn errors surface as a misleading "exit code 1".
  const probe = runCommand(cmd, ["--version"], { cwd, quiet: true });
  if (probe.error) {
    logger.error(`"${cmd}" is not available on this machine.`);
    if (probe.error.code === "ENOENT") {
      logger.info(
        `"${cmd}" was selected (lock file detected) but is not installed or not on PATH.`
      );
      logger.info(
        `Install ${cmd}, or remove its lock file to fall back to npm, then retry.`
      );
    } else {
      logger.info(probe.error.message);
    }
    return false;
  }

  logger.step(
    `Installing ${packages.join(", ")} ${dev ? "(dev) " : ""}via ${pm}...`
  );

  const result = runCommand(cmd, args, { cwd });

  if (result.exitCode !== 0) {
    if (result.error) {
      logger.error(`Failed to run "${cmd}": ${result.error.message}`);
    } else {
      logger.error(`Package installation failed (exit code ${result.exitCode})`);
      if (result.stderr) logger.error(result.stderr.trim());
    }
    logger.info(`The failing command was:`);
    logger.info(`  ${cmd} ${args.join(" ")}`);
    return false;
  }

  return true;
}

module.exports = { install, getInstallCmd };
