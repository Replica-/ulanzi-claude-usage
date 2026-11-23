// A PowerShell script from the plugin's folder, kept open in its serve mode
// in one hidden window, so a press doesn't wait for PowerShell to start.
import { spawn } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";

import Utils from "../libs/node/utils.js";

// Returns ask(command): commands run one at a time, in order, and each
// resolves to the script's JSON answer, or null.
export function helper(script) {
  const path = fileURLToPath(new URL(`../${script}`, import.meta.url));
  let shell = null;
  const waiting = [];

  function start() {
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path, "serve"];
    const child = spawn("powershell.exe", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let value = null;
      try {
        value = JSON.parse(line);
      } catch {
        Utils.warn(`${script} answered something that isn't JSON:`, line);
      }
      waiting.shift()?.(value);
    });
    child.on("error", (err) => Utils.warn(`${script} failed:`, err.message));
    child.on("exit", () => {
      shell = null;
      waiting.splice(0).forEach((resolve) => resolve(null));
    });
    return child;
  }

  return (command) => {
    shell ??= start();
    return new Promise((resolve) => {
      waiting.push(resolve);
      shell.stdin.write(`${command}\n`);
    });
  };
}
