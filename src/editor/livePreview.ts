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
import { taskToggleInLine } from "../preview/markdownCore";
import { spaceBefore, type BlockKind } from "../preview/typography";

/**
 * Typora 风格所见即所得：光标不在的语法即时"渲染"——
 * 标记字符（#、**、[]()、```、>）被隐藏或替换为 widget，光标进入即显示原始文本。
 * 退化（大文件关闭即时渲染）时不挂本扩展，整体呈现源码原样。
 */

/** 把 Markdown 图片 src 解析为最终 URL（本地路径 → asset 协议），由调用方注入 */
export type ImageSrcResolver = (rawSrc: string) => string | null;

const HIDE = Decoration.replace({});

/** 开 fence 行的语言标签（当代码块头部显示） */
class FenceWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(other: FenceWidget) {
    return other.lang === this.lang;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "md-lang-tag";
    el.textContent = this.lang;
    return el;
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

interface TableCellRange {
  from: number;
  to: number;
}

interface TableData {
  /** 行文本（首行为表头），与 cellRanges 同序同形；文本保留源码转义（\|） */
  rowsText: string[][];
  cellRanges: TableCellRange[][];
  /** 表格节点在文档中的起止（块替换范围与提交光标回放用） */
  from: number;
  to: number;
}

/** 单元格显示态：源码里的 \| 显示为 | */
const unescapeCell = (s: string): string => s.replace(/\\\|/g, "|");
/** 单元格写回文档：字面 | 转义为 \|，换行折叠为空格（GFM 单元格不能换行） */
const escapeCell = (s: string): string =>
  s.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();

/** 空单元格行兜底：lezer 对全空行（|  |  |）不产 TableCell，
 *  按行文本切分顶层管道还原单元格文本与（可插入的）文档位置 */
function rowCellsFromLine(
  lineText: string,
  lineFrom: number
): { texts: string[]; ranges: TableCellRange[] } {
  const texts: string[] = [];
  const ranges: TableCellRange[] = [];
  const segs: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i < lineText.length; i++) {
    const ch = lineText[i];
    if (ch === "\\" && lineText[i + 1] === "|") {
      i++;
      continue;
    }
    if (ch === "|") {
      if (start >= 0) segs.push({ start, end: i });
      start = i + 1;
    }
  }
  // 首个管道之前与最后一个管道之后是边缘段，丢弃
  for (const seg of segs) {
    let s = seg.start;
    let e = seg.end;
    while (s < e && lineText[s] === " ") s++;
    while (e > s && lineText[e - 1] === " ") e--;
    texts.push(lineText.slice(s, e));
    ranges.push({ from: lineFrom + s, to: lineFrom + e });
  }
  return { texts, ranges };
}

/** 表格结构操作后，重建出的新 widget 自动打开的单元格（桌面单活动编辑面，构建时立即消费） */
let pendingCellEdit: { tableFrom: number; row: number; col: number } | null = null;

/** 存活表格 widget 注册表：按文档起点索引，供结构操作后的编辑位置恢复定位最新实例 */
const liveTableWidgets = new Map<number, TableWidget>();

/** 从语法树提取表格内容：首行 = 表头，其余为数据行；同时记录单元格文档位置供提交。
 *  lezer 结构：表头行是 TableHeader（直接含 TableCell），数据行是 TableRow > TableCell */
function tableDataOf(node: SyntaxNode, doc: Text): TableData | null {
  const rowsText: string[][] = [];
  const cellRanges: TableCellRange[][] = [];
  const cellsOf = (n: SyntaxNode) => {
    const texts: string[] = [];
    const ranges: TableCellRange[] = [];
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.name === "TableCell") {
        texts.push(doc.sliceString(c.from, c.to).trim());
        ranges.push({ from: c.from, to: c.to });
      }
    }
    return { texts, ranges };
  };
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === "TableRow") {
      let { texts, ranges } = cellsOf(c);
      if (texts.length === 0) {
        // 全空行：lezer 不产 TableCell，按管道位置兜底切分
        const line = doc.lineAt(c.from);
        ({ texts, ranges } = rowCellsFromLine(line.text, line.from));
      }
      rowsText.push(texts);
      cellRanges.push(ranges);
    } else if (c.name === "TableHeader") {
      const { texts, ranges } = cellsOf(c);
      if (texts.length > 0) {
        rowsText.push(texts);
        cellRanges.push(ranges);
      }
    }
  }
  if (rowsText.length === 0) return null;
  // node.to 可能包含末行之后的换行符；以末行内容结尾为准，追加行才能紧贴表格
  const lastLine = doc.lineAt(Math.max(0, node.to - 1));
  return { rowsText, cellRanges, from: node.from, to: lastLine.to };
}

/**
 * GFM 表格 → 常渲染表格（光标进入不再还原源码）。点击单元格在原位打开
 * 编辑器（覆盖该单元格的 textarea，widget 内编辑、光标稳定），离开时把
 * 改动合成一个事务写回文档；Enter/Tab 导航，末行 Enter、末格 Tab、
 * Ctrl+Enter 追加新行，Escape 结束编辑。
 */
class TableWidget extends WidgetType {
  /** 编辑中未落盘的单元格文本（key = "r,c"，保存用户原始输入） */
  private pending = new Map<string, string>();
  private cellEls: HTMLTableCellElement[][] = [];
  private overlay: HTMLTextAreaElement | null = null;
  private activeRow = -1;
  private activeCol = -1;
  private view: EditorView | null = null;
  private wrapEl: HTMLElement | null = null;

  constructor(readonly data: TableData, readonly gap: number) {
    super();
  }

  private get rowCount(): number {
    return this.data.rowsText.length;
  }

  private get colCount(): number {
    return this.data.rowsText[0]?.length ?? 0;
  }

  eq(other: TableWidget) {
    return (
      other.gap === this.gap &&
      same2D(other.data.rowsText, this.data.rowsText) &&
      sameRanges2D(other.data.cellRanges, this.data.cellRanges)
    );
  }

  toDOM(view: EditorView) {
    this.view = view;
    const wrap = document.createElement("div");
    wrap.className = "md-table-wrap";
    if (this.gap > 0) wrap.style.paddingTop = `${this.gap}px`;
    const table = document.createElement("table");
    table.className = "md-table";
    table.addEventListener("keydown", (e) => this.onKeydown(e));
    this.cellEls = this.data.rowsText.map((row, r) => {
      const tr =
        r === 0
          ? table.createTHead().insertRow()
          : table.createTBody().insertRow();
      return row.map((text, c) => {
        const el = document.createElement(r === 0 ? "th" : "td");
        el.textContent = unescapeCell(text);
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openEditor(r, c);
        });
        tr.appendChild(el);
        return el;
      });
    });
    wrap.appendChild(table);
    this.wrapEl = wrap;
    liveTableWidgets.set(this.data.from, this);
    return wrap;
  }

  destroy(dom: HTMLElement) {
    // 重建时新实例先注册、旧实例后销毁；只在仍指向自己时清除
    if (liveTableWidgets.get(this.data.from) === this) {
      liveTableWidgets.delete(this.data.from);
    }
    this.overlay = null;
    this.wrapEl = null;
    super.destroy(dom);
  }

  /** 结构操作后的编辑位置恢复（由 livePreview 的 ViewPlugin 消费 pendingCellEdit 调用） */
  restoreCellEdit(row: number, col: number) {
    if (this.wrapEl?.isConnected && this.cellEls[row]?.[col]) {
      this.openEditor(row, col);
    }
  }

  /** 打开（或移动）单元格编辑器；同一 widget 内移动不触发重建 */
  private openEditor(r: number, c: number) {
    const row = this.cellEls[r];
    const cell = row?.[c];
    if (!cell) return;
    // 先把上一个单元格的输入落到显示层与 pending
    this.stashActiveCell();
    this.activeRow = r;
    this.activeCol = c;
    cell.classList.add("md-cell-active");
    if (!this.overlay) {
      this.overlay = document.createElement("textarea");
      this.overlay.className = "md-cell-editor";
      this.overlay.rows = 1;
      this.overlay.addEventListener("blur", () => this.finish());
      this.overlay.addEventListener("keydown", (e) => {
        // 阻止 textarea 自身的换行/焦点行为，统一走表格导航
        if (e.key === "Enter" || e.key === "Tab" || e.key === "Escape") {
          e.preventDefault();
        }
      });
    }
    this.overlay.value = this.pending.get(`${r},${c}`) ?? unescapeCell(this.data.rowsText[r][c]);
    cell.appendChild(this.overlay);
    this.overlay.focus();
    this.overlay.setSelectionRange(this.overlay.value.length, this.overlay.value.length);
  }

  /** 把当前编辑中的文本记入 pending，并同步到单元格显示层 */
  private stashActiveCell() {
    if (!this.overlay || this.activeRow < 0 || this.activeCol < 0) return;
    const key = `${this.activeRow},${this.activeCol}`;
    const text = this.overlay.value;
    this.pending.set(key, text);
    this.cellEls[this.activeRow][this.activeCol].textContent = unescapeCell(
      escapeCell(text)
    );
    this.cellEls[this.activeRow][this.activeCol].classList.remove("md-cell-active");
  }

  private onKeydown(e: KeyboardEvent) {
    if (!this.overlay || this.activeRow < 0 || e.isComposing) return;
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      this.addRowBelow();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      this.moveBy(1, 0);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) this.moveBy(0, -1);
      else this.moveBy(0, 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.finish();
    }
  }

  /** 相对移动；行末水平越界换行，末行继续下移 / 末格 Tab 时追加新行 */
  private moveBy(dr: number, dc: number) {
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
      this.addRowBelow();
      return;
    }
    this.openEditor(r, Math.min(c, (this.cellEls[r]?.length ?? 1) - 1));
  }

  /** pending 中与原文不同的单元格 → 文档替换（用建 widget 时的位置） */
  private collectChanges(): { from: number; to: number; insert: string }[] {
    const changes: { from: number; to: number; insert: string }[] = [];
    for (const [key, text] of this.pending) {
      const [r, c] = key.split(",").map(Number);
      const range = this.data.cellRanges[r]?.[c];
      if (!range) continue;
      const insert = escapeCell(text);
      if (insert !== this.data.rowsText[r][c]) {
        changes.push({ from: range.from, to: range.to, insert });
      }
    }
    return changes;
  }

  /** 在表格末尾追加一行（连同 pending 的文本改动合成一个事务） */
  private addRowBelow() {
    const view = this.view;
    if (!view) return;
    this.stashActiveCell();
    const changes = this.collectChanges();
    const rowText = "| " + Array(this.colCount).fill("").join(" | ") + " |";
    changes.push({ from: this.data.to, to: this.data.to, insert: `\n${rowText}` });
    // 新行打开编辑器的位置（当前列，越界取末列）
    pendingCellEdit = {
      tableFrom: this.data.from,
      row: this.rowCount,
      col: Math.min(this.activeCol, this.colCount - 1),
    };
    view.dispatch({ changes, selection: { anchor: this.data.to + rowText.length + 1 } });
  }

  /** 结束编辑：落盘全部改动并把光标放回文档（表格之后） */
  private finish() {
    const view = this.view;
    if (!view) return;
    this.stashActiveCell();
    const changes = this.collectChanges();
    const caret = Math.min(this.data.to, view.state.doc.length);
    this.teardown();
    if (changes.length > 0) {
      view.dispatch({ changes, selection: { anchor: caret } });
    } else {
      view.dispatch({ selection: { anchor: caret } });
    }
    view.focus();
  }

  private teardown() {
    this.overlay?.remove();
    this.overlay = null;
    for (const row of this.cellEls) for (const el of row) el.classList.remove("md-cell-active");
    this.pending.clear();
    this.activeRow = -1;
    this.activeCol = -1;
  }

  ignoreEvent() {
    return false;
  }
}

function same2D(a: string[][], b: string[][]): boolean {
  return (
    a.length === b.length &&
    a.every((row, i) => row.length === b[i].length && row.every((c, j) => c === b[i][j]))
  );
}

function sameRanges2D(a: TableCellRange[][], b: TableCellRange[][]): boolean {
  return (
    a.length === b.length &&
    a.every((row, i) =>
      row.length === b[i].length &&
      row.every((r, j) => r.from === b[i][j].from && r.to === b[i][j].to)
    )
  );
}

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
  const tables: { from: number; to: number; data: TableData }[] = [];
  const blockKindOf = (name: string): BlockKind | null => {
    if (/^(ATXHeading[1-6]|SetextHeading[12])$/.test(name)) return "heading";
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

  tree.iterate({
    enter: (iter) => {
      const node = iter.node;
      const parent = node.parent;
      const from = node.from;
      const to = node.to;

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
        // 顶层表格：常渲染（Typora 式），编辑在 widget 内完成，与光标位置无关
        if (node.name === "Table") {
          const data = tableDataOf(node, doc);
          if (data) tables.push({ from, to, data });
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

      // —— 行内：强调 / 删除线 / 行内代码（隐藏标记字符） ——
      if (node.name === "EmphasisMark") {
        if (
          parent &&
          (parent.name === "Emphasis" || parent.name === "StrongEmphasis") &&
          !selectionTouches(state, parent.from, parent.to)
        ) {
          hideChild(node);
        }
        return;
      }
      if (node.name === "StrikethroughMark") {
        if (
          parent &&
          parent.name === "Strikethrough" &&
          !selectionTouches(state, parent.from, parent.to)
        ) {
          hideChild(node);
        }
        return;
      }
      if (node.name === "CodeMark") {
        // FencedCode 的 fence 行在下方整行处理；这里只管行内代码的反引号
        if (
          parent &&
          parent.name === "InlineCode" &&
          !selectionTouches(state, parent.from, parent.to)
        ) {
          hideChild(node);
        }
        return;
      }

      // —— 链接：隐藏 [ ](url)，只剩链接文字 ——
      if (
        (node.name === "LinkMark" ||
          node.name === "URL" ||
          node.name === "LinkLabel" ||
          node.name === "LinkTitle") &&
        parent &&
        parent.name === "Link" &&
        !selectionTouches(state, parent.from, parent.to)
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
        if (!active) {
          const lang = codeInfoOf(node, doc);
          ranges.push(
            (lang
              ? Decoration.replace({ widget: new FenceWidget(lang) })
              : HIDE
            ).range(first.from, first.to)
          );
        }
        // 闭 fence 无条件隐藏；开 fence 光标进入时显示原文，便于修改语言标注
        if (hasClosing) {
          const r = hideRange(state, last.from, last.to);
          if (r) ranges.push(r);
        }
        return false;
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
      pushLineClass(firstLine.from, "md-quote-first");
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
            widget: new TableWidget(t.data, gap),
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
        // 表格结构操作后：在最新存活实例上恢复单元格编辑
        if (pendingCellEdit) {
          const pend = pendingCellEdit;
          pendingCellEdit = null;
          queueMicrotask(() => {
            liveTableWidgets.get(pend.tableFrom)?.restoreCellEdit(
              pend.row,
              pend.col,
            );
          });
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
