import { buildFullHtml, type ExportOptions } from "./exportHtml";

/**
 * 打印 / 导出 PDF（X-01 + X-02）。
 *
 * 路线：把导出管线产出的完整 HTML 写进一个离屏 iframe，加载完成后调
 * `iframe.contentWindow.print()` 唤起系统打印对话框，用户在其中选
 * "Microsoft Print to PDF" 即可另存为 PDF（wry 0.57 起 WebView2 暴露
 * `window.print()`，见 docs/成熟度差距分析.md §4.2）。
 *
 * 选 iframe 而不是独立 WebviewWindow：零新窗口 label、零 capabilities 改动、
 * 不需要跨窗口通信，打印结束即可回收。@media print 规则由 renderShell 注入。
 */

const PRINT_FRAME_ID = "moxie-print-frame";

function ensureFrame(): HTMLIFrameElement {
  const existing = document.getElementById(PRINT_FRAME_ID);
  if (existing instanceof HTMLIFrameElement) return existing;
  const frame = document.createElement("iframe");
  frame.id = PRINT_FRAME_ID;
  // 离屏但保持渲染：display:none 会让部分 WebView2 版本跳过布局，打印出空白
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  return frame;
}

/** 渲染并打印当前文档；返回是否成功唤起打印对话框 */
export async function printDocument(opts: ExportOptions): Promise<boolean> {
  const html = await buildFullHtml({ ...opts, embedFonts: true });
  // 复用同一 iframe：先清空再写入，避免 onload 因文档未变而不触发
  const frame = ensureFrame();
  frame.srcdoc = "<!DOCTYPE html><html><head></head><body></body></html>";
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        finish(false);
        return;
      }
      try {
        win.focus();
        win.print();
        finish(true);
      } catch {
        finish(false);
      }
      // print() 在 WebView2 上是异步弹窗（阻塞式对话框在部分版本会立即返回），
      // 延迟回收：给打印任务留出读取文档的时间，再释放 iframe 与其中的 base64 图片
      window.setTimeout(() => disposePrintFrame(), 30_000);
    };

    // 超时兜底：某些环境 onload 不触发（srcdoc 命中缓存等）
    window.setTimeout(() => finish(false), 10_000);
    frame.srcdoc = html;
  });
}

/** 清理离屏 iframe（打印后延迟调用，释放文档与内存） */
export function disposePrintFrame(): void {
  const frame = document.getElementById(PRINT_FRAME_ID);
  if (frame instanceof HTMLIFrameElement) {
    // 先清空 srcdoc，让 WebView2 尽早释放内联图片占用的内存
    frame.srcdoc = "";
  }
  frame?.remove();
}
