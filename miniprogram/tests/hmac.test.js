/**
 * SHA-256 / HMAC-SHA256 纯 TS 实现的正确性测试：与 Node 内置 crypto 交叉验证。
 *
 * 运行方式（在项目根目录）：
 *   node node_modules/typescript/bin/tsc miniprogram/utils/sha256.ts miniprogram/utils/activation.ts --module commonjs --target es2018 --outDir miniprogram/.tmp/mp2
 *   node miniprogram/tests/hmac.test.js
 */
const path = require("path");
const crypto = require("crypto");
const { sha256Hex, hmacSha256Hex } = require(path.join(__dirname, "../.tmp/mp2/sha256.js"));
const activation = require(path.join(__dirname, "../.tmp/mp2/activation.js"));

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${name}\n  got:      ${actual}\n  expected: ${expected}`);
  }
}

// 1) SHA-256 标准向量
check("sha256('')", sha256Hex(""), crypto.createHash("sha256").update("").digest("hex"));
check("sha256('abc')", sha256Hex("abc"), crypto.createHash("sha256").update("abc").digest("hex"));
check(
  "sha256 长输入(55字节边界)",
  sha256Hex("a".repeat(55)),
  crypto.createHash("sha256").update("a".repeat(55)).digest("hex"),
);
check(
  "sha256 长输入(56字节边界)",
  sha256Hex("a".repeat(56)),
  crypto.createHash("sha256").update("a".repeat(56)).digest("hex"),
);
check(
  "sha256 长输入(64字节)",
  sha256Hex("a".repeat(64)),
  crypto.createHash("sha256").update("a".repeat(64)).digest("hex"),
);
check(
  "sha256 长输入(1000字节)",
  sha256Hex("x".repeat(1000)),
  crypto.createHash("sha256").update("x".repeat(1000)).digest("hex"),
);
check(
  "sha256 中文",
  sha256Hex("喜播教育九宫格切割工具"),
  crypto.createHash("sha256").update("喜播教育九宫格切割工具", "utf8").digest("hex"),
);
check(
  "sha256 emoji(代理对)",
  sha256Hex("🎉🀄𝕏"),
  crypto.createHash("sha256").update("🎉🀄𝕏", "utf8").digest("hex"),
);

// 2) HMAC-SHA256 标准向量（RFC 4231 Test Case 2）
check(
  "HMAC RFC4231-2",
  hmacSha256Hex("Jefe", "what do ya want for nothing?"),
  crypto.createHmac("sha256", "Jefe").update("what do ya want for nothing?").digest("hex"),
);

// 3) HMAC 各种密钥长度（<64、=64、>64 触发密钥哈希路径）
for (const keyLen of [8, 63, 64, 65, 100, 200]) {
  const key = `k${keyLen}-` + "z".repeat(keyLen);
  const msg = `message-${keyLen}-` + "m".repeat(keyLen);
  check(
    `HMAC keyLen=${keyLen}`,
    hmacSha256Hex(key, msg),
    crypto.createHmac("sha256", key).update(msg).digest("hex"),
  );
}
check(
  "HMAC 空密钥",
  hmacSha256Hex("", "data"),
  crypto.createHmac("sha256", "").update("data").digest("hex"),
);
check(
  "HMAC 空消息",
  hmacSha256Hex("key", ""),
  crypto.createHmac("sha256", "key").update("").digest("hex"),
);
check(
  "HMAC 中文混合",
  hmacSha256Hex("密钥喜播", "消息九宫格🎉"),
  crypto.createHmac("sha256", "密钥喜播").update("消息九宫格🎉", "utf8").digest("hex"),
);

// 4) 激活码生成 → 校验闭环
const now = new Date(2026, 9, 26); // 2026-10-26（注意 JS 月份从 0 起）
const gen = activation.generateStudentCode("XB10086", 90, now);
check("激活码格式", /^[0-9]{8}-[0-9A-F]{16}$/.test(gen.code) ? "ok" : gen.code, "ok");
check("过期日=90天后", gen.expiresAt, "20270124");
check("正确码校验通过", activation.verifyStudentCode("XB10086", gen.code, now).ok, true);
check(
  "错 UID 校验失败",
  activation.verifyStudentCode("XB10087", gen.code, now).ok,
  false,
);
check(
  "篡改签名校验失败",
  activation.verifyStudentCode("XB10086", gen.code.slice(0, 13) + "0" + gen.code.slice(14), now).ok,
  false,
);
check(
  "过期后校验失败",
  activation.verifyStudentCode("XB10086", gen.code, new Date(2027, 0, 25)).ok, // 2027-01-25
  false,
);
check(
  "过期当天仍有效",
  activation.verifyStudentCode("XB10086", gen.code, new Date(2027, 0, 24)).ok, // 2027-01-24
  true,
);
check("乱码格式校验失败", activation.verifyStudentCode("XB10086", "not-a-code", now).ok, false);

// 5) 教师码月度轮换
const tc = activation.generateTeacherCode(now);
check("教师码当月有效", activation.verifyTeacherCode(tc, now), true);
check(
  "教师码上月也有效",
  activation.verifyTeacherCode(
    activation.generateTeacherCode(new Date(2026, 8, 15)), // 2026-09
    now,
  ),
  true,
);
check(
  "教师码两个月前无效",
  activation.verifyTeacherCode(activation.generateTeacherCode(new Date(2026, 7, 15)), now), // 2026-08
  false,
);

console.log(`\nSHA-256/HMAC/激活码测试：${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
