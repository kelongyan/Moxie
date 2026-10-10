import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  File,
  FilePlus,
  Files,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  ListTree,
  Plus,
  RotateCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { baseName } from "../models/markdown";
import {
  closeOtherTabsAction,
  closeTabAction,
  closeTabsToRightAction,
  newTabAction,
  openPathAction,
} from "../state/actions";
import { useDocuments } from "../state/documents";
import { promptConfirm, promptInput } from "../state/prompts";
import {
  dirName,
  joinPath,
  parentDirPath,
  type DirEntry,
  useSidebar,
} from "../state/sidebar";
import { moveDocToNewWindow } from "../state/windows";
import { subscribeTextChange, viewFor } from "../editor/registry";
import { Tooltip } from "./Tooltip";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

// ============================================================================
// 1. 大纲导航视图 (Outline View)
// ============================================================================

interface OutlineItem {
  level: number;
  text: string;
  from: number;
}

function stripHeadingMarks(text: string): string {
  return text
    .replace(/^\s*#{1,6}[ \t]+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[（(]\s*https?:\/\/[^）)]*[）)]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractOutline(view: EditorView): OutlineItem[] {
  const items: OutlineItem[] = [];
  syntaxTree(view.state).iterate({
    enter: (iter) => {
      const m = /^(ATXHeading([1-6])|SetextHeading([12]))$/.exec(iter.node.name);
      if (!m) return;
      const line = view.state.doc.lineAt(iter.from);
      items.push({
        level: Number(m[2] ?? m[3]),
        text: stripHeadingMarks(line.text),
        from: iter.from,
      });
    },
  });
  return items;
}

function computeActiveFrom(
  view: EditorView,
  items: OutlineItem[],
  cursorLine: number
): number | null {
  const line = Math.min(Math.max(1, cursorLine), view.state.doc.lines);
  const head = view.state.doc.line(line).from;
  let current: number | null = null;
  for (const item of items) {
    if (item.from <= head) current = item.from;
    else break;
  }
  return current;
}

function OutlineView({ activeId }: { activeId: string | null }) {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const cursorLine = useDocuments(
    (s) => s.documents.find((d) => d.id === activeId)?.cursorLine ?? 0
  );

  useEffect(() => {
    if (!activeId) {
      setItems([]);
      return;
    }
    let timer: number | null = null;
    const refresh = () => {
      const view = viewFor(activeId);
      if (!view) {
        setItems([]);
        return;
      }
      setItems(extractOutline(view));
    };
    refresh();
    const unsubscribe = subscribeTextChange(activeId, () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 300);
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeId]);

  const activeFrom = useMemo(() => {
    const view = activeId ? viewFor(activeId) : undefined;
    if (!view || cursorLine <= 0) return null;
    return computeActiveFrom(view, items, cursorLine);
  }, [items, cursorLine, activeId]);

  const filteredItems = useMemo(() => {
    if (!filterQuery.trim()) return items;
    const q = filterQuery.toLowerCase();
    return items.filter((item) => item.text.toLowerCase().includes(q));
  }, [items, filterQuery]);

  const jump = (item: OutlineItem) => {
    const view = activeId ? viewFor(activeId) : undefined;
    if (!view) return;
    view.dispatch({
      selection: { anchor: item.from },
      effects: EditorView.scrollIntoView(item.from, { y: "center" }),
    });
    view.focus();
  };

  if (!activeId) {
    return (
      <div className="sidebar-empty-state">
        <ListTree size={28} className="empty-icon" />
        <div className="empty-title">暂无活动文档</div>
        <div className="empty-desc">在编辑器中打开或新建文档后，此处将自动呈现层级大纲。</div>
      </div>
    );
  }

  return (
    <div className="outline-view">
      <div className="view-sub-header">
        <span className="sub-title">文档大纲</span>
        <span className="sub-badge">{items.length} 节</span>
      </div>

      {items.length >= 6 && (
        <div className="outline-filter-bar">
          <Search size={12} className="filter-icon" />
          <input
            type="text"
            className="filter-input"
            placeholder="过滤大纲章节…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          {filterQuery && (
            <button
              className="filter-clear"
              onClick={() => setFilterQuery("")}
              title="清除过滤"
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="sidebar-empty-state compact">
          <div className="empty-title">当前文档暂无标题</div>
          <div className="empty-desc">键入 # 一级标题、## 二级标题 即可生成导航</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="sidebar-empty-state compact">
          <div className="empty-title">未匹配到标题</div>
        </div>
      ) : (
        <div className="outline-tree" role="list">
          {filteredItems.map((item, idx) => {
            const isActive = item.from === activeFrom;
            const indentLevel = Math.max(0, Math.min(item.level - 1, 5));
            return (
              <button
                key={`${item.from}-${idx}`}
                role="listitem"
                className={`outline-node lvl-${item.level}` + (isActive ? " is-active" : "")}
                style={{ paddingLeft: `${indentLevel * 12 + 12}px` }}
                onClick={() => jump(item)}
                title={item.text}
              >
                <span className="outline-text">{item.text || "(空标题)"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. 工作区文件目录树 (Workspace File Tree View)
// ============================================================================

function FileTreeItem({
  entry,
  depth,
  onMenu,
}: {
  entry: DirEntry;
  depth: number;
  onMenu: (x: number, y: number, items: MenuItem[]) => void;
}) {
  const sidebar = useSidebar();
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);

  const isExpanded = sidebar.expandedDirs[entry.path] === true;
  const children = sidebar.dirChildren[entry.path] ?? [];

  const openDoc = documents.find((d) => d.path === entry.path);
  const isOpen = Boolean(openDoc);
  const isDirty = openDoc?.isDirty ?? false;
  const isActive = openDoc?.id === activeId;

  const handleClick = async () => {
    if (entry.isDir) {
      await sidebar.toggleDirExpanded(entry.path);
    } else {
      await openPathAction(entry.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items: MenuItem[] = [];

    if (entry.isDir) {
      items.push({
        label: "在此新建文件…",
        onClick: () => {
          void (async () => {
            const name = await promptInput("在文件夹中新建文件:", "未命名.md");
            if (!name) return;
            const path = await sidebar.createWorkspaceFile(entry.path, name);
            if (path) {
              await openPathAction(path);
            }
          })();
        },
      });
      items.push({
        label: "在此新建文件夹…",
        onClick: () => {
          void (async () => {
            const name = await promptInput("在文件夹中新建子目录:", "新文件夹");
            if (!name) return;
            await sidebar.createWorkspaceDir(entry.path, name);
          })();
        },
      });
      items.push({
        label: "在资源管理器中显示",
        separatorBefore: true,
        onClick: () => void invoke("explorer_select", { path: entry.path }),
      });
      items.push({
        label: "重命名…",
        onClick: () => {
          void (async () => {
            const newName = await promptInput("重命名文件夹:", entry.name);
            if (!newName || newName === entry.name) return;
            const parent = parentDirPath(entry.path);
            const target = joinPath(parent, newName);
            await sidebar.renameWorkspaceItem(entry.path, target);
          })();
        },
      });
      items.push({
        label: "删除文件夹",
        danger: true,
        separatorBefore: true,
        onClick: () => {
          void (async () => {
            const ok = await promptConfirm(
              "删除文件夹",
              `确定要删除文件夹 “${entry.name}” 及其所有内容吗？此操作无法撤销。`,
              "删除",
              true
            );
            if (ok) {
              await sidebar.deleteWorkspaceItem(entry.path);
            }
          })();
        },
      });
    } else {
      items.push({
        label: "打开",
        onClick: () => void openPathAction(entry.path),
      });
      items.push({
        label: "在资源管理器中显示",
        onClick: () => void invoke("explorer_select", { path: entry.path }),
      });
      items.push({
        label: "复制文件完整路径",
        onClick: () => void navigator.clipboard.writeText(entry.path),
      });
      items.push({
        label: "重命名…",
        separatorBefore: true,
        onClick: () => {
          void (async () => {
            const newName = await promptInput("重命名文件:", entry.name);
            if (!newName || newName === entry.name) return;
            const parent = parentDirPath(entry.path);
            const target = joinPath(parent, newName);
            const ok = await sidebar.renameWorkspaceItem(entry.path, target);
            if (ok && openDoc) {
              useDocuments.getState().updateLocation(openDoc.id, target);
            }
          })();
        },
      });
      items.push({
        label: "删除文件",
        danger: true,
        separatorBefore: true,
        onClick: () => {
          void (async () => {
            const ok = await promptConfirm(
              "删除文件",
              `确定要将 “${entry.name}” 从磁盘永久删除吗？`,
              "删除",
              true
            );
            if (ok) {
              await sidebar.deleteWorkspaceItem(entry.path);
              if (openDoc) {
                useDocuments.getState().close(openDoc.id);
              }
            }
          })();
        },
      });
    }

    onMenu(e.clientX, e.clientY, items);
  };

  return (
    <div className="tree-node-wrapper">
      <div
        className={
          "tree-node" +
          (entry.isDir ? " is-dir" : " is-file") +
          (isOpen ? " is-open" : "") +
          (isActive ? " is-active" : "")
        }
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={entry.path}
      >
        {depth > 0 && <span className="tree-guide" />}

        {entry.isDir ? (
          <>
            <ChevronRight
              size={12}
              className={"node-chevron" + (isExpanded ? " expanded" : "")}
            />
            {isExpanded ? (
              <FolderOpen size={14} className="node-icon folder-open" />
            ) : (
              <Folder size={14} className="node-icon folder-closed" />
            )}
          </>
        ) : (
          <>
            <span className="node-indent-spacer" />
            {entry.isMarkdown ? (
              <FileText size={14} className="node-icon file-md" />
            ) : (
              <File size={14} className="node-icon file-plain" />
            )}
          </>
        )}

        <span className="node-label">{entry.name}</span>

        {isDirty && (
          <span className="node-dirty-dot" title="有未保存更改" />
        )}

        {entry.isDir && (
          <button
            className="node-hover-action"
            title="在此新建文件"
            onClick={(e) => {
              e.stopPropagation();
              void (async () => {
                const name = await promptInput("在文件夹中新建文件:", "未命名.md");
                if (!name) return;
                const path = await sidebar.createWorkspaceFile(entry.path, name);
                if (path) {
                  await openPathAction(path);
                }
              })();
            }}
          >
            <FilePlus size={12} />
          </button>
        )}
      </div>

      {entry.isDir && isExpanded && (
        <div className="tree-children">
          {children.length === 0 ? (
            <div
              className="tree-empty-children"
              style={{ paddingLeft: `${(depth + 1) * 14 + 14}px` }}
            >
              (空文件夹)
            </div>
          ) : (
            children.map((child) => (
              <FileTreeItem
                key={child.path}
                entry={child}
                depth={depth + 1}
                onMenu={onMenu}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WorkspaceView({ onMenu }: { onMenu: (x: number, y: number, items: MenuItem[]) => void }) {
  const sidebar = useSidebar();
  const activeDoc = useDocuments((s) => s.documents.find((d) => d.id === s.activeId));
  const [filterQuery, setFilterQuery] = useState("");

  const handleOpenFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择工作区文件夹",
    });
    if (!selected || Array.isArray(selected)) return;
    await sidebar.openWorkspace(selected);
  };

  const handleOpenCurrentFileDir = async () => {
    if (!activeDoc?.path) return;
    const parent = parentDirPath(activeDoc.path);
    if (parent) {
      await sidebar.openWorkspace(parent);
    }
  };

  const handleCreateRootFile = async () => {
    if (!sidebar.workspacePath) return;
    const name = await promptInput("新建 Markdown 笔记:", "未命名.md");
    if (!name) return;
    const path = await sidebar.createWorkspaceFile(sidebar.workspacePath, name);
    if (path) {
      await openPathAction(path);
    }
  };

  const handleCreateRootDir = async () => {
    if (!sidebar.workspacePath) return;
    const name = await promptInput("新建文件夹:", "新目录");
    if (!name) return;
    await sidebar.createWorkspaceDir(sidebar.workspacePath, name);
  };

  if (!sidebar.workspacePath) {
    return (
      <div className="workspace-empty-container">
        <div className="sidebar-empty-state">
          <FolderOpen size={32} className="empty-icon" />
          <div className="empty-title">工作区未开启</div>
          <div className="empty-desc">
            打开本地文件夹作为工作区，可快速浏览、组织与创建 Markdown 笔记。
          </div>
          <button className="primary-open-btn" onClick={handleOpenFolder}>
            打开文件夹…
          </button>
        </div>

        {activeDoc?.path && (
          <div className="quick-open-current">
            <span className="quick-label">当前文档目录：</span>
            <button
              className="quick-link-btn"
              onClick={handleOpenCurrentFileDir}
              title={parentDirPath(activeDoc.path)}
            >
              打开 “{dirName(activeDoc.path) || "所在文件夹"}”
            </button>
          </div>
        )}
      </div>
    );
  }

  const rootChildren = sidebar.dirChildren[sidebar.workspacePath] ?? [];
  const workspaceTitle = dirName(sidebar.workspacePath) || baseName(sidebar.workspacePath);

  const filteredChildren = filterQuery.trim()
    ? rootChildren.filter((c) => c.name.toLowerCase().includes(filterQuery.toLowerCase()))
    : rootChildren;

  return (
    <div className="workspace-view">
      <div className="workspace-header">
        <Tooltip label={sidebar.workspacePath}>
          <div className="workspace-title-box">
            <Folder size={14} className="ws-icon" />
            <span className="ws-name">{workspaceTitle}</span>
          </div>
        </Tooltip>

        <div className="workspace-actions">
          <button
            className="action-btn"
            title="新建文件"
            onClick={handleCreateRootFile}
          >
            <FilePlus size={13} />
          </button>
          <button
            className="action-btn"
            title="新建文件夹"
            onClick={handleCreateRootDir}
          >
            <FolderPlus size={13} />
          </button>
          <button
            className="action-btn"
            title="刷新目录"
            onClick={() => void sidebar.refreshWorkspace()}
          >
            <RotateCw size={13} className={sidebar.workspaceLoading ? "spin" : ""} />
          </button>
          <button
            className="action-btn"
            title="关闭工作区"
            onClick={() => sidebar.closeWorkspace()}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {rootChildren.length > 5 && (
        <div className="outline-filter-bar">
          <Search size={12} className="filter-icon" />
          <input
            type="text"
            className="filter-input"
            placeholder="过滤目录条目…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          {filterQuery && (
            <button
              className="filter-clear"
              onClick={() => setFilterQuery("")}
              title="清除过滤"
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}

      <div className="workspace-tree-scroll">
        {filteredChildren.length === 0 ? (
          <div className="sidebar-empty-state compact">
            <div className="empty-title">
              {filterQuery ? "未匹配到文件" : "文件夹为空"}
            </div>
            {!filterQuery && (
              <button className="text-action-btn" onClick={handleCreateRootFile}>
                新建首篇笔记
              </button>
            )}
          </div>
        ) : (
          filteredChildren.map((entry) => (
            <FileTreeItem
              key={entry.path}
              entry={entry}
              depth={0}
              onMenu={onMenu}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 3. 打开的标签页视图 (Open Documents / Tabs List View)
// ============================================================================

function TabsListView({ onMenu }: { onMenu: (x: number, y: number, items: MenuItem[]) => void }) {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const setActive = useDocuments((s) => s.setActive);

  const handleCreateNew = () => {
    newTabAction();
  };

  const handleCloseAll = async () => {
    if (documents.length === 0) return;
    const ok = await promptConfirm(
      "关闭全部标签",
      "确定要关闭所有已打开的标签页吗？未保存内容将提示保存。",
      "关闭全部",
      false
    );
    if (!ok) return;
    for (const doc of [...documents]) {
      await closeTabAction(doc.id);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="sidebar-empty-state">
        <Files size={28} className="empty-icon" />
        <div className="empty-title">暂无打开的标签</div>
        <div className="empty-desc">打开或新建文档后，此处将集中呈现并管理所有标签页。</div>
        <button className="primary-open-btn" onClick={handleCreateNew}>
          新建标签页
        </button>
      </div>
    );
  }

  return (
    <div className="tabs-list-view">
      <div className="view-sub-header">
        <span className="sub-title">打开的标签</span>
        <div className="sub-actions">
          <span className="sub-badge">{documents.length}</span>
          <button
            className="action-btn"
            title="新建标签页 (Ctrl+T)"
            onClick={handleCreateNew}
          >
            <Plus size={13} />
          </button>
          <button
            className="action-btn-danger"
            title="关闭所有标签"
            onClick={handleCloseAll}
          >
            <XCircle size={13} />
          </button>
        </div>
      </div>

      <div className="sidebar-tabs-container">
        {documents.map((doc) => {
          const isActive = doc.id === activeId;
          const dir = doc.path ? dirName(doc.path) : "未保存新文档";

          const handleContextMenu = (e: React.MouseEvent) => {
            e.preventDefault();
            const items: MenuItem[] = [
              {
                label: "关闭",
                shortcut: "Ctrl+W",
                onClick: () => void closeTabAction(doc.id),
              },
              {
                label: "关闭其他标签",
                onClick: () => void closeOtherTabsAction(doc.id),
              },
              {
                label: "关闭右侧标签",
                onClick: () => void closeTabsToRightAction(doc.id),
              },
              {
                label: "移入新窗口",
                separatorBefore: true,
                onClick: () => void moveDocToNewWindow(doc.id),
              },
              ...(doc.path
                ? [
                    {
                      label: "在资源管理器中显示",
                      separatorBefore: true,
                      onClick: () => void invoke("explorer_select", { path: doc.path }),
                    },
                    {
                      label: "复制文件路径",
                      onClick: () => void navigator.clipboard.writeText(doc.path!),
                    },
                  ]
                : []),
            ];
            onMenu(e.clientX, e.clientY, items);
          };

          return (
            <div
              key={doc.id}
              className={"sidebar-tab-row" + (isActive ? " is-active" : "")}
              onClick={() => setActive(doc.id)}
              onContextMenu={handleContextMenu}
              title={doc.path ?? doc.name}
            >
              <div className="tab-row-left">
                <FileText
                  size={14}
                  className={"tab-row-icon" + (isActive ? " is-active" : "")}
                />
                <div className="tab-row-info">
                  <span className="tab-row-name">{doc.name}</span>
                  <span className="tab-row-path">{dir}</span>
                </div>
              </div>

              <div className="tab-row-right">
                {doc.isDirty && (
                  <span className="node-dirty-dot" title="有未保存更改" />
                )}
                <button
                  className="tab-row-close-btn"
                  title="关闭标签页"
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTabAction(doc.id);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 4. 侧边栏整体视图 (SidebarView Main Export)
// ============================================================================

export function SidebarView() {
  const activeId = useDocuments((s) => s.activeId);
  const activeTab = useSidebar((s) => s.activeTab);
  const setActiveTab = useSidebar((s) => s.setActiveTab);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const openMenu = (x: number, y: number, items: MenuItem[]) => {
    setMenu({ x, y, items });
  };

  return (
    <div className="sidebar-content">
      {/* 顶部分段切换器 (文件 / 大纲 / 标签) */}
      <div className="sidebar-nav-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "files"}
          className={"nav-tab-btn" + (activeTab === "files" ? " is-active" : "")}
          onClick={() => setActiveTab("files")}
          title="工作区文件树"
        >
          <Folder size={13} />
          <span>文件</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "outline"}
          className={"nav-tab-btn" + (activeTab === "outline" ? " is-active" : "")}
          onClick={() => setActiveTab("outline")}
          title="当前文档大纲"
        >
          <ListTree size={13} />
          <span>大纲</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "tabs"}
          className={"nav-tab-btn" + (activeTab === "tabs" ? " is-active" : "")}
          onClick={() => setActiveTab("tabs")}
          title="已打开的标签页"
        >
          <Files size={13} />
          <span>标签</span>
        </button>
      </div>

      {/* 主视图内容区域 */}
      <div className="sidebar-main-pane">
        {activeTab === "files" && <WorkspaceView onMenu={openMenu} />}
        {activeTab === "outline" && <OutlineView activeId={activeId} />}
        {activeTab === "tabs" && <TabsListView onMenu={openMenu} />}
      </div>

      {/* 上下文右键菜单 */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
