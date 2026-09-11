import MarkdownIt from "markdown-it";
import deflist from "markdown-it-deflist";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import { highlightToLines, languageKeyOf } from "./highlight";
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

// ---------- 标题 id（提前到 core 阶段计算，[TOC] 依赖） ----------

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

md.core.ruler.push("moxie_heading_ids", (state) => {
  const env = (state.env ?? {}) as RenderEnv;
  const used = new Set<string>();
  env.__headingIds = used;
  for (const token of state.tokens) {
    if (token.type !== "heading_open") continue;
    const idx = state.tokens.indexOf(token) + 1;
    const inline = state.tokens[idx];
    const slug = slugify(inline?.content ?? "");
    let id = slug || "section";
    let n = 1;
    while (used.has(id)) {
      n += 1;
      id = `${slug || "section"}-${n}`;
    }
    used.add(id);
    token.attrSet("id", id);
  }
});

// ---------- Callout（GitHub 风提示块，TizuMark 复刻） ----------

const CALLOUT_ICON_PATHS: Record<string, string> = {
  note: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  tip: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  important:
    '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  caution:
    '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
};

const CALLOUT_LABELS: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

const CALLOUT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(.*)$/i;

function calloutTitleHtml(
  kind: string,
  customTitle: string,
  dataLine: string | number | null
): string {
  const icon = CALLOUT_ICON_PATHS[kind] ?? CALLOUT_ICON_PATHS.note;
  const label = customTitle || CALLOUT_LABELS[kind] || "Note";
  const lineAttr = dataLine != null ? ` data-line="${escapeAttribute(String(dataLine))}"` : "";
  return (
    `<div class="alert-title"${lineAttr}>` +
    `<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>` +
    `${escapeHtmlText(label)}</div>`
  );
}

// > [!NOTE] / > [!TIP] 标题 … → div.alert.alert-x > (div.alert-title + div.alert-content > …)
// 结构对齐 TizuMark：blockquote_open 改 tag，首段替换为标题，其余内容包进 alert-content。
// 兼容两种写法：标题独占段落（[!NOTE] 后跟其他块）与软换行同段（[!NOTE]\n内容在同一段落）。
md.core.ruler.push("moxie_callout", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "blockquote_open") continue;
    // 配对 blockquote_close（考虑嵌套 blockquote）
    let depth = 0;
    let closeIdx = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === "blockquote_open") depth += 1;
      else if (tokens[j].type === "blockquote_close") {
        if (depth === 0) {
          closeIdx = j;
          break;
        }
        depth -= 1;
      }
    }
    if (closeIdx < 0) continue;
    const pOpenIdx = i + 1;
    if (tokens[pOpenIdx]?.type !== "paragraph_open") continue;
    const inlineTok = tokens[pOpenIdx + 1];
    if (inlineTok?.type !== "inline") continue;
    const content = inlineTok.content.trim();
    const firstNl = content.indexOf("\n");
    const firstLine = firstNl < 0 ? content : content.slice(0, firstNl);
    const match = CALLOUT_RE.exec(firstLine);
    if (!match) continue;
    const kind = match[1].toLowerCase();
    const customTitle = match[2].trim();
    // 软换行：同段落的剩余文本作为 callout 正文
    const rest = firstNl < 0 ? "" : content.slice(firstNl + 1);
    const openTok = tokens[i];
    const dataLine = openTok.attrGet("data-line");

    openTok.tag = "div";
    openTok.attrSet("class", `alert alert-${kind}`);
    tokens[closeIdx].tag = "div";

    const titleTok = new state.Token("html_block", "", 0);
    titleTok.content = calloutTitleHtml(kind, customTitle, dataLine);
    const contentOpen = new state.Token("html_block", "", 0);
    contentOpen.content = `<div class="alert-content">`;
    const contentClose = new state.Token("html_block", "", 0);
    contentClose.content = `</div>`;

    if (rest) {
      // 保留段落容器，仅重写 inline 内容（剩余文本重新走 inline 解析）
      tokens.splice(pOpenIdx, 0, titleTok, contentOpen);
      inlineTok.content = rest;
      inlineTok.children = [];
      state.md.inline.parse(rest, state.md, state.env, inlineTok.children);
      tokens.splice(closeIdx + 2, 0, contentClose);
    } else {
      // 标题独占段落：[paragraph_open, inline, paragraph_close] → [title, contentOpen]
      tokens.splice(pOpenIdx, 3, titleTok, contentOpen);
      tokens.splice(closeIdx - 1, 0, contentClose);
    }
  }
});

// ---------- [TOC] 目录卡片 ----------

function stripInlineMarks(text: string): string {
  return text
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
}

function buildTocHtml(
  heads: { level: number; id: string; text: string }[],
  lineAttr: string
): string {
  const items = heads
    .map((h) => {
      const lvl = Math.min(4, Math.max(1, h.level));
      const cls = lvl > 1 ? ` class="lvl-${lvl}"` : "";
      return `<li${cls}><a href="#${escapeAttribute(h.id)}">${escapeHtmlText(h.text)}</a></li>`;
    })
    .join("");
  return (
    `<div class="toc-wrapper"${lineAttr}><div class="toc">` +
    `<div class="toc-title"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>目录</div>` +
    `<ul class="toc-list">${items}</ul></div></div>`
  );
}

md.core.ruler.push("moxie_toc", (state) => {
  const env = (state.env ?? {}) as RenderEnv;
  const offset = Number(env.__lineOffset ?? 0);
  const heads: { level: number; id: string; text: string }[] = [];
  for (let i = 0; i < state.tokens.length; i++) {
    const tok = state.tokens[i];
    if (tok.type !== "heading_open") continue;
    const level = Number(tok.tag.slice(1));
    if (!Number.isFinite(level) || level < 1 || level > 4) continue;
    const inline = state.tokens[i + 1];
    const id = tok.attrGet("id");
    if (id == null || id === "") continue;
    heads.push({ level, id: String(id), text: stripInlineMarks(inline?.content ?? "") });
  }
  if (heads.length === 0) return;
  for (let i = 0; i < state.tokens.length; i++) {
    const tok = state.tokens[i];
    if (tok.type !== "inline") continue;
    if (!/^\[toc\]$/i.test(tok.content.trim())) continue;
    const pOpen = state.tokens[i - 1];
    const pClose = state.tokens[i + 1];
    if (pOpen?.type !== "paragraph_open" || pClose?.type !== "paragraph_close") continue;
    const lineAttr = pOpen.map
      ? ` data-line="${pOpen.map[0] + offset}"`
      : "";
    const tocTok = new state.Token("html_block", "", 0);
    tocTok.content = buildTocHtml(heads, lineAttr);
    state.tokens.splice(i - 1, 3, tocTok);
    break;
  }
});

// ---------- ==mark== 行内高亮（markdown-it-mark 同款规则） ----------

md.inline.ruler.after("emphasis", "moxie_mark", function markRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x3d /* = */) return false;
  if (src.charCodeAt(start + 1) !== 0x3d) return false;
  if (silent) return false;
  const max = state.posMax;
  let pos = start + 2;
  let match = -1;
  while (pos < max - 1) {
    if (src.charCodeAt(pos) === 0x3d && src.charCodeAt(pos + 1) === 0x3d) {
      match = pos;
      break;
    }
    if (src.charCodeAt(pos) === 0x5c /* backslash */) pos += 1;
    pos += 1;
  }
  if (match < 0) return false;
  const content = src.slice(start + 2, match);
  if (!content.trim()) return false;
  state.push("mark_open", "mark", 1);
  state.pos = start + 2;
  state.posMax = match;
  state.md.inline.tokenize(state);
  state.pos = match + 2;
  state.posMax = max;
  state.push("mark_close", "mark", -1);
  return true;
});
md.renderer.rules.mark_open = () => "<mark>";
md.renderer.rules.mark_close = () => "</mark>";

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

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  void options;
  void self;
  const token = tokens[idx];
  const info = token.info ?? "";
  const offset = Number((env as RenderEnv | undefined)?.__lineOffset ?? 0);
  const dataLine = token.map ? ` data-line="${token.map[0] + offset}"` : "";
  const key = languageKeyOf(info);
  const langClass = key ? ` class="language-${escapeAttribute(key)}"` : "";
  // TizuMark 同构：code > .code-scroll > .code-line（行号 span 常驻，CSS 控制显隐）
  const { html: body } = highlightToLines(token.content, info);
  return `<pre${dataLine}><code${langClass}><span class="code-scroll">${body}</span></code></pre>\n`;
};

const renderHeadingOpen = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  // id 已由 moxie_heading_ids core 规则统一生成（[TOC] 依赖同源），此处仅兜底
  if (!token.attrGet("id")) {
    const inline = tokens[idx + 1];
    const slug = slugify(inline?.content ?? "");
    token.attrSet("id", nextHeadingId((env ?? {}) as RenderEnv, slug));
  }
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
