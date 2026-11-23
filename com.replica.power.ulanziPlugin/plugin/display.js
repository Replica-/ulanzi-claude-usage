// Display sleep through display.ps1. It also runs on its own; see the README.
import { helper } from "./helper.js";

const ask = helper("display.ps1");

export const displayOff = () => ask("off");
export const displayOn = () => ask("on");

// Milliseconds since the last keyboard or mouse input, or null.
export async function idleMs() {
  const ms = await ask("idle");
  return typeof ms === "number" && ms >= 0 ? ms : null;
}
