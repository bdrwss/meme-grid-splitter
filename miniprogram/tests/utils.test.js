const assert = require("assert");
const {
  sanitizePrefix,
  sanitizeSuffix,
  formatBytes,
  formatTime,
  getAspectRatioLabel,
  DEFAULT_PREFIX,
} = require("../utils/utils.js");
const JSZip = require("../libs/jszip.js");

console.log("=== 开始测试 utils.js 及 JSZip ===");

// 1. sanitizePrefix
assert.strictEqual(sanitizePrefix(""), DEFAULT_PREFIX);
assert.strictEqual(sanitizePrefix("   "), DEFAULT_PREFIX);
assert.strictEqual(sanitizePrefix(null), DEFAULT_PREFIX);
assert.strictEqual(sanitizePrefix("表情包"), "表情包");
assert.strictEqual(sanitizePrefix("猫咪/表情*包?"), "猫咪_表情_包_");
assert.strictEqual(sanitizePrefix("CON"), "_CON");
assert.strictEqual(sanitizePrefix("aux.png"), "_aux.png");
assert.strictEqual(sanitizePrefix("a".repeat(60)).length, 50);

// 2. sanitizeSuffix
assert.strictEqual(sanitizeSuffix(""), "");
assert.strictEqual(sanitizeSuffix("   "), "");
assert.strictEqual(sanitizeSuffix("hd"), "_hd");
assert.strictEqual(sanitizeSuffix("_hd"), "_hd");
assert.strictEqual(sanitizeSuffix("-wx"), "-wx");
assert.strictEqual(sanitizeSuffix(".gif"), ".gif");

// 3. formatBytes
assert.strictEqual(formatBytes(500), "1 KB");
assert.strictEqual(formatBytes(2048), "2 KB");
assert.strictEqual(formatBytes(1048576 * 2.5), "2.5 MB");
assert.strictEqual(formatBytes(1073741824 * 1.2), "1.2 GB");

// 4. formatTime
assert.strictEqual(formatTime(0), "00:00");
assert.strictEqual(formatTime(5.4), "00:05");
assert.strictEqual(formatTime(65.2), "01:05");
assert.strictEqual(formatTime(125), "02:05");

// 5. getAspectRatioLabel
assert.strictEqual(getAspectRatioLabel(480, 480), "1:1");
assert.strictEqual(getAspectRatioLabel(1920, 1080), "16:9");
assert.strictEqual(getAspectRatioLabel(1080, 1920), "9:16");
assert.strictEqual(getAspectRatioLabel(640, 480), "4:3");
assert.strictEqual(getAspectRatioLabel(480, 640), "3:4");

// 6. JSZip
const zip = new JSZip();
zip.file("test.gif", "GIF89a...");
zip.generateAsync({ type: "uint8array" }).then((buf) => {
  assert(buf.length > 50, "ZIP 生成内容长度必须大于 50");
  console.log("utils.js 与 JSZip 测试全部通过！");
});
