import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { useDocuments } from "../state/documents";
import { useSidebar } from "../state/sidebar";
import { openSettingsWindow } from "../state/settingsWindow";
import { subscribeTextChange, viewFor } from "../editor/registry";

function SectionHeader(props: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="section-header" onClick={props.onToggle}>
      <ChevronRight
        size={11}
        className={"section-chevron" + (props.expanded ? " expanded" : "")}
      />
      <span className="section-title">{props.title}</span>
      <span className="section-count">{props.count}</span>
      <span className="spacer" />
      {props.trailing}
    </div>
  );
}

// ---------- 大纲（当前文档标题导航） ----------

interface OutlineItem {
  level: number;
  text: string;
  from: number;
}

function stripHeadingMarks(text: string): string {
  return text
    .replace(/^\s*#{1,6}[ \t]+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // 括号包裹的裸链接（全角/半角）与散落 URL 一并去掉，避免长链撑爆标题行
    .replace(/[（(]\s*https?:\/\/[^）)]*[）)]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractOutline(view: EditorView): OutlineItem[] {
  const items: OutlineItem[] = [];
  syntaxTree(view.state).iterate({
    enter: (iter) => {
      const m = /^(ATXHeading([1-6])|SetextHeading([12]))$/.exec(iter.node.name);
      if (!m) return;
      const line = view.state.doc.lineAt(iter.from);
      items.push({
        level: Number(m[2] ?? m[3]),
        text: stripHeadingMarks(line.text),
        from: iter.from,
      });
    },
  });
  return items;
}

/** 光标所在位置对应的当前标题（最后一个 from ≤ 光标行首的标题） */
function computeActiveFrom(
  view: EditorView,
  items: OutlineItem[],
  cursorLine: number
): number | null {
  const line = Math.min(Math.max(1, cursorLine), view.state.doc.lines);
  const head = view.state.doc.line(line).from;
  let current: number | null = null;
  for (const item of items) {
    if (item.from <= head) current = item.from;
    else break;
  }
  return current;
}

function OutlineSection({ activeId }: { activeId: string | null }) {
  const sidebar = useSidebar();
  const [items, setItems] = useState<OutlineItem[]>([]);
  // 光标行（store 里的行列号）驱动当前标题高亮
  const cursorLine = useDocuments(
    (s) => s.documents.find((d) => d.id === activeId)?.cursorLine ?? 0
  );

  useEffect(() => {
    if (!activeId) {
      setItems([]);
      return;
    }
    let timer: number | null = null;
    const refresh = () => {
      const view = viewFor(activeId);
      if (!view) {
        setItems([]);
        return;
      }
      setItems(extractOutline(view));
    };
    refresh();
    // 编辑防抖刷新（notifyTextChange 在每次文档变更时触发）
    const unsubscribe = subscribeTextChange(activeId, () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 300);
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeId]);

  // 当前标题是派生状态：items 或光标行任一变化即重算，无提交时序问题
  const activeFrom = useMemo(() => {
    const view = activeId ? viewFor(activeId) : undefined;
    if (!view || cursorLine <= 0) return null;
    return computeActiveFrom(view, items, cursorLine);
  }, [items, cursorLine, activeId]);

  const jump = (item: OutlineItem) => {
    const view = activeId ? viewFor(activeId) : undefined;
    if (!view) return;
    view.dispatch({
      selection: { anchor: item.from },
      effects: EditorView.scrollIntoView(item.from, { y: "center" }),
    });
    view.focus();
  };

  if (!activeId) return null;
  return (
    <div className="nav-section">
      <SectionHeader
        title="大纲"
        count={items.length}
        expanded={sidebar.sectionsExpanded.outline}
        onToggle={() => sidebar.toggleSection("outline")}
      />
      {sidebar.sectionsExpanded.outline &&
        (items.length === 0 ? (
          <div className="section-empty">暂无标题</div>
        ) : (
          <div className="outline-list" role="list">
            {items.map((item, idx) => (
              <button
                key={`${item.from}-${idx}`}
                role="listitem"
                className={`outline-row lvl-${Math.min(item.level, 6)}` +
                  (item.from === activeFrom ? " active" : "")}
                style={{ paddingLeft: 6 + Math.min(item.level, 5) * 14 }}
                title={item.text}
                onClick={() => jump(item)}
              >
                {item.text || "(空标题)"}
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

export function SidebarView() {
  const activeId = useDocuments((s) => s.activeId);

  return (
    <div className="sidebar-content">
      <div className="sidebar-scroll">
        {activeId ? (
          <OutlineSection activeId={activeId} />
        ) : (
          <div className="sidebar-empty">打开文档后，这里会显示它的大纲导航。</div>
        )}
      </div>

      <div className="sidebar-footer">
        <button
          className="sidebar-settings"
          onClick={() => void openSettingsWindow()}
        >
          <Settings size={14} />
          <span>设置</span>
        </button>
      </div>
    </div>
  );
}
