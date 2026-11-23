// Monitor keys: the input key switches the monitor between two inputs over
// DDC/CI and shows which one is on; the Panel Protect key starts an MSI OLED
// monitor's pixel refresh over USB and counts down. The only connections are
// the local one to Ulanzi Studio and USB to the monitor.
import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import { INPUT_NAMES, getInput, listMonitors, setInput } from "./ddc.js";
import { PROTECT_S, pressProtect, stopProtect } from "./protect.js";
import { DRAWABLE, renderInput, renderPanel } from "./render.js";

const appId = "com.replica.ulanzideck.monitor";
const REFRESH_MS = 3_000;
// The monitor takes a moment to switch before it reports the new input.
const SETTLE_MS = 2_000;
const MAX_LABEL = 8;
// What a key uses until its settings say otherwise: DisplayPort 1 and 0x10,
// which is USB-C on some monitors. A monitor of "" is the first that answers.
const DEFAULTS = { monitor: "", a: 0x0f, b: 0x10, labelA: "PC", labelB: "USB-C" };

// context -> { action, settings, active, image, protect, timer }; the action
// is "input" or "panel", the last part of the action UUID.
const keys = {};
// monitor name -> its last input, or null when it didn't answer
const inputs = new Map();

function key(context) {
  if (!keys[context]) {
    const action = $UD.decodeContext(context).uuid.split(".").pop() === "panel" ? "panel" : "input";
    keys[context] = { action, settings: { ...DEFAULTS }, active: true, image: "", protect: null, timer: null };
  }
  return keys[context];
}

// Upper case, only characters the key font can draw, at most 8.
function cleanLabel(label, fallback) {
  const clean = [...String(label ?? "").toUpperCase()].filter((c) => DRAWABLE.has(c)).join("").trim();
  return clean.slice(0, MAX_LABEL) || fallback;
}

function cleanInput(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 0xff ? n : fallback;
}

// Takes a key's settings, keeping the current value of any that are missing
// or invalid. Answers whether they changed.
function applySettings(context, settings) {
  if (!settings) return false;
  const k = key(context);
  const s = k.settings;
  const next = {
    monitor: typeof settings.monitor === "string" ? settings.monitor : s.monitor,
    a: cleanInput(settings.a, s.a),
    b: cleanInput(settings.b, s.b),
    labelA: cleanLabel(settings.labelA, s.labelA),
    labelB: cleanLabel(settings.labelB, s.labelB),
  };
  if (JSON.stringify(next) === JSON.stringify(s)) return false;
  k.settings = next;
  return true;
}

function image(k) {
  if (k.action === "panel") return renderPanel(k.protect, PROTECT_S);
  const s = k.settings;
  const input = inputs.get(s.monitor);
  if (input === undefined || input === null) return renderInput(s.labelA, s.labelB, null);
  if (input === s.a) return renderInput(s.labelA, s.labelB, "a");
  if (input === s.b) return renderInput(s.labelA, s.labelB, "b");
  return renderInput(s.labelA, s.labelB, "other", `0X${input.toString(16).toUpperCase().padStart(2, "0")}`);
}

function draw(force) {
  for (const context in keys) {
    const k = keys[context];
    if (!k.active) continue;
    const next = image(k);
    if (!force && next === k.image) continue;
    k.image = next;
    $UD.setBaseDataIcon(context, next);
  }
}

// Each monitor is read once per refresh, however many keys show it.
async function refresh(force) {
  const monitors = new Set(Object.values(keys).filter((k) => k.active && k.action === "input").map((k) => k.settings.monitor));
  for (const monitor of monitors) inputs.set(monitor, await getInput(monitor));
  draw(force);
}

// Switches to B from A, and to A from anything else.
async function toggle(context) {
  const { monitor, a, b } = key(context).settings;
  const target = inputs.get(monitor) === a ? b : a;
  if (await setInput(monitor, target)) {
    inputs.set(monitor, target);
    draw(false);
  } else {
    $UD.toast("The monitor did not answer over DDC/CI. Check that DDC/CI is on in its menu.");
  }
  setTimeout(() => refresh(false), SETTLE_MS);
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context, param }) => {
  key(context);
  applySettings(context, param);
  refresh(true);
});

// The settings page asks for the monitors and their inputs, and sends the
// settings picked; Studio saves them as the key's settings too.
$UD.on("sendToPlugin", async ({ context, payload = {} }) => {
  if (payload.__type === "get-monitors") {
    $UD.send("sendToPropertyInspector", {
      ...$UD.decodeContext(context),
      payload: {
        __type: "monitors",
        monitors: await listMonitors(),
        names: INPUT_NAMES,
        settings: key(context).settings,
      },
    });
    return;
  }
  if (applySettings(context, payload)) refresh(true);
});

$UD.onParamFromApp(({ context, param }) => {
  if (applySettings(context, param)) refresh(true);
});

$UD.onSetActive(({ context, active }) => {
  key(context).active = active;
  if (active) refresh(true);
});

$UD.onClear(({ param = [] }) => {
  for (const { context } of param) {
    if (keys[context]) stopProtect(keys[context]);
    delete keys[context];
  }
});

$UD.onRun(({ context }) => {
  const k = key(context);
  if (k.action === "panel") pressProtect(k, () => draw(false));
  else toggle(context);
});

setInterval(() => refresh(false), REFRESH_MS);
