// CPU usage from Node's own CPU counters; GPU usage and temperature from
// nvidia-smi, which comes with the NVIDIA driver; RAM and disk space from Node.
import { execFile } from "child_process";
import fs from "fs";
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

const GB = 1024 ** 3;

// Used RAM, counting what Windows reports as available as free.
export function readRam() {
  const total = os.totalmem();
  const used = total - os.freemem();
  return {
    label: "RAM",
    level: (100 * used) / total,
    sub: `${(used / GB).toFixed(1)}/${Math.round(total / GB)}G`,
  };
}

// "412G" or, from 1000G up, "1.2T".
function size(bytes) {
  const gb = bytes / GB;
  return gb < 1000 ? `${Math.round(gb)}G` : `${(gb / 1024).toFixed(1)}T`;
}

// Space used on a drive, with the free space underneath.
export async function readDisk(drive) {
  const label = `DISK ${drive}`;
  try {
    const { blocks, bavail, bsize } = await fs.promises.statfs(`${drive}:/`);
    return { label, level: (100 * (blocks - bavail)) / blocks, sub: `${size(bavail * bsize)} FREE` };
  } catch (err) {
    Utils.warn(`Reading drive ${drive} failed:`, err.message);
    return { label, level: null, sub: "" };
  }
}

// Drive letters that currently have a file system.
export async function listDrives() {
  const letters = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const found = await Promise.all(
    letters.map((d) => fs.promises.statfs(`${d}:/`).then(() => d, () => null))
  );
  return found.filter(Boolean);
}
