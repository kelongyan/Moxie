import DOMPurify from "dompurify";
import katexCssUrl from "katex/dist/katex.min.css?url";
import {
  renderWithPlugins,
  type RenderEnv,
  type CoreRenderOptions,
} from "./markdownCore";
import { CONTENT_LINE_HEIGHT, MD_MARGIN } from "./typography";

export type { RenderEnv } from "./markdownCore";
export {
  splitFrontmatter,
  stripFrontmatter,
  taskToggleInLine,
  resolveLocalImageSrc,
  directoryOf,
  localImagePlaceholder,
  resolveImagePlaceholders,
  renderWithPlugins,
  IMAGE_PLACEHOLDER_SCHEME,
} from "./markdownCore";

/** 预览依赖的外部样式表（KaTeX 等），注入 iframe 外壳 */
export const previewStyleUrls: string[] = [katexCssUrl];

export interface PreviewTokens {
  scheme: "light" | "dark";
  bg: string;
  surface: string;
  fg: string;
  secondary: string;
  border: string;
  borderStrong: string;
  accent: string;
  success: string;
  warning: string;
  fontUi: string;
  fontMono: string;
  /** 语法高亮 CSS 变量（--syn-*）声明，供预览代码块使用；缺省时不着色 */
  synVars?: string;
  /** Callout 五色 RGB 三元组声明（--alert-*-rgb），缺省时走浅色 fallback */
  alertVars?: string;
  /** h2 标题专用色（略柔主色），缺省用 fg */
  heading2?: string;
  /** 荧光标记（==mark==）底/字色，缺省回落 warning 淡化 */
  markBg?: string;
  markFg?: string;
  /** 导出时代码块显示行号（写入 article.code-line-numbers） */
  codeLineNumbers?: boolean;
  /** 导出正文限宽（960px 居中） */
  narrow?: boolean;
}

/** 净化 HTML：保留 KaTeX 需要的 style 属性与 data-line，剥离脚本/事件处理器 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["style", "data-line", "target"],
  });
}

const SYN_TOKEN_NAMES = [
  "keyword",
  "string",
  "number",
  "comment",
  "type",
  "property",
  "heading",
  "link",
  "meta",
  "punct",
] as const;

const ALERT_TOKEN_NAMES = ["note", "tip", "important", "warning", "caution"] as const;

/** 从主文档读取当前主题令牌，预览 iframe 与应用保持单一色源。
 *  opts.theme 可固定导出配色（非 auto 且与当前不同时，临时翻转主题读变量再还原） */
export function collectPreviewTokens(opts?: {
  theme?: "auto" | "light" | "dark";
  codeLineNumbers?: boolean;
  narrow?: boolean;
}): PreviewTokens {
  const want = opts?.theme ?? "auto";
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const flip = want !== "auto" && want !== current;
  const prevTheme = document.documentElement.dataset.theme;
  if (flip && want) document.documentElement.dataset.theme = want;
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const synVars = SYN_TOKEN_NAMES.map((name) => `--syn-${name}:${v(`--syn-${name}`)};`).join(" ");
  const alertVars = ALERT_TOKEN_NAMES.map(
    (name) => `--alert-${name}-rgb:${v(`--lac-alert-${name}`)};`
  ).join(" ");
  const tokens: PreviewTokens = {
    scheme: flip ? (want as "light" | "dark") : current,
    // 预览页底色 = 编辑器内容面：渲染/源码切换时底色不跳
    bg: v("--lac-bg"),
    surface: v("--lac-bg"),
    fg: v("--lac-text"),
    secondary: v("--lac-text-secondary"),
    border: v("--lac-border"),
    borderStrong: v("--lac-border-strong"),
    accent: v("--lac-accent"),
    success: v("--lac-success"),
    warning: v("--lac-warning"),
    fontUi: v("--font-ui"),
    fontMono: v("--font-mono"),
    synVars,
    alertVars,
    heading2: v("--lac-heading-2"),
    markBg: v("--lac-mark-bg") || undefined,
    markFg: v("--lac-mark-fg") || undefined,
    codeLineNumbers: opts?.codeLineNumbers,
    narrow: opts?.narrow,
  };
  if (flip && prevTheme) document.documentElement.dataset.theme = prevTheme;
  return tokens;
}

function escapeAttribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 主线程渲染正文：纯渲染核心 + （可选）DOMPurify 净化 */
export function renderBody(text: string, env?: RenderEnv): string {
  const opts: CoreRenderOptions = {
    baseDir: env?.baseDir ?? null,
    assetUrl: env?.assetUrl,
    breaks: env?.breaks === true,
    typographer: env?.typographer === true,
    allowHtml: env?.allowHtml === true,
  };
  const { html } = renderWithPlugins(text, opts);
  return opts.allowHtml ? sanitizeHtml(html) : html;
}

/**
 * 预览文档外壳：样式与空正文。正文经 renderBody 原地替换，避免整份 srcDoc 重建。
 * fontFaceUrl 传入时在 iframe 内声明内置中文字体（iframe 是独立文档，不继承主文档的 @font-face）；
 * 导出 HTML 不传，交给读者本地字体。
 */
export function renderShell(
  tokens: PreviewTokens,
  title: string,
  fontFaceUrl?: string
): string {
  const codeBg = `color-mix(in srgb, ${tokens.fg} 6%, ${tokens.bg})`;
  // 表头与斑马纹底（TizuMark bg-secondary 的 fg 混合等效）
  const thBg = `color-mix(in srgb, ${tokens.fg} 4%, ${tokens.bg})`;
  const fontFaceBlock = fontFaceUrl
    ? `  @font-face {
    font-family: "Frex Sans GB";
    src: url("${escapeAttribute(fontFaceUrl)}") format("truetype-variations");
    font-weight: 100 700;
    font-style: normal;
    font-display: swap;
  }
`
    : "";

  const articleClass = [
    tokens.codeLineNumbers ? "code-line-numbers" : "",
    tokens.narrow ? "code-narrow" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const articleTag = articleClass
    ? `<article class="${articleClass}"></article>`
    : "<article></article>";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeAttribute(title)}</title>
${previewStyleUrls
  .map((url) => `<link rel="stylesheet" href="${escapeAttribute(url)}">`)
  .join("\n")}
<style>
${fontFaceBlock}  html { color-scheme: ${tokens.scheme}; ${tokens.synVars ?? ""} ${tokens.alertVars ?? ""} }
  html, body { margin: 0; padding: 0; background: ${tokens.bg}; }
  body {
    color: ${tokens.fg};
    font-family: ${tokens.fontUi};
    font-size: 16px;
    line-height: ${CONTENT_LINE_HEIGHT};
    /* 中英文混排：trim 中文标点旁的西文空白，等宽数字 */
    text-spacing-trim: space-first;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: ${tokens.borderStrong};
    border: 2px solid transparent;
    border-radius: 999px;
    background-clip: content-box;
  }
  /* 全宽（TizuMark 复刻）：正文区不再限宽，--measure 仅保留给源码模式 */
  article { max-width: 100%; margin: 0 auto; padding: 24px 24px 40px; }
  /* 导出限宽变体：正文 960px 居中 */
  article.code-narrow { max-width: min(960px, 94%); margin: 0 auto; }

  /* 标题：对标 Typora 黄金比例层级——h1/h2 发丝底线、层级紧凑透气；间距走 typography 单一来源 */
  h1, h2, h3, h4, h5, h6 { line-height: 1.35; }
  h1 {
    font-size: 2.0em;
    font-weight: 650;
    line-height: 1.25;
    color: ${tokens.fg};
    margin: ${MD_MARGIN.headingMajor.top}px 0 ${MD_MARGIN.headingMajor.bottom}px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${tokens.border};
  }
  h2 {
    font-size: 1.5em;
    font-weight: 600;
    line-height: 1.3;
    color: ${tokens.heading2 || tokens.fg};
    margin: ${MD_MARGIN.headingMajor.top}px 0 ${MD_MARGIN.headingMajor.bottom}px;
    padding-bottom: 6px;
    border-bottom: 1px solid color-mix(in srgb, ${tokens.border} 70%, transparent);
  }
  h3 {
    font-size: 1.25em;
    font-weight: 600;
    line-height: 1.35;
    color: ${tokens.fg};
    margin: ${MD_MARGIN.heading.top}px 0 ${MD_MARGIN.heading.bottom}px;
  }
  h4 {
    font-size: 1.0em;
    font-weight: 600;
    color: ${tokens.fg};
    margin: ${MD_MARGIN.heading.top}px 0 ${MD_MARGIN.heading.bottom}px;
  }
  h5 {
    font-size: 0.875em;
    font-weight: 600;
    color: ${tokens.secondary};
    margin: ${MD_MARGIN.heading.top}px 0 ${MD_MARGIN.heading.bottom}px;
  }
  h6 {
    font-size: 0.8125em;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: ${tokens.secondary};
    margin: ${MD_MARGIN.heading.top}px 0 ${MD_MARGIN.heading.bottom}px;
  }

  /* 段落：单侧 margin，对标段间距规范 */
  p { margin: 0 0 ${MD_MARGIN.paragraph.bottom}px; }

  /* 行内强调 */
  strong, b { font-weight: 600; }
  em { font-style: italic; }
  del { text-decoration: line-through; color: ${tokens.secondary}; }
  /* ==高亮== 荧光标记（校对样张高亮黄） */
  mark {
    display: inline-block;
    background: ${tokens.markBg ?? tokens.warning};
    color: ${tokens.markFg ?? (tokens.scheme === "dark" ? "#14151d" : tokens.fg)};
    padding: 1px 4px;
    border-radius: 3px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  kbd {
    display: inline-block;
    padding: 2px 7px;
    font-size: 0.82em;
    font-family: ${tokens.fontMono};
    color: ${tokens.fg};
    background: ${codeBg};
    border: 1px solid ${tokens.border};
    border-bottom-width: 2px;
    border-radius: 4px;
    box-shadow: inset 0 -1px 0 ${tokens.border};
    line-height: 1.5;
    vertical-align: baseline;
  }
  abbr { text-decoration: underline dotted; cursor: help; }
  /* 链接：墨字 + 强调色发丝下划线 */
  a {
    color: ${tokens.fg};
    text-decoration: underline;
    text-decoration-color: ${tokens.accent};
    text-underline-offset: 3px;
  }
  a:hover { color: ${tokens.accent}; }

  /* 行内 code：无边框淡灰胶囊（Typora 风格） */
  code {
    font-family: ${tokens.fontMono};
    font-size: 0.85em;
    padding: 2px 5px;
    background: ${codeBg};
    border-radius: 3px;
  }

  /* 列表：24px 缩进 / 4px 项距 / 嵌套 4px；多级 marker */
  ul, ol { padding-left: 24px; margin: 0 0 ${MD_MARGIN.list.bottom}px; }
  li { margin: 0 0 4px; }
  li > p { margin: 0 0 4px; }
  ul ul, ol ol, ul ol, ol ul { margin-top: 4px; margin-bottom: 4px; }
  /* 嵌套列表引导线（校对样张）：发丝线沿层级收进 */
  li > ul, li > ol {
    padding-left: 16px;
    border-left: 1px solid ${tokens.border};
  }
  :where(article) ul { list-style-type: disc; }
  :where(article) ul ul { list-style-type: circle; }
  :where(article) ul ul ul { list-style-type: square; }
  :where(article) ul ul ul ul { list-style-type: disc; }
  @counter-style paren-decimal { system: extends decimal; suffix: ") "; }
  @counter-style circled-decimal {
    system: numeric;
    symbols: "\\24EA" "\\2460" "\\2461" "\\2462" "\\2463" "\\2464" "\\2465" "\\2466" "\\2467" "\\2468";
    suffix: " ";
  }
  :where(article) ol { list-style-type: decimal; }
  :where(article) ol ol { list-style-type: paren-decimal; }
  :where(article) ol ol ol { list-style-type: circled-decimal; }
  :where(article) ol ol ol ol { list-style-type: circled-decimal; }

  /* 任务列表：16px 绿色勾选框（TizuMark） */
  ul:has(input[type="checkbox"]) { list-style: none; padding-left: 0; }
  ul:has(input[type="checkbox"]) > li:not(.task-list-item) { list-style: disc; padding-left: 24px; }
  li.task-list-item { list-style: none; }
  li input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    margin: 0 8px 0 0;
    width: 16px;
    height: 16px;
    border: 1.5px solid ${tokens.borderStrong};
    border-radius: 3px;
    background: ${tokens.surface};
    vertical-align: middle;
    position: relative;
    top: -1px;
    cursor: pointer;
    transition: background 120ms ease-out, border-color 120ms ease-out;
  }
  li input[type="checkbox"]:hover { border-color: ${tokens.success}; }
  li input[type="checkbox"]:not(:checked) { opacity: 0.7; }
  li input[type="checkbox"]:checked {
    background: ${tokens.success};
    border-color: ${tokens.success};
    opacity: 1;
  }
  li input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    left: 4px;
    top: 1px;
    width: 5px;
    height: 9px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  /* 代码块：打纸稿——与行内代码同底、1px 边框、6px 圆角、右上语言标签；300px 按需滚动 */
  pre {
    position: relative;
    padding: 14px 16px;
    background: ${codeBg};
    border: 1px solid ${tokens.border};
    border-radius: 6px;
    margin: ${MD_MARGIN.pre.top}px 0;
  }
  pre[data-lang]::after {
    content: attr(data-lang);
    position: absolute;
    top: 12px;
    right: 16px;
    font: 10px ${tokens.fontMono};
    letter-spacing: 0.14em;
    color: ${tokens.secondary};
  }
  pre code {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    font-size: 0.9em;
    font-weight: 400;
    display: block;
  }
  .code-scroll { display: block; max-height: 300px; overflow: auto; }
  .code-line { display: flex; line-height: 1.6; min-width: 0; }
  .code-line-num {
    flex: none;
    width: 3em;
    text-align: right;
    padding-right: 0.8em;
    color: ${tokens.secondary};
    opacity: 0.75;
    user-select: none;
    display: none;
  }
  article.code-line-numbers .code-line-num { display: inline; }
  .code-line-text { white-space: pre; flex: 1 1 auto; min-width: 0; }

  /* 语法高亮：与编辑器同源的 --syn-* 变量（见 collectPreviewTokens） */
  .tok-keyword { color: var(--syn-keyword); }
  .tok-string, .tok-string2 { color: var(--syn-string); }
  .tok-number, .tok-atom, .tok-literal { color: var(--syn-number); }
  .tok-comment { color: var(--syn-comment); font-style: italic; }
  .tok-typeName, .tok-namespace, .tok-className, .tok-macroName { color: var(--syn-type); }
  .tok-propertyName { color: var(--syn-property); }
  .tok-meta { color: var(--syn-meta); }
  .tok-operator, .tok-punctuation, .tok-bracket, .tok-separator { color: var(--syn-punct); }
  .tok-link, .tok-url { color: var(--syn-link); }
  .tok-heading { color: var(--syn-heading); font-weight: 600; }

  /* 表格：校样样张「简约灰」——圆角外框、无竖线、灰表头、斑马纹、发丝行线、粘性表头 */
  .table-wrap {
    overflow-x: auto;
    margin: ${MD_MARGIN.table.bottom}px 0;
    border: 1px solid ${tokens.border};
    border-radius: 10px;
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    font-variant-numeric: tabular-nums;
  }
  th, td {
    padding: 8px 14px;
    text-align: left;
    vertical-align: top;
    line-height: 1.65;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    font-weight: 600;
    font-size: 12.5px;
    letter-spacing: 0.03em;
    color: ${tokens.secondary};
    background: ${thBg};
    border-bottom: 1px solid ${tokens.borderStrong};
  }
  th:first-child { border-top-left-radius: 9px; }
  th:last-child { border-top-right-radius: 9px; }
  td { border-bottom: 1px solid ${tokens.border}; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:last-child td:first-child { border-bottom-left-radius: 9px; }
  tbody tr:last-child td:last-child { border-bottom-right-radius: 9px; }
  tbody tr:nth-child(even) { background: color-mix(in srgb, ${tokens.fg} 3%, transparent); }
  tbody tr:hover { background: color-mix(in srgb, ${tokens.accent} 6%, transparent); }

  /* 引用：3.5px 强调色边条、无底色、灰字；嵌套收敛为发丝线 */
  blockquote {
    margin: 0 0 ${MD_MARGIN.blockquote.bottom}px;
    padding: 8px 16px;
    border-left: 3.5px solid ${tokens.accent};
    color: ${tokens.secondary};
  }
  blockquote > :last-child { margin-bottom: 0; }
  blockquote > blockquote {
    margin: 8px 0;
    border-left: 1px solid ${tokens.borderStrong};
    color: inherit;
  }
  blockquote:has(strong:first-child) { border-left-color: ${tokens.warning}; }

  /* hr：发丝线 + 中心校对红圆点（校对样张） */
  hr {
    border: none;
    position: relative;
    height: 1px;
    background: ${tokens.border};
    margin: ${MD_MARGIN.hr.top}px 0;
  }
  hr::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    margin: -2.5px 0 0 -2.5px;
    border-radius: 50%;
    background: ${tokens.accent};
  }

  img { max-width: 100%; height: auto; border: 1px solid ${tokens.border}; border-radius: 8px; }
  .img-broken {
    display: inline-block;
    max-width: 100%;
    padding: 6px 10px;
    border: 1px dashed ${tokens.borderStrong};
    border-radius: 6px;
    color: ${tokens.secondary};
    font-size: 0.85em;
    word-break: break-all;
  }

  /* 定义列表 */
  dl { margin: 0 0 16px; }
  dt { font-weight: 600; margin-top: 8px; }
  dd { margin-left: 24px; margin-bottom: 8px; color: ${tokens.secondary}; }

  /* [TOC] 目录卡片（TizuMark） */
  .toc {
    background: linear-gradient(135deg,
      color-mix(in srgb, ${tokens.accent} 6%, ${tokens.bg}) 0%,
      color-mix(in srgb, ${tokens.accent} 3%, ${tokens.bg}) 100%);
    border: 1px solid color-mix(in srgb, ${tokens.accent} 22%, ${tokens.bg});
    border-left: 3px solid ${tokens.accent};
    border-radius: 8px;
    padding: 16px 20px;
    margin: 16px 0;
  }
  .toc-title {
    font-size: 1em;
    font-weight: 600;
    margin-bottom: 12px;
    color: ${tokens.accent};
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toc-title svg { flex: none; }
  .toc-list { list-style: none !important; padding-left: 0 !important; margin: 0; }
  .toc-list li { margin-bottom: 3px; line-height: 1.6; }
  .toc-list li::before {
    content: "";
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${tokens.accent};
    margin-right: 8px;
    vertical-align: middle;
    opacity: 0.6;
  }
  .toc-list li.lvl-2 { padding-left: 20px; }
  .toc-list li.lvl-3 { padding-left: 40px; }
  .toc-list li.lvl-4 { padding-left: 60px; }
  .toc-list a {
    color: ${tokens.accent};
    text-decoration: underline;
    text-underline-offset: 2px;
    font-size: 0.92em;
  }
  .toc-list a:hover { color: color-mix(in srgb, ${tokens.accent} 82%, ${tokens.fg}); }

  /* Callout（GitHub 风 > [!NOTE]，TizuMark 复刻；五色走 --alert-*-rgb） */
  .alert {
    border-radius: 10px;
    padding: 14px 18px;
    margin: 16px 0;
    border-left: 4px solid;
    overflow-wrap: break-word;
  }
  .alert-title {
    font-weight: 700;
    margin-bottom: 6px;
    font-size: 0.95em;
    display: flex;
    align-items: center;
    gap: 8px;
    letter-spacing: 0.3px;
  }
  .alert-icon { width: 18px; height: 18px; flex: none; }
  .alert-content { font-size: 0.92em; }
  .alert-content > :first-child { margin-top: 0; }
  .alert-content > :last-child { margin-bottom: 0; }
  .alert-note {
    background: linear-gradient(135deg, rgba(var(--alert-note-rgb, 74, 82, 163), 0.08) 0%, rgba(var(--alert-note-rgb, 74, 82, 163), 0.04) 100%);
    border-left-color: rgb(var(--alert-note-rgb, 74, 82, 163));
    box-shadow: inset 0 0 0 1px rgba(var(--alert-note-rgb, 74, 82, 163), 0.1);
  }
  .alert-note .alert-title { color: rgb(var(--alert-note-rgb, 74, 82, 163)); }
  .alert-tip {
    background: linear-gradient(135deg, rgba(var(--alert-tip-rgb, 23, 122, 61), 0.08) 0%, rgba(var(--alert-tip-rgb, 23, 122, 61), 0.04) 100%);
    border-left-color: rgb(var(--alert-tip-rgb, 23, 122, 61));
    box-shadow: inset 0 0 0 1px rgba(var(--alert-tip-rgb, 23, 122, 61), 0.1);
  }
  .alert-tip .alert-title { color: rgb(var(--alert-tip-rgb, 23, 122, 61)); }
  .alert-important {
    background: linear-gradient(135deg, rgba(var(--alert-important-rgb, 124, 58, 237), 0.08) 0%, rgba(var(--alert-important-rgb, 124, 58, 237), 0.04) 100%);
    border-left-color: rgb(var(--alert-important-rgb, 124, 58, 237));
    box-shadow: inset 0 0 0 1px rgba(var(--alert-important-rgb, 124, 58, 237), 0.1);
  }
  .alert-important .alert-title { color: rgb(var(--alert-important-rgb, 124, 58, 237)); }
  .alert-warning {
    background: linear-gradient(135deg, rgba(var(--alert-warning-rgb, 150, 89, 10), 0.08) 0%, rgba(var(--alert-warning-rgb, 150, 89, 10), 0.04) 100%);
    border-left-color: rgb(var(--alert-warning-rgb, 150, 89, 10));
    box-shadow: inset 0 0 0 1px rgba(var(--alert-warning-rgb, 150, 89, 10), 0.1);
  }
  .alert-warning .alert-title { color: rgb(var(--alert-warning-rgb, 150, 89, 10)); }
  .alert-caution {
    background: linear-gradient(135deg, rgba(var(--alert-caution-rgb, 192, 57, 44), 0.08) 0%, rgba(var(--alert-caution-rgb, 192, 57, 44), 0.04) 100%);
    border-left-color: rgb(var(--alert-caution-rgb, 192, 57, 44));
    box-shadow: inset 0 0 0 1px rgba(var(--alert-caution-rgb, 192, 57, 44), 0.1);
  }
  .alert-caution .alert-title { color: rgb(var(--alert-caution-rgb, 192, 57, 44)); }

  /* 数学公式（KaTeX 1.1em，TizuMark） */
  .math-block { margin: 16px 0; overflow-x: auto; overflow-y: hidden; }
  .math-block .katex-display { margin: 0; }
  .katex { font-size: 1.1em; }
  .katex-error { color: ${tokens.secondary}; font-style: italic; }
  .math-error {
    color: ${tokens.secondary};
    background: ${codeBg};
    border: 1px dashed ${tokens.borderStrong};
    border-radius: 4px;
    padding: 0 0.35em;
    font-family: ${tokens.fontMono};
    font-size: 0.88em;
  }

  /* 脚注 */
  .footnote-ref { line-height: 0; }
  .footnote-ref a, .footnote-backref {
    color: ${tokens.accent};
    font-weight: 600;
    text-decoration: none;
  }
  .footnote-ref a:hover { text-decoration: underline; }
  .footnotes-sep { margin: 32px 0 16px; border: none; border-top: 1px solid ${tokens.border}; }
  .footnotes { font-size: 0.92em; color: ${tokens.secondary}; }
  .footnotes-list { padding-left: 1.6em; margin: 0; }
  .footnote-item { margin: 0.25em 0; }
  .footnote-item p { margin: 0 0 4px; }
  .footnote-backref { margin-left: 4px; font-size: 0.85em; opacity: 0.6; }
  .footnote-backref:hover { opacity: 1; }

  ins { text-decoration: underline; }
  sub, sup { font-size: 0.72em; line-height: 0; }
  /* 选中态：随系统颜色，但保证不破坏布局 */
  ::selection { background: color-mix(in srgb, ${tokens.accent} 30%, transparent); }
</style>
</head>
<body>
${articleTag}
</body>
</html>`;
}

/** 整份预览文档（外壳 + 正文），用于测试与后续导出 */
export function renderMarkdown(
  text: string,
  tokens: PreviewTokens,
  title: string,
  env?: RenderEnv
): string {
  const shell = renderShell(tokens, title);
  return shell.replace(
    /<article([^>]*)><\/article>/,
    (_m, attrs: string) => `<article${attrs}>${renderBody(text, env)}</article>`
  );
}
