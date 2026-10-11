import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  EditorState,
  Extension,
  Range,
  StateEffect,
  StateField,
  Text,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  CALLOUT_ICON_PATHS,
  CALLOUT_LABELS,
  renderInlineMarkdown,
  taskToggleInLine,
} from "../preview/markdownCore";
import {
  buildTable,
  deleteColEdit,
  deleteRowEdit,
  deleteTableEdit,
  escapeCell,
  findTableAt,
  formatTableChange,
  insertColEdit,
  insertRowEdit,
  resizeTableEdit,
  setAlignEdit,
  type TableEdit,
  type TableCellRef,
  type TableModel,
  tableModelOf,
  unescapeCell,
} from "./table";
import {
  caretPosInTable,
  clearActiveEdit,
  getActiveEdit,
  liveTableWidgets,
  openTableMenu,
  setActiveEdit,
} from "./tableNav";
import { renderKatex } from "../preview/math";
import { FENCE_LANGUAGE_OPTIONS } from "./languages";
// eslint-disable-next-line import/no-relative-packages -- 该子路径是 emoji 短代码映射表
import EMOJI_MAP from "markdown-it-emoji/lib/data/light.mjs";
import { spaceBefore, type BlockKind } from "../preview/typography";

/**
 * Typora 风格所见即所得：光标不在的语法即时"渲染"——
 * 标记字符（#、**、[]()、```、>）被隐藏或替换为 widget，光标进入即显示原始文本。
 * 退化（大文件关闭即时渲染）时不挂本扩展，整体呈现源码原样。
 */

/** 把 Markdown 图片 src 解析为最终 URL（本地路径 → asset 协议），由调用方注入 */
export type ImageSrcResolver = (rawSrc: string) => string | null;

/** 当前窗口的图片解析器（livePreview() 注册，渲染态表格单元格复用） */
let imageResolver: ImageSrcResolver | null = null;

const HIDE = Decoration.replace({});

/** 开 fence 行的语言标签（当代码块头部显示），点击弹出语言切换菜单 */
let openLangMenu: HTMLElement | null = null;

function closeLangMenu() {
  openLangMenu?.remove();
  openLangMenu = null;
}

document.addEventListener("mousedown", (e) => {
  if (openLangMenu && !openLangMenu.contains(e.target as Node)) closeLangMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLangMenu();
});

/** 标注块（Callout）类型切换菜单 */
let openCalloutMenu: HTMLElement | null = null;

function closeCalloutMenu() {
  openCalloutMenu?.remove();
  openCalloutMenu = null;
}

document.addEventListener("mousedown", (e) => {
  if (openCalloutMenu && !openCalloutMenu.contains(e.target as Node)) closeCalloutMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCalloutMenu();
});

const CALLOUT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;

/** 标注块（Callout）右下角悬浮气泡 Widget */
class CalloutBadgeWidget extends WidgetType {
  constructor(
    readonly kind: string,
    readonly markStart: number,
    readonly markEnd: number
  ) {
    super();
  }

  eq(other: CalloutBadgeWidget) {
    return (
      other.kind === this.kind &&
      other.markStart === this.markStart &&
      other.markEnd === this.markEnd
    );
  }

  toDOM(view: EditorView) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `md-callout-bubble md-callout-bubble-${this.kind}`;
    btn.title = "点击切换标注类型";
    const iconSvg = CALLOUT_ICON_PATHS[this.kind] ?? CALLOUT_ICON_PATHS.note;
    const label = CALLOUT_LABELS[this.kind] ?? "Note";
    btn.innerHTML = `
      <svg class="md-callout-bubble-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconSvg}</svg>
      <span class="md-callout-bubble-label">${label}</span>
      <svg class="md-callout-bubble-caret" viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
    `;

    const handleOpenMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      closeCalloutMenu();

      const menu = document.createElement("div");
      menu.className = `md-callout-menu md-callout-menu-${this.kind}`;
      menu.setAttribute("role", "menu");

      for (const t of CALLOUT_TYPES) {
        const item = document.createElement("button");
        item.type = "button";
        const isCurrent = t === this.kind;
        item.className = `md-callout-menu-item item-${t}` + (isCurrent ? " is-current" : "");
        const svg = CALLOUT_ICON_PATHS[t] ?? CALLOUT_ICON_PATHS.note;
        const name = CALLOUT_LABELS[t] ?? t;
        const checkSvg = isCurrent
          ? `<svg class="md-callout-menu-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
          : "";
        item.innerHTML = `<div class="md-callout-menu-label"><svg class="md-callout-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg><span>${name}</span></div>${checkSvg}`;

        item.addEventListener("mousedown", (ev) => ev.stopPropagation());
        item.addEventListener("click", () => {
          closeCalloutMenu();
          const target = `[!${t.toUpperCase()}]`;
          view.dispatch({
            changes: { from: this.markStart, to: this.markEnd, insert: target },
            userEvent: "input",
          });
          view.focus();
        });
        menu.appendChild(item);
      }

      const rect = btn.getBoundingClientRect();
      const menuWidth = 125;
      menu.style.left = `${Math.max(4, rect.right - menuWidth)}px`;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 155) {
        menu.style.top = `${Math.max(8, rect.top - 150)}px`;
      } else {
        menu.style.top = `${rect.bottom + 5}px`;
      }
      document.body.appendChild(menu);
      openCalloutMenu = menu;
    };

    btn.addEventListener("mousedown", handleOpenMenu);
    btn.addEventListener("click", handleOpenMenu);

    return btn;
  }

  ignoreEvent() {
    return true;
  }
}

const ICON_CODE_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="md-lang-icon"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
const ICON_CHEVRON_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="md-lang-arrow"><polyline points="6 9 12 15 18 9"/></svg>';
const ICON_COPY_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const ICON_CHECK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function getCodeBlockContent(view: EditorView, pos: number): string {
  const doc = view.state.doc;
  const tree = syntaxTree(view.state);
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);
  while (node && node.name !== "FencedCode") {
    node = node.parent;
  }
  if (node) {
    const firstLine = doc.lineAt(node.from);
    const lastLine = doc.lineAt(node.to);
    const hasClosing =
      lastLine.number > firstLine.number && /^\s*(`{3,}|~{3,})\s*$/.test(lastLine.text);
    const endLineNumber = hasClosing ? lastLine.number - 1 : lastLine.number;
    const lines: string[] = [];
    for (let ln = firstLine.number + 1; ln <= endLineNumber; ln++) {
      lines.push(doc.line(ln).text);
    }
    return lines.join("\n");
  }
  const curLine = doc.lineAt(pos);
  const lines: string[] = [];
  for (let ln = curLine.number + 1; ln <= doc.lines; ln++) {
    const l = doc.line(ln);
    if (/^\s*(`{3,}|~{3,})\s*$/.test(l.text)) break;
    lines.push(l.text);
  }
  return lines.join("\n");
}

function applyFenceLanguage(view: EditorView, widgetEl: HTMLElement, newLang: string) {
  closeLangMenu();
  const pos = view.posAtDOM(widgetEl);
  const line = view.state.doc.lineAt(pos);
  const m = /^(\s*(?:`{3,}|~{3,}))( ?)(\S*)/.exec(line.text);
  if (!m) return;
  const from = line.from + m[1].length;
  const to = line.from + m[1].length + m[2].length + m[3].length;
  const insert = newLang ? ` ${newLang}` : "";
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: line.to },
    userEvent: "input",
  });
  view.focus();
}

function openLanguageMenu(view: EditorView, triggerEl: HTMLElement, currentLang: string) {
  closeLangMenu();
  const menu = document.createElement("div");
  menu.className = "md-lang-menu";
  menu.setAttribute("role", "menu");

  const searchWrap = document.createElement("div");
  searchWrap.className = "md-lang-search-wrap";
  const searchInput = document.createElement("input");
  searchInput.className = "md-lang-search";
  searchInput.placeholder = "搜索或输入语言...";
  searchWrap.appendChild(searchInput);
  menu.appendChild(searchWrap);

  const listWrap = document.createElement("div");
  listWrap.className = "md-lang-options-list";
  menu.appendChild(listWrap);

  const renderOptions = (filter: string) => {
    listWrap.innerHTML = "";
    const q = filter.trim().toLowerCase();
    const matched = FENCE_LANGUAGE_OPTIONS.filter(
      (opt) => !q || opt.label.toLowerCase().includes(q) || opt.key.toLowerCase().includes(q)
    );

    for (const opt of matched) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt.label;
      if (opt.key === currentLang) btn.classList.add("current");
      btn.addEventListener("mousedown", (ev) => ev.stopPropagation());
      btn.addEventListener("click", () => {
        applyFenceLanguage(view, triggerEl, opt.key);
      });
      listWrap.appendChild(btn);
    }

    if (q && !FENCE_LANGUAGE_OPTIONS.some((o) => o.key.toLowerCase() === q)) {
      const customBtn = document.createElement("button");
      customBtn.type = "button";
      customBtn.textContent = `使用 "${filter.trim()}"`;
      customBtn.classList.add("custom");
      customBtn.addEventListener("mousedown", (ev) => ev.stopPropagation());
      customBtn.addEventListener("click", () => {
        applyFenceLanguage(view, triggerEl, filter.trim());
      });
      listWrap.appendChild(customBtn);
    }
  };

  renderOptions("");

  searchInput.addEventListener("mousedown", (ev) => ev.stopPropagation());
  searchInput.addEventListener("input", () => {
    renderOptions(searchInput.value);
  });
  searchInput.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      const val = searchInput.value.trim();
      applyFenceLanguage(view, triggerEl, val);
    } else if (ev.key === "Escape") {
      closeLangMenu();
    }
  });

  const rect = triggerEl.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 210))}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 300)}px`;
  document.body.appendChild(menu);
  openLangMenu = menu;
  setTimeout(() => searchInput.focus(), 20);
}

class FenceWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(other: FenceWidget) {
    return other.lang === this.lang;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "md-code-header";

    const langBtn = document.createElement("button");
    langBtn.type = "button";
    langBtn.className = "md-lang-tag md-lang-badge";
    langBtn.innerHTML = `${ICON_CODE_SVG}<span class="md-lang-text">${this.lang}</span>${ICON_CHEVRON_SVG}`;
    langBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLanguageMenu(view, langBtn, this.lang);
    });
    wrap.appendChild(langBtn);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "md-code-copy-btn";
    copyBtn.title = "复制代码";
    copyBtn.setAttribute("aria-label", "复制代码");
    copyBtn.innerHTML = ICON_COPY_SVG;

    copyBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = getCodeBlockContent(view, view.posAtDOM(wrap));
      const write =
        navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(text)
          : Promise.resolve().then(() => {
              const ta = document.createElement("textarea");
              ta.value = text;
              ta.style.position = "fixed";
              ta.style.opacity = "0";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              ta.remove();
            });
      write
        .then(() => {
          copyBtn.innerHTML = ICON_CHECK_SVG;
          copyBtn.classList.add("copied");
          copyBtn.title = "已复制";
          setTimeout(() => {
            copyBtn.innerHTML = ICON_COPY_SVG;
            copyBtn.classList.remove("copied");
            copyBtn.title = "复制代码";
          }, 1500);
        })
        .catch(() => {});
    });
    wrap.appendChild(copyBtn);

    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

/** 选区是否与 [from, to] 相接（含端点：光标贴着语法即视为"进入"，显示原文） */
function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const r of state.selection.ranges) {
    if (r.from <= to && r.to >= from) return true;
  }
  return false;
}

function selectionOnLine(state: EditorState, lineFrom: number, lineTo: number): boolean {
  return selectionTouches(state, lineFrom, lineTo);
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "md-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.draggable = false;
    img.addEventListener("error", () => {
      if (wrap.classList.contains("broken")) return;
      wrap.classList.add("broken");
      const name = this.alt || this.src.split(/[\\/]/).pop() || "图片";
      wrap.textContent = `图片不可用:${name}`;
    });
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

class HorizontalRuleWidget extends WidgetType {
  constructor() {
    super();
  }
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "md-hr";
    return el;
  }
}

/** 无序列表标记 → 项目符号（•/◦/▪ 按嵌套层级，对齐导出侧 disc/circle/square） */
class BulletWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }
  eq(other: BulletWidget) {
    return other.level === this.level;
  }
  toDOM() {
    const level = Math.min(this.level, 2);
    const el = document.createElement("span");
    el.className = `md-bullet md-bullet-${level}`;
    el.textContent = ["•", "◦", "▪"][level];
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

// —— 表格浮动工具条轻量 SVG 图标定义 ——
const SVG_ALIGN_LEFT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`;
const SVG_ALIGN_CENTER = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="19" y1="12" x2="5" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`;
const SVG_ALIGN_RIGHT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`;

const SVG_ROW_ABOVE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h16"/><path d="M4 20h16"/><path d="M12 4v6"/><path d="m8 6 4-4 4 4"/></svg>`;
const SVG_ROW_BELOW = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16"/><path d="M4 10h16"/><path d="M12 14v6"/><path d="m8 18 4 4 4-4"/></svg>`;
const SVG_ROW_DELETE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="m14 8-4 8"/><path d="m10 8 4 8"/></svg>`;

const SVG_COL_LEFT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v16"/><path d="M20 4v16"/><path d="M4 12h6"/><path d="m6 8-4 4 4 4"/></svg>`;
const SVG_COL_RIGHT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16"/><path d="M10 4v16"/><path d="M14 12h6"/><path d="m18 8 4 4-4 4"/></svg>`;
const SVG_COL_DELETE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="m8 14 8-4"/><path d="m8 10 8 4"/></svg>`;

const SVG_GRID = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`;
const SVG_FORMAT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;
const SVG_TRASH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
const SVG_GEAR = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="md-table-gear-icon"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_TABLE_COPY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SVG_TABLE_CHECK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--lac-success)"><polyline points="20 6 9 17 4 12"/></svg>`;

let activeTableToolbarWidget: TableWidget | null = null;

function closeActiveTableToolbar() {
  if (activeTableToolbarWidget) {
    activeTableToolbarWidget.closeToolbar();
    activeTableToolbarWidget = null;
  }
}

document.addEventListener("mousedown", (e) => {
  if (
    activeTableToolbarWidget &&
    !activeTableToolbarWidget.containsElement(e.target as Node)
  ) {
    closeActiveTableToolbar();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeTableToolbarWidget) {
    closeActiveTableToolbar();
  }
});

/**
 * 表格（GFM，Typora 式）：始终渲染为带对齐与行内 markdown 的真实表格。
 * - 顶部浮动悬停/编辑工具条：对齐切换、行列增删、规模调整、整理与整表删除；
 * - 单元格原位编辑：textarea 无缝贴合活动单元格；
 * - 键盘导航：Tab/Shift+Tab 换格，末格 Tab / 末行 Enter 自动追加行，
 *   ArrowUp/ArrowDown 纵向导航，ArrowLeft/ArrowRight 首尾边缘跨格平滑流转；
 * - 列头手柄与右键快捷菜单。
 */
class TableWidget extends WidgetType {
  private pending = new Map<string, string>();
  private cellEls: HTMLTableCellElement[][] = [];
  private overlay: HTMLTextAreaElement | null = null;
  private activeRow = -1;
  private activeCol = -1;
  private view: EditorView | null = null;
  private wrapEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  private gearBtnEl: HTMLElement | null = null;
  private isToolbarOpen = false;
  private sizePopupEl: HTMLElement | null = null;

  constructor(readonly data: TableModel, readonly gap: number) {
    super();
  }

  private get rowCount(): number {
    return this.data.rows.length;
  }

  private get colCount(): number {
    return this.data.rows[0]?.length ?? 0;
  }

  get tableFrom(): number {
    return this.data.from;
  }

  eq(other: TableWidget) {
    return other.gap === this.gap && sameModel(other.data, this.data);
  }

  toDOM(view: EditorView) {
    this.view = view;
    const wrap = document.createElement("div");
    wrap.className = "md-table-wrap";
    this.wrapEl = wrap;
    if (this.gap > 0) wrap.style.paddingTop = `${this.gap}px`;

    // 单元格内的链接不做外部跳转：点击即进入该格编辑
    wrap.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) e.preventDefault();
    });

    // 右键上下文菜单
    wrap.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cell = (e.target as HTMLElement).closest("td,th");
      const r = cell?.getAttribute("data-r");
      const c = cell?.getAttribute("data-c");
      openTableMenu(view, this.data.from, e.clientX, e.clientY, {
        at:
          r !== null && c !== null && r !== undefined && c !== undefined
            ? { row: Number(r), col: Number(c) }
            : undefined,
      });
    });

    // 顶部悬浮工具条（Typora 风格：绝对定位悬浮于表格上方，绝不占用文档流或产生空白带）
    wrap.appendChild(this.buildToolbar());

    // 内部独立横向滚动卡片
    const scrollBox = document.createElement("div");
    scrollBox.className = "md-table-scroll";

    // 实体表格
    const table = document.createElement("table");
    table.className = "md-table";
    const alignOf = (c: number) => this.data.aligns[c] ?? "left";

    this.cellEls = this.data.rows.map((row, r) => {
      const tr =
        r === 0 ? table.createTHead().insertRow() : table.createTBody().insertRow();
      return row.map((cell, c) => {
        const el = document.createElement(r === 0 ? "th" : "td");
        el.setAttribute("data-r", String(r));
        el.setAttribute("data-c", String(c));
        const align = alignOf(c);
        if (align !== "left") el.style.textAlign = align;
        el.innerHTML = renderInlineMarkdown(unescapeCell(cell.text), imageResolver);

        el.addEventListener("mousedown", (e) => {
          if ((e.target as HTMLElement).closest(".md-table-handle")) return;
          if (r === this.activeRow && c === this.activeCol) return;
          e.preventDefault();
          e.stopPropagation();
          this.openEditor(r, c, {
            x: e.clientX,
            y: e.clientY,
          });
        });

        if (r === 0) el.appendChild(this.buildHandle(view, c));
        tr.appendChild(el);
        return el;
      });
    });

    // 底部规格与便捷操作条 (参考 marktable_studio.html)
    const footer = document.createElement("div");
    footer.className = "md-table-footer";

    // 快速在底部追加行手柄
    const quickAddRow = document.createElement("button");
    quickAddRow.type = "button";
    quickAddRow.className = "md-table-quick-add-row";
    quickAddRow.title = "在表格最下方追加行";
    quickAddRow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>添加新行</span>`;
    quickAddRow.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    quickAddRow.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.applyEdit((m) => insertRowEdit(m, m.rows.length, 0));
    });

    const stat = document.createElement("div");
    stat.className = "md-table-footer-stat";
    stat.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg><span>表格规格: ${this.rowCount} 行 × ${this.colCount} 列</span>`;

    const actions = document.createElement("div");
    actions.className = "md-table-footer-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "md-table-footer-btn md-table-icon-btn";
    copyBtn.title = "复制表格 Markdown 源码";
    copyBtn.setAttribute("aria-label", "复制表格 Markdown 源码");
    copyBtn.innerHTML = SVG_TABLE_COPY;
    copyBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const model = this.modelWithPending() ?? this.data;
      const text = buildTable(model);
      void navigator.clipboard.writeText(text);
      copyBtn.innerHTML = SVG_TABLE_CHECK;
      copyBtn.title = "已复制表格！";
      setTimeout(() => {
        copyBtn.innerHTML = SVG_TABLE_COPY;
        copyBtn.title = "复制表格 Markdown 源码";
      }, 1500);
    });

    const gearBtn = document.createElement("button");
    gearBtn.type = "button";
    gearBtn.className = "md-table-footer-btn md-table-gear-btn md-table-icon-btn";
    gearBtn.title = "表格设置与编辑操作";
    gearBtn.setAttribute("aria-label", "表格设置与编辑操作");
    gearBtn.innerHTML = SVG_GEAR;
    this.gearBtnEl = gearBtn;

    gearBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    gearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleToolbar();
    });

    actions.appendChild(copyBtn);
    actions.appendChild(gearBtn);
    footer.appendChild(stat);
    footer.appendChild(actions);

    // 快速在最右侧追加列手柄
    const quickAddCol = document.createElement("button");
    quickAddCol.type = "button";
    quickAddCol.className = "md-table-quick-add-col";
    quickAddCol.title = "在表格最右侧追加列";
    quickAddCol.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    quickAddCol.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    quickAddCol.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.applyEdit((m) => insertColEdit(m, m.rows[0].length));
    });

    scrollBox.appendChild(table);
    scrollBox.appendChild(quickAddRow);
    scrollBox.appendChild(footer);
    scrollBox.appendChild(quickAddCol);
    wrap.appendChild(scrollBox);
    liveTableWidgets.set(this.data.from, this);
    return wrap;
  }

  toggleToolbar(open?: boolean) {
    const next = open !== undefined ? open : !this.isToolbarOpen;
    if (next) {
      closeActiveTableToolbar();
      this.openToolbar();
      activeTableToolbarWidget = this;
    } else {
      this.closeToolbar();
      if (activeTableToolbarWidget === this) {
        activeTableToolbarWidget = null;
      }
    }
  }

  openToolbar() {
    this.isToolbarOpen = true;
    if (this.toolbarEl && this.wrapEl) {
      const wrapRect = this.wrapEl.getBoundingClientRect();
      const spaceOnRight = window.innerWidth - wrapRect.right;
      const canDockOutside = spaceOnRight >= 46;
      this.toolbarEl.classList.toggle("is-docked-outside", canDockOutside);
      this.toolbarEl.classList.toggle("is-docked-inside", !canDockOutside);
      this.toolbarEl.classList.add("is-open");
    }
    this.gearBtnEl?.classList.add("is-active");
  }

  closeToolbar() {
    this.isToolbarOpen = false;
    this.toolbarEl?.classList.remove("is-open");
    this.gearBtnEl?.classList.remove("is-active");
    this.closeSizePopover();
  }

  containsElement(target: Node): boolean {
    return Boolean(
      this.toolbarEl?.contains(target) ||
      this.gearBtnEl?.contains(target) ||
      this.sizePopupEl?.contains(target)
    );
  }

  destroy(dom: HTMLElement) {
    if (activeTableToolbarWidget === this) {
      activeTableToolbarWidget = null;
    }
    this.closeToolbar();
    this.closeSizePopover();
    if (liveTableWidgets.get(this.data.from) === this) {
      liveTableWidgets.delete(this.data.from);
    }
    this.overlay = null;
    this.wrapEl = null;
    this.toolbarEl = null;
    this.gearBtnEl = null;
    super.destroy(dom);
  }

  restoreCellEdit(row: number, col: number) {
    if (this.wrapConnected() && this.cellEls[row]?.[col]) {
      this.openEditor(row, col, { caretMode: "select" });
    }
  }

  private wrapConnected(): boolean {
    return this.cellEls[0]?.[0]?.isConnected ?? false;
  }

  /** 构建顶部 Typora 风格悬浮快捷工具条 */
  private buildToolbar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "md-table-toolbar";
    this.toolbarEl = bar;

    const makeBtn = (
      title: string,
      iconSvg: string,
      onClick: () => void,
      extraClass = ""
    ) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `md-table-tool-btn ${extraClass}`.trim();
      btn.title = title;
      btn.innerHTML = iconSvg;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      return btn;
    };

    const makeDivider = () => {
      const d = document.createElement("div");
      d.className = "md-table-tool-divider";
      return d;
    };

    // 1. 对齐控制组 (分段胶囊控制条)
    const alignGroup = document.createElement("div");
    alignGroup.className = "md-table-tool-group md-table-align-pill";

    const btnAlignLeft = makeBtn("左对齐 (当前列)", SVG_ALIGN_LEFT, () => {
      this.applyEdit((m) =>
        setAlignEdit(m, this.activeCol >= 0 ? this.activeCol : 0, "left")
      );
    }, "btn-align-left");
    btnAlignLeft.dataset.align = "left";

    const btnAlignCenter = makeBtn("居中对齐 (当前列)", SVG_ALIGN_CENTER, () => {
      this.applyEdit((m) =>
        setAlignEdit(m, this.activeCol >= 0 ? this.activeCol : 0, "center")
      );
    }, "btn-align-center");
    btnAlignCenter.dataset.align = "center";

    const btnAlignRight = makeBtn("右对齐 (当前列)", SVG_ALIGN_RIGHT, () => {
      this.applyEdit((m) =>
        setAlignEdit(m, this.activeCol >= 0 ? this.activeCol : 0, "right")
      );
    }, "btn-align-right");
    btnAlignRight.dataset.align = "right";

    alignGroup.append(btnAlignLeft, btnAlignCenter, btnAlignRight);

    // 2. 行列结构操作组 (细分为行操作与列操作微组)
    const structGroup = document.createElement("div");
    structGroup.className = "md-table-tool-group md-table-struct-group";

    const rowGroup = document.createElement("div");
    rowGroup.className = "md-table-subgroup";

    const btnRowAbove = makeBtn("在上方插入行", SVG_ROW_ABOVE, () => {
      this.applyEdit((m) =>
        insertRowEdit(
          m,
          Math.max(1, this.activeRow >= 0 ? this.activeRow : 1),
          this.activeCol >= 0 ? this.activeCol : 0
        )
      );
    });
    const btnRowBelow = makeBtn("在下方插入行", SVG_ROW_BELOW, () => {
      this.applyEdit((m) =>
        insertRowEdit(
          m,
          Math.max(1, (this.activeRow >= 0 ? this.activeRow : m.rows.length - 1) + 1),
          this.activeCol >= 0 ? this.activeCol : 0
        )
      );
    });
    const btnRowDel = makeBtn("删除当前行", SVG_ROW_DELETE, () => {
      this.applyEdit((m) =>
        deleteRowEdit(m, this.activeRow >= 0 ? this.activeRow : m.rows.length - 1)
      );
    }, "btn-danger-hover");

    rowGroup.append(btnRowAbove, btnRowBelow, btnRowDel);

    const colGroup = document.createElement("div");
    colGroup.className = "md-table-subgroup";

    const btnColLeft = makeBtn("在左侧插入列", SVG_COL_LEFT, () => {
      this.applyEdit((m) =>
        insertColEdit(m, this.activeCol >= 0 ? this.activeCol : 0)
      );
    });
    const btnColRight = makeBtn("在右侧插入列", SVG_COL_RIGHT, () => {
      this.applyEdit((m) =>
        insertColEdit(m, (this.activeCol >= 0 ? this.activeCol : m.rows[0].length - 1) + 1)
      );
    });
    const btnColDel = makeBtn("删除当前列", SVG_COL_DELETE, () => {
      this.applyEdit((m) =>
        deleteColEdit(m, this.activeCol >= 0 ? this.activeCol : m.rows[0].length - 1)
      );
    }, "btn-danger-hover");

    colGroup.append(btnColLeft, btnColRight, btnColDel);

    structGroup.append(rowGroup, makeDivider(), colGroup);

    // 3. 表格整体操作（规模、整理、删除）
    const metaGroup = document.createElement("div");
    metaGroup.className = "md-table-tool-group md-table-meta-group";

    const btnSize = makeBtn(
      "调整表格大小",
      `${SVG_GRID}<span class="table-size-badge">${this.rowCount}×${this.colCount}</span>`,
      () => {
        this.toggleSizePopover(btnSize);
      },
      "btn-table-size"
    );

    const btnFormat = makeBtn("整理表格 (对齐管道)", SVG_FORMAT, () => {
      this.applyEdit((m) => formatTableChange(m));
    });

    const btnDelete = makeBtn("删除表格", SVG_TRASH, () => {
      this.applyEdit((m) => deleteTableEdit(m));
    }, "btn-table-danger");

    metaGroup.append(btnSize, btnFormat, btnDelete);

    const arrow = document.createElement("div");
    arrow.className = "md-table-toolbar-arrow";

    bar.append(alignGroup, makeDivider(), structGroup, makeDivider(), metaGroup, arrow);
    return bar;
  }

  /** 同步工具条上的对齐高亮与规模徽章 */
  private updateToolbarState(col: number) {
    if (!this.toolbarEl) return;
    const align = this.data.aligns[col] ?? "left";
    const btns = this.toolbarEl.querySelectorAll<HTMLButtonElement>("[data-align]");
    btns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.align === align);
    });
    const sizeBadge = this.toolbarEl.querySelector(".table-size-badge");
    if (sizeBadge) {
      sizeBadge.textContent = `${this.rowCount}×${this.colCount}`;
    }
  }

  /** 弹出调整表格大小浮动气泡 */
  private toggleSizePopover(anchorBtn: HTMLElement) {
    if (this.sizePopupEl) {
      this.closeSizePopover();
      return;
    }
    const pop = document.createElement("div");
    pop.className = "md-table-size-popover";
    pop.innerHTML = `
      <div class="md-table-size-header">调整表格大小</div>
      <div class="md-table-size-row">
        <label>行数</label>
        <input type="number" class="md-table-size-input-rows" min="2" max="60" value="${this.rowCount}">
      </div>
      <div class="md-table-size-row">
        <label>列数</label>
        <input type="number" class="md-table-size-input-cols" min="1" max="25" value="${this.colCount}">
      </div>
      <div class="md-table-size-actions">
        <button type="button" class="md-table-size-btn-cancel">取消</button>
        <button type="button" class="md-table-size-btn-ok">应用</button>
      </div>
    `;

    const close = () => {
      this.closeSizePopover();
    };

    pop.addEventListener("mousedown", (e) => e.stopPropagation());
    const okBtn = pop.querySelector(".md-table-size-btn-ok") as HTMLButtonElement;
    const cancelBtn = pop.querySelector(".md-table-size-btn-cancel") as HTMLButtonElement;
    const inputRows = pop.querySelector(".md-table-size-input-rows") as HTMLInputElement;
    const inputCols = pop.querySelector(".md-table-size-input-cols") as HTMLInputElement;

    const apply = () => {
      const rows = Math.max(2, Math.min(60, parseInt(inputRows.value, 10) || this.rowCount));
      const cols = Math.max(1, Math.min(25, parseInt(inputCols.value, 10) || this.colCount));
      close();
      this.applyEdit((m) => resizeTableEdit(m, rows, cols));
    };

    okBtn.addEventListener("click", apply);
    cancelBtn.addEventListener("click", close);
    inputRows.addEventListener("keydown", (e) => {
      if (e.key === "Enter") apply();
      if (e.key === "Escape") close();
    });
    inputCols.addEventListener("keydown", (e) => {
      if (e.key === "Enter") apply();
      if (e.key === "Escape") close();
    });

    const rect = anchorBtn.getBoundingClientRect();
    const popWidth = 165;
    pop.style.left = `${Math.max(8, rect.left - popWidth - 6)}px`;
    pop.style.top = `${Math.max(8, Math.min(window.innerHeight - 180, rect.top - 20))}px`;

    const onOutside = (e: MouseEvent) => {
      if (!pop.contains(e.target as Node) && !anchorBtn.contains(e.target as Node)) {
        close();
      }
    };
    setTimeout(() => {
      window.addEventListener("mousedown", onOutside, true);
    }, 10);

    document.body.appendChild(pop);
    this.sizePopupEl = pop;
    inputRows.focus();
    inputRows.select();
  }

  private closeSizePopover() {
    this.sizePopupEl?.remove();
    this.sizePopupEl = null;
  }

  /** 打开单元格原位编辑器 */
  private openEditor(
    r: number,
    c: number,
    opts: {
      caretMode?: "select" | "start" | "end";
      x?: number;
      y?: number;
    } = {}
  ) {
    const cell = this.cellEls[r]?.[c];
    if (!cell) return;
    this.stashActiveCell();
    this.activeRow = r;
    this.activeCol = c;
    cell.classList.add("md-cell-active");
    this.wrapEl?.classList.add("has-active-cell");

    if (!this.overlay) {
      this.overlay = document.createElement("textarea");
      this.overlay.className = "md-cell-editor";
      this.overlay.rows = 1;
      this.overlay.spellcheck = false;
      this.overlay.addEventListener("blur", () => this.finish(false));
      this.overlay.addEventListener("keydown", (e) => this.onKeydown(e));
    }

    const raw = this.pending.get(`${r},${c}`) ?? unescapeCell(this.data.rows[r][c].text);
    this.overlay.value = raw;
    cell.appendChild(this.overlay);
    this.overlay.focus();

    if (opts.caretMode === "start") {
      this.overlay.setSelectionRange(0, 0);
    } else if (opts.caretMode === "end") {
      this.overlay.setSelectionRange(raw.length, raw.length);
    } else if (opts.caretMode === "select" || opts.x === undefined) {
      this.overlay.setSelectionRange(0, raw.length);
    } else {
      const at = this.caretFromPoint(r, c, opts.x, opts.y);
      this.overlay.setSelectionRange(at[0], at[1]);
    }

    setActiveEdit({ tableFrom: this.data.from, row: r, col: c });
    this.updateToolbarState(c);
  }

  private caretFromPoint(
    r: number,
    c: number,
    x?: number,
    y?: number
  ): [number, number] {
    const raw = this.overlay?.value ?? "";
    const range = document.caretRangeFromPoint?.(x ?? 0, y ?? 0);
    const cell = this.cellEls[r][c];
    if (!range || !cell.contains(range.startContainer)) return [raw.length, raw.length];
    const pre = document.createRange();
    pre.setStart(cell, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return [
      Math.min(pre.toString().length, raw.length),
      Math.min(pre.toString().length, raw.length),
    ];
  }

  private stashActiveCell() {
    if (!this.overlay || this.activeRow < 0 || this.activeCol < 0) return;
    const key = `${this.activeRow},${this.activeCol}`;
    const text = this.overlay.value;
    this.pending.set(key, text);
    const el = this.cellEls[this.activeRow][this.activeCol];
    el.innerHTML = renderInlineMarkdown(
      unescapeCell(escapeCell(text)),
      imageResolver
    );
    el.classList.remove("md-cell-active");
  }

  private onKeydown(e: KeyboardEvent) {
    if (!this.overlay || this.activeRow < 0 || e.isComposing) return;

    // Ctrl+Enter: 紧邻下方追加新行
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      this.applyEdit((m) =>
        insertRowEdit(m, Math.max(1, this.activeRow + 1), this.activeCol)
      );
      return;
    }

    // Enter: 下移行格，末行自动追加
    if (e.key === "Enter") {
      e.preventDefault();
      this.moveBy(1, 0, "select");
    } else if (e.key === "Tab") {
      // Tab / Shift+Tab
      e.preventDefault();
      if (e.shiftKey) this.moveBy(0, -1, "select");
      else this.moveBy(0, 1, "select");
    } else if (e.key === "ArrowUp") {
      if (this.activeRow > 0) {
        e.preventDefault();
        this.moveBy(-1, 0, "select");
      }
    } else if (e.key === "ArrowDown") {
      if (this.activeRow < this.rowCount - 1) {
        e.preventDefault();
        this.moveBy(1, 0, "select");
      }
    } else if (e.key === "ArrowLeft") {
      // 光标位于最左端时，按左箭头平滑移入前一格末尾
      if (this.overlay.selectionStart === 0 && this.overlay.selectionEnd === 0) {
        if (this.activeRow > 0 || this.activeCol > 0) {
          e.preventDefault();
          this.moveBy(0, -1, "end");
        }
      }
    } else if (e.key === "ArrowRight") {
      // 光标位于最右端时，按右箭头平滑移入后一格首部
      if (
        this.overlay.selectionStart === this.overlay.value.length &&
        this.overlay.selectionEnd === this.overlay.value.length
      ) {
        if (
          this.activeRow < this.rowCount - 1 ||
          this.activeCol < (this.cellEls[this.activeRow]?.length ?? 1) - 1
        ) {
          e.preventDefault();
          this.moveBy(0, 1, "start");
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.finish(true);
    }
  }

  /** 跨单元格移动；末行 Enter 或末格 Tab 自动追加新行 */
  private moveBy(
    dr: number,
    dc: number,
    caretMode: "select" | "start" | "end" = "select"
  ) {
    let r = this.activeRow + dr;
    let c = this.activeCol + dc;
    if (c >= (this.cellEls[r]?.length ?? 0)) {
      r += 1;
      c = 0;
    } else if (c < 0) {
      r -= 1;
      c = Math.max(0, (this.cellEls[r]?.length ?? 1) - 1);
    }
    if (r < 0) r = 0;
    if (r >= this.rowCount) {
      // 末行 Enter / 末格 Tab：追加行（Typora 经典连击录入体验）
      this.applyEdit((m) =>
        insertRowEdit(
          m,
          m.rows.length,
          Math.max(0, Math.min(this.activeCol, m.rows[0].length - 1))
        )
      );
      return;
    }
    this.openEditor(
      r,
      Math.max(0, Math.min(c, (this.cellEls[r]?.length ?? 1) - 1)),
      { caretMode }
    );
  }

  private modelWithPending(): TableModel | null {
    const view = this.view;
    if (!view) return null;
    const model = findTableAt(view.state, this.data.from);
    if (!model) return null;
    if (this.pending.size === 0) return model;
    const rows = model.rows.map((row, ri) =>
      row.map((cell, ci) => {
        const t = this.pending.get(`${ri},${ci}`);
        return t === undefined ? cell : { ...cell, text: escapeCell(t) };
      })
    );
    return { ...model, rows };
  }

  applyEdit(make: (model: TableModel) => TableEdit | null) {
    const view = this.view;
    if (!view) return;
    const hadSession = this.activeRow >= 0;
    this.stashActiveCell();
    const model = this.modelWithPending();
    if (!model) return;
    const edit = make(model);
    if (!edit) return;
    this.teardown();
    if (hadSession) {
      const caret = caretPosInTable(edit.insert, edit.caretRow, edit.caretCol);
      setActiveEdit({
        tableFrom: this.data.from,
        row: edit.caretRow,
        col: edit.caretCol,
      });
      view.dispatch({
        changes: { from: edit.from, to: edit.to, insert: edit.insert },
        selection: { anchor: edit.from + caret },
      });
    } else {
      clearActiveEdit(this.data.from);
      view.dispatch({
        changes: { from: edit.from, to: edit.to, insert: edit.insert },
      });
    }
  }

  finish(caretAfter: boolean) {
    const view = this.view;
    if (!view) return;
    this.stashActiveCell();
    const model = this.modelWithPending();
    clearActiveEdit(this.data.from);
    this.teardown();
    if (!model) return;
    const insert = buildTable(model);
    if (insert === view.state.doc.sliceString(model.from, model.to)) {
      if (caretAfter) this.moveCaretAfterTable();
      return;
    }
    if (caretAfter) {
      view.dispatch({
        changes: { from: model.from, to: model.to, insert },
        selection: { anchor: model.from + insert.length },
      });
    } else {
      view.dispatch({ changes: { from: model.from, to: model.to, insert } });
    }
    view.focus();
  }

  private moveCaretAfterTable() {
    const view = this.view;
    if (!view) return;
    const doc = view.state.doc;
    const after = doc.lineAt(this.data.to).number;
    const anchor = after + 1 <= doc.lines ? doc.line(after + 1).from : doc.length;
    view.dispatch({ selection: { anchor } });
    view.focus();
  }

  private teardown() {
    this.closeSizePopover();
    this.overlay?.remove();
    this.overlay = null;
    this.wrapEl?.classList.remove("has-active-cell");
    for (const row of this.cellEls) {
      for (const el of row) el.classList.remove("md-cell-active");
    }
    this.pending.clear();
    this.activeRow = -1;
    this.activeCol = -1;
  }

  private buildHandle(view: EditorView, col: number) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "md-table-handle";
    btn.setAttribute("aria-label", "列操作与对齐");
    btn.title = "列操作与对齐";
    btn.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      openTableMenu(view, this.data.from, rect.left, rect.bottom + 4, { col });
    });
    return btn;
  }

  ignoreEvent() {
    return true;
  }
}

function sameModel(a: TableModel, b: TableModel): boolean {
  const sameCells = (x: TableCellRef[], y: TableCellRef[]) =>
    x.length === y.length &&
    x.every(
      (c, i) => c.text === y[i].text && c.from === y[i].from && c.to === y[i].to
    );
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.rows.length === b.rows.length &&
    a.rows.every((row, i) => sameCells(row, b.rows[i])) &&
    a.aligns.length === b.aligns.length &&
    a.aligns.every((al, i) => al === b.aligns[i])
  );
}

/** mermaid 动态加载（首次遇到 mermaid 围栏才拉包），主题变化时重新 initialize */
let mermaidTheme: string | null = null;

async function getMermaid(dark: boolean) {
  const theme = dark ? "dark" : "default";
  const mermaid = (await import("mermaid")).default;
  if (mermaidTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme,
    });
    mermaidTheme = theme;
  }
  return mermaid;
}

/** mermaid 围栏 → SVG 图（渲染失败回退错误提示，光标进入显示源码） */
class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly dark: boolean
  ) {
    super();
  }
  eq(other: MermaidWidget) {
    return other.source === this.source && other.dark === this.dark;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "md-mermaid";
    el.textContent = "mermaid 渲染中…";
    void (async () => {
      try {
        const mermaid = await getMermaid(this.dark);
        const id = `mmd-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, this.source);
        const holder = document.createElement("div");
        holder.innerHTML = svg;
        el.replaceChildren(...Array.from(holder.childNodes));
        el.classList.add("done");
      } catch {
        el.textContent = "mermaid 语法错误";
        el.classList.add("error");
      }
    })();
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

/** emoji 短代码（:smile:）→ unicode 字符 widget */
class EmojiWidget extends WidgetType {
  constructor(readonly char: string) {
    super();
  }
  eq(other: EmojiWidget) {
    return other.char === this.char;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "md-emoji";
    el.textContent = this.char;
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

/** ==高亮== → 荧光标记（mark 元素，光标进入回显原文） */
class MarkWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: MarkWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const el = document.createElement("mark");
    el.className = "md-mark";
    el.textContent = this.text;
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const ICON_TASK_CHECK_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="md-task-check-icon"><polyline points="20 6 9 17 4 12"/></svg>';

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("button");
    box.type = "button";
    box.className = "md-task" + (this.checked ? " checked" : "");
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.title = this.checked ? "标为未完成" : "标为已完成";
    if (this.checked) {
      box.innerHTML = ICON_TASK_CHECK_SVG;
    }
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const pos = view.posAtDOM(box);
      const line = view.state.doc.lineAt(pos);
      const toggle = taskToggleInLine(line.text);
      if (!toggle) return;
      const from = line.from + toggle.index;
      view.dispatch({
        changes: { from, to: from + 3, insert: toggle.insert },
        userEvent: "input",
      });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

/** 隐藏 [from, to)，吞掉紧随的空格（标题 # 与引用 > 的后续空格一并隐藏） */
function hideRange(
  state: EditorState,
  from: number,
  to: number,
  swallowSpaces = false
): Range<Decoration> | null {
  const doc = state.doc;
  if (swallowSpaces) {
    while (to < doc.length && doc.sliceString(to, to + 1) === " ") to += 1;
  }
  if (to <= from) return null;
  return HIDE.range(from, to);
}

let activeMathBubble: HTMLElement | null = null;
let activeMathTarget: HTMLElement | null = null;
let closeMathBubbleCleanup: (() => void) | null = null;

function closeMathBubble() {
  if (closeMathBubbleCleanup) {
    closeMathBubbleCleanup();
    closeMathBubbleCleanup = null;
  }
  if (activeMathTarget) {
    activeMathTarget.classList.remove("is-editing");
    activeMathTarget = null;
  }
  if (activeMathBubble) {
    activeMathBubble.classList.add("is-closing");
    const el = activeMathBubble;
    activeMathBubble = null;
    setTimeout(() => {
      el.remove();
    }, 100);
  }
}

document.addEventListener("mousedown", (e) => {
  if (activeMathBubble && !activeMathBubble.contains(e.target as Node)) {
    closeMathBubble();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeMathBubble) {
    closeMathBubble();
  }
});

function positionMathBubble(bubble: HTMLElement, targetEl: HTMLElement) {
  const rect = targetEl.getBoundingClientRect();
  const bubbleWidth = bubble.offsetWidth || 380;
  const bubbleHeight = bubble.offsetHeight || 160;

  let left = rect.left + rect.width / 2 - bubbleWidth / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - bubbleWidth - 12));

  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < bubbleHeight + 16 && rect.top > bubbleHeight + 16;

  const top = placeAbove ? rect.top - bubbleHeight - 10 : rect.bottom + 10;

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
  bubble.dataset.placement = placeAbove ? "top" : "bottom";

  const arrow = bubble.querySelector(".md-math-bubble-arrow") as HTMLElement | null;
  if (arrow) {
    const arrowLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - left, bubbleWidth - 16));
    arrow.style.left = `${arrowLeft}px`;
  }
}

function resolveInlineMathRange(doc: Text, pos: number): { from: number; to: number } | null {
  const line = doc.lineAt(pos);
  const text = line.text;
  const relPos = pos - line.from;
  let i = 0;
  while (i < text.length - 1) {
    if (text[i] !== "$" || text[i + 1] === "$" || (i > 0 && text[i - 1] === "\\")) {
      i++;
      continue;
    }
    let close = -1;
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") {
        j++;
        continue;
      }
      if (text[j] === "$") {
        close = j;
        break;
      }
    }
    if (close > i + 1) {
      if (relPos >= i && relPos <= close + 1) {
        return { from: line.from + i, to: line.from + close + 1 };
      }
      i = close + 1;
    } else {
      i++;
    }
  }
  return null;
}

function resolveBlockMathRange(doc: Text, pos: number): { from: number; to: number } | null {
  const line = doc.lineAt(pos);
  const trimmed = line.text.trim();
  if (trimmed.startsWith("$$")) {
    const second = trimmed.indexOf("$$", 2);
    if (second > 2) {
      return { from: line.from, to: line.to };
    }
    for (let j = line.number + 1; j <= doc.lines; j++) {
      if (doc.line(j).text.trim().startsWith("$$")) {
        return { from: line.from, to: doc.line(j).to };
      }
    }
  }
  let startLine = -1;
  for (let j = line.number; j >= 1; j--) {
    if (doc.line(j).text.trim().startsWith("$$")) {
      startLine = j;
      break;
    }
  }
  if (startLine > 0) {
    for (let j = startLine + 1; j <= doc.lines; j++) {
      if (doc.line(j).text.trim().startsWith("$$")) {
        return { from: doc.line(startLine).from, to: doc.line(j).to };
      }
    }
  }
  return null;
}

function openMathBubble(
  view: EditorView,
  targetEl: HTMLElement,
  initialTex: string,
  display: boolean,
  from: number,
  to: number
) {
  closeMathBubble();

  activeMathTarget = targetEl;
  targetEl.classList.add("is-editing");

  const bubble = document.createElement("div");
  bubble.className = "md-math-bubble";
  bubble.setAttribute("role", "dialog");
  bubble.setAttribute("aria-label", "编辑 LaTeX 公式");

  let currentRange = { from, to };
  let currentTex = initialTex;

  const arrow = document.createElement("div");
  arrow.className = "md-math-bubble-arrow";
  bubble.appendChild(arrow);

  const header = document.createElement("div");
  header.className = "md-math-bubble-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "md-math-bubble-title";
  titleWrap.innerHTML = `
    <svg class="md-math-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19h4a8 8 0 0 0 8-8V4"/>
      <path d="M12 4h6"/>
      <path d="M8 11h8"/>
    </svg>
    <span>${display ? "块级 LaTeX 公式" : "行内 LaTeX 公式"}</span>
  `;
  header.appendChild(titleWrap);

  const actions = document.createElement("div");
  actions.className = "md-math-bubble-actions";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "md-math-confirm-btn";
  confirmBtn.textContent = "完成";
  confirmBtn.addEventListener("mousedown", (ev) => ev.stopPropagation());
  confirmBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeMathBubble();
    view.focus();
  });
  actions.appendChild(confirmBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "md-math-action-btn md-math-copy-btn";
  copyBtn.title = "复制 LaTeX 源码";
  copyBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  `;
  copyBtn.addEventListener("mousedown", (ev) => ev.stopPropagation());
  copyBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    void navigator.clipboard?.writeText(currentTex);
    copyBtn.classList.add("copied");
    setTimeout(() => copyBtn.classList.remove("copied"), 1200);
  });
  actions.appendChild(copyBtn);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "md-math-action-btn md-math-close-btn";
  closeBtn.title = "关闭 (Esc)";
  closeBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  `;
  closeBtn.addEventListener("mousedown", (ev) => ev.stopPropagation());
  closeBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeMathBubble();
    view.focus();
  });
  actions.appendChild(closeBtn);
  header.appendChild(actions);
  bubble.appendChild(header);

  const body = document.createElement("div");
  body.className = "md-math-bubble-body";

  const textarea = document.createElement("textarea");
  textarea.className = "md-math-input";
  textarea.value = initialTex;
  textarea.rows = display ? 3 : 1;
  textarea.placeholder = display ? "输入 LaTeX 公式源码 (多行)..." : "输入 LaTeX 公式源码...";
  body.appendChild(textarea);
  bubble.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "md-math-bubble-footer";

  const quickSymbols = document.createElement("div");
  quickSymbols.className = "md-math-quick-symbols";
  const SYMBOLS = [
    { label: "\\frac", insert: "\\frac{a}{b}" },
    { label: "\\sqrt", insert: "\\sqrt{x}" },
    { label: "\\sum", insert: "\\sum_{i=1}^{n}" },
    { label: "\\int", insert: "\\int_{a}^{b}" },
    { label: "\\alpha", insert: "\\alpha" },
    { label: "\\infty", insert: "\\infty" },
    { label: "\\pm", insert: "\\pm" },
    { label: "\\leq", insert: "\\leq" },
    { label: "\\geq", insert: "\\geq" },
  ];
  for (const s of SYMBOLS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "md-math-chip";
    chip.textContent = s.label;
    chip.title = `插入 ${s.insert}`;
    chip.addEventListener("mousedown", (ev) => ev.stopPropagation());
    chip.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.slice(0, start) + s.insert + val.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + s.insert.length;
      textarea.focus();
      handleTexChange(textarea.value);
    });
    quickSymbols.appendChild(chip);
  }
  footer.appendChild(quickSymbols);
  bubble.appendChild(footer);
  bubble.appendChild(footer);

  const handleTexChange = (newVal: string) => {
    currentTex = newVal;
    const trimmed = newVal.trim();
    const newInsert = display
      ? `$$\n${trimmed || " "}\n$$`
      : `$${trimmed || " "}$`;

    if (
      currentRange.from <= view.state.doc.length &&
      currentRange.to <= view.state.doc.length
    ) {
      view.dispatch({
        changes: {
          from: currentRange.from,
          to: currentRange.to,
          insert: newInsert,
        },
        userEvent: "input",
      });
      currentRange.to = currentRange.from + newInsert.length;
    }
  };

  textarea.addEventListener("mousedown", (ev) => ev.stopPropagation());
  textarea.addEventListener("input", () => {
    handleTexChange(textarea.value);
  });
  textarea.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Escape") {
      closeMathBubble();
      view.focus();
    } else if (
      (display && ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) ||
      (!display && ev.key === "Enter" && !ev.shiftKey)
    ) {
      ev.preventDefault();
      closeMathBubble();
      view.focus();
    }
  });

  document.body.appendChild(bubble);
  activeMathBubble = bubble;

  positionMathBubble(bubble, targetEl);

  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 30);

  const reposition = () => {
    if (activeMathBubble && activeMathTarget) {
      positionMathBubble(activeMathBubble, activeMathTarget);
    }
  };
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);

  closeMathBubbleCleanup = () => {
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
  };
}

/** 数学公式 → KaTeX 渲染 widget（块级 div / 行内 span，常驻渲染并通过气泡浮层编辑） */
class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
    readonly mathFrom?: number,
    readonly mathTo?: number
  ) {
    super();
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }
  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "md-math-block" : "md-math-inline";
    el.innerHTML = renderKatex(this.tex, this.display);

    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const pos = view.posAtDOM(el);
      let from = this.mathFrom ?? pos;
      let to = this.mathTo ?? pos + this.tex.length + (this.display ? 4 : 2);

      const resolved = this.display
        ? resolveBlockMathRange(view.state.doc, pos)
        : resolveInlineMathRange(view.state.doc, pos);
      if (resolved) {
        from = resolved.from;
        to = resolved.to;
      }

      openMathBubble(view, el, this.tex, this.display, from, to);
    });

    return el;
  }
  ignoreEvent() {
    return false;
  }
}

/** 取围栏的语言标注（```js → "js"），无标注返回空串 */
function codeInfoOf(node: SyntaxNode, doc: Text): string {
  for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
    if (ch.name === "CodeInfo") return doc.sliceString(ch.from, ch.to).trim();
  }
  return "";
}

/** 行内图片 `![alt](src)` → widget；解析不出可用地址时保持原文 */
function imageReplace(
  state: EditorState,
  from: number,
  to: number,
  resolveImageSrc: ImageSrcResolver
): Range<Decoration> | null {
  const raw = state.doc.sliceString(from, to);
  const m = /^!\[([\s\S]*?)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)$/.exec(raw);
  if (!m) return null;
  const src = resolveImageSrc(m[2]);
  if (!src) return null;
  return Decoration.replace({
    widget: new ImageWidget(src, m[1]),
  }).range(from, to);
}

/**
 * 计算即时渲染的全部装饰区间（纯函数，便于单测）。
 * parseTo：要求语法树解析到的位置（编辑器里传视口末端，测试里传文档全长）。
 * scale：块间距缩放系数（见 typography.spacingScale），1 = 16px 正文 + 标准档。
 */
export function computeLiveRanges(
  state: EditorState,
  parseTo: number,
  resolveImageSrc: ImageSrcResolver,
  scale = 1
): Range<Decoration>[] {
  const doc = state.doc;
  const tree =
    ensureSyntaxTree(state, Math.min(parseTo, doc.length), 120) ?? syntaxTree(state);
  const ranges: Range<Decoration>[] = [];

  /** 行级装饰累加器：每行只发一个 Decoration.line，把 class 与行内自定义属性合并，
   *  避免同一行多个行装饰的 style 互相覆盖。 */
  interface LineInfo {
    classes: Set<string>;
    spaceBefore: number;
  }
  const lineMap = new Map<number, LineInfo>();
  const calloutEmptyDecls = new Set<number>();
  const lineInfo = (from: number): LineInfo => {
    let info = lineMap.get(from);
    if (!info) {
      info = { classes: new Set<string>(), spaceBefore: 0 };
      lineMap.set(from, info);
    }
    return info;
  };
  const pushLineClass = (from: number, cls: string) => {
    lineInfo(from).classes.add(cls);
  };
  const setSpaceBefore = (from: number, px: number) => {
    const info = lineInfo(from);
    if (px > info.spaceBefore) info.spaceBefore = px;
  };

  /** 顶层块（Document 直接子节点）的起止行，用于折叠间距与压缩空行 */
  interface TopBlock {
    kind: BlockKind;
    firstLine: number;
    lastLine: number;
  }
  const blocks: TopBlock[] = [];
  /** 待渲染的顶层表格（光标不在其内），折叠间距算好后替换为 widget */
  const tables: TableModel[] = [];
  const blockKindOf = (name: string): BlockKind | null => {
    // h1/h2 是大节标题（节间呼吸 48px），h3~h6 走普通小标题节奏
    if (/^(ATXHeading[12]|SetextHeading[12])$/.test(name)) return "headingMajor";
    if (/^ATXHeading[3-6]$/.test(name)) return "heading";
    if (name === "Paragraph") return "paragraph";
    if (name === "BulletList" || name === "OrderedList") return "list";
    if (name === "Blockquote") return "blockquote";
    if (name === "FencedCode" || name === "CodeBlock") return "pre";
    if (name === "HorizontalRule") return "hr";
    if (name === "Table") return "table";
    if (name === "HTMLBlock") return "paragraph";
    return null;
  };

  const hideChild = (node: { from: number; to: number }, swallowSpaces = false) => {
    const r = hideRange(state, node.from, node.to, swallowSpaces);
    if (r) ranges.push(r);
  };

  /** 数学公式扫描的禁区（代码块/行内代码/表格/HTML 块/已识别的块级公式） */
  const excluded: { from: number; to: number }[] = [];
  const inExcluded = (pos: number): boolean => {
    for (const r of excluded) {
      if (pos >= r.from && pos < r.to) return true;
    }
    return false;
  };

  tree.iterate({
    enter: (iter) => {
      const node = iter.node;
      const parent = node.parent;
      const from = node.from;
      const to = node.to;

      // 公式扫描禁区
      if (
        node.name === "CodeBlock" ||
        node.name === "HTMLBlock" ||
        node.name === "InlineCode"
      ) {
        excluded.push({ from, to });
      }

      // 顶层块：收集用于折叠间距与空行压缩
      if (parent && parent.name === "Document") {
        const kind = blockKindOf(node.name);
        if (kind) {
          blocks.push({
            kind,
            firstLine: doc.lineAt(from).number,
            lastLine: doc.lineAt(to > from ? to - 1 : from).number,
          });
        }
        // 顶层表格：恒渲染（Typora 式），编辑在 widget 内完成。
        // 公式/emoji 扫描禁区与渲染无关（表格行不容公式与 emoji 短代码）
        if (node.name === "Table") {
          excluded.push({ from, to });
          const model = tableModelOf(node, doc);
          if (model) tables.push(model);
        }
      }

      // —— 行级：标题 ——
      if (/^ATXHeading[1-6]$/.test(node.name)) {
        const line = doc.lineAt(from);
        pushLineClass(line.from, `md-h${node.name.slice(-1)}`);
        return;
      }
      if (node.name === "HeaderMark") {
        // 标题标记无条件隐藏（Typora 式）：编辑标题时标题保持渲染，
        // 级别调整走 Ctrl+0-6 快捷键（extensions.ts）
        if (parent && /^ATXHeading[1-6]$/.test(parent.name)) {
          hideChild(node, true);
        }
        return;
      }

      // —— 行内：强调 / 删除线 / 行内代码（Typora 风格常驻所见即所得，隐藏标记字符） ——
      if (node.name === "EmphasisMark") {
        if (
          parent &&
          (parent.name === "Emphasis" || parent.name === "StrongEmphasis")
        ) {
          hideChild(node);
        }
        return;
      }
      if (node.name === "StrikethroughMark") {
        if (
          parent &&
          parent.name === "Strikethrough"
        ) {
          hideChild(node);
        }
        return;
      }
      if (node.name === "CodeMark") {
        // FencedCode 的 fence 行在下方整行处理；这里只管行内代码的反引号
        if (
          parent &&
          parent.name === "InlineCode"
        ) {
          hideChild(node);
        }
        return;
      }

      // —— 链接：隐藏 [ ](url)，只剩链接文字（Typora 风格常驻所见即所得） ——
      if (
        (node.name === "LinkMark" ||
          node.name === "URL" ||
          node.name === "LinkLabel" ||
          node.name === "LinkTitle") &&
        parent &&
        parent.name === "Link"
      ) {
        hideChild(node);
        return;
      }

      // —— 图片：整体替换为图片 widget（光标进入即显示原文） ——
      if (node.name === "Image") {
        if (!selectionTouches(state, from, to)) {
          const replace = imageReplace(state, from, to, resolveImageSrc);
          if (replace) {
            ranges.push(replace);
            return false;
          }
        }
        return;
      }

      // —— 代码围栏：fence 行压低成"代码块头部/尾部"（行内替换，不跨行），内容行上代码块样式 ——
      // 不用整行 block 替换：block 装饰与"跨行 replace"在 ViewPlugin/边界归属上有一堆坑
      // （行首点装饰恰在 block 替换结束边界上会被吞掉，实测 CodeMirror 6.43）。
      if (node.name === "FencedCode") {
        const first = doc.lineAt(from);
        const last = doc.lineAt(to);
        const active = selectionTouches(state, from, to);
        const hasClosing =
          last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
        excluded.push({ from, to });

        for (let ln = first.number; ln <= last.number; ln++) {
          const line = doc.line(ln);
          const cls =
            ln === first.number
              ? "md-code-fence md-code-fence-open"
              : hasClosing && ln === last.number
                ? "md-code-fence md-code-fence-close"
                : "md-code-block";
          pushLineClass(line.from, cls);
        }
        const lang = codeInfoOf(node, doc);
        // mermaid 围栏：整块替换为渲染后的 SVG（StateField 允许跨行 block replace）
        if (lang === "mermaid") {
          if (!active) {
            const dark = document.documentElement.dataset.theme === "dark";
            // 有闭合围栏时源码不含闭合行
            const source = doc
              .sliceString(
                first.to,
                hasClosing ? doc.line(last.number - 1).to : last.to
              )
              .trim();
            ranges.push(
              Decoration.replace({
                widget: new MermaidWidget(source, dark),
                block: true,
              }).range(first.from, last.to)
            );
            return false;
          }
        } else {
          // 常规代码块（Typora 风格代码卡片）：首尾围栏常驻隐藏与卡片化，光标在代码内编辑时不展开首尾 ``` 围栏
          if (hasClosing || !active) {
            ranges.push(
              Decoration.replace({ widget: new FenceWidget(lang) }).range(
                first.from,
                first.to
              )
            );
          }
        }
        // 闭 fence 无条件隐藏；开 fence 保持右上角语言标签卡片
        if (hasClosing) {
          const r = hideRange(state, last.from, last.to);
          if (r) ranges.push(r);
        }
        return false;
      }

      // —— callout（> [!NOTE] 等）：整块五色样式，首行标记折叠，末行右下角悬浮气泡徽标 ——
      if (node.name === "Blockquote") {
        const firstLine = doc.lineAt(from);
        const cm = /^\s*>\s*(\[!((?:NOTE|TIP|IMPORTANT|WARNING|CAUTION))\][ \t]*)(.*)$/i.exec(firstLine.text);
        if (cm) {
          const kind = cm[2].toLowerCase();
          const lastLine = doc.lineAt(to > from ? to - 1 : from);
          const hasEmptyDecl = cm[3].trim() === "" && lastLine.number > firstLine.number;

          for (let ln = firstLine.number; ln <= lastLine.number; ln++) {
            pushLineClass(doc.line(ln).from, `md-callout md-callout-${kind}`);
          }

          if (hasEmptyDecl) {
            calloutEmptyDecls.add(firstLine.number);
            pushLineClass(firstLine.from, "md-callout-decl-empty");
            pushLineClass(doc.line(firstLine.number + 1).from, "md-callout-first");
            // 纯声明首行全部隐藏折叠
            ranges.push(HIDE.range(firstLine.from, firstLine.to));
          } else {
            pushLineClass(firstLine.from, "md-callout-first");
            const markStart = firstLine.from + firstLine.text.indexOf(cm[1]);
            const markEnd = markStart + cm[1].length;
            ranges.push(HIDE.range(markStart, markEnd));
          }

          pushLineClass(lastLine.from, "md-callout-last");

          // 在末行末尾插入右下角气泡 Widget
          const markStartInDoc = firstLine.from + firstLine.text.indexOf(cm[1]);
          const markEndInDoc = markStartInDoc + cm[1].length;
          ranges.push(
            Decoration.widget({
              widget: new CalloutBadgeWidget(kind, markStartInDoc, markEndInDoc),
              side: 1,
            }).range(lastLine.to)
          );
        }
        return;
      }

      // —— 引用：隐藏 > 标记，行上引用样式 ——
      if (node.name === "QuoteMark") {
        const line = doc.lineAt(from);
        pushLineClass(line.from, "md-quote");
        // 引用内的空引用行压缩为分隔高度；光标停在该行时还原为可编辑的普通空行
        if (/^\s*>+\s*$/.test(line.text) && !selectionOnLine(state, line.from, line.to)) {
          pushLineClass(line.from, "md-blank");
        }
        hideChild(node, true);
        return;
      }

      // —— 分割线：整行替换为 hr（无条件，Typora 式） ——
      if (node.name === "HorizontalRule") {
        const line = doc.lineAt(from);
        pushLineClass(line.from, "md-hr-line");
        ranges.push(
          Decoration.replace({ widget: new HorizontalRuleWidget() }).range(
            line.from,
            line.to
          )
        );
        return false;
      }

      // —— 任务清单：[ ] / [x] → 可点击 checkbox（无条件，光标在行上也保持） ——
      if (node.name === "TaskMarker") {
        const line = doc.lineAt(from);
        const checked = /^\[[xX]\]/.test(doc.sliceString(from, to));
        pushLineClass(line.from, "md-task-line" + (checked ? " md-task-done" : ""));
        ranges.push(
          Decoration.replace({ widget: new TaskWidget(checked) }).range(from, to)
        );
        // 任务行不再显示 "- ☑" 双标记：隐藏行首列表标记与其后空格（保留缩进）
        const m = /^([ \t]*)[-*+][ \t]/.exec(line.text);
        if (m) {
          ranges.push(HIDE.range(line.from + m[1].length, line.from + m[0].length));
        }
        return false;
      }

      // —— 列表项：项间 4px 间距（末项除外，末项下方交给列表块间距） ——
      if (node.name === "ListItem") {
        const next = node.nextSibling;
        if (next && next.name === "ListItem") {
          pushLineClass(doc.lineAt(to).from, "md-li-end");
        }
        // 无序列表标记 → 项目符号 widget（Typora 式：光标在行上也保持渲染；
        // 任务行由上方分支处理双标记）
        if (parent && parent.name === "BulletList") {
          const mark = node.firstChild;
          if (mark && mark.name === "ListMark") {
            const line = doc.lineAt(mark.from);
            if (!taskToggleInLine(line.text)) {
              let level = 0;
              for (let p = parent.parent; p; p = p.parent) {
                if (p.name === "BulletList") level += 1;
              }
              ranges.push(
                Decoration.replace({ widget: new BulletWidget(level) }).range(
                  mark.from,
                  mark.to
                )
              );
            }
          }
        }
        return;
      }

      return;
    },
  });

  // —— 数学公式：语法树不认识 $...$，单独线性扫描 ——
  // 块级 $$..$$（单行或跨行）整块替换（StateField 允许跨行 replace）；
  // 行内 $..$ 内容非空、首尾无空白（降低把价格符号误判为公式的概率）。
  // 点击通过气泡浮层编辑源码，正文常驻渲染，不漏出源码模式。
  const mathRanges: Range<Decoration>[] = [];
  const blockMathLines = new Set<number>();
  for (let ln = 1; ln <= doc.lines; ln++) {
    if (blockMathLines.has(ln)) continue;
    const line = doc.line(ln);
    if (inExcluded(line.from)) continue;
    const t = line.text.trim();
    if (!t.startsWith("$$")) continue;
    const sameLineClose = t.indexOf("$$", 2);
    if (sameLineClose > 2) {
      mathRanges.push(
        Decoration.replace({
          widget: new MathWidget(t.slice(2, sameLineClose).trim(), true, line.from, line.to),
          block: true,
        }).range(line.from, line.to)
      );
      blockMathLines.add(ln);
      excluded.push({ from: line.from, to: line.to });
      continue;
    }
    let endLine = -1;
    for (let j = ln + 1; j <= doc.lines; j++) {
      if (doc.line(j).text.trim().startsWith("$$")) {
        endLine = j;
        break;
      }
    }
    if (endLine > 0) {
      const absTo = doc.line(endLine).to;
      mathRanges.push(
        Decoration.replace({
          widget: new MathWidget(doc.sliceString(line.to, doc.line(endLine).from).trim(), true, line.from, absTo),
          block: true,
        }).range(line.from, absTo)
      );
      for (let j = ln; j <= endLine; j++) blockMathLines.add(j);
      excluded.push({ from: line.from, to: absTo });
    }
  }
  for (let ln = 1; ln <= doc.lines; ln++) {
    if (blockMathLines.has(ln)) continue;
    const line = doc.line(ln);
    const text = line.text;
    let i = 0;
    while (i < text.length - 1) {
      if (text[i] !== "$" || text[i + 1] === "$" || (i > 0 && text[i - 1] === "\\")) {
        i += 1;
        continue;
      }
      if (inExcluded(line.from + i)) {
        i += 1;
        continue;
      }
      let close = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === "\\") {
          j += 1;
          continue;
        }
        if (text[j] === "$") {
          close = j;
          break;
        }
      }
      const content = close > i + 1 ? text.slice(i + 1, close) : "";
      if (close < 0 || content === "" || content.length > 1000 || /^\s|\s$/.test(content)) {
        i += 1;
        continue;
      }
      const absFrom = line.from + i;
      const absTo = line.from + close + 1;
      mathRanges.push(
        Decoration.replace({ widget: new MathWidget(content, false, absFrom, absTo) }).range(absFrom, absTo)
      );
      i = close + 1;
    }
  }
  // —— emoji 短代码：:name: → unicode（语法树不认识，单独扫描，与公式同一禁区） ——
  const emojiRanges: Range<Decoration>[] = [];
  for (let ln = 1; ln <= doc.lines; ln++) {
    if (blockMathLines.has(ln)) continue;
    const line = doc.line(ln);
    const text = line.text;
    const re = /(^|[^\\]):([a-zA-Z0-9_+-]+):/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const char = (EMOJI_MAP as Record<string, string>)[m[2].toLowerCase()];
      if (!char) continue;
      const absFrom = line.from + m.index + m[1].length;
      const absTo = line.from + m.index + m[0].length;
      if (inExcluded(absFrom)) continue;
      if (!selectionTouches(state, absFrom, absTo)) {
        emojiRanges.push(
          Decoration.replace({ widget: new EmojiWidget(char) }).range(absFrom, absTo)
        );
      }
    }
  }
  // —— ==高亮==:荧光标记（语法树不认识,单独扫描,与公式/emoji 同一禁区） ——
  const markRanges: Range<Decoration>[] = [];
  for (let ln = 1; ln <= doc.lines; ln++) {
    if (blockMathLines.has(ln)) continue;
    const line = doc.line(ln);
    const text = line.text;
    // 内容两端不留空白、不含 =（==a==b== 场景放弃）、不跨行
    const re = /(^|[^\\])==([^=\s](?:[^=\n]*[^=\s])?)==/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const absFrom = line.from + m.index + m[1].length;
      const absTo = absFrom + m[0].length - m[1].length;
      if (inExcluded(absFrom)) continue;
      if (!selectionTouches(state, absFrom, absTo)) {
        markRanges.push(
          Decoration.replace({ widget: new MarkWidget(m[2]) }).range(absFrom, absTo)
        );
      }
    }
  }
  // 与其他替换/隐藏区间（强调标记、图片、fence 标签等）重叠的公式放弃渲染
  if (mathRanges.length > 0 || emojiRanges.length > 0 || markRanges.length > 0) {
    const taken = [...ranges].sort((a, b) => a.from - b.from);
    const overlaps = (from: number, to: number): boolean => {
      for (const r of taken) {
        if (r.to <= from) continue;
        if (r.from >= to) break;
        return true;
      }
      return false;
    };
    for (const r of [...mathRanges, ...emojiRanges, ...markRanges]) {
      if (!overlaps(r.from, r.to)) ranges.push(r);
    }
  }

  // —— 顶层块间距与分隔空行压缩（Typora 式） ——
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prev = i > 0 ? blocks[i - 1] : null;
    const firstLine = doc.line(block.firstLine);
    // 承载自身顶部内边距的块（引用 / 代码 / 表格 widget）由 CSS 或 widget 读取，不加 md-block 以免双计
    if (block.kind !== "blockquote" && block.kind !== "pre" && block.kind !== "table") {
      pushLineClass(firstLine.from, "md-block");
    }
    if (block.kind === "blockquote") {
      const actualFirst =
        calloutEmptyDecls.has(block.firstLine) && block.firstLine < block.lastLine
          ? doc.line(block.firstLine + 1)
          : firstLine;
      pushLineClass(actualFirst.from, "md-quote-first");
      pushLineClass(doc.line(block.lastLine).from, "md-quote-last");
    }

    const blankFrom = prev ? prev.lastLine + 1 : 1;
    for (let ln = blankFrom; ln < block.firstLine; ln++) {
      pushLineClass(doc.line(ln).from, "md-blank");
    }
    const blankLines = prev ? Math.max(0, block.firstLine - prev.lastLine - 1) : 0;
    if (prev) {
      const gap = spaceBefore(prev.kind, block.kind, blankLines, scale);
      if (gap > 0) setSpaceBefore(firstLine.from, gap);
    }
    // 表格整块替换：与上一块的折叠间距由 widget 自身 padding 承载
    if (block.kind === "table") {
      const t = tables.find((x) => doc.lineAt(x.from).number === block.firstLine);
      if (t) {
        const gap = prev ? spaceBefore(prev.kind, "table", blankLines, scale) : 0;
        ranges.push(
          Decoration.replace({
            widget: new TableWidget(t, gap),
            block: true,
          }).range(firstLine.from, doc.line(block.lastLine).to)
        );
      }
    }
  }
  if (blocks.length > 0) {
    const lastBlockLine = blocks[blocks.length - 1].lastLine;
    for (let ln = lastBlockLine + 1; ln <= doc.lines; ln++) {
      pushLineClass(doc.line(ln).from, "md-blank");
    }
  }

  // —— 汇总：每行一个行装饰（class + 行内 --md-space-before） ——
  const lineStarts = [...lineMap.keys()].sort((a, b) => a - b);
  for (const lineStart of lineStarts) {
    const info = lineMap.get(lineStart)!;
    const cls = [...info.classes].join(" ");
    if (!cls) continue;
    const spec: { class: string; attributes?: { style: string } } = { class: cls };
    if (info.spaceBefore > 0) {
      spec.attributes = { style: `--md-space-before:${info.spaceBefore}px` };
    }
    ranges.push(Decoration.line(spec).range(lineStart));
  }

  return ranges;
}

/**
 * 即时渲染装饰的提供者。
 *
 * CodeMirror 的两条硬约束决定了这里的结构：
 * 1. ViewPlugin 提供的装饰不允许包含"跨换行的 replace"（fence 行整行隐藏需要它）；
 * 2. ViewPlugin 提供的装饰也不允许包含 block 装饰。
 * 因此装饰必须经由 StateField 提供：
 * - doc / selection 变化 → update 里同步全量重算（区间收集是 O(文档) 的轻量遍历，毫秒级；
 *   且 livePreview 本身只在 standard 档（<20MB）启用）；
 * - 视口变化（滚动到未解析区域）→ ViewPlugin 在微任务里 dispatch recompute effect 补算，
 *   不能在 update 循环内直接 dispatch。
 */
export function livePreview(
  resolveImageSrc: ImageSrcResolver,
  scale = 1
): Extension {
  // 渲染态表格单元格里的本地图片需要走同一解析器（窗口内各文档闭包等价）
  imageResolver = resolveImageSrc;
  const recompute = StateEffect.define<null>();

  const field = StateField.define<DecorationSet>({
    create(state) {
      return safeCompute(state, resolveImageSrc, scale);
    },
    update(value, tr) {
      if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(recompute))) {
        return safeCompute(tr.state, resolveImageSrc, scale);
      }
      return value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const viewportDriver = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        // 表格结构操作/落盘后：文档已变，在重建出的最新 widget 实例上恢复单元格编辑
        if (update.docChanged) {
          const edit = getActiveEdit();
          if (edit) {
            queueMicrotask(() => {
              liveTableWidgets.get(edit.tableFrom)?.restoreCellEdit(edit.row, edit.col);
            });
          }
        }
        if (!update.viewportChanged) return;
        const view = update.view;
        queueMicrotask(() => {
          // 视图可能已销毁（destroyed 为私有属性，用 DOM 脱离判断）
          if (view.dom.isConnected) view.dispatch({ effects: recompute.of(null) });
        });
      }
    }
  );

  return [field, viewportDriver];
}

/** 装饰计算出错绝不能炸掉视图（前车之鉴：跨行 replace 直接让 EditorView 创建失败） */
function safeCompute(
  state: EditorState,
  resolver: ImageSrcResolver,
  scale = 1
): DecorationSet {
  try {
    return Decoration.set(
      computeLiveRanges(state, state.doc.length, resolver, scale),
      true
    );
  } catch {
    return Decoration.none;
  }
}
