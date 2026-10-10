import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Copy,
  Download,
  Minus,
  MoreHorizontal,
  PanelLeft,
  Square,
  X,
} from "lucide-react";
import { EditorDocument, useDocuments } from "../state/documents";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { Tooltip } from "./Tooltip";
import { openSettingsWindow } from "../state/settingsWindow";
import { openFindWindow } from "../state/findWindow";
import { exportPreviewHtml, exportWordDoc } from "../preview/exportHtml";
import { collectPreviewTokens } from "../preview/markdown";
import { directoryOf } from "../preview/markdownCore";
import { usePreferences } from "../state/preferences";
import { viewFor } from "../editor/registry";

interface TitleToolbarProps {
  activeDoc: EditorDocument | null;
  sidebarPinned: boolean;
  onSidebarToggle: () => void;
  onSidebarHoverStart: () => void;
  onSidebarHoverEnd: () => void;
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
        <Minus size={13} />
      </button>
      <button
        aria-label={maximized ? "向下还原" : "最大化"}
        onClick={() => call("最大化", () => appWindow.toggleMaximize())}
      >
        {maximized ? <Copy size={11} /> : <Square size={11} />}
      </button>
      <button
        className="close"
        aria-label="关闭"
        onClick={() => call("关闭", () => appWindow.close())}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Typora 经典菜单项（按需求先使用灰色按钮占位表示，暂不接入业务）
const TYPORA_MENUS = [
  { key: "file", label: "文件(F)" },
  { key: "edit", label: "编辑(E)" },
  { key: "paragraph", label: "段落(P)" },
  { key: "format", label: "格式(O)" },
  { key: "view", label: "视图(V)" },
  { key: "theme", label: "主题(T)" },
  { key: "help", label: "帮助(H)" },
];

export function TitleToolbar({
  activeDoc,
  sidebarPinned,
  onSidebarToggle,
  onSidebarHoverStart,
  onSidebarHoverEnd,
}: TitleToolbarProps) {
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);

  const runExport = async (
    fn: (opts: Parameters<typeof exportPreviewHtml>[0]) => Promise<boolean>,
    doneMessage: string
  ) => {
    if (!activeDoc) return;
    const view = viewFor(activeDoc.id);
    if (!view) return;
    try {
      const prefs = usePreferences.getState();
      const saved = await fn({
        tokens: collectPreviewTokens({
          theme: prefs.exportTheme,
          codeLineNumbers: prefs.exportCodeLineNumbers,
          narrow: prefs.exportNarrow,
        }),
        title: activeDoc.name,
        text: view.state.doc.toString(),
        baseDir: activeDoc.path ? directoryOf(activeDoc.path) : null,
        breaks: prefs.markdownBreaks,
        typographer: prefs.markdownTypographer,
        allowHtml: prefs.markdownAllowHtml,
      });
      useDocuments
        .getState()
        .setStatus(saved ? { text: doneMessage, kind: "info" } : null);
    } catch (error) {
      useDocuments
        .getState()
        .setStatus({ text: `导出失败:${String(error)}`, kind: "error" });
    }
  };

  const exportMenuItems: MenuItem[] = [
    {
      label: "导出为独立 HTML",
      disabled: !activeDoc,
      onClick: () => void runExport(exportPreviewHtml, "已导出为 HTML"),
    },
    {
      label: "导出为 Word 文档 (.doc)",
      disabled: !activeDoc,
      onClick: () => void runExport(exportWordDoc, "已导出为 Word 文档"),
    },
  ];

  const moreMenuItems: MenuItem[] = [
    {
      label: "查找/替换",
      shortcut: "Ctrl+F",
      onClick: () => void openFindWindow("find"),
    },
    {
      label: "偏好设置",
      shortcut: "Ctrl+,",
      onClick: () => void openSettingsWindow(),
    },
  ];

  return (
    <header className="title-toolbar typora-header" data-tauri-drag-region>
      {/* 1. 左侧：侧栏切换按钮 + 仿 Typora 菜单栏（灰色占位按钮） */}
      <div className="titlebar-left" data-tauri-drag-region>
        <Tooltip label={sidebarPinned ? "收起侧栏" : "展开侧栏"} shortcut="Ctrl+Shift+B">
          <button
            className={"tool-icon-btn sidebar-toggle" + (sidebarPinned ? " active" : "")}
            aria-label="显示/隐藏侧边栏"
            onClick={onSidebarToggle}
            onMouseEnter={onSidebarHoverStart}
            onMouseLeave={onSidebarHoverEnd}
          >
            <PanelLeft size={14} />
          </button>
        </Tooltip>

        <div className="typora-menu-bar" data-tauri-drag-region>
          {TYPORA_MENUS.map((menu) => (
            <button
              key={menu.key}
              className="typora-menu-placeholder-btn"
              title={`${menu.label} 菜单 (占位)`}
            >
              {menu.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 中间：纯拖拽留白区 */}
      <div className="titlebar-center" data-tauri-drag-region />

      {/* 3. 右侧：快速占位操作（导出/更多） + 窗口控制 */}
      <div className="titlebar-right" data-tauri-drag-region>
        <button
          className="tool-icon-btn placeholder-action-btn"
          title="导出文档选项"
          disabled={!activeDoc}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setExportMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <Download size={13} />
        </button>

        <button
          className="tool-icon-btn placeholder-action-btn"
          title="更多选项"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMoreMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <MoreHorizontal size={14} />
        </button>

        <WindowControls />
      </div>

      {/* 导出菜单 */}
      {exportMenu && (
        <ContextMenu
          x={exportMenu.x}
          y={exportMenu.y}
          items={exportMenuItems}
          onClose={() => setExportMenu(null)}
        />
      )}

      {/* 更多菜单 */}
      {moreMenu && (
        <ContextMenu
          x={moreMenu.x}
          y={moreMenu.y}
          items={moreMenuItems}
          onClose={() => setMoreMenu(null)}
        />
      )}
    </header>
  );
}
