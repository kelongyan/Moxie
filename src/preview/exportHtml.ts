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

/** 将正文中的 moxieimg:// 占位替换为内联 base64 data URL */
export async function inlineLocalImages(html: string): Promise<string> {
  const encoded = new Set<string>();
  for (const match of html.matchAll(/src="moxieimg:\/\/([^"]+)"/g)) {
    encoded.add(match[1]);
  }
  let result = html;
  for (const value of encoded) {
    const path = decodeURIComponent(value);
    let replacement: string;
    try {
      const b64 = await invoke<string>("read_file_base64", { path });
      replacement = `src="data:${mimeOf(path)};base64,${b64}"`;
    } catch {
      replacement = `src=""`;
    }
    result = result.split(`src="moxieimg://${value}"`).join(replacement);
  }
  return result;
}

/** 组装独立 HTML：外壳样式内联，KaTeX 样式内联，正文注入 */
export function buildExportHtml(shell: string, bodyHtml: string): string {
  let out = shell.replace(/<link rel="stylesheet"[^>]*>/g, () => `<style>${katexCssInline}</style>`);
  out = out.replace("<article></article>", `<article>${bodyHtml}</article>`);
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

/** 导出当前预览为独立 HTML 文件（内联样式与本地图片），返回是否完成保存 */
export async function exportPreviewHtml(opts: ExportOptions): Promise<boolean> {
  const body = renderBody(opts.text, {
    baseDir: opts.baseDir,
    assetUrl: localImagePlaceholder,
    breaks: opts.breaks,
    typographer: opts.typographer,
    allowHtml: opts.allowHtml,
  });
  const withImages = await inlineLocalImages(body);
  const shell = renderShell(opts.tokens, opts.title);
  const full = buildExportHtml(shell, withImages);

  const base = (opts.title || "预览").replace(/\.md$/i, "");
  const target = await save({
    title: "导出预览为 HTML",
    defaultPath: `${base}.html`,
    filters: [{ name: "HTML 文件", extensions: ["html"] }],
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
