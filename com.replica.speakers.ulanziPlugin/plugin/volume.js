// Speaker volume controls. Full volume presses the keyboard volume keys, so
// Windows changes it and shows its own volume pop-up; the others use NirSoft
// SoundVolumeView, which also reads every level back.
import { execFile, spawn } from "child_process";
import readline from "readline";

import Utils from "../libs/node/utils.js";

const SOUND_VOLUME_VIEW = "C:\\development\\sound\\SoundVolumeView.exe";
const SPEAKERS = "High Definition Audio Device\\Device\\Speakers\\Render";
const WINDOWS_VOLUME = "DefaultRenderDevice"; // the taskbar volume: whichever output is the default
export const REAR_CHANNELS = [4, 5]; // rear left, rear right; each Rear dial can pick its own
const FOCUSED_APP = "focusedname"; // every instance of the app in front
export const STEP = 2; // percent per dial click; also what one volume key press does

// Resolves to SoundVolumeView's exit code and stdout (UTF-16), or null if it could not run.
function run(...args) {
  return new Promise((resolve) =>
    execFile(
      SOUND_VOLUME_VIEW,
      args.map(String),
      { timeout: 10_000, windowsHide: true, encoding: "buffer" },
      (err, stdout) => {
        const text = stdout.toString("utf16le").replace(/^\uFEFF/, "").trim();
        if (!err) return resolve({ code: 0, text });
        if (typeof err.code === "number") return resolve({ code: err.code, text });
        Utils.warn("SoundVolumeView failed:", err.message);
        resolve(null);
      }
    )
  );
}

// The /GetPercent commands return the percent times 10 as their exit code.
async function percent(...args) {
  const result = await run(...args);
  return result === null ? null : result.code / 10;
}

// One hidden PowerShell that presses the volume keys. It reads lines like
// "up 3" and answers "ok" once the presses are sent, so starting PowerShell
// isn't paid on every click.
const KEYBOARD_SCRIPT = `
Add-Type -Namespace Speakers -Name Keys -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);'
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $dir, $times = $line.Split(' ')
  $vk = if ($dir -eq 'up') { 0xAF } else { 0xAE }
  for ($i = 0; $i -lt [int]$times; $i++) {
    [Speakers.Keys]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
    [Speakers.Keys]::keybd_event($vk, 0, 2, [UIntPtr]::Zero)
  }
  [Console]::Out.WriteLine('ok')
}
`;

let keyboard = null;
const keyboardWaiting = [];

function startKeyboard() {
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", KEYBOARD_SCRIPT], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  readline.createInterface({ input: child.stdout }).on("line", () => keyboardWaiting.shift()?.());
  child.on("error", (err) => Utils.warn("Volume keys failed:", err.message));
  child.on("exit", () => {
    keyboard = null;
    keyboardWaiting.splice(0).forEach((resolve) => resolve());
  });
  return child;
}

function pressVolumeKeys(step) {
  keyboard ??= startKeyboard();
  return new Promise((resolve) => {
    keyboardWaiting.push(resolve);
    keyboard.stdin.write(`${step > 0 ? "up" : "down"} ${Math.max(1, Math.round(Math.abs(step) / STEP))}\n`);
  });
}

const signed = (step) => (step > 0 ? `+${step}` : `${step}`);

// Each control reads { label, level } (level null when unknown) and applies a
// step in percent, positive or negative. Rear also takes the channels to use,
// and shows the level of the first.
export const CONTROLS = {
  volume: {
    read: async () => ({ label: "VOLUME", level: await percent("/GetPercent", WINDOWS_VOLUME) }),
    apply: (step) => pressVolumeKeys(step),
  },
  rear: {
    read: async (channels = REAR_CHANNELS) => ({
      label: "REAR",
      level: await percent("/GetPercentChannel", SPEAKERS, channels[0]),
    }),
    apply: (step, channels = REAR_CHANNELS) =>
      Promise.all(channels.map((ch) => run("/ChangeVolumeChannel", SPEAKERS, ch, signed(step)))),
  },
  // Apps without an audio session have no name, and /GetPercent reports 0 for them.
  app: {
    read: async () => {
      const name = (await run("/GetColumnValue", FOCUSED_APP, "Name"))?.text;
      if (!name) return { label: "NO AUDIO", level: null };
      return { label: name, level: await percent("/GetPercent", FOCUSED_APP) };
    },
    apply: (step) => run("/ChangeVolume", FOCUSED_APP, signed(step)),
  },
};

// Clicks that arrive while a change is still running are added up and applied
// together, so a fast turn doesn't pile up work. Changes are grouped by source,
// which tells apart Rear dials set to different channels. Resolves to the new
// reading, or undefined when the clicks were handed to a change in progress.
const pending = {};
const busy = {};
export async function change(source, name, delta, channels) {
  const control = CONTROLS[name];
  pending[source] = (pending[source] || 0) + delta;
  if (busy[source]) return undefined;
  busy[source] = true;
  while (pending[source]) {
    const step = pending[source];
    pending[source] = 0;
    await control.apply(step, channels);
  }
  busy[source] = false;
  return control.read(channels);
}

// Close the key-press helper along with the plugin.
process.on("exit", () => keyboard?.kill());
