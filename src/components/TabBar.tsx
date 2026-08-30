import {
  Database,
  FileCode2,
  FileJson2,
  FileTerminal,
  FileText,
  LucideIcon,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EditorLanguage } from "../models/language";
import {
  closeOtherTabsAction,
  closeTabAction,
  closeTabsToRightAction,
  newTabAction,
} from "../state/actions";
import { EditorDocument, useDocuments } from "../state/documents";
import { moveDocToNewWindow, moveDocToWindow, otherEditorWindows } from "../state/windows";
import { ContextMenu, MenuItem } from "./ContextMenu";

const LANGUAGE_ICONS: Record<EditorLanguage, LucideIcon> = {
  plaintext: FileText,
  markdown: FileText,
  json: FileJson2,
  html: FileCode2,
  javascript: FileCode2,
  typescript: FileCode2,
  css: FileCode2,
  python: FileCode2,
  swift: FileCode2,
  shell: FileTerminal,
  yaml: FileCode2,
  ccpp: FileCode2,
  sql: Database,
};

export function languageIconOf(language: EditorLanguage) {
  return LANGUAGE_ICONS[language];
}

let measureContext: CanvasRenderingContext2D | null = null;

function measureText(text: string, font: string): number {
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return text.length * 8;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

export function truncateMiddle(text: string, maxWidth: number, font: string): string {
  if (measureText(text, font) <= maxWidth) return text;
  const ellipsis = "…";
  for (let keep = text.length - 1; keep >= 2; keep--) {
    const headLen = Math.ceil((keep - 1) / 2);
    const candidate =
      text.slice(0, headLen) + ellipsis + text.slice(text.length - (keep - 1 - headLen));
    if (measureText(candidate, font) <= maxWidth) return candidate;
  }
  return ellipsis;
}

interface MenuState {
  x: number;
  y: number;
  docId: string;
  otherWindows: string[];
}

export function TabBar() {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const setActive = useDocuments((s) => s.setActive);
  const reorder = useDocuments((s) => s.reorder);

  const barRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => setBarWidth(bar.clientWidth));
    observer.observe(bar);
    setBarWidth(bar.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !activeId) return;
    const el = scroller.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    if (el) {
      const left = el.offsetLeft - scroller.scrollLeft;
      const right = left + el.offsetWidth;
      if (left < 0 || right > scroller.clientWidth) {
        scroller.scrollTo({ left: el.offsetLeft - scroller.clientWidth / 2 + el.offsetWidth / 2 });
      }
    }
  }, [activeId]);

  const count = documents.length;
  const tabWidth = Math.min(208, Math.max(128, (barWidth - 64) / Math.max(1, count)));
  const tabFont = "14px 'Segoe UI', 'Noto Sans SC', sans-serif";

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", documents[index].id);
    const ghost = document.createElement("div");
    ghost.className = "tab-drag-ghost";
    ghost.style.width = `${Math.max(132, tabWidth + 31)}px`;
    ghost.textContent = documents[index].name;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 12, 16);
    window.setTimeout(() => ghost.remove(), 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (dragIndex === null) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    setDropIndex(before ? index : index + 1);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null && dropIndex !== null) {
      reorder(dragIndex, dropIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const renderTab = (doc: EditorDocument, index: number) => {
    const selected = doc.id === activeId;
    const hovered = hoverIndex === index;
    const Icon = languageIconOf(doc.language);
    const nameWidth = Math.max(40, tabWidth - 14 - 12 - 20 - 18);
    const showSeparator =
      index > 0 &&
      !selected &&
      !hovered &&
      hoverIndex !== index - 1 &&
      documents[index - 1].id !== activeId;

    return (
      <span key={doc.id} className="tab-slot">
        {dropIndex === index && dragIndex !== null && (
          <span className="tab-drop-indicator" />
        )}
        {showSeparator && <span className="tab-separator" />}
        <span
          data-tab-id={doc.id}
          className={
            "tab" + (selected ? " selected" : "") + (dragIndex === index ? " dragging" : "")
          }
          style={{ width: tabWidth }}
          draggable
          onMouseEnter={() => setHoverIndex(index)}
          onMouseLeave={() => setHoverIndex((h) => (h === index ? null : h))}
          onClick={() => setActive(doc.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            const cx = e.clientX;
            const cy = e.clientY;
            void otherEditorWindows().then((others) => {
              setMenu({ x: cx, y: cy, docId: doc.id, otherWindows: others });
            });
          }}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        >
          <Icon size={14} className={selected ? "tab-icon selected" : "tab-icon"} />
          <span className="tab-name">
            {truncateMiddle(doc.name, nameWidth, tabFont)}
          </span>
          <span className="tab-state">
            {doc.isDirty && !hovered && <span className="dirty-dot" />}
            {hovered && (
              <button
                className="tab-close"
                aria-label="关闭标签页"
                onClick={(e) => {
                  e.stopPropagation();
                  void closeTabAction(doc.id);
                }}
              >
                  <X size={11} strokeWidth={2} />
              </button>
            )}
          </span>
        </span>
      </span>
    );
  };

  const menuItems: MenuItem[] = menu
    ? [
        { label: "关闭", shortcut: "Ctrl+W", onClick: () => void closeTabAction(menu.docId) },
        { label: "关闭其他标签页", onClick: () => void closeOtherTabsAction(menu.docId) },
        { label: "关闭右侧标签页", onClick: () => void closeTabsToRightAction(menu.docId) },
        { label: "移入新窗口", onClick: () => void moveDocToNewWindow(menu.docId) },
        ...(menu.otherWindows.length > 0
          ? [
              {
                label: "移入其他窗口",
                onClick: () => void moveDocToWindow(menu.docId, menu.otherWindows[0]),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="tab-bar" ref={barRef}>
      <div
        className="tab-scroll"
        ref={scrollRef}
        onDragOver={(e) => {
          if (dragIndex !== null) e.preventDefault();
        }}
        onDrop={handleDrop}
      >
        {documents.map(renderTab)}
        {dropIndex === count && dragIndex !== null && (
          <span className="tab-drop-indicator end" />
        )}
        <span className="tab-end-zone" />
      </div>
      <button
        className="tab-new-button"
        aria-label="新建标签页"
        onClick={newTabAction}
      >
        <Plus size={14} />
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
