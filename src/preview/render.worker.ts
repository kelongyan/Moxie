import { renderWithPlugins, localImagePlaceholder } from "./markdownCore";

interface WorkerRequest {
  id: number;
  text: string;
  baseDir: string | null;
  breaks: boolean;
  typographer: boolean;
  allowHtml: boolean;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, text, baseDir, breaks, typographer, allowHtml } = e.data;
  try {
    const { html } = renderWithPlugins(text, {
      baseDir,
      breaks,
      typographer,
      allowHtml,
      assetUrl: localImagePlaceholder,
    });
    ctx.postMessage({ id, html });
  } catch (error) {
    ctx.postMessage({ id, error: String(error) });
  }
};
