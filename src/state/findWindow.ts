import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";

export type FindMode = "find" | "replace";

const CONTENT_HEIGHT: Record<FindMode, number> = { find: 220, replace: 260 };

export async function openFindWindow(mode: FindMode) {
  const existing = await WebviewWindow.getByLabel("find");
  if (existing) {
    await existing.setSize(new LogicalSize(520, CONTENT_HEIGHT[mode]));
    await existing.emit("find:set-mode", mode);
    await existing.setFocus();
    return;
  }
  const url = `${location.origin}${location.pathname}?view=find&mode=${mode}`;
  const win = new WebviewWindow("find", {
    url,
    title: "查找与替换",
    width: 520,
    height: CONTENT_HEIGHT[mode],
    resizable: false,
    maximizable: false,
    minimizable: false,
    center: true,
  });
  win.once("tauri://created", () => {});
  win.once("tauri://error", (e) => {
    console.error("find window error", e);
  });
}

export async function resizeFindWindow(mode: FindMode) {
  const win = await WebviewWindow.getByLabel("find");
  if (win) {
    await win.setSize(new LogicalSize(520, CONTENT_HEIGHT[mode]));
  }
}
