import { useEffect, useRef, useState } from "react";
import { useDocuments } from "../state/documents";
import { useTableInsert } from "../state/tableInsert";
import { viewFor } from "../editor/registry";
import { insertTableAtCursor } from "../editor/tableNav";

const MAX_ROWS = 10;
const MAX_COLS = 8;

/** 插入表格的行列选择网格：悬停预览 N 行 × M 列，点击确认（Ctrl+Shift+T） */
export function TableInsertPicker() {
  const hide = useTableInsert((s) => s.hide);
  const activeId = useDocuments((s) => s.activeId);
  const [size, setSize] = useState({ rows: 3, cols: 3 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hide]);

  const confirm = (rows: number, cols: number) => {
    hide();
    const view = activeId ? viewFor(activeId) : null;
    if (view) insertTableAtCursor(view, rows, cols);
  };

  return (
    <div
      className="quick-open-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div
        ref={panelRef}
        className="table-picker"
        role="dialog"
        aria-modal="true"
        aria-label="插入表格"
        tabIndex={-1}
      >
        <div className="table-picker-title">插入表格</div>
        <div className="table-picker-grid" onMouseLeave={() => setSize({ rows: 3, cols: 3 })}>
          {Array.from({ length: MAX_ROWS }, (_, r) => (
            <div className="table-picker-row" key={r}>
              {Array.from({ length: MAX_COLS }, (_, c) => {
                const rows = r + 1;
                const cols = c + 1;
                const inRange = rows <= size.rows && cols <= size.cols;
                return (
                  <button
                    key={c}
                    type="button"
                    className={"table-picker-cell" + (inRange ? " in-range" : "")}
                    aria-label={`${rows} 行 ${cols} 列`}
                    onMouseEnter={() => setSize({ rows, cols })}
                    onClick={() => confirm(rows, cols)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="table-picker-hint">
          {size.rows} 行 × {size.cols} 列 · 点击确认，Esc 取消
        </div>
      </div>
    </div>
  );
}
