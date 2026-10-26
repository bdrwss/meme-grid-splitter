/**
 * CellGif 编码冒烟测试（Node）：
 * 用合成帧（红→蓝渐变动画）走完 采样→调色板→编码 全流程，
 * 校验 GIF89a 文件头、NETSCAPE 循环扩展、文件尾与多帧结构。
 *
 * 运行方式（在项目根目录）：
 *   node node_modules/typescript/bin/tsc miniprogram/utils/gifencode.ts --module commonjs --target es2018 --outDir miniprogram/.tmp/mp3 --esModuleInterop
 *   node miniprogram/tests/gifencode.test.js
 */
const path = require("path");
const { CellGif, adaptiveFps } = require(path.join(__dirname, "../.tmp/mp3/gifencode.js"));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${name}${detail ? "：" + detail : ""}`);
  }
}

// ── 构造 24×16 的红→蓝闪烁动画（20 帧）──
const W = 24;
const H = 16;
const FRAMES = 20;
const DELAY = 100;

function makeFrame(k) {
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = Math.round((255 * k) / (FRAMES - 1));
    rgba[i * 4 + 1] = 64;
    rgba[i * 4 + 2] = Math.round((255 * (FRAMES - 1 - k)) / (FRAMES - 1));
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

const gif = new CellGif(W, H, DELAY);
for (let i = 0; i < 6; i++) gif.addSamplePixels(makeFrame(i * 3));
gif.buildPalette(256);
for (let i = 0; i < FRAMES; i++) gif.addFrame(makeFrame(i));
const bytes = gif.finish();

// 1) 文件头 GIF89a
check("文件头 GIF89a", String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a");

// 2) NETSCAPE2.0 无限循环扩展存在
const ascii = Buffer.from(bytes).toString("latin1");
check("NETSCAPE 循环扩展", ascii.includes("NETSCAPE2.0"));

// 3) 文件尾 0x3B
check("文件尾 0x3B", bytes[bytes.length - 1] === 0x3b);

// 4) 逻辑屏幕尺寸（小端）
check("屏幕宽度", bytes[6] | (bytes[7] << 8) === W, `got ${bytes[6] | (bytes[7] << 8)}`);
check("屏幕高度", bytes[8] | (bytes[9] << 8) === H, `got ${bytes[8] | (bytes[9] << 8)}`);

// 5) 多帧：统计图像分隔符 0x2C 出现次数（至少等于帧数；LZW 数据中也可能出现，用 >=）
let separators = 0;
for (let i = 13; i < bytes.length - 1; i++) {
  if (bytes[i] === 0x2c && bytes[i - 1] === 0) separators++;
}
check("包含全部 20 帧图像", separators >= FRAMES, `separators=${separators}`);

// 6) 体积合理（20 帧渐变应远大于空文件、远小于原始 RGBA）
check(
  "体积合理",
  bytes.length > 500 && bytes.length < W * H * 4 * FRAMES,
  `len=${bytes.length}`,
);

// 7) 帧延迟写入（GCE 中 delay 单位 1/100s，100ms → 10）
const delayIdx = ascii.indexOf("\u0021\u00f9\u0004");
check("GCE 扩展存在", delayIdx >= 0);
if (delayIdx >= 0) {
  const delayUnits = bytes[delayIdx + 4] | (bytes[delayIdx + 5] << 8);
  check("帧延迟 100ms", delayUnits === 10, `delayUnits=${delayUnits}`);
}

// 8) 空采样时灰阶调色板兜底
const gif2 = new CellGif(4, 4, 100);
gif2.buildPalette(256);
gif2.addFrame(new Uint8Array(4 * 4 * 4));
check("空采样兜底", gif2.finish().length > 30);

// 9) 未 buildPalette 就 addFrame 应报错
let threw = false;
try {
  const gif3 = new CellGif(4, 4, 100);
  gif3.addFrame(new Uint8Array(4 * 4 * 4));
} catch (e) {
  threw = true;
}
check("未生成调色板时报错", threw);

// 10) 自适应帧率
check("adaptiveFps 60s → 5", adaptiveFps(60) === 5, `got ${adaptiveFps(60)}`);
check("adaptiveFps 25s → 12", adaptiveFps(25) === 12, `got ${adaptiveFps(25)}`);
check("adaptiveFps 10s → 12", adaptiveFps(10) === 12, `got ${adaptiveFps(10)}`);
check("adaptiveFps 0s → 12", adaptiveFps(0) === 12);

// 11) 采样上限保护（注入超量采样不崩溃且可正常编码）
const gif4 = new CellGif(64, 64, 80);
for (let i = 0; i < 40; i++) gif4.addSamplePixels(makeFrame(i % FRAMES));
gif4.buildPalette(64);
gif4.addFrame(makeFrame(0));
check("超量采样保护", gif4.finish().length > 100);

console.log(`\nGIF 编码测试：${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
