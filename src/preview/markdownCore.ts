import MarkdownIt from "markdown-it";
import deflist from "markdown-it-deflist";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import { highlightToHtml, languageKeyOf } from "./highlight";
import { mathPlugin } from "./math";

/**
 * 纯渲染核心：不含 DOM / window 依赖（markdown-it + 插件 + KaTeX + Lezer 均为纯函数），
 * 可在主线程与 Web Worker 中复用。DOMPurify 净化与 asset URL 转换留在主线程。
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
md.use(taskLists, { enabled: true });
md.use(footnote);
md.use(deflist);
md.use(sub);
md.use(sup);
md.use(emoji);
md.use(mathPlugin);

export interface RenderEnv {
  baseDir?: string | null;
  assetUrl?: (absPath: string) => string;
  /** 单换行渲染为 <br>（默认遵循 GFM，不换行） */
  breaks?: boolean;
  /** 排版美化：引号、破折号等替换 */
  typographer?: boolean;
  /** 允许原始 HTML（净化在主线程完成） */
  allowHtml?: boolean;
  [key: string]: unknown;
  [key: symbol]: unknown;
}

// 为带源码行映射的块级元素注入 data-line（M3 滚动同步与勾选回写的地基）。
// frontmatter 被剥离后需把被剥掉的行数补回，保证 data-line 对应真实源文件行号。
md.core.ruler.push("moxie_data_line", (state) => {
  const offset = Number((state.env as RenderEnv | undefined)?.__lineOffset ?? 0);
  for (const token of state.tokens) {
    if (token.map && token.type.endsWith("_open")) {
      token.attrSet("data-line", String(token.map[0] + offset));
    }
  }
});

function escapeAttribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 剥离开头的 YAML frontmatter（--- 包裹），并给出被剥掉的行数，供 data-line 补偿 */
export function splitFrontmatter(text: string): { body: string; lineOffset: number } {
  const bomLen = text.startsWith("\uFEFF") ? 1 : 0;
  const trimmed = text.slice(bomLen);
  if (!/^---[ \t]*\r?\n/.test(trimmed)) return { body: text, lineOffset: 0 };
  const firstNl = trimmed.indexOf("\n");
  const rest = trimmed.slice(firstNl + 1);
  const match = /^(?:---|\.\.\.)[ \t]*(\r?\n|$)/m.exec(rest);
  if (!match || match.index === 0) return { body: text, lineOffset: 0 };
  const body = rest.slice(match.index + match[0].length);
  const bodyStart = bomLen + firstNl + 1 + match.index + match[0].length;
  const lineOffset = text.slice(0, bodyStart).split("\n").length - 1;
  return { body, lineOffset };
}

/** 剥离文档开头的 YAML frontmatter（--- 包裹），无则原样返回 */
export function stripFrontmatter(text: string): string {
  return splitFrontmatter(text).body;
}

/** 在一行文本中定位任务复选框并给出翻转后的替换；无复选框返回 null */
export function taskToggleInLine(lineText: string): { index: number; insert: string } | null {
  const match = /\[[ xX]\]/.exec(lineText);
  if (!match) return null;
  return { index: match.index, insert: match[0] === "[ ]" ? "[x]" : "[ ]" };
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function nextHeadingId(env: RenderEnv, base: string): string {
  let used = env.__headingIds as Set<string> | undefined;
  if (!used) {
    used = new Set<string>();
    env.__headingIds = used;
  }
  const root = base || "section";
  let id = root;
  let n = 1;
  while (used.has(id)) {
    n += 1;
    id = `${root}-${n}`;
  }
  used.add(id);
  return id;
}

const KEEP_SRC_RE = /^(data:|https?:|asset:|blob:)/i;
const ABSOLUTE_SRC_RE = /^[A-Za-z]:[/\\]/;

function normalizeSeparators(path: string): string {
  return path.replace(/\//g, "\\");
}

function joinSegments(baseDir: string, rel: string): string {
  const isUnc = /^\\\\/.test(baseDir);
  const segments = baseDir.split(/[\\/]+/).filter(Boolean);
  // 驱动器盘符（1 段）或 UNC 主机+共享（2 段）不允许被 .. 吃掉
  const rootKeep = isUnc ? 2 : 1;
  for (const seg of rel.split(/[\\/]+/)) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (segments.length > rootKeep) segments.pop();
      continue;
    }
    segments.push(seg);
  }
  return isUnc ? `\\\\${segments.join("\\")}` : segments.join("\\");
}

/**
 * 把 Markdown 图片的 src 解析为本地绝对路径。
 * 返回 null 表示保持原样（外链、data:、锚点、或无文档目录时的相对路径）。
 */
export function resolveLocalImageSrc(baseDir: string | null, rawSrc: string): string | null {
  let src = rawSrc.trim();
  if (!src || src.startsWith("#") || KEEP_SRC_RE.test(src)) return null;
  src = src.split(/[?#]/)[0];
  if (!src) return null;
  if (/^file:/i.test(src)) {
    src = src.replace(/^file:(\/\/(localhost)?)?/i, "");
  }
  // file:///D:/x 去掉协议后会剩一个前导斜杠
  if (/^\/[A-Za-z]:/.test(src)) {
    src = src.slice(1);
  }
  try {
    src = decodeURIComponent(src);
  } catch {
    // 解码失败就按原样继续
  }
  src = src.trim();
  if (!src) return null;

  if (ABSOLUTE_SRC_RE.test(src) || /^\\\\/.test(src)) {
    return normalizeSeparators(src);
  }
  if (src.startsWith("/")) {
    const drive = baseDir?.match(/^([A-Za-z]:)/);
    if (!drive) return null;
    return normalizeSeparators(`${drive[1]}${src}`);
  }
  if (!baseDir) return null;
  return joinSegments(baseDir, src);
}

/** 取文件所在目录（兼容 / 与 \ 分隔），无目录时返回 null */
export function directoryOf(path: string): string | null {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (idx < 0) return null;
  const dir = path.slice(0, idx);
  if (!dir) return null;
  // 盘符根目录：D:\a.md -> D:\
  return /^[A-Za-z]:$/.test(dir) ? `${dir}${path[idx]}` : dir;
}

/** 本地图片占位协议：可在 Worker 内生成，主线程再替换为 asset URL 或 base64 */
export const IMAGE_PLACEHOLDER_SCHEME = "moxieimg://";

export function localImagePlaceholder(absPath: string): string {
  return `${IMAGE_PLACEHOLDER_SCHEME}${encodeURIComponent(absPath)}`;
}

/** 把正文中的本地图片占位替换为由 assetUrl 生成的最终 URL */
export function resolveImagePlaceholders(
  html: string,
  assetUrl: (absPath: string) => string
): string {
  return html.replace(/src="moxieimg:\/\/([^"]+)"/g, (whole, encoded: string) => {
    try {
      return `src="${assetUrl(decodeURIComponent(encoded))}"`;
    } catch {
      return whole;
    }
  });
}

const renderImageDefault = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env: RenderEnv | undefined, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex("src");
  if (srcIndex >= 0) {
    const raw = String(token.attrs![srcIndex][1]);
    const resolved = resolveLocalImageSrc(env?.baseDir ?? null, raw);
    if (resolved) {
      token.attrs![srcIndex][1] = env?.assetUrl ? env.assetUrl(resolved) : resolved;
    }
  }
  return renderImageDefault(tokens, idx, options, env, self);
};

const renderTableOpen = md.renderer.rules.table_open;
const renderTableClose = md.renderer.rules.table_close;
md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
  `<div class="table-wrap">${
    renderTableOpen
      ? renderTableOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }`;
md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
  `${
    renderTableClose
      ? renderTableClose(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }</div>`;

const renderFenceDefault = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = token.info ?? "";
  const offset = Number((env as RenderEnv | undefined)?.__lineOffset ?? 0);
  const dataLine = token.map ? ` data-line="${token.map[0] + offset}"` : "";
  const highlighted = highlightToHtml(token.content, info);
  if (highlighted === null) {
    const fallback = renderFenceDefault
      ? renderFenceDefault(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return dataLine ? fallback.replace(/^<pre/, `<pre${dataLine}`) : fallback;
  }
  const key = languageKeyOf(info);
  const langClass = key ? ` class="language-${escapeAttribute(key)}"` : "";
  return `<pre${dataLine}><code${langClass}>${highlighted}</code></pre>\n`;
};

const renderHeadingOpen = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const inline = tokens[idx + 1];
  const slug = slugify(inline?.content ?? "");
  token.attrSet("id", nextHeadingId((env ?? {}) as RenderEnv, slug));
  return renderHeadingOpen
    ? renderHeadingOpen(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

export interface CoreRenderOptions {
  baseDir?: string | null;
  assetUrl?: (absPath: string) => string;
  breaks?: boolean;
  typographer?: boolean;
  allowHtml?: boolean;
}

/** 纯渲染：markdown-it + 插件，返回 HTML 与被剥离的 frontmatter 行数 */
export function renderWithPlugins(
  text: string,
  opts: CoreRenderOptions
): { html: string; lineOffset: number } {
  md.set({
    breaks: opts.breaks === true,
    typographer: opts.typographer === true,
    html: opts.allowHtml === true,
  });
  const { body, lineOffset } = splitFrontmatter(text);
  const env: RenderEnv = {
    baseDir: opts.baseDir ?? null,
    assetUrl: opts.assetUrl,
    __lineOffset: lineOffset,
  };
  return { html: md.render(body, env), lineOffset };
}
