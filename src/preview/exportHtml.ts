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

/** 组装独立 HTML：外壳样式内联，KaTeX 样式内联，正文注入 */
export function buildExportHtml(shell: string, bodyHtml: string): string {
  let out = shell.replace(/<link rel="stylesheet"[^>]*>/g, () => `<style>${katexCssInline}</style>`);
  out = out.replace(
    /<article([^>]*)><\/article>/,
    (_m, attrs: string) => `<article${attrs}>${bodyHtml}</article>`
  );
  return out;
}

export interface ExportOptions {
  tokens: PreviewTokens;
  title: string;
  text: string;
  baseDir: string | null;
  breaks: boolean;
  typographer: boolean;
  allowHtml: boolean;
}

/** 渲染完整独立 HTML（正文 + 图片内联 + 外壳） */
async function buildFullHtml(opts: ExportOptions): Promise<string> {
  const body = renderBody(opts.text, {
    baseDir: opts.baseDir,
    assetUrl: localImagePlaceholder,
    breaks: opts.breaks,
    typographer: opts.typographer,
    allowHtml: opts.allowHtml,
  });
  const withImages = await inlineLocalImages(body);
  const shell = renderShell(opts.tokens, opts.title);
  return buildExportHtml(shell, withImages);
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

/** 导出当前预览为独立 HTML 文件（内联样式与本地图片），返回是否完成保存 */
export async function exportPreviewHtml(opts: ExportOptions): Promise<boolean> {
  const full = await buildFullHtml(opts);
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
