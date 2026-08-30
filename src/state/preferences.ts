import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { ThemeMode, useThemeStore } from "./theme";

export type IndentStyle = "spaces" | "tabs";
export type ExitBehavior = "preserveWorkspace" | "askToSave";

export const PT_TO_PX = 4 / 3;

interface PreferencesState {
  wordWrap: boolean;
  lineNumbers: boolean;
  statusBarVisible: boolean;
  fontSizePt: number;
  lineSpacingPt: number;
  indentStyle: IndentStyle;
  tabWidth: 2 | 4 | 8;
  exitBehavior: ExitBehavior;
  sidebarPinned: boolean;
  prefsVersion: number;
  set: (partial: Partial<Omit<PreferencesState, "set" | "prefsVersion">>) => void;
  hydrate: (disk: Record<string, unknown>) => void;
}

const EDITOR_KEYS = new Set([
  "wordWrap",
  "lineNumbers",
  "fontSizePt",
  "lineSpacingPt",
  "indentStyle",
  "tabWidth",
]);

let saveTimer: number | null = null;

function toDisk(state: PreferencesState): Record<string, unknown> {
  return {
    isWordWrapEnabled: state.wordWrap,
    isLineNumbersVisible: state.lineNumbers,
    isStatusBarVisible: state.statusBarVisible,
    editorFontSize: state.fontSizePt,
    editorLineSpacing: state.lineSpacingPt,
    editorIndentationStyle: state.indentStyle,
    editorTabWidth: state.tabWidth,
    appTheme: useThemeStore.getState().mode,
    workspaceExitBehavior: state.exitBehavior,
    sidebarPinned: state.sidebarPinned,
  };
}

export async function persistPreferences() {
  try {
    const current = await invoke<Record<string, unknown>>("settings_load");
    const merged = { ...(current ?? {}), ...toDisk(usePreferences.getState()) };
    await invoke("settings_save", { value: merged });
  } catch {
    // 存储失败不阻断交互
  }
}

function scheduleSave() {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persistPreferences().then(() => emit("settings:changed"));
  }, 300);
}

export const usePreferences = create<PreferencesState>((set) => ({
  wordWrap: true,
  lineNumbers: true,
  statusBarVisible: true,
  fontSizePt: 13.5,
  lineSpacingPt: 4,
  indentStyle: "spaces",
  tabWidth: 4,
  exitBehavior: "preserveWorkspace",
  sidebarPinned: true,
  prefsVersion: 0,

  set: (partial) => {
    const affectsEditor = Object.keys(partial).some((k) => EDITOR_KEYS.has(k));
    set((s) => ({
      ...s,
      ...partial,
      prefsVersion: affectsEditor ? s.prefsVersion + 1 : s.prefsVersion,
    }));
    void scheduleSave();
  },

  hydrate: (disk) => {
    const patch: Partial<PreferencesState> = {};
    if (typeof disk.isWordWrapEnabled === "boolean") patch.wordWrap = disk.isWordWrapEnabled;
    if (typeof disk.isLineNumbersVisible === "boolean") patch.lineNumbers = disk.isLineNumbersVisible;
    if (typeof disk.isStatusBarVisible === "boolean") patch.statusBarVisible = disk.isStatusBarVisible;
    if (typeof disk.editorFontSize === "number") {
      patch.fontSizePt = Math.min(32, Math.max(9, disk.editorFontSize));
    }
    if (typeof disk.editorLineSpacing === "number") {
      patch.lineSpacingPt = Math.min(10, Math.max(0, disk.editorLineSpacing));
    }
    if (disk.editorIndentationStyle === "spaces" || disk.editorIndentationStyle === "tabs") {
      patch.indentStyle = disk.editorIndentationStyle;
    }
    if (disk.editorTabWidth === 2 || disk.editorTabWidth === 4 || disk.editorTabWidth === 8) {
      patch.tabWidth = disk.editorTabWidth;
    }
    if (disk.workspaceExitBehavior === "preserveWorkspace" || disk.workspaceExitBehavior === "askToSave") {
      patch.exitBehavior = disk.workspaceExitBehavior;
    }
    if (typeof disk.sidebarPinned === "boolean") patch.sidebarPinned = disk.sidebarPinned;
    if (typeof disk.appTheme === "string") {
      const mode = disk.appTheme as ThemeMode;
      if (mode === "system" || mode === "light" || mode === "dark") {
        useThemeStore.getState().setMode(mode);
      }
    }
    const affectsEditor = Object.keys(patch).some((k) => EDITOR_KEYS.has(k));
    set((s) => ({
      ...s,
      ...patch,
      prefsVersion: affectsEditor ? s.prefsVersion + 1 : s.prefsVersion,
    }));
  },
}));

export async function hydrateSettings() {
  try {
    const disk = await invoke<Record<string, unknown>>("settings_load");
    usePreferences.getState().hydrate(disk ?? {});
  } catch {
    // 首次运行无配置
  }
}

export function applyTheme(mode: ThemeMode) {
  useThemeStore.getState().setMode(mode);
  void persistPreferences().then(() => emit("settings:changed"));
}

export async function initSettingsSync(): Promise<() => void> {
  await hydrateSettings();
  const unlisten = await listen("settings:changed", () => hydrateSettings());
  return () => {
    unlisten();
  };
}

export function indentUnitOf(style: IndentStyle, tabWidth: number): string {
  return style === "tabs" ? "\t" : " ".repeat(tabWidth);
}
