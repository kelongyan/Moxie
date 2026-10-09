import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPathAction } from "./state/actions";
import { initAutosave } from "./state/autosave";
import { initExternalWatch } from "./state/externalWatch";
import { EditorPane } from "./components/EditorPane";
import { FindBar } from "./components/FindBar";
import { HistoryOverlay } from "./components/HistoryOverlay";
import { QuickOpen } from "./components/QuickOpen";
import { useFindBar } from "./state/findBar";
import { useHistoryOverlay } from "./state/historyOverlay";
import { useQuickOpen } from "./state/quickOpen";
import { saveWorkspaceAndFinish } from "./state/recovery";
import { ConflictDialog, EncodingDialog, LossyDialog } from "./components/FileDialogs";
import { PromptDialogs } from "./components/PromptDialogs";
import { SavePromptDialog } from "./components/SavePromptDialog";
import { SidebarView } from "./components/SidebarView";
import { StatusBar } from "./components/StatusBar";
import { TableInsertPicker } from "./components/TableInsertPicker";
import { TabBar } from "./components/TabBar";
import { TitleToolbar } from "./components/TitleToolbar";
import { useCloseGuard } from "./hooks/useCloseGuard";
import { DropOverlay, useFileDrop } from "./hooks/useFileDrop";
import { useShortcuts } from "./hooks/useShortcuts";
import { initCodecSession } from "./state/codecSession";
import { useDocuments } from "./state/documents";
import { initFindSession } from "./state/findSession";
import { usePreferences } from "./state/preferences";
import { useSidebar } from "./state/sidebar";
import { useTableInsert } from "./state/tableInsert";

const PREVIEW_SHOW_MS = 160;
const PREVIEW_HIDE_MS = 220;

export default function App() {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const activeDoc = documents.find((d) => d.id === activeId) ?? null;
  const dragActive = useFileDrop();
  const sidebarPinned = usePreferences((s) => s.sidebarPinned);
  const quickOpenOpen = useQuickOpen((s) => s.open);
  const findBarOpen = useFindBar((s) => s.open);
  const historyOpen = useHistoryOverlay((s) => s.open);
  const tableInsertOpen = useTableInsert((s) => s.open);
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useShortcuts();
  useCloseGuard();

  useEffect(() => initAutosave(), []);
  useEffect(() => initExternalWatch(), []);

  useEffect(() => {
    let disposed = false;
    let unlistenFiles: (() => void) | null = null;
    let unlistenQuit: (() => void) | null = null;
    let unlistenFind: (() => void) | null = null;
    let unlistenCodec: (() => void) | null = null;
    // 单实例：二次启动转发的文件参数
    void listen<string[]>("open-files-request", (event) => {
      for (const path of event.payload ?? []) {
        void openPathAction(path);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlistenFiles = fn;
    });
    // 托盘"退出"：先保存工作区快照再退出
    void listen("app:quit", () => {
      void (async () => {
        await saveWorkspaceAndFinish();
        await invoke("app_exit");
      })();
    }).then((fn) => {
      if (disposed) fn();
      else unlistenQuit = fn;
    });
    void initFindSession().then((fn) => {
      if (disposed) fn();
      else unlistenFind = fn;
    });
    void initCodecSession().then((fn) => {
      if (disposed) fn();
      else unlistenCodec = fn;
    });
    return () => {
      disposed = true;
      unlistenFiles?.();
      unlistenQuit?.();
      if (unlistenFind) unlistenFind();
      if (unlistenCodec) unlistenCodec();
    };
  }, []);

  useEffect(() => {
    void useSidebar.getState().refresh();
    const onFocus = () => void useSidebar.getState().refreshMissing();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const title = activeDoc
      ? `${activeDoc.isDirty ? "● " : ""}${activeDoc.name} — Moxie`
      : "Moxie";
    void getCurrentWindow().setTitle(title);
  }, [activeDoc?.name, activeDoc?.isDirty]);

  const clearTimers = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const sidebarMode = sidebarPinned
    ? "pinned"
    : sidebarPeek
      ? "preview"
      : "hidden";

  const onSidebarHoverStart = () => {
    clearTimers();
    if (!sidebarPinned) {
      showTimer.current = window.setTimeout(() => {
        setSidebarPeek(true);
      }, PREVIEW_SHOW_MS);
    }
  };

  const onSidebarHoverEnd = () => {
    clearTimers();
    if (sidebarMode === "preview") {
      hideTimer.current = window.setTimeout(() => {
        setSidebarPeek(false);
      }, PREVIEW_HIDE_MS);
    }
  };

  const onSidebarToggle = () => {
    clearTimers();
    setSidebarPeek(false);
    usePreferences.getState().set({ sidebarPinned: !sidebarPinned });
  };

  return (
    <div className="lac-window">
      <TitleToolbar
        activeDoc={activeDoc}
        sidebarPinned={sidebarPinned}
        onSidebarToggle={onSidebarToggle}
        onSidebarHoverStart={onSidebarHoverStart}
        onSidebarHoverEnd={onSidebarHoverEnd}
      >
        <TabBar />
      </TitleToolbar>
      <div className={"lac-main" + (sidebarMode === "pinned" ? " sidebar-pinned" : "")}>
        <aside
          className={`sidebar mode-${sidebarMode}`}
          onMouseEnter={() => {
            if (hideTimer.current !== null) {
              window.clearTimeout(hideTimer.current);
              hideTimer.current = null;
            }
          }}
          onMouseLeave={onSidebarHoverEnd}
        >
          <SidebarView />
        </aside>
        <EditorPane />
      </div>
      <StatusBar activeDoc={activeDoc} />
      <SavePromptDialog />
      <EncodingDialog />
      <ConflictDialog />
      <LossyDialog />
      <PromptDialogs />
      {quickOpenOpen && <QuickOpen />}
      {findBarOpen && <FindBar />}
      {historyOpen && <HistoryOverlay />}
      {tableInsertOpen && <TableInsertPicker />}
      <DropOverlay visible={dragActive} />
    </div>
  );
}
