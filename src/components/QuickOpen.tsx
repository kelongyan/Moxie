import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { baseName } from "../models/markdown";
import { openPathAction } from "../state/actions";
import { useDocuments } from "../state/documents";
import { dirName, useSidebar } from "../state/sidebar";
import { useQuickOpen } from "../state/quickOpen";

/** 关键字匹配高亮 */
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="quick-open-match">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/** 名称前缀 > 名称包含 > 路径子序列；null = 不命中 */
function scoreOf(name: string, path: string, query: string): number | null {
  if (!query) return 1;
  const n = name.toLowerCase();
  const p = path.toLowerCase();
  const q = query.toLowerCase();
  if (n.startsWith(q)) return 100;
  if (n.includes(q)) return 80;
  let i = 0;
  for (const ch of p) {
    if (ch === q[i]) i += 1;
    if (i >= q.length) break;
  }
  return i >= q.length ? 40 : null;
}

const MAX_RESULTS = 20;

export function QuickOpen() {
  const hide = useQuickOpen((s) => s.hide);
  const recent = useSidebar((s) => s.recent);
  const missing = useSidebar((s) => s.missing);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    return recent
      .filter((e) => !missing[e.path])
      .map((e) => ({ entry: e, score: scoreOf(baseName(e.path), e.path, query.trim()) }))
      .filter((x): x is { entry: (typeof recent)[number]; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || b.entry.lastOpenedMs - a.entry.lastOpenedMs)
      .slice(0, MAX_RESULTS);
  }, [recent, missing, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const open = (path: string) => {
    hide();
    void openPathAction(path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[selected];
      if (item) open(item.entry.path);
    }
  };

  const activePath = useDocuments((s) =>
    s.documents.find((d) => d.id === s.activeId)?.path ?? null
  );

  return (
    <div
      className="quick-open-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div className="quick-open" role="dialog" aria-label="快速打开">
        <div className="quick-open-search">
          <Search size={15} className="quick-open-search-icon" />
          <input
            ref={inputRef}
            value={query}
            placeholder="键入文件名搜索最近文档…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {query && (
            <button
              type="button"
              className="quick-open-clear-btn"
              title="清空搜索"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="quick-open-list" ref={listRef}>
          {results.length === 0 ? (
            <div className="quick-open-empty">
              <FileText size={24} className="quick-open-empty-icon" />
              <span>没有找到匹配的文档</span>
            </div>
          ) : (
            results.map(({ entry }, idx) => {
              const name = baseName(entry.path);
              const dir = dirName(entry.path);
              const isOpen = entry.path === activePath;
              return (
                <button
                  key={entry.path}
                  data-idx={idx}
                  className={
                    "quick-open-item" +
                    (idx === selected ? " selected" : "") +
                    (isOpen ? " is-open" : "")
                  }
                  title={entry.path}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => open(entry.path)}
                >
                  <FileText size={14} className="quick-open-file-icon" />
                  <span className="quick-open-name">{highlightMatch(name, query)}</span>
                  {isOpen && <span className="quick-open-tag">当前</span>}
                  <span className="quick-open-dir">{dir}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="quick-open-footer">
          <div className="quick-open-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> 移动</span>
            <span><kbd>↵</kbd> 打开</span>
            <span><kbd>Esc</kbd> 退出</span>
          </div>
          <div className="quick-open-count">{results.length} 项</div>
        </div>
      </div>
    </div>
  );
}
