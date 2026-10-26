/**
 * 生成底部导航图标（81x81 PNG，RGBA）
 * 用 4x 超采样做抗锯齿，纯 Node 生成，无第三方依赖
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 81;
const SS = 4; // 超采样倍数
const BIG = SIZE * SS;

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter none
    rgba.copy(raw, p, y * width * 4, (y + 1) * width * 4);
    p += width * 4;
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- 形状（归一化到 81 坐标系） ---------- */
function inRoundedRect(x, y, rx, ry, w, h, r) {
  const x0 = rx, y0 = ry, x1 = rx + w, y1 = ry + h;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// 工具图标：2x2 圆角方块（代表九宫格）
function toolMask(x, y) {
  if (inRoundedRect(x, y, 8, 8, 28, 28, 7)) return true;
  if (inRoundedRect(x, y, 45, 8, 28, 28, 7)) return true;
  if (inRoundedRect(x, y, 8, 45, 28, 28, 7)) return true;
  if (inRoundedRect(x, y, 45, 45, 28, 28, 7)) return true;
  return false;
}

// 我的图标：头部圆 + 肩部穹顶
function meMask(x, y) {
  if (inCircle(x, y, 40.5, 25.5, 13.5)) return true;
  if (y >= 50 && y <= 71 && inCircle(x, y, 40.5, 72, 27)) return true;
  return false;
}

function render(mask, rgb) {
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS);
          const y = (py + (sy + 0.5) / SS);
          if (mask(x, y)) hit++;
        }
      }
      const a = Math.round((hit / (SS * SS)) * 255);
      const i = (py * SIZE + px) * 4;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = a;
    }
  }
  return out;
}

const NORMAL = [148, 163, 184]; // #94a3b8
const ACTIVE = [37, 99, 235]; // #2563eb

const outDir = path.join(__dirname, "..", "images", "tab");
fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  ["tools.png", toolMask, NORMAL],
  ["tools-active.png", toolMask, ACTIVE],
  ["me.png", meMask, NORMAL],
  ["me-active.png", meMask, ACTIVE],
];

for (const [name, mask, rgb] of jobs) {
  const buf = encodePNG(SIZE, SIZE, render(mask, rgb));
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(name, buf.length + " bytes");
}
console.log("output:", outDir);
