import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { ThemeMode, useThemeStore } from "./theme";
import type { BlockSpacing } from "../preview/typography";

export type IndentStyle = "spaces" | "tabs";
export type ExitBehavior = "preserveWorkspace" | "askToSave";

export const PT_TO_PX = 4 / 3;

interface PreferencesState {
  wordWrap: boolean;
  lineNumbers: boolean;
  statusBarVisible: boolean;
  fontSizePt: number;
  lineSpacingPt: number;
  blockSpacing: BlockSpacing;
  indentStyle: IndentStyle;
  tabWidth: 2 | 4 | 8;
  exitBehavior: ExitBehavior;
  sidebarPinned: boolean;
  sidebarWidth: number;
  markdownBreaks: boolean;
  markdownTypographer: boolean;
  markdownAllowHtml: boolean;
  /** 粘贴/拖入图片的落盘目录（相对文档目录，默认 assets） */
  imageFolder: string;
  /** 专注模式：当前顶层块之外的行降透明度 */
  focusMode: boolean;
  /** 打字机模式：光标行保持屏幕垂直居中 */
  typewriterMode: boolean;
  /** 导出主题：跟随当前 / 固定浅色 / 固定深色 */
  exportTheme: "auto" | "light" | "dark";
  /** 导出正文限宽（960px 居中） */
  exportNarrow: boolean;
  /** 导出 HTML / 富文本时代码块显示行号 */
  exportCodeLineNumbers: boolean;
  /** 自动保存模式：关闭 / 定时（30s，仅已保存过的文档）/ 失焦保存 */
  autosave: "off" | "interval" | "focus";
  /** 界面语言（en 为实验性，未完全覆盖） */
  lang: "zh" | "en";
  /** 查找形态：独立窗口 / 编辑器内浮层 */
  findStyle: "window" | "inline";
  /** 关闭窗口时最小化到托盘（需重启应用生效托盘图标恢复） */
  closeToTray: boolean;
  /** 界面字体（空 = 默认 Frex Sans GB） */
  uiFont: string;
  /** 强调色（hex，空 = 主题默认） */
  accentColor: string;
  prefsVersion: number;
  set: (partial: Partial<Omit<PreferencesState, "set" | "prefsVersion">>) => void;
  hydrate: (disk: Record<string, unknown>) => void;
}

const EDITOR_KEYS = new Set([
  "wordWrap",
  "lineNumbers",
  "fontSizePt",
  "lineSpacingPt",
  "blockSpacing",
  "indentStyle",
  "tabWidth",
  "focusMode",
  "typewriterMode",
]);

let saveTimer: number | null = null;

function toDisk(state: PreferencesState): Record<string, unknown> {
  return {
    isWordWrapEnabled: state.wordWrap,
    isLineNumbersVisible: state.lineNumbers,
    isStatusBarVisible: state.statusBarVisible,
    editorFontSize: state.fontSizePt,
    editorLineSpacing: state.lineSpacingPt,
    editorBlockSpacing: state.blockSpacing,
    editorIndentationStyle: state.indentStyle,
    editorTabWidth: state.tabWidth,
    appTheme: useThemeStore.getState().mode,
    workspaceExitBehavior: state.exitBehavior,
    sidebarPinned: state.sidebarPinned,
    sidebarWidth: state.sidebarWidth,
    markdownBreaks: state.markdownBreaks,
    markdownTypographer: state.markdownTypographer,
    markdownAllowHtml: state.markdownAllowHtml,
    editorImageFolder: state.imageFolder,
    isFocusModeEnabled: state.focusMode,
    isTypewriterModeEnabled: state.typewriterMode,
    exportTheme: state.exportTheme,
    isExportNarrow: state.exportNarrow,
    isExportCodeLineNumbers: state.exportCodeLineNumbers,
    autosaveMode: state.autosave,
    appLang: state.lang,
    findStyle: state.findStyle,
    isCloseToTray: state.closeToTray,
    uiFontFamily: state.uiFont,
    accentColor: state.accentColor,
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
  // 所见即所得对标 Typora：默认不显示行号（设置里可开）
  lineNumbers: false,
  statusBarVisible: true,
  /** 12pt = 16px，与预览正文同号（源码/渲染切换不产生字号跳跃） */
  fontSizePt: 12,
  lineSpacingPt: 4,
  blockSpacing: "standard",
  indentStyle: "spaces",
  tabWidth: 4,
  exitBehavior: "preserveWorkspace",
  sidebarPinned: true,
  sidebarWidth: 240,
  markdownBreaks: false,
  // Typora 风格的灵魂：直引号 → 弯引号、-- → —、... → …
  // 默认开启：新装用户的预览就带"出版物感"，老用户的偏好不受影响
  markdownTypographer: true,
  markdownAllowHtml: false,
  imageFolder: "assets",
  focusMode: false,
  typewriterMode: false,
  exportTheme: "auto",
  exportNarrow: false,
  exportCodeLineNumbers: false,
  autosave: "off",
  lang: "zh",
  findStyle: "window",
  closeToTray: false,
  uiFont: "",
  accentColor: "",
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
    if (
      disk.editorBlockSpacing === "compact" ||
      disk.editorBlockSpacing === "standard" ||
      disk.editorBlockSpacing === "relaxed"
    ) {
      patch.blockSpacing = disk.editorBlockSpacing;
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
    if (typeof disk.sidebarWidth === "number") {
      patch.sidebarWidth = Math.min(480, Math.max(180, disk.sidebarWidth));
    }
    if (typeof disk.markdownBreaks === "boolean") patch.markdownBreaks = disk.markdownBreaks;
    if (typeof disk.markdownTypographer === "boolean") {
      patch.markdownTypographer = disk.markdownTypographer;
    }
    if (typeof disk.markdownAllowHtml === "boolean") {
      patch.markdownAllowHtml = disk.markdownAllowHtml;
    }
    if (typeof disk.editorImageFolder === "string" && disk.editorImageFolder.trim() !== "") {
      patch.imageFolder = disk.editorImageFolder.trim();
    }
    if (typeof disk.isFocusModeEnabled === "boolean") {
      patch.focusMode = disk.isFocusModeEnabled;
    }
    if (typeof disk.isTypewriterModeEnabled === "boolean") {
      patch.typewriterMode = disk.isTypewriterModeEnabled;
    }
    if (
      disk.exportTheme === "auto" ||
      disk.exportTheme === "light" ||
      disk.exportTheme === "dark"
    ) {
      patch.exportTheme = disk.exportTheme;
    }
    if (typeof disk.isExportNarrow === "boolean") {
      patch.exportNarrow = disk.isExportNarrow;
    }
    if (typeof disk.isExportCodeLineNumbers === "boolean") {
      patch.exportCodeLineNumbers = disk.isExportCodeLineNumbers;
    }
    if (
      disk.autosaveMode === "off" ||
      disk.autosaveMode === "interval" ||
      disk.autosaveMode === "focus"
    ) {
      patch.autosave = disk.autosaveMode;
    }
    if (disk.appLang === "zh" || disk.appLang === "en") {
      patch.lang = disk.appLang;
    }
    if (disk.findStyle === "window" || disk.findStyle === "inline") {
      patch.findStyle = disk.findStyle;
    }
    if (typeof disk.isCloseToTray === "boolean") {
      patch.closeToTray = disk.isCloseToTray;
    }
    if (typeof disk.uiFontFamily === "string") {
      patch.uiFont = disk.uiFontFamily;
    }
    if (typeof disk.accentColor === "string") {
      patch.accentColor = disk.accentColor;
    }
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
