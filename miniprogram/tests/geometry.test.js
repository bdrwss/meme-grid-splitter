/**
 * 几何算法对照测试：小程序版 geometry.ts 必须与 Web 版 src/lib/geometry.ts 输出完全一致。
 *
 * 运行方式（在项目根目录）：
 *   node node_modules/typescript/bin/tsc src/lib/geometry.ts --module commonjs --target es2018 --outDir miniprogram/.tmp/web
 *   node node_modules/typescript/bin/tsc miniprogram/utils/geometry.ts --module commonjs --target es2018 --outDir miniprogram/.tmp/mp
 *   node miniprogram/tests/geometry.test.js
 */
const path = require("path");
const web = require(path.join(__dirname, "../.tmp/web/geometry.js"));
const mp = require(path.join(__dirname, "../.tmp/mp/geometry.js"));

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${name}\n  mp:   ${a}\n  web:  ${e}`);
  }
}

const lineSets = [
  [],
  [50],
  [33.3, 66.7],
  [10, 90],
  [1, 99],
  [12.5, 37.5, 62.5, 87.5],
  [5, 15, 25, 35, 45, 55, 65, 75, 85, 95], // 满配 10 条
  [66.7, 33.3], // 未排序输入
  [99.9, 0.5], // 越界值（与 Web 版行为一致：不裁剪，按百分比直接计算）
];

const sizes = [
  [1080, 1920],
  [1920, 1080],
  [853, 479], // 奇数宽高
  [999, 1001],
  [2, 2], // 极小
  [123, 456],
  [3, 1000],
];

// 1) buildRects + snapRect 逐格对照
for (const hLines of lineSets) {
  for (const vLines of lineSets.slice(0, 6)) {
    for (const [w, h] of sizes) {
      const webRects = web.buildRects(hLines, vLines, w, h);
      const mpRects = mp.buildRects(hLines, vLines, w, h);
      check(`buildRects h=${hLines} v=${vLines} ${w}x${h}`, mpRects, webRects);
      check(
        `snapRect   h=${hLines} v=${vLines} ${w}x${h}`,
        mpRects.map((r) => mp.snapRect(r)),
        webRects.map((r) => web.snapRect(r)),
      );
      check(
        `cellCount  h=${hLines} v=${vLines}`,
        mp.cellCount(hLines.length, vLines.length),
        web.cellCount(hLines.length, vLines.length),
      );
    }
  }
}

// 2) getEqualLines
for (let n = 0; n <= 12; n++) {
  check(`getEqualLines(${n})`, mp.getEqualLines(n), web.getEqualLines(n));
}

// 3) suggestNextLine 链式推进（直到满配）
for (const start of [[], [50], [33.3, 66.7], [10, 90]]) {
  let wl = start.slice();
  let ml = start.slice();
  for (let step = 0; step < 11; step++) {
    wl = web.suggestNextLine(wl);
    ml = mp.suggestNextLine(ml);
    check(`suggestNextLine step=${step} start=${start}`, ml, wl);
  }
}

// 4) 预设匹配
for (const preset of web.GRID_PRESETS) {
  const mpPreset = mp.GRID_PRESETS.find((p) => p.id === preset.id);
  check(`preset ${preset.id}`, mpPreset && mpPreset.hLines, preset.hLines);
  check(`preset ${preset.id} vLines`, mpPreset && mpPreset.vLines, preset.vLines);
  check(
    `isPresetActive ${preset.id} 正例`,
    mp.isPresetActive(mpPreset, preset.hLines, preset.vLines),
    true,
  );
  check(
    `isPresetActive ${preset.id} 微调后应失效`,
    mp.isPresetActive(mpPreset, [preset.hLines[0] + 1 || 40], preset.vLines),
    web.isPresetActive(preset, [preset.hLines[0] + 1 || 40], preset.vLines),
  );
}

// 5) snapRect 边界语义（偶数对齐 + 最小 2px）——直接对照 Web 版实现
for (const rect of [
  { x: 1.6, y: 3.4, w: 5.7, h: 1 },
  { x: -5, y: 2.5, w: 0, h: 0 },
  { x: 1079.9, y: 1919.9, w: 1081, h: 1921 },
  { x: 0.4, y: 0.4, w: 2.4, h: 3.4 },
]) {
  check(`snapRect ${JSON.stringify(rect)}`, mp.snapRect(rect), web.snapRect(rect));
}

// 6) 常量一致性
check("DEFAULT_LINES", mp.DEFAULT_LINES, web.DEFAULT_LINES);
check("MAX_LINES", mp.MAX_LINES, web.MAX_LINES);

console.log(`\n几何对照测试：${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
