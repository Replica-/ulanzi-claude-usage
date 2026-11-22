// System keys: CPU and GPU usage, refreshed every couple of seconds while on
// screen. The only connection is the local one to Ulanzi Studio.
import UlanzideckApi from "../libs/node/ulanzideckApi.js";
import { renderStat } from "./render.js";
import { readCpu, readGpu } from "./stats.js";

const appId = "com.replica.ulanzideck.system";
const REFRESH_MS = 2_000;

const READERS = { cpu: readCpu, gpu: readGpu };

// context -> { stat, active, image }; the stat is the last part of the action UUID.
const keys = {};

function key(context) {
  if (!keys[context]) {
    const stat = $UD.decodeContext(context).uuid.split(".").pop();
    keys[context] = { stat: READERS[stat] ? stat : "cpu", active: true, image: "" };
  }
  return keys[context];
}

// Each stat is read once per refresh, however many keys show it.
async function refresh(force) {
  const shown = new Set(Object.values(keys).filter((k) => k.active).map((k) => k.stat));
  for (const stat of shown) {
    const { label, level, sub } = await READERS[stat]();
    const image = renderStat(label, level, sub);
    for (const context in keys) {
      const k = keys[context];
      if (!k.active || k.stat !== stat || (!force && image === k.image)) continue;
      k.image = image;
      $UD.setBaseDataIcon(context, image);
    }
  }
}

const $UD = new UlanzideckApi();
$UD.connect(appId);

$UD.onAdd(({ context }) => {
  key(context);
  refresh(true);
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
