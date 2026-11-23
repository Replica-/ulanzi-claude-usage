// The monitor's input source over DDC/CI (VCP code 0x60), through one hidden
// PowerShell that stays open, so starting PowerShell isn't paid on every press.
import { spawn } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";

import Utils from "../libs/node/utils.js";

// Input values from the MCCS standard. A monitor can use one for another
// connector: 0x10 is USB-C on some monitors.
export const INPUT_NAMES = {
  0x01: "VGA 1",
  0x02: "VGA 2",
  0x03: "DVI 1",
  0x04: "DVI 2",
  0x05: "Composite 1",
  0x06: "Composite 2",
  0x07: "S-Video 1",
  0x08: "S-Video 2",
  0x09: "Tuner 1",
  0x0a: "Tuner 2",
  0x0b: "Tuner 3",
  0x0c: "Component 1",
  0x0d: "Component 2",
  0x0e: "Component 3",
  0x0f: "DisplayPort 1",
  0x10: "DisplayPort 2 / USB-C",
  0x11: "HDMI 1",
  0x12: "HDMI 2",
};

// ddc.ps1 in the plugin's folder, in its serve mode: one command per line in,
// one line of JSON out. It also runs on its own; see the README.
const SCRIPT = fileURLToPath(new URL("../ddc.ps1", import.meta.url));

let shell = null;
const waiting = [];

function start() {
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "serve"];
  const child = spawn("powershell.exe", args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let value = null;
    try {
      value = JSON.parse(line);
    } catch {
      Utils.warn("DDC/CI answered something that isn't JSON:", line);
    }
    waiting.shift()?.(value);
  });
  child.on("error", (err) => Utils.warn("DDC/CI helper failed:", err.message));
  child.on("exit", () => {
    shell = null;
    waiting.splice(0).forEach((resolve) => resolve(null));
  });
  return child;
}

// Commands run one at a time, in order; each resolves to its answer or null.
function ask(...parts) {
  shell ??= start();
  return new Promise((resolve) => {
    waiting.push(resolve);
    shell.stdin.write(`${parts.map((p) => String(p).replace(/[\t\r\n]/g, " ")).join("\t")}\n`);
  });
}

// The input values a monitor lists in its capabilities, such as "60(11 12 0F 10)".
export function capsInputs(caps = "") {
  const match = /(?:^|[\s(])60\(([0-9A-Fa-f\s]*)\)/.exec(caps);
  if (!match) return [];
  return match[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((hex) => parseInt(hex, 16));
}

// Every monitor: [{ name, input, inputs }]. input is -1 when it doesn't answer.
// The capabilities request takes a second or two per monitor.
export async function listMonitors() {
  const list = (await ask("list")) || [];
  return (Array.isArray(list) ? list : [list]).map(({ Name, Input, Caps }) => ({
    name: Name,
    input: Input,
    inputs: capsInputs(Caps),
  }));
}

// The input of the named monitor (or of the first that answers), or null.
export async function getInput(monitor = "") {
  const answer = await ask("get", monitor);
  return answer ? answer.Input : null;
}

// Switches the named monitor (or the first that answers). True if it took it.
export async function setInput(monitor, value) {
  return Boolean(await ask("set", monitor, value.toString(16)));
}
