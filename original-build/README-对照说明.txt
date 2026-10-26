【对照目录说明】原站线上构建产物

本目录原样保留原站（秒哒平台生成的线上应用）的构建产物，用于与重建源码工程逐字对照。

线上地址：https://app-f9osmt3mxse9.miaoda.online
平台应用 ID：app-f9osmt3mxse9

文件说明
- index.html
  原站首页 HTML（与服务端返回内容一致）。其中的 head 部分包含 SEO / Open Graph /
  Twitter Card 元信息，以及一段把 ?redirect= 归一化到真实路径的内联脚本——重建工程的
  index.html 已逐字保留这两部分，仅把资源引用改为本地相对路径。
- assets/index-CSv1xKhH.js
  原站主包（minified，529857 字节）。业务逻辑、组件、文案、滤镜链的核对依据。
- assets/index-5MHfmlPY.css
  原站样式包（minified，71501 字节）。设计令牌、组件样式与动效的核对依据。
- ffmpeg/worker.js、ffmpeg/const.js、ffmpeg/errors.js
  原站同源 ffmpeg.wasm worker 与常量，重建工程放了一份到 public/ffmpeg/ 原样使用。
- ui-strings.txt
  从原站产物中提取的 86 条去重 UI 文案，用于逐字核对界面文字。

关于「平台注入」内容
原站 index.html 顶部还有若干由平台在发布时注入、与工具本身无关的内容，本目录（原始产物）
不含这些内容：
- 右下角的「秒哒制作 ×」悬浮水印 —— 由平台注入的运行时脚本在页面里渲染，原始 HTML 里没有；
  重建工程已按线上实测的位置/尺寸/配色/圆角/阴影**完整复刻**（见 src/components/PlatformBadge.tsx
  与 public/platform/ 下的本地资源），因此本目录里看不到它是正常现象；
- <script id="md-click">、<script id="iframe-onerror-catcher"> 两段平台内联脚本；
- 加载平台运行时 miaoda-external.js 的脚本块；
- <link id="fonts-code"> 指向 miaoda-font CDN 的字体样式表。

重要提醒：把本目录放在**本地**静态服务器上时，平台脚本与 CDN 都取不到，
「秒哒制作」角标不会出现、初始态元素数只有 46（线上为 51）。
因此**比对角标态、弹窗态等必须用线上原站作为基线**；本目录只用于逐字核对 HTML / JS / CSS 与文案。

其中字体一项不影响视觉一致性：原站样式包中实际使用的是
  .font-display → font-family: ZCOOL KuaiLe, Noto Sans SC, sans-serif
  body        → font-family: Noto Sans SC, system-ui, -apple-system, sans-serif
重建工程已通过 Google Fonts 加载同名同字体的 ZCOOL KuaiLe 与 Noto Sans SC，
并在 src/index.css 中声明了完全相同的字体栈。

favicon
原站图标用的是 CDN 上的 PNG
（app-f9osmt3mxse9_web_1792687261417.png）。重建工程已把它作为本地 public/favicon.png，
避免依赖外网。

对照方法（可选）
分别用静态服务器打开本目录与重建工程的 dist/，逐项比对界面、文案与交互；
行为与界面层面的对照结果见工程根目录 README.md 第 6 节「已验证结果」，
以及 docs/界面差异清单.md（含 6 状态逐像素比对结论与可复现命令）。
注意：界面比对（含角标）需以线上原站为基线，本目录仅用于逐字核对源码级内容。