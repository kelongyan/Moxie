import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDocuments } from "../state/documents";
import { viewFor } from "../editor/registry";
import { useHistoryOverlay } from "../state/historyOverlay";
import { promptConfirm } from "../state/prompts";

interface Entry {
  timestampMs: number;
  size: number;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** 历史版本浮层：列出当前文档的写盘快照，可回滚或以新标签查看 */
export function HistoryOverlay() {
  const hide = useHistoryOverlay((s) => s.hide);
  const doc = useDocuments((s) =>
    s.documents.find((d) => d.id === s.activeId) ?? null
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!doc?.path) return;
    void invoke<Entry[]>("timeline_list", { path: doc.path })
      .then((list) => setEntries(list ?? []))
      .catch(() => setEntries([]));
  }, [doc?.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, entries.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries.length, hide]);

  const rollback = async (ts: number) => {
    if (!doc || busy) return;
    const ok = await promptConfirm(
      "回滚到历史版本",
      `“${doc.name}”的当前内容将被该历史版本覆盖（可先手动保存留底）,确定吗?`,
      "回滚",
      true
    );
    if (!ok) return;
    setBusy(true);
    try {
      const content = await invoke<string>("timeline_read", {
        path: doc.path,
        timestampMs: ts,
      });
      const view = viewFor(doc.id);
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: { anchor: 0 },
        userEvent: "input",
      });
      view.focus();
      hide();
    } catch {
      useDocuments.getState().setStatus({ text: "读取历史版本失败", kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const openAsTab = async (ts: number) => {
    if (!doc || busy) return;
    setBusy(true);
    try {
      const content = await invoke<string>("timeline_read", {
        path: doc.path,
        timestampMs: ts,
      });
      useDocuments.getState().addRestored({
        name: `${doc.name.replace(/\.md$/i, "")} (历史)`,
        path: null,
        text: content,
        savedText: content,
        isDirty: false,
      });
      hide();
    } catch {
      useDocuments.getState().setStatus({ text: "读取历史版本失败", kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="quick-open-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="quick-open" role="dialog" aria-label="历史版本">
        <div className="quick-open-search">
          <span>历史版本{doc ? ` · ${doc.name}` : ""}</span>
        </div>
        <div className="quick-open-list">
          {entries.length === 0 ? (
            <div className="quick-open-empty">暂无历史版本（保存后自动记录）</div>
          ) : (
            entries.map((entry, idx) => (
              <button
                key={entry.timestampMs}
                data-idx={idx}
                className={"quick-open-item" + (idx === selected ? " selected" : "")}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => void openAsTab(entry.timestampMs)}
              >
                <span className="quick-open-name">{formatTime(entry.timestampMs)}</span>
                <span className="quick-open-dir">{formatSize(entry.size)}</span>
              </button>
            ))
          )}
        </div>
        {entries.length > 0 && (
          <div className="history-actions">
            <span className="history-hint">回车/点击行=新标签查看</span>
            <span className="spacer" />
            <button
              className="find-button"
              disabled={busy}
              onClick={() => void rollback(entries[selected]?.timestampMs)}
            >
              回滚到此版本
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
