import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  isMarkdown: boolean;
  size: number;
  modifiedMs: number;
}

export interface SidebarGroup {
  id: string;
  name: string;
  expanded: boolean;
  paths: string[];
}

/** 最近文件条目（与 Rust RecentEntryDto 对应） */
export interface RecentEntry {
  path: string;
  lastOpenedMs: number;
}

export interface SectionsExpanded {
  groups: boolean;
  recent: boolean;
  outline: boolean;
}

export type SidebarTab = "files" | "outline" | "recent";

interface SidebarState {
  activeTab: SidebarTab;
  workspacePath: string | null;
  dirChildren: Record<string, DirEntry[]>;
  expandedDirs: Record<string, boolean>;
  workspaceLoading: boolean;
  groups: SidebarGroup[];
  sectionsExpanded: SectionsExpanded;
  recent: RecentEntry[];
  missing: Record<string, boolean>;
  loaded: boolean;
  setActiveTab: (tab: SidebarTab) => void;
  openWorkspace: (path: string) => Promise<void>;
  closeWorkspace: () => void;
  toggleDirExpanded: (dirPath: string) => Promise<void>;
  refreshDir: (dirPath: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  createWorkspaceFile: (parentDir: string, name: string) => Promise<string | null>;
  createWorkspaceDir: (parentDir: string, name: string) => Promise<boolean>;
  deleteWorkspaceItem: (path: string) => Promise<boolean>;
  renameWorkspaceItem: (oldPath: string, newPath: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  refreshRecent: () => Promise<void>;
  refreshMissing: () => Promise<void>;
  toggleSection: (key: keyof SectionsExpanded) => void;
  addGroup: (name: string) => void;
  renameGroup: (id: string, name: string) => void;
  removeGroup: (id: string) => void;
  toggleGroupExpanded: (id: string) => void;
  addToGroup: (groupId: string, path: string) => void;
  removeFromGroup: (groupId: string, path: string) => void;
  replacePath: (oldPath: string, newPath: string) => void;
  clearRecent: () => Promise<void>;
  removeRecent: (path: string) => Promise<void>;
}

let groupSeq = 0;
function newGroupId(): string {
  groupSeq += 1;
  return `g-${Date.now().toString(36)}-${groupSeq}`;
}

export function joinPath(parent: string, child: string): string {
  const isBackslash = parent.includes("\\");
  const sep = isBackslash ? "\\" : "/";
  if (parent.endsWith("\\") || parent.endsWith("/")) {
    return `${parent}${child}`;
  }
  return `${parent}${sep}${child}`;
}

export function parentDirPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "";
  return path.slice(0, idx);
}

async function persist(get: () => SidebarState) {
  const { groups, sectionsExpanded, workspacePath, expandedDirs, activeTab } = get();
  try {
    await invoke("sidebar_save", {
      value: {
        groups,
        sections: sectionsExpanded,
        workspacePath,
        expandedDirs,
        activeTab,
      },
    });
  } catch {
    // 存储失败不阻断交互
  }
}

/** 最近文件行尾的相对时间（阶段 2 展示口径） */
export function formatRelativeTime(ms: number, now = Date.now()): string {
  if (!ms || ms <= 0) return "";
  const diff = now - ms;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const date = new Date(ms);
  const today = new Date(now);
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export const useSidebar = create<SidebarState>((set, get) => ({
  activeTab: "files",
  workspacePath: null,
  dirChildren: {},
  expandedDirs: {},
  workspaceLoading: false,
  groups: [],
  sectionsExpanded: { groups: true, recent: true, outline: true },
  recent: [],
  missing: {},
  loaded: false,

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    void persist(get);
  },

  openWorkspace: async (path: string) => {
    set({ workspacePath: path, workspaceLoading: true });
    try {
      const entries = await invoke<DirEntry[]>("list_dir", { path });
      set((s) => ({
        dirChildren: { ...s.dirChildren, [path]: entries },
        expandedDirs: { ...s.expandedDirs, [path]: true },
        workspaceLoading: false,
      }));
    } catch {
      set({ workspaceLoading: false });
    }
    void persist(get);
  },

  closeWorkspace: () => {
    set({ workspacePath: null, dirChildren: {}, expandedDirs: {} });
    void persist(get);
  },

  toggleDirExpanded: async (dirPath: string) => {
    const isExpanded = get().expandedDirs[dirPath] === true;
    if (!isExpanded) {
      set((s) => ({
        expandedDirs: { ...s.expandedDirs, [dirPath]: true },
      }));
      await get().refreshDir(dirPath);
    } else {
      set((s) => ({
        expandedDirs: { ...s.expandedDirs, [dirPath]: false },
      }));
    }
    void persist(get);
  },

  refreshDir: async (dirPath: string) => {
    try {
      const entries = await invoke<DirEntry[]>("list_dir", { path: dirPath });
      set((s) => ({
        dirChildren: { ...s.dirChildren, [dirPath]: entries },
      }));
    } catch {
      set((s) => {
        const next = { ...s.dirChildren };
        delete next[dirPath];
        return { dirChildren: next };
      });
    }
  },

  refreshWorkspace: async () => {
    const { workspacePath, expandedDirs } = get();
    if (!workspacePath) return;
    set({ workspaceLoading: true });
    try {
      await get().refreshDir(workspacePath);
      const subDirs = Object.keys(expandedDirs).filter(
        (p) => p !== workspacePath && expandedDirs[p]
      );
      await Promise.all(subDirs.map((dir) => get().refreshDir(dir)));
    } finally {
      set({ workspaceLoading: false });
    }
  },

  createWorkspaceFile: async (parentDir: string, name: string) => {
    const fileName = name.endsWith(".md") || name.endsWith(".markdown") ? name : `${name}.md`;
    const fullPath = joinPath(parentDir, fileName);
    try {
      await invoke("create_file", { path: fullPath });
      await get().refreshDir(parentDir);
      return fullPath;
    } catch {
      return null;
    }
  },

  createWorkspaceDir: async (parentDir: string, name: string) => {
    const fullPath = joinPath(parentDir, name);
    try {
      await invoke("create_dir", { path: fullPath });
      await get().refreshDir(parentDir);
      return true;
    } catch {
      return false;
    }
  },

  deleteWorkspaceItem: async (path: string) => {
    try {
      await invoke("delete_path", { path });
      const parent = parentDirPath(path);
      if (parent) {
        await get().refreshDir(parent);
      }
      return true;
    } catch {
      return false;
    }
  },

  renameWorkspaceItem: async (oldPath: string, newPath: string) => {
    try {
      await invoke("rename_file", { from: oldPath, to: newPath });
      const parentOld = parentDirPath(oldPath);
      const parentNew = parentDirPath(newPath);
      if (parentOld) await get().refreshDir(parentOld);
      if (parentNew && parentNew !== parentOld) await get().refreshDir(parentNew);
      return true;
    } catch {
      return false;
    }
  },

  refresh: async () => {
    try {
      const value = await invoke<Record<string, unknown>>("sidebar_load");
      const groups = Array.isArray(value.groups)
        ? (value.groups as SidebarGroup[]).map((g) => ({
            id: String(g.id ?? newGroupId()),
            name: String(g.name ?? ""),
            expanded: Boolean(g.expanded),
            paths: Array.isArray(g.paths) ? (g.paths as string[]) : [],
          }))
        : [];
      const sections = (value.sections ?? {}) as Partial<SectionsExpanded>;
      const workspacePath = typeof value.workspacePath === "string" ? value.workspacePath : null;
      const activeTab = (value.activeTab === "files" || value.activeTab === "outline" || value.activeTab === "recent")
        ? value.activeTab
        : "files";
      const expandedDirs = (typeof value.expandedDirs === "object" && value.expandedDirs !== null)
        ? (value.expandedDirs as Record<string, boolean>)
        : {};

      set({
        groups,
        sectionsExpanded: {
          groups: sections.groups !== false,
          recent: sections.recent !== false,
          outline: sections.outline !== false,
        },
        workspacePath,
        activeTab,
        expandedDirs,
        loaded: true,
      });

      if (workspacePath) {
        void get().refreshWorkspace();
      }
    } catch {
      set({ loaded: true });
    }
    await get().refreshRecent();
  },

  refreshRecent: async () => {
    try {
      const list = await invoke<RecentEntry[]>("recent_list");
      set({
        recent: (list ?? []).map((e) => ({
          path: String(e?.path ?? ""),
          lastOpenedMs: Number(e?.lastOpenedMs ?? 0),
        })),
      });
    } catch {
      // ignore
    }
    await get().refreshMissing();
  },

  refreshMissing: async () => {
    const { groups, recent } = get();
    const paths = new Set<string>([
      ...groups.flatMap((g) => g.paths),
      ...recent.map((e) => e.path),
    ]);
    const missing: Record<string, boolean> = {};
    await Promise.all(
      [...paths].map(async (path) => {
        try {
          await invoke("get_file_revision", { path });
          missing[path] = false;
        } catch {
          missing[path] = true;
        }
      })
    );
    set({ missing });
  },

  toggleSection: (key) => {
    set((s) => ({
      sectionsExpanded: { ...s.sectionsExpanded, [key]: !s.sectionsExpanded[key] },
    }));
    void persist(get);
  },

  addGroup: (name) => {
    set((s) => ({
      groups: [
        ...s.groups,
        { id: newGroupId(), name, expanded: true, paths: [] },
      ],
    }));
    void persist(get);
  },

  renameGroup: (id, name) => {
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)),
    }));
    void persist(get);
  },

  removeGroup: (id) => {
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
    void persist(get);
  },

  toggleGroupExpanded: (id) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, expanded: !g.expanded } : g
      ),
    }));
    void persist(get);
  },

  addToGroup: (groupId, path) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId && !g.paths.includes(path)
          ? { ...g, paths: [...g.paths, path] }
          : g
      ),
    }));
    void persist(get);
  },

  removeFromGroup: (groupId, path) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, paths: g.paths.filter((p) => p !== path) } : g
      ),
    }));
    void persist(get);
  },

  replacePath: (oldPath, newPath) => {
    set((s) => ({
      groups: s.groups.map((g) => ({
        ...g,
        paths: g.paths.map((p) => (p === oldPath ? newPath : p)),
      })),
    }));
    void invoke("recent_replace", { old: oldPath, new: newPath }).catch(() => {});
    void persist(get);
    void get().refreshRecent();
  },

  clearRecent: async () => {
    await invoke("recent_clear").catch(() => {});
    await get().refreshRecent();
  },

  removeRecent: async (path) => {
    await invoke("recent_remove", { path }).catch(() => {});
    await get().refreshRecent();
  },
}));

export function dirName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "";
  const dir = normalized.slice(0, idx);
  const slash = dir.lastIndexOf("/");
  return slash >= 0 ? dir.slice(slash + 1) : dir;
}
