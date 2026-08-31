import { renderWithPlugins, localImagePlaceholder } from "./markdownCore";

export interface PreviewRenderRequest {
  text: string;
  baseDir: string | null;
  breaks: boolean;
  typographer: boolean;
  allowHtml: boolean;
}

/** Worker 超时后回退主线程，避免渲染永久挂起 */
const WORKER_TIMEOUT_MS = 5000;

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./render.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("error", () => {
      workerBroken = true;
    });
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** 主线程同步渲染（Worker 不可用/超时时的回退） */
export function renderPreviewHtmlSync(req: PreviewRenderRequest): string {
  const { html } = renderWithPlugins(req.text, {
    baseDir: req.baseDir,
    breaks: req.breaks,
    typographer: req.typographer,
    allowHtml: req.allowHtml,
    assetUrl: localImagePlaceholder,
  });
  return html;
}

/** 优先在 Worker 中渲染，失败时回退主线程；返回带本地图片占位的 HTML */
export function renderPreviewHtml(req: PreviewRenderRequest): Promise<string> {
  const w = getWorker();
  if (!w) return Promise.resolve(renderPreviewHtmlSync(req));
  const id = ++seq;
  return new Promise<string>((resolve) => {
    let settled = false;
    const finish = (html: string) => {
      if (settled) return;
      settled = true;
      w.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      resolve(html);
    };
    const timer = window.setTimeout(
      () => finish(renderPreviewHtmlSync(req)),
      WORKER_TIMEOUT_MS
    );
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { id?: number; html?: string };
      if (!data || data.id !== id) return;
      finish(typeof data.html === "string" ? data.html : renderPreviewHtmlSync(req));
    };
    w.addEventListener("message", onMessage);
    try {
      w.postMessage({ id, ...req });
    } catch {
      finish(renderPreviewHtmlSync(req));
    }
  });
}
