/**
 * 工具目录与客户端搜索（零后端：目录随代码打包，后续新工具只需在此追加）。
 */

export interface ToolItem {
  key: string;
  name: string;
  subtitle: string;
  keywords: string[];
  path: string;
  /** 是否需要激活（绑定 UID）后才能使用 */
  needActivation: boolean;
  /** 图标字符（首期用文字图标，后续可换图片资源） */
  icon: string;
  /** 是否已上线（false 则不在首页显示，预留给二期工具） */
  enabled: boolean;
}

export const TOOLS: ToolItem[] = [
  {
    key: "grid-split",
    name: "九宫格视频切割",
    subtitle: "把多宫格视频拆成一个个独立表情包（GIF）",
    keywords: ["九宫格", "宫格", "切割", "切视频", "表情包", "动图", "gif", "grid", "split"],
    path: "/pages/splitter/index",
    needActivation: true,
    icon: "宫",
    enabled: true,
  },
];

/** 客户端搜索：按名称 / 副标题 / 关键词过滤 */
export function searchTools(query: string): ToolItem[] {
  const q = (query || "").trim().toLowerCase();
  const pool = TOOLS.filter((t) => t.enabled);
  if (!q) return pool;
  return pool.filter((t) => {
    const haystack = [t.name, t.subtitle, ...t.keywords].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}
