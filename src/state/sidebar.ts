import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

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
}

interface SidebarState {
  groups: SidebarGroup[];
  sectionsExpanded: SectionsExpanded;
  recent: RecentEntry[];
  missing: Record<string, boolean>;
  loaded: boolean;
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

async function persist(get: () => SidebarState) {
  const { groups, sectionsExpanded } = get();
  try {
    await invoke("sidebar_save", {
      value: { groups, sections: sectionsExpanded },
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
  groups: [],
  sectionsExpanded: { groups: true, recent: true },
  recent: [],
  missing: {},
  loaded: false,

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
      set({
        groups,
        sectionsExpanded: {
          groups: sections.groups !== false,
          recent: sections.recent !== false,
        },
        loaded: true,
      });
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
