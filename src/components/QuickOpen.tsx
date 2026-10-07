import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { baseName } from "../models/markdown";
import { openPathAction } from "../state/actions";
import { useDocuments } from "../state/documents";
import { dirName, useSidebar } from "../state/sidebar";
import { useQuickOpen } from "../state/quickOpen";

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
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索最近文件…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="quick-open-list" ref={listRef}>
          {results.length === 0 ? (
            <div className="quick-open-empty">没有匹配的文件</div>
          ) : (
            results.map(({ entry }, idx) => (
              <button
                key={entry.path}
                data-idx={idx}
                className={
                  "quick-open-item" +
                  (idx === selected ? " selected" : "") +
                  (entry.path === activePath ? " is-open" : "")
                }
                title={entry.path}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => open(entry.path)}
              >
                <span className="quick-open-name">{baseName(entry.path)}</span>
                <span className="quick-open-dir">{dirName(entry.path)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
