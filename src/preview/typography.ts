/**
 * 内容排版节奏的单一数值来源：编辑器书写面（livePreview + app.css）与导出
 * renderShell 共用。数值对标 Typora 经典排版规范。
 *
 * 编辑器无法用 CSS 垂直 margin（会破坏 CodeMirror 行高测量），改为按块边界
 * 逐个计算"折叠间距"后，以 `--md-space-before` 自定义属性注入行装饰。
 */

/** 正文行高（对标 Typora 经典黄金基准行高：16px × 1.625 = 26px 整数行盒） */
export const CONTENT_LINE_HEIGHT = 1.625;

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

/**
 * 各顶层块的（等效）垂直 margin，px @ 16px 正文。
 * 间距精细调优（对标 Typora 黄金网格）：
 * - 段落间距适中（下 16px），呼吸感自然；
 * - 标题上方留白（h1/h2 上 26px，h3~h6 上 22px），距离下文正文紧密贴合（下 14px / 10px），邻近性极佳；
 * - 引用、代码块与表格紧凑精致，分割线上下留白规范为 24px。
 */
export const MD_MARGIN = {
  paragraph: { top: 0, bottom: 16 },
  headingMajor: { top: 26, bottom: 14 },
  heading: { top: 22, bottom: 10 },
  list: { top: 0, bottom: 16 },
  blockquote: { top: 16, bottom: 16 },
  pre: { top: 18, bottom: 18 },
  hr: { top: 24, bottom: 24 },
  table: { top: 16, bottom: 18 },
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
