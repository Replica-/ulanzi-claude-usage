// CPU usage from Node's own CPU counters; GPU usage and temperature from
// nvidia-smi, which comes with the NVIDIA driver.
import { execFile } from "child_process";
import os from "os";

import Utils from "../libs/node/utils.js";

// Busy and total CPU time summed over all cores.
function cpuTimes() {
  let busy = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    const all = times.user + times.nice + times.sys + times.irq + times.idle;
    busy += all - times.idle;
    total += all;
  }
  return { busy, total };
}

// Usage since the previous measurement; the first one measures since start-up.
// Calls less than a second apart reuse the last result, as such a short
// window gives a noisy number.
let lastCpu = { busy: 0, total: 0, at: 0, pct: null };
export function readCpu() {
  if (Date.now() - lastCpu.at >= 1_000) {
    const now = cpuTimes();
    const total = now.total - lastCpu.total;
    const pct = total > 0 ? (100 * (now.busy - lastCpu.busy)) / total : null;
    lastCpu = { ...now, at: Date.now(), pct };
  }
  return { label: "CPU", level: lastCpu.pct, sub: "" };
}

export function readGpu() {
  return new Promise((resolve) =>
    execFile(
      "nvidia-smi",
      ["--query-gpu=utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"],
      { timeout: 5_000, windowsHide: true },
      (err, stdout) => {
        const [util, temp] = (stdout || "").split("\n")[0].split(",").map(Number);
        if (err || Number.isNaN(util)) {
          if (err) Utils.warn("nvidia-smi failed:", err.message);
          return resolve({ label: "GPU", level: null, sub: "" });
        }
        resolve({ label: "GPU", level: util, sub: Number.isNaN(temp) ? "" : `${temp}C` });
      }
    )
  );
}
