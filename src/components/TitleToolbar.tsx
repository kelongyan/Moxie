import { ReactNode, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronDown,
  Copy,
  Download,
  Minus,
  MoreHorizontal,
  PanelLeft,
  Square,
  X,
} from "lucide-react";
import { redoFor, undoFor, viewFor } from "../editor/registry";
import {
  copyRichTextAction,
  newTabAction,
  openFileAction,
  saveActiveAction,
  saveAsAction,
} from "../state/actions";
import { openCodecWindow } from "../state/codecWindow";
import { EditorDocument, useDocuments } from "../state/documents";
import { openFindWindow } from "../state/findWindow";
import { openHistoryOverlay } from "../state/historyOverlay";
import { usePreferences } from "../state/preferences";
import { promptConfirm } from "../state/prompts";
import { openSettingsWindow } from "../state/settingsWindow";
import { createEmptyWindow } from "../state/windows";
import { directoryOf } from "../preview/markdownCore";
import { collectPreviewTokens } from "../preview/markdown";
import { exportPreviewHtml, exportWordDoc } from "../preview/exportHtml";
import { ContextMenu, MenuItem } from "./ContextMenu";
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
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);

  const runExport = async (
    fn: (opts: Parameters<typeof exportPreviewHtml>[0]) => Promise<boolean>,
    doneMessage: string
  ) => {
    if (!activeDoc || exportingRef.current) return;
    const view = viewFor(activeDoc.id);
    if (!view) return;
    exportingRef.current = true;
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
    } finally {
      exportingRef.current = false;
    }
  };

  const handleExportHtml = () => runExport(exportPreviewHtml, "已导出为 HTML");

  const handleAbout = async () => {
    let version = "";
    try {
      version = await getVersion();
    } catch {
      version = "";
    }
    await promptConfirm(
      "关于 Moxie",
      `Moxie ${version ? `v${version}` : ""}\n一款安静、快速、真正属于 Windows 的本地 Markdown 编辑器。不登录、不联网、不上传内容。`,
      "关闭"
    );
  };

  const exportMenuItems: MenuItem[] = [
    {
      label: "导出为独立 HTML",
      disabled: !hasDocument,
      onClick: () => void handleExportHtml(),
    },
    {
      label: "导出为 Word 文档 (.doc)",
      disabled: !hasDocument,
      onClick: () => void runExport(exportWordDoc, "已导出为 Word 文档"),
    },
    {
      label: "复制为富文本",
      shortcut: "Ctrl+Shift+C",
      disabled: !hasDocument,
      onClick: () => void copyRichTextAction(),
    },
  ];

  const moreMenuItems: MenuItem[] = [
    {
      label: "撤销",
      shortcut: "Ctrl+Z",
      disabled: !hasDocument,
      onClick: () => activeDoc && undoFor(activeDoc.id),
    },
    {
      label: "重做",
      shortcut: "Ctrl+Shift+Z",
      disabled: !hasDocument,
      onClick: () => activeDoc && redoFor(activeDoc.id),
    },
    {
      label: "新建标签",
      shortcut: "Ctrl+T",
      separatorBefore: true,
      onClick: () => newTabAction(),
    },
    {
      label: "新建窗口",
      onClick: () => void createEmptyWindow(),
    },
    {
      label: "打开文件…",
      shortcut: "Ctrl+O",
      onClick: () => void openFileAction(),
    },
    {
      label: "保存",
      shortcut: "Ctrl+S",
      disabled: !hasDocument,
      onClick: () => void saveActiveAction(),
    },
    {
      label: "另存为…",
      shortcut: "Ctrl+Shift+S",
      disabled: !hasDocument,
      onClick: () => void saveAsAction(),
    },
    {
      label: "查找/替换",
      shortcut: "Ctrl+F",
      separatorBefore: true,
      onClick: () => void openFindWindow("find"),
    },
    {
      label: "插入表格…",
      shortcut: "Ctrl+Shift+T",
      disabled: !hasDocument,
      onClick: () => void import("../state/tableInsert").then((m) => m.openTableInsert()),
    },
    {
      label: "版本时间线…",
      disabled: !hasDocument,
      onClick: () => openHistoryOverlay(),
    },
    {
      label: "编码转换",
      shortcut: "Alt+D",
      onClick: () => void openCodecWindow("smart-decode"),
    },
    {
      label: "设置",
      shortcut: "Ctrl+,",
      separatorBefore: true,
      onClick: () => void openSettingsWindow(),
    },
    {
      label: "关于 Moxie",
      onClick: () => void handleAbout(),
    },
  ];

  return (
    <header className="title-toolbar" data-tauri-drag-region>
      {/* 1. 左侧品牌标牌与侧栏折叠开关 */}
      <div className="title-left-group" data-tauri-drag-region>
        <div className="wordmark" data-tauri-drag-region aria-hidden="true" title="Moxie">
          M
        </div>
        <Tooltip label={sidebarPinned ? "收起侧栏" : "展开侧栏"} shortcut="Ctrl+Shift+B">
          <button
            className={"tool-button sidebar-toggle-btn" + (sidebarPinned ? " active" : "")}
            aria-label="显示/隐藏侧边栏"
            onClick={onSidebarToggle}
            onMouseEnter={onSidebarHoverStart}
            onMouseLeave={onSidebarHoverEnd}
          >
            <PanelLeft size={15} />
          </button>
        </Tooltip>
      </div>

      {/* 2. 标签栏并入顶栏中段：占满中段弹性宽度 */}
      {children}

      {/* 3. 右侧操作集合：整合为现代「导出」下拉与「更多」菜单 */}
      <div className="title-actions-group">
        <button
          className="header-action-pill export-pill"
          aria-label="导出"
          aria-haspopup="menu"
          title="导出文档选项"
          disabled={!hasDocument}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setExportMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <Download size={13} />
          <span>导出</span>
          <ChevronDown size={11} className="pill-chevron" />
        </button>

        <button
          className="tool-button more-btn"
          aria-label="更多操作"
          aria-haspopup="menu"
          title="更多操作"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMoreMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      {/* 4. 原生窗口控制按钮 */}
      <WindowControls />

      {/* 下拉菜单浮层 */}
      {exportMenu && (
        <ContextMenu
          x={exportMenu.x}
          y={exportMenu.y}
          items={exportMenuItems}
          onClose={() => setExportMenu(null)}
        />
      )}

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
