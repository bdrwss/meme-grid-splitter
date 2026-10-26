# 九宫格表情包切割器（源码工程 · 一比一复刻版）

纯前端的「动态九宫格表情包视频切割器」。上传一张多宫格动态表情包视频（或 GIF），
用可增删、可拖拽、可输入精确数值的切割线把画面切开，在 **浏览器本地** 用 ffmpeg.wasm
把每一格裁成独立的表情包视频，支持 **MP4** 与 **循环 GIF** 两种导出，可单格下载、
勾选打包、或一键全部打包成 ZIP。

> 视频全程不离开本机：所有解码、裁切、编码都在浏览器里完成，不上传任何服务器。

本工程是对原站（秒哒平台生成的线上应用 `https://app-f9osmt3mxse9.miaoda.online`）
的**重新参照开发（复刻）**：行为契约、UI 文案、配色与动效、切割/导出算法、ffmpeg
滤镜链均按原站产物逐项还原，并重写为可读、可维护的 TypeScript 源码。原站的构建产物
原样保留在 `original-build/` 目录中，供逐字对照。

---

## 1. 目录结构

```
meme-grid-splitter/
├─ index.html                 # Vite 入口 HTML（含与原站一致的内联 redirect 脚本与 SEO 元信息）
├─ package.json               # 依赖与脚本（dev / build / preview）
├─ package-lock.json          # 锁定依赖版本
├─ tsconfig.json              # TypeScript 配置
├─ vite.config.ts             # 构建配置（base: "./"，产物可放任意路径）
├─ tailwind.config.js         # Tailwind 主题：主色玫红、Zap 圆角、fade-in 动效、ZCOOL 字体
├─ postcss.config.js          # PostCSS（tailwindcss + autoprefixer）
├─ .gitignore
├─ public/
│  ├─ favicon.png             # 站点图标
│  ├─ platform/               # 「秒哒制作」角标的本地资源（避免依赖平台 CDN）
│  │  ├─ favicon.png
│  │  └─ close.svg
│  └─ ffmpeg/                 # ffmpeg.wasm 的 worker 与常量（同源加载，等价原站 /ffmpeg/*）
│     ├─ worker.js
│     ├─ const.js
│     └─ errors.js
├─ src/
│  ├─ main.tsx                # 应用入口（挂载 React + Toaster）
│  ├─ App.tsx                 # 顶层组件（页面骨架 + 右下角角标 + 全局 Toaster）
│  ├─ config.ts               # 界面开关：SHOW_PLATFORM_BADGE（右下角「秒哒制作」角标）
│  ├─ index.css               # 设计令牌（HSL 变量）、sticker 阴影、dot-grid、fade-in 等
│  ├─ pages/
│  │  └─ SplitterPage.tsx     # 主页面：四个步骤区 + 状态编排
│  ├─ components/
│  │  ├─ Section.tsx          # 带编号的步骤区块外壳
│  │  ├─ UploadCard.tsx       # 步骤 1：上传视频（点击/拖拽）
│  │  ├─ PreviewCanvas.tsx    # 步骤 2：九宫格预览 + 切割线图层（拖拽调整）
│  │  ├─ LinePanel.tsx        # 步骤 2：横线/竖线面板（±增删、百分比/像素、精确输入、删除）
│  │  ├─ CutPanel.tsx         # 步骤 3：执行切割（进度、取消、重新切割）
│  │  ├─ DownloadPanel.tsx    # 步骤 4：导出格式、文件名前缀、单格/勾选/全部下载
│  │  ├─ PlatformBadge.tsx    # 右下角「秒哒制作」角标（Portal 到 body，× 可关闭）
│  │  ├─ icons/file-play.tsx  # lucide 无内置 FilePlay，按原站 SVG 用 createLucideIcon 自建
│  │  ├─ icons/package.tsx    # 按原站所用旧版图元复刻 package（盒盖两翼为直线 polyline）
│  │  └─ ui/                  # shadcn/Radix 基础组件（button/input/label/badge/checkbox/progress/alert-dialog/sonner）
│  └─ lib/
│     ├─ utils.ts             # cn()、formatBytes() 等工具
│     ├─ geometry.ts          # 切割线 → 矩形几何：buildRects / snapRect（取偶、最小 2px）
│     ├─ video.ts             # 视频元信息读取、fetchAsBlobUrl（供 ffmpeg core 的 Blob URL）
│     ├─ engine.ts            # ffmpeg.wasm 引擎加载（多 CDN 兜底 + 90s 超时 + 同源 worker）
│     └─ split.ts             # 切割与导出：单格裁剪、批量并发、MP4 与循环 GIF 滤镜链、ZIP 打包
├─ original-build/            # 【对照目录】原站线上构建产物（原样保留，勿改）
│  ├─ index.html              # 原站首页 HTML（含 SEO/OG/内联脚本）
│  ├─ assets/
│  │  ├─ index-CSv1xKhH.js    # 原站主包（minified）
│  │  └─ index-5MHfmlPY.css   # 原站样式包
│  ├─ ffmpeg/                 # 原站同源 ffmpeg worker 与常量
│  └─ ui-strings.txt          # 从原站产物中提取的 86 条去重 UI 文案（逐字对照用）
├─ docs/
│  └─ 界面差异清单.md          # 与原站逐状态、逐像素的比对结论与复现命令
└─ dist/                      # 构建产物（已随包提供，可直接用静态服务器预览）
```

---

## 2. 环境要求

- **Node.js ≥ 18**（推荐 18 LTS 或 20 LTS；本工程用 Node 18.19 构建验证通过）
- **npm ≥ 9**
- 首次打开页面需要 **联网**：ffmpeg.wasm 的 core（core.js + core.wasm，约 30MB）
  按原站同样的策略从 CDN 下载（unpkg 优先，jsdelivr / npmmirror 兜底），下载一次后浏览器会缓存。
- 除首次下载引擎外，切割与导出全部离线在本地完成。

---

## 3. 安装与运行

```bash
# 1) 安装依赖
npm install

# 2) 开发模式（热更新，默认 http://localhost:5173）
npm run dev

# 3) 生产构建（产物输出到 dist/）
npm run build

# 4) 预览构建产物（默认 http://localhost:4173）
npm run preview
```

> **重要**：请用 `npm run dev` 或 `npm run preview` 这类 **HTTP 服务器** 打开页面，
> 不要直接双击 `dist/index.html`（`file://` 协议下浏览器会拦截 ESM Worker，引擎无法启动）。
> 若想用别的静态服务器，**根目录可以指向 `dist/`，也可以指向 `dist/` 的任意上级目录**：
>
> ```bash
> # 方式一：直接把 dist 当站点根目录
> python -m http.server 8080 --directory dist
> # 访问 http://localhost:8080/
>
> # 方式二：把解压出来的项目文件夹当根目录（dist 在子目录里也能正常工作）
> python -m http.server 8080 --directory .
> # 访问 http://localhost:8080/dist/
> ```
>
> 页面对角标图片、`ffmpeg` worker 等本地资源一律按 **页面自身的基准地址** 解析
> （`document.baseURI`），因此在站点根目录、子目录或反代子路径下都能正确加载，
> 切图功能不受影响。

---

## 4. 放到 `C:\Users\98691\Desktop\9999` 的方法（Windows）

本工程以压缩包形式交付，压缩包顶层就是项目文件夹 `meme-grid-splitter`：

1. 确认 `C:\Users\98691\Desktop\9999` 存在；不存在就先新建这个文件夹。
2. 把 `meme-grid-splitter.zip` 解压到 `C:\Users\98691\Desktop\9999` 下，
   解压后得到 `C:\Users\98691\Desktop\9999\meme-grid-splitter\`。
3. 在该目录下打开命令行（在文件夹地址栏输入 `cmd` 回车），依次执行：

   ```bat
   npm install
   npm run dev
   ```

   浏览器打开提示的地址（默认 `http://localhost:5173`）即可看到与原站一致的界面。
4. 想直接看成品、不改代码，可先执行 `npm run build`，再 `npm run preview`
   （默认 `http://localhost:4173`）。

> 目录名用的是 ASCII 的 `meme-grid-splitter`，避免中文名在 Windows 解压时出现编码问题。
> 若不习惯，解压后把文件夹改名（例如 `九宫格表情包切割器`）不影响运行，但请保持路径
> 全为英文/数字，以避免个别工具链的路径问题。

---

## 5. 功能清单（与原站一致，末尾附本工程新增项）

**步骤 1 · 上传视频**
- 点击或拖拽上传，支持 `mp4 / mov / webm / mkv / gif`，最大 1GB。
- 显示文件名、大小、分辨率、时长；提供「更换视频」。

**步骤 2 · 设置切割线**
- 默认九宫格：横线 2 条、竖线 2 条，默认位置 33.3% / 66.7%。
- 横线与竖线分别可「−」减少、「+」增加，单侧上限 **10 条**（与原站一致）。
- 每条线可输入精确数值，支持 **百分比 / 像素** 两种单位实时换算（像素按画面宽/高换算）。
- 预览区可直接 **拖拽** 切割线；横线粉色、竖线蓝色，线端带数值标签。
- 实时提示「将切割出 N 个表情包」；格子宽或高不足 2 像素时拦截并提示，不产出结果。
- 几何算法按原站：位置取整到偶数（`Math.round(x) & -2`），宽/高最小 2 像素，
  格子按 **自上而下、自左而右** 顺序编号。

**步骤 3 · 执行切割**
- 浏览器本地用 ffmpeg.wasm 逐格裁剪；每格独立在 worker 中执行，带进度与状态提示。
- 支持「取消切割」并中断当前任务；切割中更换视频会弹出确认框。

**步骤 4 · 下载导出**
- 导出格式：**MP4**（保持原时长与动效、复制原音轨）或 **GIF**（无限循环、调色板优化）。
- 可自定义 **文件名前缀**，命名规则 `${前缀}_序号.gif|mp4`；打包 ZIP 命名 `${前缀}_表情包.zip`。
- 结果卡片支持单个下载、勾选后「下载所选(N)」、「全部下载」打包 ZIP。

**时长约束（本工程新增，默认关闭）**
- 右侧面板「统一片段时长」开关打开后，可设置目标时长（0.2~60 秒，步进 0.1 秒），
  切割出的每个片段都统一成这个长度。
- 片段比目标长：按 `原始时长 / 目标时长` 加速（`setpts` 压时间轴），MP4 保留音频时
  用 `atempo` 链同步变速，输出时长精确到目标值。
- 片段比目标短：`split` 复制 N 路再 `concat` 拼回，音轨用 `asplit` 同构拼接以保证音画同步，
  最后用 `-t` 截到目标时长。
- 两者相等（0.05 秒容差内）：完全走原有链路，不做任何变速或循环。
- 策略与滤镜拼装集中在 `src/lib/duration.ts`，界面提示会实时显示「加速 x2.00 / 循环 2 次」。
- GIF 加速时会自动提升到 10/20/50 fps 档位并给末帧补帧，避开 1/100 秒帧延迟取整造成的时长漂移。

**视觉与动效**
- 主色玫红 `hsl(330 82% 49%)`，竖线标识蓝 `hsl(221 83% 53%)`；圆角 `.5rem`。
- 卡通描边卡片 + 硬阴影（`.sticker-shadow-*`）、点阵底纹（`.dot-grid`）、
  标题字体 ZCOOL KuaiLe（`.font-display`）、淡入动效 `fade-in 0.5s`。
- 步骤编号、图标、文案、Toast 提示均与原站逐字一致。
- Toast（sonner）与原站同版同参：出现在**右下角**、白底深字、与视口边距 24px，
  容器带 `toaster group` 类名（依赖 `sonner@2.0.8` + `next-themes`，见 `src/components/ui/sonner.tsx`）。

> **关于右下角「秒哒制作」角标**：原站页面上这个角标是秒哒平台注入的浮层
> （`#privilege-mask`：深色胶囊 + 20×20 站点图标 + 「秒哒制作」+ 关闭按钮，
> 距右/下各 14px，`z-index: 99999`）。为了做到与原站界面完全一致，本工程按实测的
> 位置、尺寸、配色、圆角、阴影、字重把它复刻了一遍（资源已本地化到 `public/platform/`，
> 不依赖平台 CDN），并把开关放在一处：
>
> ```ts
> // src/config.ts
> export const SHOW_PLATFORM_BADGE = true; // 改成 false 即可整块隐藏
> ```
>
> 如果你的用途是独立发布、不想要平台水印，把这一行改成 `false` 即可；
> 其余界面不受影响。

---

## 6. 已验证结果

在无头 Chromium（Chrome for Testing 149）中对**本工程 `npm run build` 的产物**做过端到端验证：

- 26 项检查 **全部通过**，浏览器控制台 **0 错误**。
- 默认 3×3 → 9 格；加横线 → 12 格；加竖线 → 16 格；各减一条 → 移除最大值后 9 格。
- 数值输入 40 → 切换像素得 360（900×40%）→ 切回百分比得 40。
- MP4 切割产出 9 个可解码文件（各约 24.0–26.5KB）；GIF 切割产出 9 个 GIF89a
  文件（各约 63.6–75.8KB，300×300，24 帧，`loop=0` 无限循环，时长约 2.0 秒）。
- 单个下载、勾选 2 个打包（ZIP 恰含 2 个文件）、全部下载（ZIP 含 9 个文件）均校验通过。
- 前缀改为「萌宠」后，产物为 `萌宠_1.gif`、`萌宠_表情包.zip` 等。

### 界面一致性复验（与原站逐像素比对）

用无头浏览器分别打开**线上原站**与**本工程构建产物**，对同一状态采集整页截图 + 逐元素
DOM（tag / class / 文案 / 位置尺寸）+ 36 项计算样式，然后做结构化比对与逐像素差异定位
（8×8 块，阈值 24/255）。结果：**6 个状态全部逐像素一致（差异块 0）**。

| 状态 | 元素数（原站/本工程） | 文案差异 | 计算样式差异 | 像素差异块 |
|------|----------------------|----------|--------------|-----------|
| 初始态（含「秒哒制作」角标） | 51 / 51 | 0 | 0 | 0 |
| 拖拽悬停态 | 51 / 51 | 0 | 0 | 0 |
| 上传后态（暂停归零对齐） | 209 / 209 | 0 | 0 | 0 |
| 切割结果态 | 372 / 372 | 0 | 0 | 0 |
| 勾选 + 切换 GIF 提示条态 | 372 / 372 | 0 | 0 | 0 |
| 「更换视频」确认弹窗 | 380 / 380 | 0 | 0 | 0 |

这套比对要求比对双方处于**同一格式状态**（都停在 MP4，或都停在 GIF），并在截图前把
入场动画推进到终态；否则会把「MP4 / GIF 按钮高亮互换」或动画中间值误判成界面差异。
具体做法（含可复现命令）见随包的 `docs/界面差异清单.md`。

仅剩的差异是若干**渲染不可见**的 DOM 标记写法（`<path>` / `<line>` 图元写法、`lucide-trash-2`
兼容别名 class、`aria-hidden` 属性），已逐像素验证无影响，并在同一份差异清单里逐条列明。

此外还验证过：把交付包解压后**以项目文件夹（而非 `dist`）为站点根目录**托管，
`http://host/meme-grid-splitter/dist/` 也能正常显示并完成切割（0 报错、0 个 404）。

---

## 7. 想完全离线（可选）

首次加载的 ffmpeg core 来自公网 CDN。若部署环境无法访问外网，可把 core 本地化：

1. 把 `ffmpeg-core.js`、`ffmpeg-core.wasm`（`@ffmpeg/core@0.12.10` 的 `dist/esm` 版本）
   放进 `public/ffmpeg/`。
2. 修改 `src/lib/engine.ts` 中的 `CORE_SOURCES`，改为本地路径（如 `"."`，即从
   `/ffmpeg/` 同源加载）。

这样引擎也会同源加载，彻底离线运行。

---

## 8. 技术栈

React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3（+ tailwindcss-animate）·
shadcn/Radix UI · Sonner（Toast）· lucide-react（图标）· react-dropzone（拖拽上传）·
JSZip（打包下载）· @ffmpeg/ffmpeg + @ffmpeg/core@0.12.10（浏览器端音视频处理）

---

## 9. 说明

- 本工程为**参照原站重新开发**的可读源码实现，不是从原平台导出的原始工程文件；
  两者的行为、界面、文案、算法与导出结果一致，但源码组织与变量命名不同
  （原站产物为压缩后的 minified 代码，无法逐行还原）。
- 原站构建产物保存在 `original-build/`，可用于逐字对照与差异核查。
`