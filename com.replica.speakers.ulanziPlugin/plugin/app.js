// Speaker dials: full volume, rear volume and the focused app's volume. Turning
// a dial steps its volume and the dial shows the level. The only connection is
// the local one to Ulanzi Studio.
import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import { renderDial } from "./render.js";
import { CONTROLS, REAR_DEFAULTS, STEP, change, listDevices } from "./volume.js";

const appId = "com.replica.ulanzideck.speakers";

// context -> { control, settings, active }; the control is the last part of the
// action UUID, and the settings are a Rear dial's device, channels and label.
const dials = {};

function dial(context) {
  if (!dials[context]) {
    const control = $UD.decodeContext(context).uuid.split(".").pop();
    dials[context] = { control: CONTROLS[control] ? control : "volume", settings: REAR_DEFAULTS, active: true };
  }
  return dials[context];
}

// Takes the device, channels and label from a dial's settings, keeping the
// current value of any that are missing or invalid.
function applySettings(context, settings) {
  if (!settings) return false;
  const d = dial(context);
  const channels = [...new Set((settings.channels || []).map(Number))]
    .filter((ch) => Number.isInteger(ch) && ch >= 0 && ch <= 31)
    .sort((a, b) => a - b);
  const label = typeof settings.label === "string" ? settings.label.trim() : "";
  const next = {
    device: typeof settings.device === "string" && settings.device ? settings.device : d.settings.device,
    channels: channels.length ? channels : d.settings.channels,
    label: label || (typeof settings.label === "string" ? REAR_DEFAULTS.label : d.settings.label),
  };
  if (JSON.stringify(next) === JSON.stringify(d.settings)) return false;
  d.settings = next;
  return true;
}

// What a dial controls: its control, plus the settings for a Rear dial.
function source(d) {
  return d.control === "rear" ? `rear:${JSON.stringify(d.settings)}` : d.control;
}

function draw(src, reading) {
  const image = renderDial(reading.label, reading.level);
  for (const context in dials) {
    if (dials[context].active && source(dials[context]) === src) $UD.setBaseDataIcon(context, image);
  }
}

// Re-reads every source of a control that's on screen, once each.
function show(control) {
  const shown = new Map();
  for (const d of Object.values(dials)) if (d.active && d.control === control) shown.set(source(d), d);
  for (const [src, d] of shown) CONTROLS[control].read(d.settings).then((reading) => draw(src, reading));
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context, param }) => {
  applySettings(context, param);
  show(dial(context).control);
});

// The Rear dial's settings page asks for the output devices, and sends the
// settings picked; Studio saves them as the dial's settings too.
$UD.on("sendToPlugin", async ({ context, payload = {} }) => {
  if (payload.__type === "get-devices") {
    $UD.send("sendToPropertyInspector", {
      ...$UD.decodeContext(context),
      payload: { __type: "devices", devices: await listDevices(), settings: dial(context).settings },
    });
    return;
  }
  if (applySettings(context, payload)) show(dial(context).control);
});

$UD.onParamFromApp(({ context, param }) => {
  if (applySettings(context, param)) show(dial(context).control);
});

$UD.onSetActive(({ context, active }) => {
  dial(context).active = active;
  if (active) show(dial(context).control);
});

$UD.onClear(({ param = [] }) => {
  for (const { context } of param) delete dials[context];
});

// Turning a dial steps its volume; pressing it re-reads the level.
$UD.on("dialrotate", ({ context, rotateEvent = "" }) => {
  const d = dial(context);
  const src = source(d);
  change(src, d.control, rotateEvent.includes("left") ? -STEP : STEP, d.settings).then((reading) => {
    if (reading !== undefined) draw(src, reading);
  });
});

$UD.on("dialdown", ({ context }) => show(dial(context).control));
$UD.onRun(({ context }) => show(dial(context).control));

// Follow the focused app, and pick up volume changes made outside the dials.
setInterval(() => show("app"), 3_000);
setInterval(() => {
  show("volume");
  show("rear");
}, 30_000);
