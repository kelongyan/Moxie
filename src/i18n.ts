import { usePreferences } from "./state/preferences";

/**
 * 轻量 i18n：以中文文案为键（zh 直接显示键），en 字典覆盖翻译，
 * 未覆盖的键回落中文——新界面不需要先登记中文条目。
 * 语言切换即时生效（useT 走 zustand 订阅）。
 */

const en: Record<string, string> = {
  // 设置页
  "通用设置": "Settings",
  "缩进方式": "Indentation",
  "Tab 键插入的缩进字符": "Characters inserted by the Tab key",
  "使用空格": "Spaces",
  "使用 Tab 字符": "Tab characters",
  "Tab 宽度": "Tab width",
  "一个缩进级别的宽度": "Width of one indent level",
  "个字符": " chars",
  "外观": "Appearance",
  "窗口与编辑区的明暗主题": "Light/dark theme for window and editor",
  "跟随系统": "System",
  "浅色": "Light",
  "深色": "Dark",
  "性能": "Performance",
  "自动管理": "Auto-managed",
  "文本换行": "Word wrap",
  "超出编辑区宽度时自动折行": "Wrap lines wider than the editor",
  "显示行号": "Line numbers",
  "在编辑区左侧显示行号列": "Show the line-number column",
  "专注模式": "Focus mode",
  "当前段落之外的行降低透明度": "Dim lines outside the current paragraph",
  "打字机模式": "Typewriter mode",
  "光标行始终保持屏幕垂直居中": "Keep the cursor line vertically centered",
  "图片保存目录": "Image folder",
  "粘贴或拖入图片时，相对文档的存放目录": "Folder (relative to the document) for pasted or dropped images",
  "退出行为": "On exit",
  "退出应用时对未保存内容的处理": "How to handle unsaved content on exit",
  "保留工作区并退出": "Keep workspace and exit",
  "每次检查未保存文件": "Ask about unsaved files",
  "自动保存": "Auto save",
  "定时（30 秒）或窗口失焦时保存已保存过的文档": "Save saved documents every 30s or on window blur",
  "关闭": "Off",
  "定时保存": "Timed",
  "失焦保存": "On blur",
  "编辑器字体": "Editor font",
  "正文字号,范围 9–32": "Body font size, 9–32",
  "编辑器行距": "Line spacing",
  "行与行之间的额外间距": "Extra spacing between lines",
  "段间距": "Paragraph spacing",
  "段落与区块之间的留白节奏": "Vertical rhythm between blocks",
  "紧凑": "Compact",
  "标准": "Standard",
  "宽松": "Relaxed",
  "Markdown 单换行": "Single newline",
  "单个换行渲染为换行;关闭时遵循 GFM,仅在空行处分段": "Render single newlines as breaks; off follows GFM",
  "Markdown 排版美化": "Typographic replacements",
  "自动替换直引号、破折号等排版符号": "Replace quotes, dashes and friends",
  "Markdown 原始 HTML": "Raw HTML",
  "渲染文档中的 HTML 片段（经本地净化，默认关闭）": "Render HTML fragments (sanitized, off by default)",
  "导出主题": "Export theme",
  "导出 HTML / 富文本使用的配色": "Color scheme for exported HTML / rich text",
  "导出正文限宽": "Narrow export body",
  "导出 HTML 时正文限制在 960px 内居中": "Limit exported body to 960px centered",
  "导出代码行号": "Code line numbers",
  "导出 HTML / 富文本时代码块显示行号": "Show code line numbers in exports",
  "界面语言": "Language",
  "界面显示语言（英文为实验性，尚未覆盖全部界面）": "UI language (English is experimental)",
  "中文": "中文",
  "English": "English",
  "查找形态": "Find style",
  "查找/替换的呈现方式": "How find & replace is presented",
  "独立窗口": "Separate window",
  "编辑器内浮层": "In-editor bar",
  "关闭时最小化到托盘": "Minimize to tray on close",
  "开启后点关闭隐藏到托盘,托盘菜单可退出": "Close hides the window; quit from the tray menu",
  "开机自启": "Launch at login",
  "登录 Windows 时自动启动 Moxie": "Start Moxie automatically at login",
  "强调色": "Accent color",
  "界面与光标的强调色（留空使用主题默认）": "Accent for UI and caret (empty = theme default)",
  "界面字体": "UI font",
  "界面与正文字体（留空使用默认）": "UI and body font (empty = default)",
  "恢复默认": "Reset",
  "版本": "Version",
  // 设置页 v2（导航分区）
  "通用": "General",
  "关于": "About",
  "编辑器": "Editor",
  "导出": "Export",
  "基础行为与系统集成": "Core behavior & system integration",
  "主题": "Theme",
  "强调色与字体": "Accent & fonts",
  "界面外观的个性化": "Personalize the interface",
  "视图": "View",
  "书写面的显示方式": "How the writing surface is displayed",
  "排版": "Typography",
  "正文的字号与间距节奏": "Font size and spacing rhythm",
  "正文字号": "Body size",
  "范围 9–32": "9–32",
  "缩进与文件": "Indent & files",
  "缩进行为与图片存放": "Indentation and image storage",
  "解析与渲染选项": "Parsing and rendering options",
  "导出 HTML / Word 的外观": "Look of exported HTML / Word",
  "按文档体量自动分级，无需手动配置": "Auto-tiered by document size; no config needed",
  "数据": "Data",
  "全部保存在本地磁盘": "Everything stays on your local disk",
};

export function t(key: string): string {
  if (usePreferences.getState().lang === "en") return en[key] ?? key;
  return key;
}

export function useT(): (key: string) => string {
  const lang = usePreferences((s) => s.lang);
  if (lang === "en") return (key: string) => en[key] ?? key;
  return (key: string) => key;
}

export function addEnTranslations(entries: Record<string, string>) {
  Object.assign(en, entries);
}
