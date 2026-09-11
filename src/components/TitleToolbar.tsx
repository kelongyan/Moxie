import { ReactNode, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Copy,
  Download,
  Minus,
  PanelLeft,
  Redo2,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { redoFor, undoFor, viewFor } from "../editor/registry";
import { EditorDocument, useDocuments } from "../state/documents";
import { usePreferences } from "../state/preferences";
import { directoryOf } from "../preview/markdownCore";
import { collectPreviewTokens } from "../preview/markdown";
import { exportPreviewHtml } from "../preview/exportHtml";
import { Tooltip } from "./Tooltip";

interface TitleToolbarProps {
  activeDoc: EditorDocument | null;
  sidebarPinned: boolean;
  onSidebarToggle: () => void;
  onSidebarHoverStart: () => void;
  onSidebarHoverEnd: () => void;
  /** 标签栏并入同一行：作为中段的弹性内容渲染 */
  children?: ReactNode;
}

function WindowControls() {
  const appWindow = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  const call = (label: string, fn: () => Promise<void>) => {
    fn().catch((error) => {
      useDocuments
        .getState()
        .setStatus({ text: `${label}失败: ${String(error)}`, kind: "error" });
    });
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    const sync = () =>
      void appWindow.isMaximized().then(setMaximized).catch(() => {});
    sync();
    void appWindow.onResized(sync).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="window-controls">
      <button aria-label="最小化" onClick={() => call("最小化", () => appWindow.minimize())}>
        <Minus size={14} />
      </button>
      <button
        aria-label={maximized ? "向下还原" : "最大化"}
        onClick={() => call("最大化", () => appWindow.toggleMaximize())}
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </button>
      <button
        className="close"
        aria-label="关闭"
        onClick={() => call("关闭", () => appWindow.close())}
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function TitleToolbar({
  activeDoc,
  sidebarPinned,
  onSidebarToggle,
  onSidebarHoverStart,
  onSidebarHoverEnd,
  children,
}: TitleToolbarProps) {
  const hasDocument = activeDoc !== null;
  const exportingRef = useRef(false);

  const handleExport = async () => {
    if (!activeDoc || exportingRef.current) return;
    const view = viewFor(activeDoc.id);
    if (!view) return;
    exportingRef.current = true;
    try {
      const prefs = usePreferences.getState();
      const saved = await exportPreviewHtml({
        tokens: collectPreviewTokens(),
        title: activeDoc.name,
        text: view.state.doc.toString(),
        baseDir: activeDoc.path ? directoryOf(activeDoc.path) : null,
        breaks: prefs.markdownBreaks,
        typographer: prefs.markdownTypographer,
        allowHtml: prefs.markdownAllowHtml,
      });
      useDocuments
        .getState()
        .setStatus(saved ? { text: "已导出为 HTML", kind: "info" } : null);
    } catch (error) {
      useDocuments
        .getState()
        .setStatus({ text: `导出失败:${String(error)}`, kind: "error" });
    } finally {
      exportingRef.current = false;
    }
  };

  return (
    <header className="title-toolbar" data-tauri-drag-region>
      <Tooltip label="显示/隐藏侧边栏" shortcut="Ctrl+Shift+B">
        <button
          className={"tool-button" + (sidebarPinned ? " active" : "")}
          aria-label="显示/隐藏侧边栏"
          onClick={onSidebarToggle}
          onMouseEnter={onSidebarHoverStart}
          onMouseLeave={onSidebarHoverEnd}
        >
          <PanelLeft />
        </button>
      </Tooltip>

      {/* 标签栏并入顶栏中段：占满标签开关与右侧动作之间的全部宽度 */}
      {children}

      <Tooltip label="撤销" shortcut="Ctrl+Z">
        <button
          className="tool-button"
          aria-label="撤销"
          disabled={!hasDocument}
          onClick={() => activeDoc && undoFor(activeDoc.id)}
        >
          <Undo2 />
        </button>
      </Tooltip>
      <Tooltip label="重做" shortcut="Ctrl+Shift+Z">
        <button
          className="tool-button"
          aria-label="重做"
          disabled={!hasDocument}
          onClick={() => activeDoc && redoFor(activeDoc.id)}
        >
          <Redo2 />
        </button>
      </Tooltip>

      <span className="title-divider" />

      <Tooltip label="导出为 HTML">
        <button
          className="tool-button"
          aria-label="导出为 HTML"
          disabled={!hasDocument}
          onClick={() => void handleExport()}
        >
          <Download />
        </button>
      </Tooltip>

      <WindowControls />
    </header>
  );
}
