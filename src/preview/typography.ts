/**
 * 内容排版节奏的单一数值来源：编辑器书写面（livePreview + app.css）与导出
 * renderShell 共用。数值对齐 docs/TizuMark渲染复刻方案.md（v2.2）。
 *
 * 编辑器无法用 CSS 垂直 margin（会破坏 CodeMirror 行高测量），改为按块边界
 * 逐个计算"折叠间距"后，以 `--md-space-before` 自定义属性注入行装饰。
 */

/** 正文行高（TizuMark 基准 1.7） */
export const CONTENT_LINE_HEIGHT = 1.7;

/** 分隔用空行被压缩后的高度（px）；与 app.css 的 .md-blank 保持一致 */
export const BLANK_LINE_HEIGHT = 8;

/** MD_MARGIN 的参考字号：数值按 16px 正文定义（em 语义），其他字号按比例缩放 */
export const FONT_REF_PX = 16;

/** 段间距档位（设置页「段间距」）：对全部块级 margin 的整体缩放 */
export type BlockSpacing = "compact" | "standard" | "relaxed";

export const BLOCK_SPACING_FACTOR: Record<BlockSpacing, number> = {
  compact: 0.75,
  standard: 1,
  relaxed: 1.25,
};

export interface BlockMargins {
  top: number;
  bottom: number;
}

/** 各顶层块的（等效）垂直 margin，px @ 16px 正文（14=0.875em、24/12=1.5/0.75em…） */
export const MD_MARGIN = {
  paragraph: { top: 0, bottom: 14 },
  heading: { top: 24, bottom: 12 },
  list: { top: 0, bottom: 14 },
  blockquote: { top: 0, bottom: 16 },
  pre: { top: 16, bottom: 16 },
  hr: { top: 24, bottom: 24 },
  /** 表格：上 0 下 16（对齐导出侧 table margin 16px 0）；表格自身的上间距在 widget 内部承载 */
  table: { top: 0, bottom: 16 },
} as const;

export type BlockKind = keyof typeof MD_MARGIN;

/** 块间距缩放系数：字号偏离 16px 与段间距档位的乘积（16px + 标准档 = 1） */
export function spacingScale(
  fontSizePx: number,
  blockSpacing: BlockSpacing = "standard"
): number {
  return (fontSizePx / FONT_REF_PX) * BLOCK_SPACING_FACTOR[blockSpacing];
}

/** CSS 相邻兄弟 margin 折叠：取 max(prev.bottom, cur.top)；首块为 0 */
export function collapsedGap(
  prev: BlockKind | null,
  cur: BlockKind,
  scale = 1
): number {
  if (!prev) return 0;
  return Math.round(Math.max(MD_MARGIN[prev].bottom, MD_MARGIN[cur].top) * scale);
}

/** 块首行应得的外部间距：折叠值扣除被压缩空行已占的高度，夹取到 ≥ 0 */
export function spaceBefore(
  prev: BlockKind | null,
  cur: BlockKind,
  blankLines: number,
  scale = 1
): number {
  const blanks = Math.max(0, blankLines);
  return Math.max(0, collapsedGap(prev, cur, scale) - blanks * BLANK_LINE_HEIGHT);
}
