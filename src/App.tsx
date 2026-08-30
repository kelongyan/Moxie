import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorPane } from "./components/EditorPane";
import { ConflictDialog, EncodingDialog, LossyDialog } from "./components/FileDialogs";
import { PromptDialogs } from "./components/PromptDialogs";
import { SavePromptDialog } from "./components/SavePromptDialog";
import { SidebarView } from "./components/SidebarView";
import { StatusBar } from "./components/StatusBar";
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

const PREVIEW_SHOW_MS = 160;
const PREVIEW_HIDE_MS = 220;

export default function App() {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const activeDoc = documents.find((d) => d.id === activeId) ?? null;
  const dragActive = useFileDrop();
  const sidebarPinned = usePreferences((s) => s.sidebarPinned);
  const [previewVisible, setPreviewVisible] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useShortcuts();
  useCloseGuard();

  useEffect(() => {
    let disposed = false;
    let unlistenFind: (() => void) | null = null;
    let unlistenCodec: (() => void) | null = null;
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
    : previewVisible
      ? "preview"
      : "hidden";

  const onSidebarHoverStart = () => {
    clearTimers();
    if (!sidebarPinned) {
      showTimer.current = window.setTimeout(() => {
        setPreviewVisible(true);
      }, PREVIEW_SHOW_MS);
    }
  };

  const onSidebarHoverEnd = () => {
    clearTimers();
    if (sidebarMode === "preview") {
      hideTimer.current = window.setTimeout(() => {
        setPreviewVisible(false);
      }, PREVIEW_HIDE_MS);
    }
  };

  const onSidebarToggle = () => {
    clearTimers();
    setPreviewVisible(false);
    usePreferences.getState().set({ sidebarPinned: !sidebarPinned });
  };

  const onTogglePreview = () => {
    if (!activeDoc || activeDoc.language !== "markdown") return;
    useDocuments
      .getState()
      .patchDocument(activeDoc.id, { previewVisible: !activeDoc.previewVisible });
  };

  return (
    <div className="lac-window">
      <TitleToolbar
        activeDoc={activeDoc}
        sidebarPinned={sidebarPinned}
        onSidebarToggle={onSidebarToggle}
        onSidebarHoverStart={onSidebarHoverStart}
        onSidebarHoverEnd={onSidebarHoverEnd}
        onTogglePreview={onTogglePreview}
      />
      <TabBar />
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
      <DropOverlay visible={dragActive} />
    </div>
  );
}
