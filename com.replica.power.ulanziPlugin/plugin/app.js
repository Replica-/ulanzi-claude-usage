// Power keys: one turns the displays off and on, one shuts the PC down after
// a countdown. The only connection is the local one to Ulanzi Studio.
import { spawn } from "child_process";

import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import { displayOff, displayOn, idleMs } from "./display.js";
import { renderDisplay, renderShutdown } from "./render.js";

const appId = "com.replica.ulanzideck.power";
const CHECK_MS = 2_000;
const COUNTDOWN_S = 10;
// Input this long after the displays went off is the user waking them.
const WAKE_SLACK_MS = 1_000;
const ACTIONS = ["display", "shutdown"];

// context -> { action, active, image, left, timer }; the action is the last
// part of the action UUID. left is the countdown's seconds, or null.
const keys = {};
// When this plugin turned the displays off, or null while they're on.
let offAt = null;

function key(context) {
  if (!keys[context]) {
    const action = $UD.decodeContext(context).uuid.split(".").pop();
    keys[context] = { action: ACTIONS.includes(action) ? action : "display", active: true, image: "", left: null, timer: null };
  }
  return keys[context];
}

function image(k) {
  if (k.action === "shutdown") return renderShutdown(k.left);
  return renderDisplay(offAt === null);
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

// A mouse or keyboard wakes the displays without a press, so input since
// they went off means they're on.
async function checkDisplay() {
  if (offAt === null) return;
  const idle = await idleMs();
  if (idle !== null && idle < Date.now() - offAt - WAKE_SLACK_MS) {
    offAt = null;
    draw(false);
  }
}

async function toggleDisplay() {
  await checkDisplay();
  if (offAt === null) {
    await displayOff();
    offAt = Date.now();
  } else {
    await displayOn();
    offAt = null;
  }
  draw(false);
}

function stopCountdown(k) {
  clearInterval(k.timer);
  k.timer = null;
  k.left = null;
}

// A press starts the countdown, and a press during it cancels it.
function pressShutdown(context) {
  const k = key(context);
  if (k.timer) {
    stopCountdown(k);
    draw(false);
    return;
  }
  k.left = COUNTDOWN_S;
  k.timer = setInterval(() => {
    k.left -= 1;
    if (k.left <= 0) {
      stopCountdown(k);
      spawn("shutdown.exe", ["/s", "/t", "0"], { windowsHide: true, detached: true, stdio: "ignore" }).unref();
    }
    draw(false);
  }, 1_000);
  draw(false);
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context }) => {
  key(context);
  draw(true);
});

$UD.onSetActive(({ context, active }) => {
  key(context).active = active;
  if (active) draw(true);
});

// A key taken off the deck mid-countdown stops it.
$UD.onClear(({ param = [] }) => {
  for (const { context } of param) {
    if (keys[context]) stopCountdown(keys[context]);
    delete keys[context];
  }
});

$UD.onRun(({ context }) => {
  const { action } = key(context);
  if (action === "shutdown") pressShutdown(context);
  else toggleDisplay();
});

setInterval(checkDisplay, CHECK_MS);
