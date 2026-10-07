import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { CodecWindow } from "./components/CodecWindow";
import { FindReplaceWindow } from "./components/FindReplaceWindow";
import { SettingsWindow } from "./components/SettingsWindow";
import { openPathAction } from "./state/actions";
import { initAppearance } from "./state/appearance";
import { hydrateSettings, initSettingsSync } from "./state/preferences";
import { initRecoveryPersistence, restoreOnStartup } from "./state/recovery";
import { initTheme } from "./state/theme";
import { restoreWindowState, trackWindowState } from "./state/windowState";
import { initSpawnedWindow, initWindowTransfer } from "./state/windows";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/app.css";
// 书写面 KaTeX 公式（livePreview）所需样式；字体随包内文件走 'self'，符合 CSP
import "katex/dist/katex.min.css";

initTheme();
void hydrateSettings();

const view = new URLSearchParams(window.location.search).get("view");

if (view === "find") {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <FindReplaceWindow />
    </React.StrictMode>
  );
} else if (view === "codec") {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <CodecWindow />
    </React.StrictMode>
  );
} else if (view === "settings") {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <SettingsWindow />
    </React.StrictMode>
  );
} else {
  const params = new URLSearchParams(window.location.search);
  const spawned = params.get("spawn") === "1";
  const emptyWindow = params.get("empty") === "1";
  restoreWindowState();
  void (async () => {
    await hydrateSettings();
    initAppearance();
    initWindowTransfer();
    try {
      if (spawned) {
        await initSpawnedWindow();
      } else {
        await restoreOnStartup();
        // 双击 .md 启动：打开命令行里的文件（单实例二次启动走 open-files-request 事件）
        const args = await invoke<string[]>("launch_args").catch(() => [] as string[]);
        for (const path of args) {
          await openPathAction(path);
        }
      }
    } catch {
      // 恢复失败时进入编辑区空状态（docs/UI精修方案.md §4.10），不自动新建标签
    }
    if (!emptyWindow) initRecoveryPersistence();
    void initSettingsSync();
    const cleanup = trackWindowState();
    window.addEventListener("beforeunload", cleanup, { once: true });
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })();
}
