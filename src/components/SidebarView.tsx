import {
  ChevronRight,
  FileQuestion,
  FileText,
  Folder,
  FolderOpen,
  History,
  Settings,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { baseName } from "../models/markdown";
import { openPathAction } from "../state/actions";
import { useDocuments } from "../state/documents";
import { promptConfirm, promptInput } from "../state/prompts";
import {
  formatRelativeTime,
  SidebarGroup,
  useSidebar,
} from "../state/sidebar";
import { openSettingsWindow } from "../state/settingsWindow";
import { Tooltip } from "./Tooltip";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

function FileRow(props: {
  path: string;
  /** 最近文件带时间戳；分组文件无 */
  lastOpenedMs?: number;
  variant: "recent" | "group";
  groupId?: string;
  onMenu: (x: number, y: number, items: MenuItem[]) => void;
}) {
  const { path, lastOpenedMs, variant, groupId } = props;
  const sidebar = useSidebar();
  const documents = useDocuments((s) => s.documents);

  const name = baseName(path);
  const missing = sidebar.missing[path] === true;
  const isOpen = documents.some((d) => d.path === path);
  const Icon = FileText;

  /** 缺失文件的重新定位：输入新路径 → 校验 → 全链路替换 → 打开 */
  const relocate = async () => {
    const target = await promptInput("重新定位文件(输入新路径):", path);
    if (!target) return;
    try {
      await invoke("get_file_revision", { path: target });
    } catch {
      useDocuments
        .getState()
        .setStatus({ text: "该路径不存在或无法访问", kind: "error" });
      return;
    }
    sidebar.replacePath(path, target);
    void openPathAction(target);
  };

  const open = async () => {
    if (missing) {
      await relocate();
      return;
    }
    void openPathAction(path);
  };

  const remove = () => {
    if (variant === "group" && groupId) {
      sidebar.removeFromGroup(groupId, path);
    } else {
      void sidebar.removeRecent(path);
    }
  };

  const buildMenu = (): MenuItem[] => {
    if (missing) {
      return [
        {
          label: "重新定位…",
          onClick: () => void relocate(),
        },
      ];
    }
    const items: MenuItem[] = [
      { label: "打开", onClick: () => void open() },
      {
        label: "重命名…",
        onClick: () => {
          void (async () => {
            const newName = await promptInput("重命名文件:", name);
            if (!newName || newName === name) return;
            const parent = path.slice(0, path.length - name.length);
            const target = parent + newName;
            try {
              await invoke("rename_file", { from: path, to: target });
              sidebar.replacePath(path, target);
              const doc = useDocuments
                .getState()
                .documents.find((d) => d.path === path);
              if (doc) {
                useDocuments.getState().updateLocation(doc.id, target);
              }
            } catch (error) {
              useDocuments
                .getState()
                .setStatus({ text: String(error), kind: "error" });
            }
          })();
        },
      },
      {
        label: "在资源管理器中显示",
        onClick: () => void invoke("explorer_select", { path }),
      },
    ];
    for (const group of sidebar.groups) {
      const inGroup = group.paths.includes(path);
      items.push({
        label: `分组:${group.name}`,
        checked: inGroup,
        onClick: () =>
          inGroup
            ? sidebar.removeFromGroup(group.id, path)
            : sidebar.addToGroup(group.id, path),
      });
    }
    items.push({
      label: variant === "group" ? "移出分组" : "从列表中移除",
      danger: true,
      onClick: remove,
    });
    return items;
  };

  return (
    <Tooltip label={path}>
      <div
        className={
          "file-row" +
          (isOpen ? " is-open" : "") +
          (missing ? " is-missing" : "")
        }
        draggable={!missing}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", path);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => void open()}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onMenu(e.clientX, e.clientY, buildMenu());
        }}
      >
        <span className="row-indicator" />
        <span className="row-icon">
          {missing ? <TriangleAlert size={14} className="warn" /> : <Icon size={14} />}
        </span>
        <span className="row-name">{name}</span>
        <span className="row-end">
          {missing ? (
            <button
              className="row-action row-locate"
              title="重新定位"
              onClick={(e) => {
                e.stopPropagation();
                void relocate();
              }}
            >
              <FileQuestion size={14} />
            </button>
          ) : (
            <>
              {variant === "recent" && (
                <span className="row-time">
                  {formatRelativeTime(lastOpenedMs ?? 0)}
                </span>
              )}
              <button
                className="row-action row-action-remove"
                title={variant === "group" ? "移出分组" : "移除"}
                onClick={(e) => {
                  e.stopPropagation();
                  remove();
                }}
              >
                <X size={14} />
              </button>
            </>
          )}
        </span>
      </div>
    </Tooltip>
  );
}

function SectionHeader(props: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="section-header" onClick={props.onToggle}>
      <ChevronRight
        size={11}
        className={"section-chevron" + (props.expanded ? " expanded" : "")}
      />
      <span className="section-title">{props.title}</span>
      <span className="section-count">{props.count}</span>
      <span className="spacer" />
      {props.trailing}
    </div>
  );
}

function GroupRow(props: {
  group: SidebarGroup;
  onMenu: (x: number, y: number, items: MenuItem[]) => void;
}) {
  const { group } = props;
  const sidebar = useSidebar();
  const [dropHover, setDropHover] = useState(false);

  return (
    <div
      className={
        "group-row" +
        (group.expanded ? " expanded" : "") +
        (dropHover ? " drop-target" : "")
      }
      onClick={() => sidebar.toggleGroupExpanded(group.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onMenu(e.clientX, e.clientY, [
          {
            label: "重命名分组…",
            onClick: () => {
              void promptInput("重命名分组:", group.name).then((name) => {
                if (name && name !== group.name) sidebar.renameGroup(group.id, name);
              });
            },
          },
          {
            label: "删除分组",
            danger: true,
            onClick: () => {
              void promptConfirm(
                "删除分组",
                `删除分组“${group.name}”?(不会删除磁盘文件)`,
                "删除",
                true
              ).then((ok) => {
                if (ok) sidebar.removeGroup(group.id);
              });
            },
          },
        ]);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/plain")) {
          e.preventDefault();
          setDropHover(true);
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        const path = e.dataTransfer.getData("text/plain");
        setDropHover(false);
        if (path) {
          e.preventDefault();
          sidebar.addToGroup(group.id, path);
        }
      }}
    >
      <ChevronRight size={11} className="group-chevron" />
      {group.expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
      <span className="group-name">{group.name}</span>
      <span className="group-count">{group.paths.length}</span>
    </div>
  );
}

export function SidebarView() {
  const sidebar = useSidebar();
  const [menu, setMenu] = useState<MenuState | null>(null);

  const openMenu = (x: number, y: number, items: MenuItem[]) =>
    setMenu({ x, y, items });

  const groupsSection = sidebar.sectionsExpanded.groups;
  const recentSection = sidebar.sectionsExpanded.recent;

  return (
    <div className="sidebar-content">
      <div className="sidebar-scroll">
        <SectionHeader
          title="分组"
          count={sidebar.groups.length}
          expanded={groupsSection}
          onToggle={() => sidebar.toggleSection("groups")}
        />
        {groupsSection && (
          <>
            {sidebar.groups.length === 0 && (
              <button
                className="section-empty-button"
                onClick={() => {
                  void promptInput("新建分组:", "").then((name) => {
                    if (name) sidebar.addGroup(name);
                  });
                }}
              >
                新建分组
              </button>
            )}
            {sidebar.groups.map((group) => (
              <div key={group.id}>
                <GroupRow group={group} onMenu={openMenu} />
                {group.expanded && (
                  <div className="group-children">
                    {group.paths.length > 0 ? (
                      group.paths.map((path) => (
                        <FileRow
                          key={`grp-${group.id}-${path}`}
                          path={path}
                          variant="group"
                          groupId={group.id}
                          onMenu={openMenu}
                        />
                      ))
                    ) : (
                      <div className="group-empty">拖入文件，或右键分组添加</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        <SectionHeader
          title="最近文件"
          count={sidebar.recent.length}
          expanded={recentSection}
          onToggle={() => sidebar.toggleSection("recent")}
          trailing={
            recentSection && sidebar.recent.length > 0 ? (
              <button
                className="section-trash"
                aria-label="清除最近文件"
                onClick={(e) => {
                  e.stopPropagation();
                  void promptConfirm("清除最近文件", "清空最近打开的文件列表?", "清除", true).then(
                    (ok) => {
                      if (ok) void sidebar.clearRecent();
                    }
                  );
                }}
              >
                <Trash2 size={12} />
              </button>
            ) : undefined
          }
        />
        {recentSection &&
          (sidebar.recent.length === 0 ? (
            <div className="section-empty">
              <History size={13} />
              暂无最近文件
              <button
                className="section-empty-button"
                onClick={() => {
                  void (async () => {
                    const { openFileAction } = await import("../state/actions");
                    await openFileAction();
                  })();
                }}
              >
                打开文件…
              </button>
            </div>
          ) : (
            sidebar.recent.map((entry) => (
              <FileRow
                key={`rec-${entry.path}`}
                path={entry.path}
                lastOpenedMs={entry.lastOpenedMs}
                variant="recent"
                onMenu={openMenu}
              />
            ))
          ))}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-settings" onClick={() => void openSettingsWindow()}>
          <Settings size={14} />
          <span>设置</span>
        </button>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
