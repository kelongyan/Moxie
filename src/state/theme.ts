import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

const ORDER: ThemeMode[] = ["system", "light", "dark"];

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "system",
  setMode: (mode) => set({ mode }),
  cycleMode: () => {
    const next = ORDER[(ORDER.indexOf(get().mode) + 1) % ORDER.length];
    set({ mode: next });
  },
}));

function resolveTheme(mode: ThemeMode, systemDark: boolean): "light" | "dark" {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

/** index.html 启动脚本与此键约定一致，两处修改需同步 */
export const THEME_STORAGE_KEY = "moxie.theme";

type ThemeChangeListener = (resolved: "light" | "dark") => void;
const listeners = new Set<ThemeChangeListener>();

/**
 * 订阅"解析后的主题实际发生变化"（含 system 模式下的系统偏好跟随切换）。
 * 供编辑器侧刷新仅主题相关的渲染产物（当前为 mermaid 配色，docs/渲染优化方案.md O-6）；
 * 同值重复 apply（如重设相同模式）不会触发。
 */
export function onThemeChange(listener: ThemeChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyTheme(mode: ThemeMode) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(mode, systemDark);
  const changed = document.documentElement.dataset.theme !== resolved;
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolved);
  } catch {
    // 存储不可用时仅失去启动优化，不影响主题生效
  }
  if (changed) {
    // 注意：collectPreviewTokens 的导出临时翻转直接改 dataset、不走这里，不会误触发
    for (const listener of listeners) listener(resolved);
  }
}

export function initTheme() {
  applyTheme(useThemeStore.getState().mode);
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyTheme(useThemeStore.getState().mode));
  useThemeStore.subscribe((state) => applyTheme(state.mode));
}
