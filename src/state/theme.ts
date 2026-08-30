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

function applyTheme(mode: ThemeMode) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(mode, systemDark);
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolved);
  } catch {
    // 存储不可用时仅失去启动优化，不影响主题生效
  }
}

export function initTheme() {
  applyTheme(useThemeStore.getState().mode);
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyTheme(useThemeStore.getState().mode));
  useThemeStore.subscribe((state) => applyTheme(state.mode));
}
