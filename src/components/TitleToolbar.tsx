import { ReactNode, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Menu, Minus, PanelLeft, Square, X } from "lucide-react";
import { EditorDocument, useDocuments } from "../state/documents";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { Tooltip } from "./Tooltip";
import { openSettingsWindow } from "../state/settingsWindow";
import { openFindWindow } from "../state/findWindow";
import { openCodecWindow } from "../state/codecWindow";
import { createEmptyWindow } from "../state/windows";
import { openHistoryOverlay } from "../state/historyOverlay";
import { promptConfirm } from "../state/prompts";
import {
  copyRichTextAction,
  newTabAction,
  openFileAction,
  reloadActiveFromDiskAction,
  saveActiveAction,
  saveAsAction,
} from "../state/actions";
import { redoFor, undoFor, viewFor } from "../editor/registry";
import { exportPreviewHtml, exportWordDoc } from "../preview/exportHtml";
import { printDocument } from "../preview/print";
import { collectPreviewTokens } from "../preview/markdown";
import { directoryOf } from "../preview/markdownCore";
import { usePreferences } from "../state/preferences";

interface TitleToolbarProps {
  activeDoc: EditorDocument | null;
  sidebarPinned: boolean;
  onSidebarToggle: () => void;
  onSidebarHoverStart: () => void;
  onSidebarHoverEnd: () => void;
  /** 顶栏中段内容（标签栏）；右角按钮簇与标签栏之间的可用宽度 */
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
        <Minus size={12} />
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
        <X size={12} />
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
  const [openMenu, setOpenMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null
  );

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

  /** 打印 / 导出 PDF：与导出共用同一渲染管线（含 mermaid、KaTeX、图片内联） */
  const runPrint = async () => {
    if (!activeDoc) return;
    const view = viewFor(activeDoc.id);
    if (!view) return;
    try {
      const prefs = usePreferences.getState();
      const ok = await printDocument({
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
        .setStatus(
          ok
            ? { text: "已打开打印对话框，可选择「另存为 PDF」", kind: "info" }
            : { text: "无法打开打印对话框", kind: "error" }
        );
    } catch (error) {
      useDocuments
        .getState()
        .setStatus({ text: `打印失败:${String(error)}`, kind: "error" });
    }
  };

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

  // 汉堡菜单：原七菜单的全部可用项收进一个弹层
  const buildAppMenu = (): MenuItem[] => [
    { label: "新建标签页", shortcut: "Ctrl+T", onClick: () => newTabAction() },
    { label: "新建窗口", onClick: () => void createEmptyWindow() },
    { label: "打开文件…", shortcut: "Ctrl+O", onClick: () => void openFileAction() },
    {
      label: "保存",
      shortcut: "Ctrl+S",
      disabled: !activeDoc,
      onClick: () => void saveActiveAction(),
    },
    {
      label: "另存为…",
      shortcut: "Ctrl+Shift+S",
      disabled: !activeDoc,
      onClick: () => void saveAsAction(),
    },
    {
      label: "从磁盘重新载入",
      disabled: !activeDoc?.path,
      onClick: () => void reloadActiveFromDiskAction(),
    },
    {
      label: "历史版本…",
      disabled: !activeDoc?.path,
      onClick: () => openHistoryOverlay(),
    },
    {
      label: "导出为独立 HTML…",
      separatorBefore: true,
      disabled: !activeDoc,
      onClick: () => void runExport(exportPreviewHtml, "已导出为 HTML"),
    },
    {
      label: "导出为 Word 文档 (.doc)…",
      disabled: !activeDoc,
      onClick: () => void runExport(exportWordDoc, "已导出为 Word 文档"),
    },
    {
      label: "打印 / 导出 PDF…",
      disabled: !activeDoc,
      onClick: () => void runPrint(),
    },
    {
      label: "复制为富文本",
      shortcut: "Ctrl+Shift+C",
      disabled: !activeDoc,
      onClick: () => void copyRichTextAction(),
    },
    { label: "撤销", shortcut: "Ctrl+Z", separatorBefore: true, disabled: !activeDoc, onClick: () => activeDoc && undoFor(activeDoc.id) },
    { label: "重做", shortcut: "Ctrl+Shift+Z", disabled: !activeDoc, onClick: () => activeDoc && redoFor(activeDoc.id) },
    { label: "查找/替换", shortcut: "Ctrl+F", onClick: () => void openFindWindow("find") },
    {
      label: "插入表格…",
      shortcut: "Ctrl+Shift+T",
      disabled: !activeDoc,
      onClick: () => void import("../state/tableInsert").then((m) => m.openTableInsert()),
    },
    { label: "编码转换", shortcut: "Alt+D", onClick: () => void openCodecWindow("smart-decode") },
    {
      label: sidebarPinned ? "收起侧边栏" : "弹出侧边栏",
      shortcut: "Ctrl+Shift+B",
      separatorBefore: true,
      onClick: onSidebarToggle,
    },
    { label: "偏好设置…", shortcut: "Ctrl+,", separatorBefore: true, onClick: () => void openSettingsWindow() },
    { label: "关于 Moxie…", separatorBefore: true, onClick: () => void handleAbout() },
  ];

  const openAppMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenMenu({ x: rect.left, y: rect.bottom + 2, items: buildAppMenu() });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("button, input, select, textarea, .tab, .context-menu, [data-no-drag]")) {
      return;
    }
    if (e.detail === 2) {
      void getCurrentWindow().toggleMaximize().catch(() => {});
      return;
    }
    void getCurrentWindow().startDragging().catch(() => {});
  };

  return (
    <header className="title-toolbar" data-tauri-drag-region onMouseDown={handleMouseDown}>
      {/* 单行顶栏：左上角侧栏弹出/隐藏开关，标签栏随后占满中段，右角 应用菜单 / 窗口控制 */}
      <Tooltip label={sidebarPinned ? "收起侧栏" : "弹出侧栏"} shortcut="Ctrl+Shift+B">
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

      <div className="titlebar-center">{children}</div>

      <Tooltip label="应用菜单">
        <button
          className="tool-icon-btn app-menu-btn"
          aria-label="应用菜单"
          onClick={openAppMenu}
        >
          <Menu size={15} />
        </button>
      </Tooltip>

      <WindowControls />

      {openMenu && (
        <ContextMenu
          x={openMenu.x}
          y={openMenu.y}
          items={openMenu.items}
          onClose={() => setOpenMenu(null)}
        />
      )}
    </header>
  );
}
