// System keys: CPU, GPU, RAM and disk usage, refreshed every couple of
// seconds while on screen. The only connection is the local one to Ulanzi
// Studio.
import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import { renderStat } from "./render.js";
import { listDrives, readCpu, readDisk, readGpu, readRam } from "./stats.js";

const appId = "com.replica.ulanzideck.system";
const REFRESH_MS = 2_000;
const DEFAULT_DRIVE = "C";

const READERS = { cpu: readCpu, gpu: readGpu, ram: readRam, disk: readDisk };

// context -> { stat, drive, active, image }; the stat is the last part of the
// action UUID, and the drive is the disk key's setting.
const keys = {};

function key(context) {
  if (!keys[context]) {
    const stat = $UD.decodeContext(context).uuid.split(".").pop();
    keys[context] = { stat: READERS[stat] ? stat : "cpu", drive: DEFAULT_DRIVE, active: true, image: "" };
  }
  return keys[context];
}

// Takes the drive from a key's settings, if they have a valid one.
function applySettings(context, settings) {
  const drive = String(settings?.drive || "").toUpperCase();
  if (!/^[A-Z]$/.test(drive)) return false;
  key(context).drive = drive;
  return true;
}

// What a key shows: its stat, plus the drive for a disk key.
function source(k) {
  return k.stat === "disk" ? `disk:${k.drive}` : k.stat;
}

// Each source is read once per refresh, however many keys show it.
async function refresh(force) {
  const shown = new Map();
  for (const k of Object.values(keys)) if (k.active) shown.set(source(k), k);
  for (const [src, { stat, drive }] of shown) {
    const { label, level, sub } = await READERS[stat](drive);
    const image = renderStat(label, level, sub);
    for (const context in keys) {
      const k = keys[context];
      if (!k.active || source(k) !== src || (!force && image === k.image)) continue;
      k.image = image;
      $UD.setBaseDataIcon(context, image);
    }
  }
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context, param }) => {
  key(context);
  applySettings(context, param);
  refresh(true);
});

// The disk key's settings page asks for the drive list, and sends the drive
// picked; Studio saves it as the key's settings too.
$UD.on("sendToPlugin", async ({ context, payload = {} }) => {
  if (payload.__type === "get-drives") {
    $UD.send("sendToPropertyInspector", {
      ...$UD.decodeContext(context),
      payload: { __type: "drives", drives: await listDrives(), drive: key(context).drive },
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
  for (const { context } of param) delete keys[context];
});

$UD.onRun(({ context }) => {
  key(context);
  refresh(true);
});

setInterval(() => refresh(false), REFRESH_MS);
