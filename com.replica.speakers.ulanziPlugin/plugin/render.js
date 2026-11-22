// Draws the 196x196 dial image as a PNG data URL, using only Node's zlib.
import zlib from "zlib";

const SIZE = 196;

const WHITE = [235, 235, 235];
const GREY = [140, 140, 140];
const TRACK = [55, 55, 55];
const GREEN = [63, 216, 138];

// 5x7 pixel font: digits, A-Z and a little punctuation.
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
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
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

// A dial: label (an app name can be long), level, and a bar. pct is null when
// the level is unknown.
export function renderDial(label, pct) {
  const canvas = new Canvas();
  let text = label.toUpperCase().replace(/[^0-9A-Z%. -]/g, "").replace(/\s+/g, " ").trim();
  const scale = Canvas.textWidth(text, 4) <= SIZE - 20 ? 4 : 3;
  while (Canvas.textWidth(text, scale) > SIZE - 20) text = text.slice(0, -1).trimEnd();
  canvas.centeredText(text, 24, scale, WHITE);
  canvas.centeredText(pct === null ? "--" : `${Math.round(pct)}%`, 76, 7, pct === null ? GREY : WHITE);
  canvas.rect(14, 150, SIZE - 28, 18, TRACK);
  if (pct !== null) canvas.rect(14, 150, Math.round(((SIZE - 28) * Math.min(100, pct)) / 100), 18, GREEN);
  return canvas.toDataUrl();
}
