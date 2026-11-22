// Claude usage key: shows the 5-hour and weekly plan limits.
// Reads ~/.claude.json, where Claude Code (VS Code extension or CLI) caches its usage.
// The only connection this plugin makes is the local one to Ulanzi Studio.
// To keep ~/.claude.json fresh it runs `claude -p /usage` with the copy of
// Claude Code bundled in the VS Code extension every few minutes; that is
// Claude Code checking usage with Anthropic, the same as typing /usage.
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import Utils from "../libs/node/utils.js";
import { renderKey, toMs } from "./render.js";

const appId = "com.replica.ulanzideck.claudeusage";
const STATE_FILE = path.join(os.homedir(), ".claude.json");
const EXTENSIONS_DIR = path.join(os.homedir(), ".vscode", "extensions");
const USAGE_CHECK_MS = 5 * 60_000;

// context -> { active, image }
const keys = {};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

// Claude Code's cached copy, reshaped into the windows the key draws.
function readUsage() {
  const cached = readJson(STATE_FILE)?.cachedUsageUtilization;
  if (!cached?.utilization || !cached.fetchedAtMs) return null;
  const window = (w) =>
    w && typeof w.utilization === "number" ? { used_percentage: w.utilization, resets_at: w.resets_at } : undefined;
  return {
    updated_at: cached.fetchedAtMs,
    rate_limits: {
      five_hour: window(cached.utilization.five_hour),
      seven_day: window(cached.utilization.seven_day),
    },
  };
}

// The newest claude.exe bundled with the VS Code extension (the folder name
// changes with each extension update).
function findClaudeExe() {
  try {
    return fs
      .readdirSync(EXTENSIONS_DIR)
      .filter((dir) => dir.startsWith("anthropic.claude-code-"))
      .map((dir) => path.join(EXTENSIONS_DIR, dir, "resources", "native-binary", "claude.exe"))
      .filter((exe) => fs.existsSync(exe))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  } catch {
    return undefined;
  }
}

// /usage is a local command: it fetches usage and rewrites the cache in
// ~/.claude.json without sending a prompt to the model.
let checking = false;
function checkUsage() {
  if (checking || !Object.values(keys).some((key) => key.active)) return;
  const exe = findClaudeExe();
  if (!exe) return Utils.warn("Claude Code VS Code extension not found");
  checking = true;
  execFile(
    exe,
    ["-p", "--no-session-persistence", "/usage"],
    { cwd: os.tmpdir(), timeout: 60_000, windowsHide: true },
    (err) => {
      checking = false;
      if (err) Utils.warn("Usage check failed:", err.message);
    }
  );
}

function refresh(context, force) {
  const key = keys[context];
  if (!key || !key.active) return;
  const image = renderKey(readUsage());
  if (!force && image === key.image) return;
  key.image = image;
  $UD.setBaseDataIcon(context, image);
}

function refreshAll(force) {
  for (const context in keys) refresh(context, force);
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context }) => {
  keys[context] = { active: true, image: "" };
  refresh(context, true);
  checkUsage();
});

$UD.onSetActive(({ context, active }) => {
  if (!keys[context]) keys[context] = { image: "" };
  keys[context].active = active;
  if (active) refresh(context, true);
});

$UD.onClear(({ param = [] }) => {
  for (const { context } of param) delete keys[context];
});

// Pressing the key checks usage now, redraws, and says how old the numbers are.
$UD.onRun(({ context }) => {
  if (!keys[context]) keys[context] = { active: true, image: "" };
  refresh(context, true);
  checkUsage();
  const updated = toMs(readUsage()?.updated_at);
  if (updated === null) {
    $UD.toast("No usage data yet: open Claude in VS Code");
  } else {
    const mins = Math.round((Date.now() - updated) / 60000);
    $UD.toast(mins < 1 ? "Claude usage updated just now" : `Claude usage updated ${mins} min ago`);
  }
});

// Redraw when Claude Code rewrites ~/.claude.json, and every 30 s for the countdown.
let watchTimer = 0;
try {
  fs.watch(path.dirname(STATE_FILE), (_event, filename) => {
    if (filename !== path.basename(STATE_FILE)) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => refreshAll(false), 300);
  });
} catch (err) {
  Utils.warn("Cannot watch", STATE_FILE, err.message);
}
setInterval(() => refreshAll(false), 30_000);
setInterval(checkUsage, USAGE_CHECK_MS);
