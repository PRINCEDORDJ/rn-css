"use strict";

const readline = require("readline");

/**
 * Asks the user a yes/no question on the terminal.
 * Returns true for "y" / "yes", false for anything else.
 *
 * @param {string}  question    - the question to display
 * @param {boolean} defaultYes  - if true, pressing Enter without typing = yes
 * @returns {Promise<boolean>}
 */
function confirm(question, defaultYes = false) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";

  // Non-TTY (CI, pipes): don't hang waiting for input that can never arrive.
  if (!process.stdin.isTTY) {
    return Promise.resolve(defaultYes);
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`  ${question} ${hint}: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultYes);
      } else {
        resolve(trimmed === "y" || trimmed === "yes");
      }
    });
  });
}

module.exports = { confirm };
