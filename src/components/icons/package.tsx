import { createLucideIcon } from "lucide-react";

/**
 * lucide 的 `package` 图标（原站所用旧版定义）。
 * 当前安装的 lucide-react 版本里，盒盖两翼被改成了带弧度的 path（`m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7`），
 * 与原站 `polyline points="3.29 7 12 12 20.71 7"` 的直线版本存在可见差异。
 * 这里按原站产物中的定义复刻，保证「全部下载」「下载所选」按钮图标与原站逐像素一致。
 */
export const Package = createLucideIcon("Package", [
  [
    "path",
    {
      d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
      key: "1e5j4w",
    },
  ],
  ["path", { d: "M12 22V12", key: "1vzxa4" }],
  ["polyline", { points: "3.29 7 12 12 20.71 7", key: "1gw86v" }],
  ["path", { d: "m7.5 4.27 9 5.15", key: "1lqb9f" }],
]);