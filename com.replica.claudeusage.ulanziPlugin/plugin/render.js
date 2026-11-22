// Draws the 196x196 key image as a PNG data URL, using only Node's zlib.
import zlib from "zlib";

const SIZE = 196;

const WHITE = [235, 235, 235];
const GREY = [140, 140, 140];
const TRACK = [55, 55, 55];
const GREEN = [63, 216, 138];
const AMBER = [255, 176, 32];
const RED = [255, 77, 77];

// 5x7 pixel font, only the characters the key needs.
const FONT = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "%": ["11000", "11001", "00010", "00100", "01000", "10011", "00011"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

class Canvas {
  constructor() {
    this.px = Buffer.alloc(SIZE * SIZE * 3); // black
  }

  rect(x, y, w, h, [r, g, b]) {
    for (let j = Math.max(0, y); j < Math.min(SIZE, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(SIZE, x + w); i++) {
        const o = (j * SIZE + i) * 3;
        this.px[o] = r;
        this.px[o + 1] = g;
        this.px[o + 2] = b;
      }
    }
  }

  static textWidth(str, scale) {
    return str.length * 6 * scale - scale;
  }

  text(str, x, y, scale, color) {
    for (const ch of str) {
      const glyph = FONT[ch] || FONT[" "];
      glyph.forEach((row, j) => {
        for (let i = 0; i < 5; i++) {
          if (row[i] === "1") this.rect(x + i * scale, y + j * scale, scale, scale, color);
        }
      });
      x += 6 * scale;
    }
  }

  centeredText(str, y, scale, color) {
    this.text(str, Math.round((SIZE - Canvas.textWidth(str, scale)) / 2), y, scale, color);
  }

  toDataUrl() {
    const stride = SIZE * 3 + 1;
    const raw = Buffer.alloc(stride * SIZE);
    for (let y = 0; y < SIZE; y++) {
      this.px.copy(raw, y * stride + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", zlib.deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    return "data:image/png;base64," + png.toString("base64");
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// resets_at arrives as epoch seconds; accept milliseconds or ISO text too.
export function toMs(value) {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function formatDuration(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  if (mins < 60) return `${mins}M`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H${mins % 60}M`;
  return `${Math.floor(hours / 24)}D${hours % 24}H`;
}

function levelColor(pct) {
  if (pct >= 80) return RED;
  if (pct >= 50) return AMBER;
  return GREEN;
}

function drawWindow(canvas, top, label, win, now) {
  const resetMs = toMs(win?.resets_at);
  const expired = resetMs !== null && resetMs <= now;
  const pct = typeof win?.used_percentage === "number" && !expired ? Math.round(win.used_percentage) : null;
  const color = pct === null ? GREY : levelColor(pct);

  canvas.text(label, 14, top, 4, WHITE);
  const pctText = pct === null ? "--" : `${pct}%`;
  canvas.text(pctText, SIZE - 14 - Canvas.textWidth(pctText, 4), top, 4, color);

  canvas.rect(14, top + 36, SIZE - 28, 14, TRACK);
  if (pct !== null) {
    canvas.rect(14, top + 36, Math.round(((SIZE - 28) * Math.min(100, pct)) / 100), 14, color);
  }

  let sub = "NO DATA";
  if (expired) sub = "RESET";
  else if (pct !== null && resetMs !== null) sub = "RESETS " + formatDuration(resetMs - now);
  else if (pct !== null) sub = "";
  canvas.text(sub, 14, top + 58, 2, GREY);
}

export function renderKey(usage, now = Date.now()) {
  const canvas = new Canvas();
  const limits = usage?.rate_limits;
  if (!limits) {
    canvas.centeredText("CLAUDE", 40, 4, WHITE);
    canvas.centeredText("NO DATA YET", 100, 2, GREY);
    canvas.centeredText("OPEN CLAUDE", 124, 2, GREY);
    canvas.centeredText("IN VS CODE", 148, 2, GREY);
    return canvas.toDataUrl();
  }
  drawWindow(canvas, 12, "5H", limits.five_hour, now);
  drawWindow(canvas, 108, "7D", limits.seven_day, now);
  return canvas.toDataUrl();
}
