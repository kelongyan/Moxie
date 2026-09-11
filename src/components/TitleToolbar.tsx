import { ReactNode, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronDown,
  Copy,
  Eye,
  Minus,
  PanelLeft,
  Redo2,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { redoFor, undoFor } from "../editor/registry";
import { EditorDocument, useDocuments } from "../state/documents";
import { EditorLanguage, LANGUAGE_LABELS } from "../models/language";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { Tooltip } from "./Tooltip";

interface TitleToolbarProps {
  activeDoc: EditorDocument | null;
  sidebarPinned: boolean;
  onSidebarToggle: () => void;
  onSidebarHoverStart: () => void;
  onSidebarHoverEnd: () => void;
  onTogglePreview: () => void;
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
  onTogglePreview,
  children,
}: TitleToolbarProps) {
  const hasDocument = activeDoc !== null;
  const [langMenu, setLangMenu] = useState<{ x: number; y: number } | null>(
    null
  );

  const languageMenuItems: MenuItem[] =
    activeDoc && langMenu
      ? (
          Object.entries(LANGUAGE_LABELS) as [
            EditorLanguage,
            string
          ][]
        ).map(([language, label]) => ({
          label,
          checked: activeDoc.language === language,
          onClick: () => {
            if (activeDoc.language !== language) {
              useDocuments
                .getState()
                .patchDocument(activeDoc.id, { language });
            }
          },
        }))
      : [];

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

      <Tooltip label="语言模式">
        <button
          className="tool-button language-button"
          disabled={!hasDocument}
          onClick={(e) => {
            if (!activeDoc) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setLangMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          {activeDoc ? LANGUAGE_LABELS[activeDoc.language] : "纯文本"}
          <ChevronDown className="chevron" />
        </button>
      </Tooltip>

      <Tooltip
        label={
          activeDoc?.previewVisible
            ? "切到源码模式（Ctrl+Shift+P）"
            : "切到渲染模式（Ctrl+Shift+P）"
        }
        shortcut="Ctrl+Shift+P"
      >
        <button
          className={
            "tool-button" +
            (activeDoc?.language === "markdown" && activeDoc?.previewVisible
              ? " active"
              : "")
          }
          aria-label="切换 Markdown 视图模式"
          disabled={!hasDocument || activeDoc?.language !== "markdown"}
          onClick={onTogglePreview}
        >
          <Eye />
        </button>
      </Tooltip>

      <WindowControls />

      {langMenu && (
        <ContextMenu
          x={langMenu.x}
          y={langMenu.y}
          items={languageMenuItems}
          onClose={() => setLangMenu(null)}
        />
      )}
    </header>
  );
}
