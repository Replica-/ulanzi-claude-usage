// Speaker dials: full volume, rear volume and the focused app's volume. Turning
// a dial steps its volume and the dial shows the level. The only connection is
// the local one to Ulanzi Studio.
import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import { renderDial } from "./render.js";
import { CONTROLS, STEP, change } from "./volume.js";

const appId = "com.replica.ulanzideck.speakers";

// context -> { control, active }; the control is the last part of the action UUID.
const dials = {};

function dial(context) {
  if (!dials[context]) {
    const control = $UD.decodeContext(context).uuid.split(".").pop();
    dials[context] = { control: CONTROLS[control] ? control : "volume", active: true };
  }
  return dials[context];
}

function draw(control, reading) {
  const image = renderDial(reading.label, reading.level);
  for (const context in dials) {
    if (dials[context].active && dials[context].control === control) $UD.setBaseDataIcon(context, image);
  }
}

function show(control) {
  if (Object.values(dials).some((d) => d.active && d.control === control)) {
    CONTROLS[control].read().then((reading) => draw(control, reading));
  }
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context }) => show(dial(context).control));

$UD.onSetActive(({ context, active }) => {
  dial(context).active = active;
  if (active) show(dial(context).control);
});

$UD.onClear(({ param = [] }) => {
  for (const { context } of param) delete dials[context];
});

// Turning a dial steps its volume; pressing it re-reads the level.
$UD.on("dialrotate", ({ context, rotateEvent = "" }) => {
  const { control } = dial(context);
  change(control, rotateEvent.includes("left") ? -STEP : STEP).then((reading) => {
    if (reading !== undefined) draw(control, reading);
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
