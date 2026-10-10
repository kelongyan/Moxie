import { EditorView } from "@codemirror/view";
import {
  clearCellEdit,
  deleteColEdit,
  deleteRowEdit,
  deleteTableEdit,
  emptyTable,
  findTableAt,
  formatTableChange,
  insertColEdit,
  insertRowEdit,
  locateCell,
  setAlignEdit,
  type TableEdit,
  type TableModel,
} from "./table";

/**
 * 表格交互层：结构操作（行/列/对齐/整理/删除）与菜单。渲染态表格 widget 在此注册，
 * 菜单动作经由 widget 执行——编辑中未落盘的单元格内容由 widget 合并进模型后
 * 整表重写（单事务、一步撤销）。「活动编辑格」标记供文档变化后恢复编辑位置。
 */

export interface TableSessionHost {
  readonly tableFrom: number;
  /** 执行结构操作：widget 先合并编辑中内容，再整表重写 */
  applyEdit(make: (model: TableModel) => TableEdit | null): void;
  /** 文档变化重建后恢复指定单元格的编辑 */
  restoreCellEdit(row: number, col: number): void;
}

/** 存活渲染表格注册表：按表格起点索引 */
export const liveTableWidgets = new Map<number, TableSessionHost>();

let activeEdit: { tableFrom: number; row: number; col: number } | null = null;

export function getActiveEdit(): { tableFrom: number; row: number; col: number } | null {
  return activeEdit;
}

export function setActiveEdit(edit: { tableFrom: number; row: number; col: number }) {
  activeEdit = edit;
}

/** 清除活动编辑标记（仅当属于指定表格——跨表格切换时不动新表格的标记） */
export function clearActiveEdit(tableFrom: number) {
  if (activeEdit?.tableFrom === tableFrom) activeEdit = null;
}

/** 结构操作后的光标落点：在新表格文本中定位第 caretRow 行第 caretCol 格 */
export function caretPosInTable(text: string, caretRow: number, caretCol: number): number {
  const lines = text.split("\n");
  const lineIdx = caretRow === 0 ? 0 : Math.min(caretRow + 1, lines.length - 1);
  const base = lines.slice(0, lineIdx).reduce((n, l) => n + l.length + 1, 0);
  const { ranges } = rowCells(lines[lineIdx]);
  const target = ranges[Math.max(0, Math.min(caretCol, ranges.length - 1))];
  return base + (target ? target.from : lines[lineIdx].length);
}

function rowCells(line: string): { ranges: { from: number; to: number }[] } {
  // 与 table.rowCellsFromLine 相同的管道切分（本地副本避免多一层导出）
  const ranges: { from: number; to: number }[] = [];
  const segs: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      i++;
      continue;
    }
    if (ch === "|") {
      if (start >= 0) segs.push({ start, end: i });
      start = i + 1;
    }
  }
  for (const seg of segs) {
    ranges.push({ from: seg.start, to: seg.end });
  }
  return { ranges };
}

/** 执行结构操作：优先经活跃 widget（合并编辑中内容），否则按当前文档直接重写 */
export function runTableEdit(
  view: EditorView,
  tableFrom: number,
  make: (model: TableModel) => TableEdit | null
): void {
  const host = liveTableWidgets.get(tableFrom);
  if (host) {
    host.applyEdit(make);
    return;
  }
  const model = findTableAt(view.state, tableFrom);
  if (!model) return;
  const edit = make(model);
  if (!edit) return;
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: {
      anchor: tableFrom + caretPosInTable(edit.insert, edit.caretRow, edit.caretCol),
    },
  });
  view.focus();
}

// —— 右键菜单 / 列头手柄菜单 ——

let openMenu: HTMLElement | null = null;

export function closeTableMenu() {
  openMenu?.remove();
  openMenu = null;
}

document.addEventListener(
  "mousedown",
  (e) => {
    if (openMenu && !openMenu.contains(e.target as Node)) closeTableMenu();
  },
  true
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTableMenu();
});

interface MenuSpec {
  label: string;
  run: () => void;
  separatorBefore?: boolean;
  danger?: boolean;
}

function showMenu(view: EditorView, items: MenuSpec[], x: number, y: number) {
  closeTableMenu();
  const menu = document.createElement("div");
  menu.className = "md-table-menu";
  menu.setAttribute("role", "menu");
  for (const item of items) {
    if (item.separatorBefore) {
      const divider = document.createElement("div");
      divider.className = "md-table-menu-divider";
      menu.appendChild(divider);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    if (item.danger) btn.className = "is-danger";
    btn.textContent = item.label;
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTableMenu();
      item.run();
    });
    menu.appendChild(btn);
  }
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - 170))}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - items.length * 30 - 30)}px`;
  document.body.appendChild(menu);
  openMenu = menu;
  view.focus();
}

/**
 * 表格菜单：col/at 未指定的右键全量菜单（行 + 列 + 对齐 + 整理），
 * 指定 col 时为列头手柄的列菜单，at 可显式指定操作目标格（右键不必先移动光标）。
 */
export function openTableMenu(
  view: EditorView,
  tableFrom: number,
  x: number,
  y: number,
  opts: { col?: number; at?: { row: number; col: number } } = {}
) {
  const state = view.state;
  const model = findTableAt(state, tableFrom);
  if (!model) return;
  const at =
    opts.at ??
    locateCell(model, state.selection.main.head) ?? {
      row: model.rows.length - 1,
      col: 0,
    };
  const activeCol = Math.max(0, opts.col ?? at.col);
  const currentColAlign = model.aligns[activeCol] ?? "left";
  const items: MenuSpec[] = [];

  if (opts.col === undefined) {
    items.push(
      {
        label: "在上方插入行",
        run: () =>
          runTableEdit(view, tableFrom, (m) =>
            insertRowAfterHeader(m, at.row, activeCol)
          ),
      },
      {
        label: "在下方插入行",
        run: () =>
          runTableEdit(view, tableFrom, (m) =>
            insertRowAfterHeader(m, at.row + 1, activeCol)
          ),
      },
      {
        label: "删除当前行",
        run: () => runTableEdit(view, tableFrom, (m) => deleteRowEdit(m, at.row)),
      }
    );
  }

  items.push(
    {
      label: "在左侧插入列",
      separatorBefore: opts.col === undefined,
      run: () => runTableEdit(view, tableFrom, (m) => insertColEdit(m, activeCol)),
    },
    {
      label: "在右侧插入列",
      run: () => runTableEdit(view, tableFrom, (m) => insertColEdit(m, activeCol + 1)),
    },
    {
      label: "删除当前列",
      run: () => runTableEdit(view, tableFrom, (m) => deleteColEdit(m, activeCol)),
    },
    {
      label: `${currentColAlign === "left" ? "✓ " : "   "}左对齐`,
      separatorBefore: true,
      run: () => runTableEdit(view, tableFrom, (m) => setAlignEdit(m, activeCol, "left")),
    },
    {
      label: `${currentColAlign === "center" ? "✓ " : "   "}居中对齐`,
      run: () => runTableEdit(view, tableFrom, (m) => setAlignEdit(m, activeCol, "center")),
    },
    {
      label: `${currentColAlign === "right" ? "✓ " : "   "}右对齐`,
      run: () => runTableEdit(view, tableFrom, (m) => setAlignEdit(m, activeCol, "right")),
    }
  );

  if (opts.col === undefined) {
    items.push(
      {
        label: "清空当前格",
        separatorBefore: true,
        run: () => runTableEdit(view, tableFrom, (m) => clearCellEdit(m, at.row, activeCol)),
      },
      {
        label: "整理表格",
        run: () => runTableEdit(view, tableFrom, (m) => formatTableChange(m)),
      },
      {
        label: "删除表格",
        separatorBefore: true,
        danger: true,
        run: () => runTableEdit(view, tableFrom, (m) => deleteTableEdit(m)),
      }
    );
  }

  showMenu(view, items, x, y);
}

/** 行插入不允许越过表头（新空行不能当表头） */
function insertRowAfterHeader(
  model: TableModel,
  at: number,
  col: number
): TableEdit | null {
  return insertRowEdit(model, Math.max(1, at), col);
}

/** 在光标处插入空表格（rows 含表头），插入后立即进入表头首格编辑 */
export function insertTableAtCursor(
  view: EditorView,
  rows: number,
  cols: number
): boolean {
  const head = view.state.selection.main.head;
  const inside = findTableAt(view.state, head);
  let insertAt: number;
  let prefix: string;
  if (inside) {
    // 光标在表格内（编辑中或选择残留）：插到该表格之后
    const line = view.state.doc.lineAt(inside.to);
    insertAt = line.to;
    prefix = "\n";
  } else {
    const line = view.state.doc.lineAt(head);
    insertAt = line.to;
    prefix = line.text.trim() === "" ? "" : "\n";
    // 目标是空行但其上一行是表格行时，需再空一行，否则两张表会被解析合并
    if (prefix === "" && insertAt > 0) {
      const prev = view.state.doc.lineAt(insertAt - 1);
      if (/^\s*\|.*\|\s*$/.test(prev.text)) prefix = "\n";
    }
  }
  const { text } = emptyTable(rows, cols);
  const tableFrom = insertAt + prefix.length;
  setActiveEdit({ tableFrom, row: 0, col: 0 });
  view.dispatch({
    changes: { from: insertAt, insert: prefix + text + "\n" },
    selection: { anchor: tableFrom + 2 },
    userEvent: "input",
  });
  view.focus();
  return true;
}
