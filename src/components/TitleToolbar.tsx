import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Copy,
  Minus,
  PanelLeft,
  Square,
  X,
} from "lucide-react";
import { EditorDocument, useDocuments } from "../state/documents";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { Tooltip } from "./Tooltip";
import { openSettingsWindow } from "../state/settingsWindow";
import { openFindWindow } from "../state/findWindow";
import { openCodecWindow } from "../state/codecWindow";
import { createEmptyWindow } from "../state/windows";
import { promptConfirm } from "../state/prompts";
import {
  copyRichTextAction,
  newTabAction,
  openFileAction,
  saveActiveAction,
  saveAsAction,
} from "../state/actions";
import { redoFor, undoFor, viewFor } from "../editor/registry";
import { exportPreviewHtml, exportWordDoc } from "../preview/exportHtml";
import { collectPreviewTokens } from "../preview/markdown";
import { directoryOf } from "../preview/markdownCore";
import { usePreferences } from "../state/preferences";

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

// Typora 经典菜单项定义
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
  const [openMenu, setOpenMenu] = useState<{
    key: string;
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

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

  const getMenuItems = (key: string): MenuItem[] => {
    switch (key) {
      case "file":
        return [
          {
            label: "新建标签页",
            shortcut: "Ctrl+T",
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
            label: "复制为富文本",
            shortcut: "Ctrl+Shift+C",
            disabled: !activeDoc,
            onClick: () => void copyRichTextAction(),
          },
          {
            label: "偏好设置…",
            shortcut: "Ctrl+,",
            separatorBefore: true,
            onClick: () => void openSettingsWindow(),
          },
        ];
      case "edit":
        return [
          {
            label: "撤销",
            shortcut: "Ctrl+Z",
            disabled: !activeDoc,
            onClick: () => activeDoc && undoFor(activeDoc.id),
          },
          {
            label: "重做",
            shortcut: "Ctrl+Shift+Z",
            disabled: !activeDoc,
            onClick: () => activeDoc && redoFor(activeDoc.id),
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
            disabled: !activeDoc,
            onClick: () =>
              void import("../state/tableInsert").then((m) => m.openTableInsert()),
          },
          {
            label: "编码转换",
            shortcut: "Alt+D",
            onClick: () => void openCodecWindow("smart-decode"),
          },
        ];
      case "view":
        return [
          {
            label: sidebarPinned ? "收起侧边栏" : "展开侧边栏",
            shortcut: "Ctrl+Shift+B",
            onClick: onSidebarToggle,
          },
        ];
      case "help":
        return [
          {
            label: "关于 Moxie…",
            onClick: () => void handleAbout(),
          },
        ];
      default:
        return [
          {
            label: "功能占位 (开发中)",
            disabled: true,
            onClick: () => {},
          },
        ];
    }
  };

  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>, key: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenMenu({
      key,
      x: rect.left,
      y: rect.bottom + 2,
      items: getMenuItems(key),
    });
  };

  return (
    <header className="title-toolbar typora-header" data-tauri-drag-region>
      {/* 1. 左侧：侧栏切换按钮 + Typora 经典菜单栏（各功能已规范移入对应菜单） */}
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
              className={
                "typora-menu-placeholder-btn" +
                (openMenu?.key === menu.key ? " is-active" : "")
              }
              onClick={(e) => handleMenuClick(e, menu.key)}
            >
              {menu.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 中间：整幅无阻碍拖拽留白区 */}
      <div className="titlebar-center" data-tauri-drag-region />

      {/* 3. 右侧：彻底清除多余下载与点阵按钮，仅保留 Windows 原生窗口控制 */}
      <div className="titlebar-right" data-tauri-drag-region>
        <WindowControls />
      </div>

      {/* 统一菜单弹出层 */}
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
