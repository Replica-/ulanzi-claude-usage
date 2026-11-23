// The Panel Protect key: starts the MSI OLED monitor's pixel refresh through
// panel.ps1, over USB, then counts down. The script also runs on its own; see
// the README.
import { helper } from "./helper.js";

const ask = helper("panel.ps1");

// The monitor reports no progress over USB, so the key counts down this
// long. It's the longest a run takes.
export const PROTECT_S = 15 * 60;
// How long the key shows NO USB.
const RESULT_MS = 3_000;

// k.protect is the seconds left, false after a failed press, or null.
export function stopProtect(k) {
  clearInterval(k.timer);
  clearTimeout(k.timer);
  k.timer = null;
  k.protect = null;
}

// A press starts Panel Protect and the countdown. A press during the
// countdown only clears the key, for a run stopped on the monitor.
export async function pressProtect(k, redraw) {
  if (typeof k.protect === "number") {
    stopProtect(k);
    redraw();
    return;
  }
  stopProtect(k);
  const reply = await ask("protect");
  if (!(typeof reply === "string" && reply.endsWith("+"))) {
    k.protect = false;
    k.timer = setTimeout(() => {
      stopProtect(k);
      redraw();
    }, RESULT_MS);
    redraw();
    return;
  }
  const endsAt = Date.now() + PROTECT_S * 1_000;
  k.protect = PROTECT_S;
  k.timer = setInterval(() => {
    k.protect = Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000));
    if (k.protect === 0) stopProtect(k);
    redraw();
  }, 1_000);
  redraw();
}
