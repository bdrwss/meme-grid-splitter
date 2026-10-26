# 宫格视频工具箱（微信小程序）

零成本纯客户端小程序：无服务器、无云服务、无付费依赖，视频全程不出手机。

## 目录结构

```
miniprogram/
├── app.ts / app.json / app.wxss    # 应用入口与全局配置
├── typings.d.ts                     # 最小运行时类型声明（免安装类型包）
├── libs/
│   └── gifenc.js                    # vendored gifenc v1.0.3（MIT 开源，22KB）
├── utils/
│   ├── geometry.ts                  # 切割几何算法（自 Web 版 src/lib/geometry.ts 原样移植，纯函数）
│   ├── sha256.ts                    # SHA-256 + HMAC 纯 TS 实现（与 Node crypto 交叉验证）
│   ├── activation.ts                # 离线激活码：生成 / 校验（学员码、教师码）
│   ├── storage.ts                   # 绑定状态与教师解锁的本机存储
│   ├── catalog.ts                   # 工具目录 + 客户端搜索（新工具在此追加）
│   ├── gifencode.ts                 # CellGif 单格构建器（采样→调色板→逐帧编码，纯逻辑可测）
│   ├── videodecode.ts               # VideoDecoder 封装（seek 定点取帧，ms 语义）
│   └── gifpipe.ts                   # 管线编排：两遍解码 → 裁剪 → 编码 → 落盘
├── pages/
│   ├── index/                       # 底部 Tab 1「工具」：固定搜索框 + 工具卡片 + 激活状态条
│   ├── splitter/                    # 切割页：选视频 → 预览+切割线拖动 → 画质 → 进度 → 结果九宫格与保存
│   ├── bind/                        # 学员激活：输入 UID + 激活码
│   ├── profile/                     # 底部 Tab 2「我的」：账户卡 + 激活信息 + 教师模式 + 关于
│   └── teacher/                     # 教师工具：批量生成激活码、查看当月教师码
├── images/tab/                      # 底部导航图标（81×81 PNG，由 .tmp/gen-tab-icons.js 生成）
└── tests/                           # Node 对照测试（不打包进小程序）
```

## 开发与调试（全程免费）

1. 修改 TS 后编译（产物 .js 与 .ts 同目录）：
   ```
   node node_modules/typescript/bin/tsc -p miniprogram/tsconfig.json
   ```
2. 用微信开发者工具打开**项目根目录**（根目录的 `project.config.json` 已指向 `miniprogram/`）。
3. AppID：注册小程序后，把根目录 `project.config.json` 里的 `"touristappid"` 替换为你的 AppID；未注册前可用测试号。

## 测试

```
# 几何算法与 Web 版一致性（1213 项断言）
node node_modules/typescript/bin/tsc src/lib/geometry.ts --module commonjs --target es2018 --outDir miniprogram/.tmp/web
node node_modules/typescript/bin/tsc miniprogram/utils/geometry.ts --module commonjs --target es2018 --outDir miniprogram/.tmp/mp
node miniprogram/tests/geometry.test.js

# SHA-256/HMAC 与激活码（29 项断言，与 Node crypto 对照）
node node_modules/typescript/bin/tsc miniprogram/utils/sha256.ts miniprogram/utils/activation.ts --module commonjs --target es2018 --outDir miniprogram/.tmp/mp2
node miniprogram/tests/hmac.test.js
```

## 底部导航（两栏）

使用微信原生 `tabBar`（`app.json` → `tabBar`），两栏等宽 50/50，由框架统一排布并自动避让底部安全区：

| 位置 | 页面 | 说明 |
|---|---|---|
| 左 | `pages/index/index` | 工具：固定搜索框 + 工具卡片 + 激活状态条 |
| 右 | `pages/profile/index` | 我的：账户卡、激活信息、教师模式、关于 |

- 图标：`images/tab/*.png`（81×81，两套常态/选中态），由 `miniprogram/.tmp/gen-tab-icons.js` 脚本生成，可随时改色重跑。
- 切换页使用 `wx.switchTab`；进入切割、激活、教师等非 Tab 页仍用 `wx.navigateTo`。
- 原首页底部的「我的 / 账户」入口已移入 Tab 2，首页仅保留工具门户职责。

## 使用流程

- **学员**：首页点工具 → 提示激活 → 输入老师给的 UID + 激活码 → 解锁切割工具。
- **老师（你）**：「我的」页连点顶部账户卡片 5 次 → 输入教师码 → 进入教师工具页，批量粘贴 UID 生成激活码，复制发给学员。
- **教师码**：教师工具页底部展示当月教师码（按月轮换，上月码当月仍有效），用于在新设备上解锁教师模式。

## 激活码机制（离线，无后端）

- 激活码格式：`过期日期YYYYMMDD-` + `HMAC-SHA256(密钥, "UID:过期日期")` 前 16 位。
- 密钥内置在代码中（`utils/activation.ts` 的 `STUDENT_SECRET` / `TEACHER_SECRET`），**发版时轮换**可让旧码全部失效。
- 已知边界：无法远程禁用某台设备；绑定状态仅存本机；换手机需重新输码。

## 尚未实现（后续步骤）

- **第 7 步（下一步）**：真机回归——用真实视频验证 VideoDecoder 逐帧取帧、OffscreenCanvas 裁剪、GIF 保存到相册的动图表现、低端机处理耗时与内存。
- 提审前：服务类目选「工具 > 图片/音视频处理」，简介注明“处理结果仅用户本人保存”。

## 编码管线（第 6 步已实现）

```
video ──VideoDecoder(seek 定点取帧, mode 0, 免音频)──▶ 原始 RGBA 帧
      ──OffscreenCanvas putImageData──▶ 主画布
      ──drawImage 按格裁剪缩放──▶ 9 个格画布（宽度上限 240/320/480）
      ──getImageData──▶ CellGif
           Pass 1: 12 个均匀时间点采样 → quantize 生成每格调色板
           Pass 2: 自适应帧率逐帧 applyPalette → LZW 编码（总帧数 ≤ 300）
      ──FileSystemManager──▶ USER_DATA_PATH/grid-cell-N.gif
```

- 帧率自适应：`fps = clamp(round(300/时长), 5, 12)`，长视频自动降帧，保证处理时长可控。
- GIF 无限循环（`repeat: 0`，同 Web 版 `-loop 0`）；调色板为每格独立（近似 Web 版 `palettegen`）。
- 取消/退出页面立即中止并清理半成品；相册保存失败时自动引导用「发送给好友」保留动图原文件。
