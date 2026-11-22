// Speaker dials: full volume, rear volume and the focused app's volume. Turning
// a dial steps its volume and the dial shows the level. The only connection is
// the local one to Ulanzi Studio.
import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import { renderDial } from "./render.js";
import { CONTROLS, REAR_CHANNELS, STEP, change } from "./volume.js";

const appId = "com.replica.ulanzideck.speakers";

// context -> { control, channels, active }; the control is the last part of the
// action UUID, and the channels are a Rear dial's setting.
const dials = {};

function dial(context) {
  if (!dials[context]) {
    const control = $UD.decodeContext(context).uuid.split(".").pop();
    dials[context] = { control: CONTROLS[control] ? control : "volume", channels: REAR_CHANNELS, active: true };
  }
  return dials[context];
}

// Takes the channels from a dial's settings, if they have a valid list.
function applySettings(context, settings) {
  const channels = [...new Set((settings?.channels || []).map(Number))]
    .filter((ch) => Number.isInteger(ch) && ch >= 0 && ch <= 7)
    .sort((a, b) => a - b);
  if (!channels.length) return false;
  dial(context).channels = channels;
  return true;
}

// What a dial controls: its control, plus the channels for a Rear dial.
function source(d) {
  return d.control === "rear" ? `rear:${d.channels}` : d.control;
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
  for (const [src, d] of shown) CONTROLS[control].read(d.channels).then((reading) => draw(src, reading));
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context, param }) => {
  applySettings(context, param);
  show(dial(context).control);
});

// The Rear dial's settings page sends the channels picked; Studio saves them
// as the dial's settings too.
$UD.on("sendToPlugin", ({ context, payload }) => {
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
  change(src, d.control, rotateEvent.includes("left") ? -STEP : STEP, d.channels).then((reading) => {
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
