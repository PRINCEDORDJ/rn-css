"use strict";

const path = require("path");
const { runCommand, logger } = require("./utils");

/**
 * Creates a new Expo React Native TypeScript project.
 *
 * Uses --template blank-typescript to ensure deterministic, non-interactive
 * project creation. This avoids any interactive SDK or template selection.
 *
 * @param {string} projectName - name of the project (directory will be created)
 * @param {string} parentDir   - directory in which to create the project
 * @returns {string} absolute path to the created project directory
 */
function createExpoProject(projectName, parentDir) {
  logger.step(`Creating Expo project: ${projectName}`);
  logger.dim("Template: blank-typescript (non-interactive)");
  logger.blank();

  const result = runCommand(
    "npx",
    [
      "create-expo-app@latest",
      projectName,
      "--template",
      "blank-typescript",
    ],
    {
      cwd: parentDir,
      // inherit so the user sees Expo's output in real time
      quiet: false,
      // Fix: on Windows + npm 10+, "npm pack --dry-run" outputs the filename
      // before the JSON, which create-expo-app tries to JSON.parse and fails.
      // Setting npm_config_loglevel=silent suppresses that extra output.
      env: {
        npm_config_loglevel: "silent",
      },
    }
  );

  if (result.exitCode !== 0) {
    logger.blank();
    logger.error("Expo project creation failed.");
    logger.error(`Exit code: ${result.exitCode}`);
    if (result.error) {
      logger.error(`Spawn error: ${result.error.message}`);
    }
    logger.info("Command that was run:");
    logger.info(
      `  npx create-expo-app@latest "${projectName}" --template blank-typescript`
    );
    logger.blank();
    logger.info(
      "Tip: Make sure you have internet access and try again. NativeWind was NOT installed."
    );
    process.exit(1);
  }

  return path.resolve(parentDir, projectName);
}

module.exports = { createExpoProject };
