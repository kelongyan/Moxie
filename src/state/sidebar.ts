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

/** 会话内最近文件条目（仅本次运行有效，不落盘） */
export interface RecentEntry {
  path: string;
  lastOpenedMs: number;
}

export interface SectionsExpanded {
  groups: boolean;
  recent: boolean;
  outline: boolean;
}

export type SidebarTab = "files" | "outline";

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
  /** 会话内最近文件：仅在本次运行中记录，不落盘、不跨启动恢复 */
  pushRecent: (path: string) => void;
  refreshMissing: () => Promise<void>;
  toggleSection: (key: keyof SectionsExpanded) => void;
  addGroup: (name: string) => void;
  renameGroup: (id: string, name: string) => void;
  removeGroup: (id: string) => void;
  toggleGroupExpanded: (id: string) => void;
  addToGroup: (groupId: string, path: string) => void;
  removeFromGroup: (groupId: string, path: string) => void;
  replacePath: (oldPath: string, newPath: string) => void;
}

/** 会话内最近文件上限（与旧版落盘上限一致） */
const RECENT_LIMIT = 12;

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
  // 只持久化界面偏好；工作区文件夹与展开状态属会话内状态，不写入磁盘、不跨启动恢复
  const { groups, sectionsExpanded, activeTab } = get();
  try {
    await invoke("sidebar_save", {
      value: {
        groups,
        sections: sectionsExpanded,
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
      const activeTab = (value.activeTab === "files" || value.activeTab === "outline")
        ? value.activeTab
        : "files";

      // 工作区文件夹与最近文件均不跨启动恢复：磁盘上的历史值一律忽略
      set({
        groups,
        sectionsExpanded: {
          groups: sections.groups !== false,
          recent: sections.recent !== false,
          outline: sections.outline !== false,
        },
        activeTab,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
    await get().refreshMissing();
  },

  pushRecent: (path) => {
    set((s) => ({
      recent: [
        { path, lastOpenedMs: Date.now() },
        ...s.recent.filter((e) => e.path !== path),
      ].slice(0, RECENT_LIMIT),
      missing: { ...s.missing, [path]: false },
    }));
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
      recent: s.recent.map((e) => (e.path === oldPath ? { ...e, path: newPath } : e)),
    }));
    void persist(get);
    void get().refreshMissing();
  },
}));

/* ---------- 文件树"祖先链追踪"悬停状态 ---------- */

/** 链上每一级：path + 同级序号（判定"位于目标分支之前/之后"用） */
export interface ChainEntry {
  path: string;
  index: number;
}

/**
 * 当前悬停行的祖先链（含悬停行自身的 path 与序号）。独立小 store：挂在 useSidebar 上会让
 * 整棵树在每次悬停切换时重渲染；独立后只有链上/链外的行按各自的布尔选择器重渲染。
 */
interface TreeHoverState {
  chain: ChainEntry[] | null;
  setChain: (chain: ChainEntry[] | null) => void;
}

export const useTreeHover = create<TreeHoverState>((set) => ({
  chain: null,
  setChain: (chain) => set({ chain }),
}));

/**
 * 祖先链追踪：计算一行应点亮的贯穿线级数（0..vlines-1）与是否点亮本行树枝（onChain）。
 * `self` 为本行"根 → 自身"的链；与悬停链逐级比对：
 * - 完全命中（本行在链上）→ 全列贯穿线 + 本行树枝点亮；
 * - 分叉处按同级序号判定：位于目标分支之前（如目标上方的前序兄弟）→ 点亮共享祖先列，
 *   使"根 → 目标"的路径在列线上连续不断链；位于之后或为悬停行后代 → 不点亮。
 */
export function chainHighlight(
  chain: ChainEntry[] | null,
  self: ChainEntry[]
): { vlines: number; onChain: boolean } {
  if (!chain || chain.length === 0 || self.length === 0) {
    return { vlines: 0, onChain: false };
  }
  let matched = 0;
  while (
    matched < self.length &&
    matched < chain.length &&
    self[matched].path === chain[matched].path
  ) {
    matched += 1;
  }
  if (matched === self.length) {
    return { vlines: self.length - 1, onChain: true };
  }
  if (matched === chain.length) {
    return { vlines: 0, onChain: false };
  }
  return self[matched].index < chain[matched].index
    ? { vlines: matched, onChain: false }
    : { vlines: 0, onChain: false };
}

export function dirName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "";
  const dir = normalized.slice(0, idx);
  const slash = dir.lastIndexOf("/");
  return slash >= 0 ? dir.slice(slash + 1) : dir;
}

/* ---------- 大纲导航缩进（纯几何计算）---------- */

/** 大纲每级缩进：基准 10px + 每级 8px，压缩深层留白保证窄侧栏可读 */
export const OUTLINE_INDENT_BASE = 10;
export const OUTLINE_INDENT_STEP = 8;

export function outlineIndent(level: number): number {
  const depth = Math.max(0, Math.min(level - 1, 5));
  return OUTLINE_INDENT_BASE + depth * OUTLINE_INDENT_STEP;
}

/* ---------- 文件树引导线（树形"树干 + 分支"的纯几何计算）---------- */

/** 每级缩进步长（px），与行的 paddingLeft 保持同一节奏 */
export const TREE_INDENT = 14;
/** 引导线相对级定位的水平偏移（px） */
export const TREE_GUIDE_X = 4;

export interface TreeGuides {
  /** 祖先贯穿竖线（级层级 + x 位置；该祖先后面还有同级项时存在） */
  vlines: { level: number; x: number }[];
  /** 本行的拐弯线：x 位置 + 是否向下延伸（"├" vs "└"） */
  elbow: { x: number; stem: boolean };
}

/**
 * 计算一行需要绘制的引导线。
 * - 祖先级：该祖先后面还有同级项时贯穿（`ancestorContinues[i]`）；
 * - 本级：始终画拐弯线，末项为"└"（不延伸）、非末项为"├"（延伸到底）。
 * 根级同样适用（depth = 0）：得到自上而下的树干与各文件的分支。
 */
export function treeGuideLines(
  depth: number,
  ancestorContinues: boolean[],
  isLast: boolean
): TreeGuides {
  const vlines: { level: number; x: number }[] = [];
  for (let i = 0; i < depth; i += 1) {
    if (ancestorContinues[i]) {
      vlines.push({ level: i, x: i * TREE_INDENT + TREE_GUIDE_X });
    }
  }
  return {
    vlines,
    elbow: { x: depth * TREE_INDENT + TREE_GUIDE_X, stem: !isLast },
  };
}
