import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function openSettingsWindow() {
  const existing = await WebviewWindow.getByLabel("settings");
  if (existing) {
    await existing.setFocus();
    return;
  }
  const url = `${location.origin}${location.pathname}?view=settings`;
  const win = new WebviewWindow("settings", {
    url,
    title: "设置",
    width: 540,
    height: 560,
    resizable: false,
    maximizable: false,
    minimizable: false,
    center: true,
  });
  win.once("tauri://error", (e) => {
    console.error("settings window error", e);
  });
}
