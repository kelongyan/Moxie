import DOMPurify from "dompurify";
import katexCssUrl from "katex/dist/katex.min.css?url";
import {
  renderWithPlugins,
  type RenderEnv,
  type CoreRenderOptions,
} from "./markdownCore";

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
  fontUi: string;
  fontMono: string;
  /** 语法高亮 CSS 变量（--syn-*）声明，供预览代码块使用；缺省时不着色 */
  synVars?: string;
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

/** 从主文档读取当前主题令牌，预览 iframe 与应用保持单一色源 */
export function collectPreviewTokens(): PreviewTokens {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const synVars = SYN_TOKEN_NAMES.map((name) => `--syn-${name}:${v(`--syn-${name}`)};`).join(" ");
  return {
    scheme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    bg: v("--lac-bg-sidebar"),
    surface: v("--lac-bg"),
    fg: v("--lac-text"),
    secondary: v("--lac-text-secondary"),
    border: v("--lac-border"),
    borderStrong: v("--lac-border-strong"),
    accent: v("--lac-accent"),
    fontUi: v("--font-ui"),
    fontMono: v("--font-mono"),
    synVars,
  };
}

const CHECK_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3.5 8.5l3 3 6-6.5'/></svg>\")";

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

/** 预览文档外壳：样式与空正文。正文经 renderBody 原地替换，避免整份 srcDoc 重建 */
export function renderShell(tokens: PreviewTokens, title: string): string {
  const codeBg = `color-mix(in srgb, ${tokens.fg} 6%, ${tokens.bg})`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeAttribute(title)}</title>
${previewStyleUrls
  .map((url) => `<link rel="stylesheet" href="${escapeAttribute(url)}">`)
  .join("\n")}
<style>
  html { color-scheme: ${tokens.scheme}; ${tokens.synVars ?? ""} }
  html, body { margin: 0; padding: 0; background: ${tokens.bg}; }
  body {
    color: ${tokens.fg};
    font-family: ${tokens.fontUi};
    font-size: 15px;
    line-height: 1.75;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: ${tokens.borderStrong};
    border: 2px solid transparent;
    border-radius: 999px;
    background-clip: content-box;
  }
  article { max-width: min(72ch, 100%); margin: 0; padding: 20px 26px 56px; }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; line-height: 1.35; }
  h1 { font-size: 1.6em; margin: 1.2em 0 0.5em; padding-bottom: 0.3em;
       border-bottom: 1px solid ${tokens.border}; }
  h2 { font-size: 1.35em; margin: 1.2em 0 0.5em; padding-bottom: 0.25em;
       border-bottom: 1px solid ${tokens.border}; }
  h3 { font-size: 1.18em; margin: 1.15em 0 0.45em; }
  h4, h5, h6 { font-size: 1.02em; margin: 1.15em 0 0.45em; }
  p { margin: 0.55em 0; }
  a { color: ${tokens.accent}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 1.6em; margin: 0.5em 0; }
  li { margin: 0.15em 0; }
  li.task-list-item { list-style: none; margin-left: -1.4em; }
  li.task-list-item input {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    margin: 0 0.5em 0 0;
    border: 1px solid ${tokens.borderStrong};
    border-radius: 4px;
    background: ${tokens.surface};
    vertical-align: -2px;
  }
  li.task-list-item input:checked {
    background: ${tokens.accent} ${CHECK_SVG} center/10px no-repeat;
    border-color: ${tokens.accent};
  }
  blockquote {
    margin: 0.8em 0; padding: 0.35em 0.9em;
    border-left: 3px solid ${tokens.borderStrong};
    background: color-mix(in srgb, ${tokens.fg} 3%, ${tokens.bg});
    border-radius: 0 6px 6px 0;
    color: ${tokens.secondary};
  }
  code {
    font-family: ${tokens.fontMono};
    font-size: 0.875em;
    background: ${codeBg};
    padding: 0.18em 0.4em;
    border-radius: 5px;
    border: 1px solid ${tokens.border};
  }
  pre {
    background: ${codeBg};
    border: 1px solid ${tokens.border};
    padding: 14px 16px;
    border-radius: 10px;
    overflow-x: auto;
  }
  pre code { background: transparent; padding: 0; border: none; font-size: 0.875em; line-height: 1.65; }
  .table-wrap { overflow-x: auto; margin: 0.8em 0; }
  table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td {
    border: none;
    border-bottom: 1px solid ${tokens.border};
    padding: 6px 16px 6px 0;
    text-align: left;
  }
  th { font-weight: 600; background: ${codeBg}; border-bottom-color: ${tokens.borderStrong}; }
  hr { border: none; border-top: 1px solid ${tokens.border}; margin: 1.4em 0; }
  img { max-width: 100%; }
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
  /* 脚注 */
  .footnote-ref { line-height: 0; }
  .footnote-ref a, .footnote-backref { color: ${tokens.accent}; text-decoration: none; }
  .footnotes-sep { margin: 2em 0 0.6em; }
  .footnotes { font-size: 0.85em; color: ${tokens.secondary}; }
  .footnotes-list { padding-left: 1.4em; }
  .footnote-item { margin: 0.25em 0; }
  .footnote-item p { margin: 0.2em 0; }
  /* 定义列表 */
  dl { margin: 0.7em 0; }
  dt { font-weight: 600; margin: 0.5em 0 0.1em; }
  dd { margin: 0.1em 0 0.35em 1.5em; color: ${tokens.fg}; }
  sub, sup { font-size: 0.72em; line-height: 0; }
  /* 数学公式 */
  .math-block { margin: 0.8em 0; overflow-x: auto; overflow-y: hidden; }
  .math-block .katex-display { margin: 0.2em 0; }
  .katex { font-size: 1.05em; }
  .math-error {
    color: ${tokens.secondary};
    background: ${codeBg};
    border: 1px dashed ${tokens.borderStrong};
    border-radius: 4px;
    padding: 0 0.35em;
    font-family: ${tokens.fontMono};
    font-size: 0.88em;
  }
</style>
</head>
<body>
<article></article>
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
  return shell.replace("<article></article>", `<article>${renderBody(text, env)}</article>`);
}
