import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  ListTree,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { baseName } from "../models/markdown";
import { openPathAction } from "../state/actions";
import { useDocuments } from "../state/documents";
import { promptConfirm, promptInput } from "../state/prompts";
import {
  chainHighlight,
  dirName,
  joinPath,
  outlineIndent,
  parentDirPath,
  treeGuideLines,
  TREE_INDENT,
  useSidebar,
  useTreeHover,
  type ChainEntry,
  type DirEntry,
} from "../state/sidebar";
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

  useEffect(() => {
    if (activeFrom === null) return;
    const timer = window.setTimeout(() => {
      const activeEl = document.querySelector(".outline-node.is-active");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeFrom]);

  if (!activeId) {
    return (
      <div className="sidebar-empty-state">
        <ListTree size={24} className="empty-icon" />
        <div className="empty-title">暂无活动文档</div>
        <div className="empty-desc">打开或新建文档后自动生成</div>
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
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="sidebar-empty-state compact">
          <div className="empty-title">当前文档暂无标题</div>
          <div className="empty-desc">用 # 号书写标题即可生成</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="sidebar-empty-state compact">
          <div className="empty-title">未匹配到标题</div>
        </div>
      ) : (
        <div className="outline-tree" role="list">
          {filteredItems.map((item, idx) => {
            const isActive = item.from === activeFrom;
            return (
              <button
                key={`${item.from}-${idx}`}
                role="listitem"
                className={`outline-node lvl-${item.level}` + (isActive ? " is-active" : "")}
                style={{ paddingLeft: `${outlineIndent(item.level)}px` }}
                onClick={() => jump(item)}
                title={item.text}
              >
                <span className={`outline-level-tag lvl-${item.level}`}>H{item.level}</span>
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

/** 树内文件图标：极简"折角页"，替代通用文档图标；
    Markdown 文件的折角带一点强调色（注释感），其他文件保持纯灰阶 */
function FileGlyph({ className, accent }: { className?: string; accent: boolean }) {
  return (
    <svg
      className={className}
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8.6 1.8H4.5a.9.9 0 0 0-.9.9v10.6a.9.9 0 0 0 .9.9h7a.9.9 0 0 0 .9-.9V5.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 1.8v3.8h3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {accent && (
        <path d="M8.6 1.8 12.4 5.6H8.6Z" fill="var(--lac-accent)" fillOpacity="0.3" />
      )}
    </svg>
  );
}

function FileTreeItem({
  entry,
  index,
  depth,
  isLast,
  ancestorContinues,
  ancestorChain,
  onMenu,
}: {
  entry: DirEntry;
  /** 同级序号（祖先链追踪判定"之前/之后"用） */
  index: number;
  depth: number;
  /** 是否同级最后一项（决定本行拐弯线为 "└" 还是 "├"） */
  isLast: boolean;
  /** 各祖先级是否还有后继同级项（决定贯穿竖线的位置） */
  ancestorContinues: boolean[];
  /** 从根到本行父级的链（祖先链追踪悬停用） */
  ancestorChain: ChainEntry[];
  onMenu: (x: number, y: number, items: MenuItem[]) => void;
}) {
  const sidebar = useSidebar();
  const setHoverChain = useTreeHover((s) => s.setChain);
  const selfChain = [...ancestorChain, { path: entry.path, index }];
  const litVlines = useTreeHover((s) => chainHighlight(s.chain, selfChain).vlines);
  const onHoverChain = useTreeHover((s) => chainHighlight(s.chain, selfChain).onChain);
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

  const guides = treeGuideLines(depth, ancestorContinues, isLast);

  return (
    <div className="tree-node-wrapper">
      <div
        className={
          "tree-node" +
          (entry.isDir ? " is-dir" : " is-file") +
          (isOpen ? " is-open" : "") +
          (isActive ? " is-active" : "") +
          (onHoverChain ? " is-chain" : "")
        }
        style={{ paddingLeft: `${depth * TREE_INDENT + 12}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHoverChain(selfChain)}
        onMouseLeave={() => setHoverChain(null)}
        title={entry.path}
      >
        {guides.vlines.map((v) => (
          <span
            key={`v-${v.level}`}
            className={"tree-vline" + (v.level < litVlines ? " is-lit" : "")}
            style={{ left: v.x }}
          />
        ))}
        <span className="tree-elbow" style={{ left: guides.elbow.x }} />
        {guides.elbow.stem && (
          <span className="tree-elbow-stem" style={{ left: guides.elbow.x }} />
        )}

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
            <FileGlyph
              className={"node-icon " + (entry.isMarkdown ? "file-md" : "file-plain")}
              accent={entry.isMarkdown}
            />
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
              style={{ paddingLeft: `${(depth + 1) * TREE_INDENT + 16}px` }}
            >
              (空文件夹)
            </div>
          ) : (
            children.map((child, childIndex) => (
              <FileTreeItem
                key={child.path}
                entry={child}
                index={childIndex}
                depth={depth + 1}
                isLast={childIndex === children.length - 1}
                ancestorContinues={[...ancestorContinues, !isLast]}
                ancestorChain={selfChain}
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
          <FolderOpen size={24} className="empty-icon" />
          <div className="empty-title">工作区未开启</div>
          <div className="empty-desc">打开文件夹，开始整理笔记</div>
          <button className="primary-open-btn" onClick={handleOpenFolder}>
            打开文件夹…
          </button>
        </div>
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
            <FilePlus size={14} />
          </button>
          <button
            className="action-btn"
            title="新建文件夹"
            onClick={handleCreateRootDir}
          >
            <FolderPlus size={14} />
          </button>
          <button
            className="action-btn"
            title="刷新目录"
            onClick={() => void sidebar.refreshWorkspace()}
          >
            <RotateCw size={14} className={sidebar.workspaceLoading ? "spin" : ""} />
          </button>
          <button
            className="action-btn"
            title="关闭工作区"
            onClick={() => sidebar.closeWorkspace()}
          >
            <X size={14} />
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
              <X size={12} />
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
          filteredChildren.map((entry, index) => (
            <FileTreeItem
              key={entry.path}
              entry={entry}
              index={index}
              depth={0}
              isLast={index === filteredChildren.length - 1}
              ancestorContinues={[]}
              ancestorChain={[]}
              onMenu={onMenu}
            />
          ))
        )}
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
      {/* 顶部分段切换器 (文件 / 大纲) */}
      <div className="sidebar-nav-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "files"}
          className={"nav-tab-btn" + (activeTab === "files" ? " is-active" : "")}
          onClick={() => setActiveTab("files")}
          title="工作区文件树"
        >
          <Folder size={14} />
          <span>文件</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "outline"}
          className={"nav-tab-btn" + (activeTab === "outline" ? " is-active" : "")}
          onClick={() => setActiveTab("outline")}
          title="当前文档大纲"
        >
          <ListTree size={14} />
          <span>大纲</span>
        </button>
      </div>

      {/* 主视图内容区域 */}
      <div className="sidebar-main-pane">
        {activeTab === "files" && <WorkspaceView onMenu={openMenu} />}
        {activeTab === "outline" && <OutlineView activeId={activeId} />}
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
