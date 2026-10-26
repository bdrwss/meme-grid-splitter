import { useState } from "react";
import { createPortal } from "react-dom";
import { SHOW_PLATFORM_BADGE } from "@/config";

/**
 * 右下角「秒哒制作」角标（等价于原站页面上平台注入的 #privilege-mask）。
 *
 * 结构与文案逐字取自线上原站，尺寸/配色/圆角/阴影/层级都按无头浏览器实测的计算值写死
 * （见 src/index.css 中的 .privilege-* 规则），挂在 document.body 末尾，与原站一致。
 * 是否显示由 src/config.ts 的 SHOW_PLATFORM_BADGE 控制，角标上的「×」也可关闭它。
 *
 * 角标图片路径按「相对页面自身」解析（等价于原站被托管在域名根目录时的 /platform/ 路径），
 * 因此把 dist 放在任意路径（域名根目录、子目录、甚至直接打开 index.html）时图标都能加载，
 * 渲染结果与原站在域名根目录下完全一致。
 */
const assetUrl = (p: string) => new URL(p, document.baseURI).href;

export function PlatformBadge() {
  const [visible, setVisible] = useState(true);

  if (!SHOW_PLATFORM_BADGE || !visible) return null;

  return createPortal(
    <div className="privilege-mask" id="privilege-mask" style={{ position: "fixed" }}>
      <img className="privilege-logo" src={assetUrl("./platform/favicon.png")} />
      <span className="privilege-label">秒哒制作</span>
      <div className="privilege-close" onClick={() => setVisible(false)}>
        <img src={assetUrl("./platform/close.svg")} />
      </div>
    </div>,
    document.body,
  );
}