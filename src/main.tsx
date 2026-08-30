import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CodecWindow } from "./components/CodecWindow";
import { FindReplaceWindow } from "./components/FindReplaceWindow";
import { SettingsWindow } from "./components/SettingsWindow";
import { hydrateSettings, initSettingsSync } from "./state/preferences";
import { initRecoveryPersistence, restoreOnStartup } from "./state/recovery";
import { initTheme } from "./state/theme";
import { initSpawnedWindow, initWindowTransfer } from "./state/windows";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/app.css";

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
  void (async () => {
    await hydrateSettings();
    initWindowTransfer();
    try {
      if (spawned) {
        await initSpawnedWindow();
      } else {
        await restoreOnStartup();
      }
    } catch {
      // 恢复失败时进入编辑区空状态（docs/UI精修方案.md §4.10），不自动新建标签
    }
    initRecoveryPersistence();
    void initSettingsSync();
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })();
}
