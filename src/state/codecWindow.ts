import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function openCodecWindow(operation?: string) {
  const existing = await WebviewWindow.getByLabel("codec");
  if (existing) {
    if (operation) await existing.emit("codec:set-op", operation);
    await existing.setFocus();
    return;
  }
  const opParam = operation ? `&op=${operation}` : "";
  const url = `${location.origin}${location.pathname}?view=codec${opParam}`;
  const win = new WebviewWindow("codec", {
    url,
    title: "编码与解码",
    width: 680,
    height: 519,
    minWidth: 600,
    minHeight: 459,
    center: true,
  });
  win.once("tauri://error", (e) => {
    console.error("codec window error", e);
  });
}
