import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import katexCssInline from "katex/dist/katex.min.css?inline";
import {
  localImagePlaceholder,
  renderBody,
  renderShell,
  type PreviewTokens,
} from "./markdown";

export { localImagePlaceholder };

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

function mimeOf(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** 将正文中的 moxieimg:// 占位替换为内联 base64 data URL。
 *  去重后并行读取、单趟替换（原实现串行 IPC 逐张读 + split/join 逐张替换，
 *  图片多的文档明显偏慢）；读取失败的占位替换为空 src（与旧行为一致）。 */
export async function inlineLocalImages(html: string): Promise<string> {
  const encoded = new Set<string>();
  for (const match of html.matchAll(/src="moxieimg:\/\/([^"]+)"/g)) {
    encoded.add(match[1]);
  }
  if (encoded.size === 0) return html;
  const replacements = new Map<string, string>();
  await Promise.all(
    [...encoded].map(async (value) => {
      const path = decodeURIComponent(value);
      try {
        const b64 = await invoke<string>("read_file_base64", { path });
        replacements.set(value, `src="data:${mimeOf(path)};base64,${b64}"`);
      } catch {
        replacements.set(value, 'src=""');
      }
    })
  );
  return html.replace(/src="moxieimg:\/\/([^"]+)"/g, (whole, value: string) => {
    return replacements.get(value) ?? whole;
  });
}

/** 组装独立 HTML：外壳样式内联，KaTeX 样式内联（可传入已内联字体的版本），正文注入 */
export function buildExportHtml(
  shell: string,
  bodyHtml: string,
  katexCss: string = katexCssInline
): string {
  let out = shell.replace(
    /<link rel="stylesheet"[^>]*>/g,
    () => `<style>${katexCss}</style>`
  );
  out = out.replace(
    /<article([^>]*)><\/article>/,
    (_m, attrs: string) => `<article${attrs}>${bodyHtml}</article>`
  );
  return out;
}

// ---------- KaTeX 字体导出内联（O-10，方案 B：按需内联） ----------
// 独立 HTML 里 KaTeX CSS 的字体 url 是构建产物绝对路径（/assets/KaTeX_*.woff2），
// 离开本机即失效、公式回退系统字体。导出 HTML 文件时按需把字体转 data URI 内联
// （仅文档含公式时；复制富文本与导出 .doc 不内联——Word/剪贴板用不上 web 字体）。

/** ArrayBuffer → base64（分块避免参数展开超限） */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** 把 KaTeX CSS 中 src 声明的 woff2 引用替换为 data URI（并去掉同 src 的
 *  woff/ttf 后备——data URI 已优先命中）。dataUris 中没有的路径保持原样。 */
export function inlineKatexFonts(css: string, dataUris: Map<string, string>): string {
  return css.replace(/src:url\(([^)]+\.woff2)\)[^;]*/g, (whole, path: string) => {
    const uri = dataUris.get(path);
    if (!uri) return whole;
    return `src:url(${uri}) format("woff2")`;
  });
}

/** 字体 data URI 会话缓存（同一会话多次导出复用，避免重复读取） */
const katexFontCache = new Map<string, string>();

async function fetchFontDataUri(path: string): Promise<string | null> {
  const cached = katexFontCache.get(path);
  if (cached) return cached;
  // 构建产物为 /assets/...（同源可取）；dev 下为字体包内相对路径，回退 node_modules
  const url =
    path.startsWith("/") || /^https?:/i.test(path)
      ? path
      : `/node_modules/katex/dist/${path.replace(/^\.\//, "")}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const uri = `data:font/woff2;base64,${arrayBufferToBase64(await res.arrayBuffer())}`;
    katexFontCache.set(path, uri);
    return uri;
  } catch {
    return null;
  }
}

/** 提取 CSS 中的 woff2 路径并并行取回 data URI（失败的路径不入表） */
async function katexFontDataUris(css: string): Promise<Map<string, string>> {
  const paths = new Set<string>();
  for (const m of css.matchAll(/url\(([^)]+\.woff2)\)/g)) paths.add(m[1]);
  const map = new Map<string, string>();
  await Promise.all(
    [...paths].map(async (path) => {
      const uri = await fetchFontDataUri(path);
      if (uri) map.set(path, uri);
    })
  );
  return map;
}

export interface ExportOptions {
  tokens: PreviewTokens;
  title: string;
  text: string;
  baseDir: string | null;
  breaks: boolean;
  typographer: boolean;
  allowHtml: boolean;
  /** 内联 KaTeX 字体（导出 HTML 文件用；仅文档含公式时生效，见 O-10） */
  embedFonts?: boolean;
}

/** 渲染完整独立 HTML（正文 + 图片内联 + 外壳）；mermaid 围栏预渲染为内联 SVG；
 *  opts.embedFonts 且文档含公式时，KaTeX 字体按需内联为 data URI（O-10） */
export async function buildFullHtml(opts: ExportOptions): Promise<string> {
  const mermaidPrep = await preRenderMermaid(opts.text, opts.tokens.scheme);
  const body = renderBody(mermaidPrep.text, {
    baseDir: opts.baseDir,
    assetUrl: localImagePlaceholder,
    breaks: opts.breaks,
    typographer: opts.typographer,
    allowHtml: opts.allowHtml,
  });
  const withMermaid = mermaidPrep.restore(body);
  const withImages = await inlineLocalImages(withMermaid);
  let katexCss = katexCssInline;
  if (opts.embedFonts && /class="katex/.test(withImages)) {
    katexCss = inlineKatexFonts(katexCssInline, await katexFontDataUris(katexCssInline));
  }
  const shell = renderShell(opts.tokens, opts.title);
  return buildExportHtml(shell, withImages, katexCss);
}

// ---------- mermaid 预渲染（O-7 / F-18 遗留）：导出与复制富文本的内联 SVG ----------

export interface MermaidBlock {
  from: number;
  to: number;
  source: string;
}

/**
 * 提取文档中的 mermaid 围栏块（``` / ~~~ 开头、info 首词为 mermaid）。
 * 未闭合块取到文档尾（渲染失败时回退原样，与旧行为一致）。
 */
export function extractMermaidBlocks(text: string): MermaidBlock[] {
  const lines = text.split("\n");
  const lineStarts: number[] = [0];
  for (let k = 0; k < lines.length; k++) {
    lineStarts.push(lineStarts[k] + lines[k].length + 1);
  }
  const blocks: MermaidBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(`{3,}|~{3,})\s*(\S+)?/.exec(lines[i]);
    if (!m || (m[2] ?? "").toLowerCase() !== "mermaid") continue;
    const fenceChar = m[1][0];
    const fenceLen = m[1].length;
    let j = i + 1;
    while (j < lines.length) {
      const cm = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[j]);
      if (cm && cm[1][0] === fenceChar && cm[1].length >= fenceLen) break;
      j += 1;
    }
    const closed = j < lines.length;
    const source = lines.slice(i + 1, closed ? j : lines.length).join("\n").trim();
    const from = lineStarts[i];
    const to = closed ? lineStarts[j] + lines[j].length : text.length;
    blocks.push({ from, to, source });
    i = closed ? j : lines.length;
  }
  return blocks;
}

/** 占位行（独占一段：渲染为 <p>占位</p> 后回填为 mermaid SVG 块） */
function mermaidPlaceholder(index: number): string {
  return `MOXIEMERMAIDBLOCK${index}XYZ`;
}

interface MermaidPrepass {
  text: string;
  restore(html: string): string;
}

/** 预渲染 mermaid：源码替换为占位行 → 渲染后回填 <div class="mermaid-block">SVG</div>。
 *  失败块不替换（渲染为普通代码块）。渲染前后切换 mermaid 主题并恢复书写面主题。 */
async function preRenderMermaid(
  text: string,
  scheme: "light" | "dark"
): Promise<MermaidPrepass> {
  const blocks = extractMermaidBlocks(text);
  if (blocks.length === 0) {
    return { text, restore: (html) => html };
  }

  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: scheme === "dark" ? "dark" : "default",
  });

  const svgs = new Map<number, string>();
  for (let i = 0; i < blocks.length; i++) {
    try {
      const id = `moxie-export-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const { svg } = await mermaid.render(id, blocks[i].source);
      svgs.set(i, svg);
    } catch {
      // 渲染失败：该块保持原样（随后渲染为普通代码块）
    }
  }

  // 恢复书写面主题，避免影响编辑器内 mermaid 的后续渲染
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default",
  });

  let replaced = text;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (!svgs.has(i)) continue;
    const block = blocks[i];
    replaced =
      replaced.slice(0, block.from) + mermaidPlaceholder(i) + replaced.slice(block.to);
  }

  const restore = (html: string): string =>
    html.replace(/<p>MOXIEMERMAIDBLOCK(\d+)XYZ<\/p>/g, (whole, n: string) => {
      const svg = svgs.get(Number(n));
      return svg ? `<div class="mermaid-block">${svg}</div>` : whole;
    });

  return { text: replaced, restore };
}

async function saveHtmlFile(
  title: string,
  baseName: string,
  filterName: string,
  ext: string,
  full: string
): Promise<boolean> {
  const target = await save({
    title,
    defaultPath: `${baseName}.${ext}`,
    filters: [{ name: filterName, extensions: [ext] }],
  });
  if (!target) return false;
  await invoke("write_text_file", {
    path: target,
    text: full,
    encoding: "utf-8",
    lineEnding: "lf",
  });
  return true;
}

/** 导出当前预览为独立 HTML 文件（内联样式、本地图片与 KaTeX 字体），返回是否完成保存 */
export async function exportPreviewHtml(opts: ExportOptions): Promise<boolean> {
  const full = await buildFullHtml({ ...opts, embedFonts: true });
  const base = (opts.title || "预览").replace(/\.md$/i, "");
  const saved = await saveHtmlFile(
    "导出预览为 HTML",
    base,
    "HTML 文件",
    "html",
    full
  );
  return saved;
}

/**
 * 导出为 Word 可直接打开的 .doc（HTML 兼容路线，零依赖）：
 * 注入 Word 文档标识，扩展名 .doc；公式/表格/样式随 HTML 带入。
 */
export async function exportWordDoc(opts: ExportOptions): Promise<boolean> {
  const full = (await buildFullHtml(opts)).replace(
    /<head>/i,
    '<head><meta name="ProgId" content="Word.Document" /><meta name="Generator" content="Moxie" />'
  );
  const base = (opts.title || "预览").replace(/\.md$/i, "");
  return saveHtmlFile("导出为 Word 文档", base, "Word 文档", "doc", full);
}
