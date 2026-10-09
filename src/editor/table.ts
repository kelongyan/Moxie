import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { EditorState, Text } from "@codemirror/state";

/**
 * GFM 表格的源码层：解析（光标定位）、结构变换（行/列/对齐/格式化）全部
 * 以「整表重写」为统一手段——任何结构操作都产出新表格文本，一次事务替换
 * [from, to]，从根上消灭"编辑中内容 + 原始坐标"双轨合并的错位问题。
 */

export type ColumnAlign = "left" | "center" | "right" | null;

export interface TableCellRef {
  /** 单元格内容（保留 \| 转义原文），首尾空白已剥离 */
  text: string;
  /** 文档坐标：trim 后的内容范围（Tab 落格/全选、渲染态点击落点都用它） */
  from: number;
  to: number;
}

export interface TableModel {
  /** 表格块范围（不含末行换行符） */
  from: number;
  to: number;
  /** rows[0] = 表头；其后是数据行。不含分隔行 */
  rows: TableCellRef[][];
  /** 每列对齐（分隔行解析，缺省 null = 左对齐不写标记） */
  aligns: ColumnAlign[];
}

/** 单元格显示态：源码里的 \| 显示为 | */
export const unescapeCell = (s: string): string => s.replace(/\\\|/g, "|");
/** 编辑输入写回文档：字面 | 转义为 \|，换行折叠为空格（GFM 单元格不能换行） */
export const escapeCell = (s: string): string =>
  s.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();

/** 空单元格行兜底：lezer 对全空行（|  |  |）不产 TableCell，
 *  按行文本切分顶层管道还原单元格文本与（可插入的）文档位置 */
export function rowCellsFromLine(
  lineText: string,
  lineFrom: number
): { texts: string[]; ranges: { from: number; to: number }[] } {
  const texts: string[] = [];
  const ranges: { from: number; to: number }[] = [];
  const segs: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i < lineText.length; i++) {
    const ch = lineText[i];
    if (ch === "\\" && lineText[i + 1] === "|") {
      i++;
      continue;
    }
    if (ch === "|") {
      segs.push({ start, end: i });
      start = i + 1;
    }
  }
  segs.push({ start, end: lineText.length });
  // 边缘段：前导/尾管道产生的空段丢弃；非空边缘段是 GFM 省略管道的单元格
  for (let i = 0; i < segs.length; i++) {
    const edge = i === 0 || i === segs.length - 1;
    let s = segs[i].start;
    let e = segs[i].end;
    while (s < e && (lineText[s] === " " || lineText[s] === "	")) s++;
    while (e > s && (lineText[e - 1] === " " || lineText[e - 1] === "	")) e--;
    if (edge && s >= e) continue;
    texts.push(lineText.slice(s, e));
    ranges.push({ from: lineFrom + s, to: lineFrom + e });
  }
  return { texts, ranges };
}

/** 解析分隔行 `| :--- | :---: | ---: |` 的对齐；非分隔行返回 null */
export function parseAlignments(lineText: string): ColumnAlign[] | null {
  const cells = rowCellsFromLine(lineText, 0).texts;
  if (cells.length === 0) return null;
  const aligns: ColumnAlign[] = [];
  for (const raw of cells) {
    const c = raw.trim();
    if (!/^:?-{1,}:?$/.test(c)) return null;
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    aligns.push(left && right ? "center" : right ? "right" : left ? "left" : null);
  }
  return aligns;
}

/** 行节点 → 单元格引用。一律按行文本管道切分：lezer 对空单元格不产
 *  TableCell，"内容 + 空"混排行会丢列；管道切分还天然处理 \| 转义 */
function cellsOfRowNode(n: SyntaxNode, doc: Text): TableCellRef[] {
  const line = doc.lineAt(n.from);
  const { texts, ranges } = rowCellsFromLine(line.text, line.from);
  return texts.map((text, i) => ({ text, ...ranges[i] }));
}

/** pos 是否位于 GFM 表格节点内；是则返回完整模型（rows[0] 为表头） */
export function findTableAt(state: EditorState, pos: number): TableModel | null {
  const doc = state.doc;
  if (doc.length === 0) return null;
  const clamped = Math.min(Math.max(0, pos), doc.length);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(clamped, -1);
  // 行首可能落在前一节点末尾，换 side 再试一次
  if (node.name !== "Table") {
    node = syntaxTree(state).resolveInner(clamped, 1);
  }
  while (node && node.name !== "Table") node = node.parent;
  if (!node) return null;
  return tableModelOf(node, doc);
}

export function tableModelOf(node: SyntaxNode, doc: Text): TableModel | null {
  const rows: TableCellRef[][] = [];
  let aligns: ColumnAlign[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === "TableHeader") {
      rows.push(cellsOfRowNode(c, doc));
    } else if (c.name === "TableDelimiter") {
      aligns = parseAlignments(doc.lineAt(c.from).text) ?? [];
    } else if (c.name === "TableRow") {
      rows.push(cellsOfRowNode(c, doc));
    }
  }
  if (rows.length === 0) return null;
  // node.to 可能包含末行之后的换行符；以末行内容结尾为准
  const lastLine = doc.lineAt(Math.max(0, node.to - 1));
  return { from: node.from, to: lastLine.to, rows, aligns };
}

/** 光标（pos）所在单元格；pos 在表格行范围之外返回 null。
 *  行内间隙（管道、行首 "| "、行尾）就近归属：格前间隙归该格，行尾归末列 */
export function locateCell(
  model: TableModel,
  pos: number
): { row: number; col: number } | null {
  for (let r = 0; r < model.rows.length; r++) {
    const cells = model.rows[r];
    if (cells.length === 0) continue;
    const prev = model.rows[r - 1];
    const rowStart = r === 0 ? model.from : (prev[prev.length - 1]?.to ?? model.from);
    const next = model.rows[r + 1];
    const rowEnd = next ? (next[0]?.from ?? model.to) : model.to;
    if (pos < rowStart || pos > rowEnd) continue;
    for (let c = 0; c < cells.length; c++) {
      if (pos <= cells[c].to) return { row: r, col: c };
    }
    return { row: r, col: cells.length - 1 };
  }
  return null;
}

/** CJK/全角按 2 列计的显示宽度（等宽字体下与源码列位对齐） */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    w +=
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x20000
        ? 2
        : 1;
  }
  return w;
}

const padCell = (text: string, align: ColumnAlign, width: number): string => {
  const gap = Math.max(0, width - displayWidth(text));
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") {
    const l = Math.floor(gap / 2);
    return " ".repeat(l) + text + " ".repeat(gap - l);
  }
  return text + " ".repeat(gap);
};

const sepOf = (align: ColumnAlign, width: number): string => {
  if (align === "left") return ":" + "-".repeat(Math.max(2, width - 1));
  if (align === "right") return "-".repeat(Math.max(2, width - 1)) + ":";
  if (align === "center") return ":" + "-".repeat(Math.max(1, width - 2)) + ":";
  return "-".repeat(Math.max(3, width));
};

/** 把模型物化为对齐排列的表格源码（结构操作与自动格式化共用出口） */
export function buildTable(model: TableModel): string {
  const colCount = Math.max(
    model.aligns.length,
    ...model.rows.map((r) => r.length),
    1
  );
  const aligns: ColumnAlign[] = [];
  for (let c = 0; c < colCount; c++) aligns.push(model.aligns[c] ?? null);
  const cells: string[][] = model.rows.map((row) => {
    const out: string[] = [];
    // 单元格文本是源码直出（\| 转义已就位），物化时只做宽度补齐
    for (let c = 0; c < colCount; c++) out.push(row[c]?.text ?? "");
    return out;
  });
  const widths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let w = 3;
    for (const row of cells) w = Math.max(w, displayWidth(row[c]));
    widths.push(w);
  }
  const lines: string[] = [];
  lines.push("| " + cells[0].map((t, c) => padCell(t, aligns[c], widths[c])).join(" | ") + " |");
  lines.push("| " + aligns.map((a, c) => sepOf(a, widths[c])).join(" | ") + " |");
  for (let r = 1; r < cells.length; r++) {
    lines.push("| " + cells[r].map((t, c) => padCell(t, aligns[c], widths[c])).join(" | ") + " |");
  }
  return lines.join("\n");
}

/** 表格 → 整理事务（整表对齐重写）；光标保持在 pos 所在格 */
export function formatTableChange(model: TableModel, pos?: number): TableEdit {
  const at =
    (pos !== undefined ? locateCell(model, pos) : null) ?? { row: 0, col: 0 };
  return {
    from: model.from,
    to: model.to,
    insert: buildTable(model),
    caretRow: at.row,
    caretCol: at.col,
  };
}

export interface TableEdit {
  /** 表格块替换范围 */
  from: number;
  to: number;
  insert: string;
  /** 操作完成后光标落点（相对新表格的行列） */
  caretRow: number;
  caretCol: number;
}

function editOf(model: TableModel, rows: TableCellRef[][], aligns: ColumnAlign[], caret: { row: number; col: number }): TableEdit {
  const next: TableModel = { from: model.from, to: model.to, rows, aligns };
  return {
    from: model.from,
    to: model.to,
    insert: buildTable(next),
    caretRow: caret.row,
    caretCol: caret.col,
  };
}

/** plain cell → TableCellRef（坐标占位，编辑后由 buildTable 重新物化） */
const rawCell = (text: string): TableCellRef => ({ text, from: 0, to: 0 });

export function insertRowEdit(
  model: TableModel,
  /** 新行插到 rows[at] 之前；at = rows.length 表示追加 */
  at: number,
  col: number
): TableEdit | null {
  if (at < 0 || at > model.rows.length) return null;
  const colCount = Math.max(model.aligns.length, ...model.rows.map((r) => r.length));
  const rows = [...model.rows];
  const cells: TableCellRef[] = [];
  for (let c = 0; c < colCount; c++) cells.push(rawCell(""));
  rows.splice(at, 0, cells);
  return editOf(model, rows, model.aligns, { row: at, col: Math.max(0, Math.min(col, colCount - 1)) });
}

export function deleteRowEdit(model: TableModel, row: number): TableEdit | null {
  if (row < 0 || row >= model.rows.length || model.rows.length <= 1) return null;
  const rows = model.rows.filter((_, i) => i !== row);
  const at = Math.max(0, Math.min(row, rows.length - 1));
  return editOf(model, rows, model.aligns, { row: at, col: 0 });
}

export function insertColEdit(model: TableModel, at: number): TableEdit | null {
  const colCount = Math.max(model.aligns.length, ...model.rows.map((r) => r.length));
  if (at < 0 || at > colCount) return null;
  const rows = model.rows.map((row) => {
    const cells = [...row];
    const pos = Math.max(0, Math.min(at, cells.length));
    cells.splice(pos, 0, rawCell(""));
    return cells;
  });
  const aligns = [...model.aligns];
  aligns.splice(Math.max(0, Math.min(at, aligns.length)), 0, null);
  return editOf(model, rows, aligns, { row: 0, col: at });
}

export function deleteColEdit(model: TableModel, col: number): TableEdit | null {
  const colCount = Math.max(model.aligns.length, ...model.rows.map((r) => r.length));
  if (colCount <= 1 || col < 0 || col >= colCount) return null;
  const rows = model.rows.map((row) => row.filter((_, c) => c !== col));
  const aligns = model.aligns.filter((_, c) => c !== col);
  return editOf(model, rows, aligns, { row: 0, col: Math.max(0, col - 1) });
}

export function setAlignEdit(
  model: TableModel,
  col: number,
  align: ColumnAlign
): TableEdit | null {
  const colCount = Math.max(model.aligns.length, ...model.rows.map((r) => r.length));
  if (col < 0 || col >= colCount) return null;
  const aligns: ColumnAlign[] = [];
  for (let c = 0; c < colCount; c++) aligns.push(model.aligns[c] ?? null);
  aligns[col] = align;
  return editOf(model, model.rows, aligns, { row: 0, col });
}

/** 新建空表格源码（1 表头 + rows-1 数据行 × cols），返回文本与表头首格光标偏移 */
export function emptyTable(rows: number, cols: number): { text: string; caret: number } {
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  const model: TableModel = {
    from: 0,
    to: 0,
    rows: Array.from({ length: r }, () => Array.from({ length: c }, () => rawCell(""))),
    aligns: Array.from({ length: c }, () => null),
  };
  const text = buildTable(model);
  // 表头首格内容起点："| " 之后
  return { text, caret: 2 };
}
