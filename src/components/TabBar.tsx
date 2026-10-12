import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeOtherTabsAction,
  closeTabAction,
  closeTabsToRightAction,
  newTabAction,
} from "../state/actions";
import { EditorDocument, useDocuments } from "../state/documents";
import { moveDocToNewWindow, moveDocToWindow, otherEditorWindows } from "../state/windows";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface MenuState {
  x: number;
  y: number;
  docId: string;
  otherWindows: string[];
}

/** 活动标签底部滑轨的目标位置（相对滚动容器内容坐标，translateX 直接可用） */
interface IndicatorTarget {
  x: number;
  width: number;
}

export function TabBar() {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const setActive = useDocuments((s) => s.setActive);
  const reorder = useDocuments((s) => s.reorder);

  const barRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const indicatorPos = useRef<IndicatorTarget | null>(null);
  const [barWidth, setBarWidth] = useState(0);
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

  /**
   * 活动标签底部滑轨：独立元素（不随标签重建），贴住标签文字（.tab-name）。
   * 切换标签时从上一位置 S 型滑到新位置（WAAPI 280ms）；布局变化时直接落位。
   * 指示器挂在滚动容器内（内容坐标），滚动时天然随内容移动，无需补偿。
   */
  const placeIndicator = useCallback(
    (animate: boolean) => {
      const indicator = indicatorRef.current;
      const scroller = scrollRef.current;
      if (!indicator || !scroller) return;
      const activeTab = activeId
        ? scroller.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)
        : null;
      if (!activeTab) {
        indicator.style.opacity = "0";
        indicatorPos.current = null;
        return;
      }
      const name = activeTab.querySelector<HTMLElement>(".tab-name");
      const measureEl = name ?? activeTab;
      const scrollerRect = scroller.getBoundingClientRect();
      const rect = measureEl.getBoundingClientRect();
      const target: IndicatorTarget = {
        x: rect.left - scrollerRect.left + scroller.scrollLeft,
        width: rect.width,
      };
      const prev = indicatorPos.current;
      indicatorPos.current = target;
      indicator.style.opacity = "1";
      indicator.style.transform = `translateX(${target.x}px)`;
      indicator.style.width = `${target.width}px`;
      if (
        animate &&
        prev &&
        (prev.x !== target.x || prev.width !== target.width)
      ) {
        indicator.animate(
          [
            { transform: `translateX(${prev.x}px)`, width: `${prev.width}px` },
            { transform: `translateX(${target.x}px)`, width: `${target.width}px` },
          ],
          { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      }
      if (animate) {
        // 活动标签字号过渡（13→14px）会改变文字宽度，动画结束后再校准一次
        window.setTimeout(() => placeIndicator(false), 260);
      }
    },
    [activeId]
  );

  useEffect(() => {
    placeIndicator(true);
  }, [activeId, documents.length, barWidth, placeIndicator]);

  const handleDragStart = (e: React.DragEvent, index: number, el: HTMLElement) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", documents[index].id);
    const ghost = document.createElement("div");
    ghost.className = "tab-drag-ghost";
    ghost.style.width = `${Math.max(120, el.offsetWidth)}px`;
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

    return (
      <span key={doc.id} className="tab-slot">
        {dropIndex === index && dragIndex !== null && (
          <span className="tab-drop-indicator" />
        )}
        <span
          data-tab-id={doc.id}
          className={
            "tab" + (selected ? " selected" : "") + (dragIndex === index ? " dragging" : "")
          }
          draggable
          onClick={() => setActive(doc.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            const cx = e.clientX;
            const cy = e.clientY;
            void otherEditorWindows().then((others) => {
              setMenu({ x: cx, y: cy, docId: doc.id, otherWindows: others });
            });
          }}
          onDragStart={(e) => handleDragStart(e, index, e.currentTarget as HTMLElement)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        >
          <span className="tab-name">{doc.name}</span>
          {doc.isDirty && <span className="dirty-dot" title="有未保存更改" />}
          <button
            className="tab-close"
            aria-label="关闭标签页"
            title="关闭标签页 (Ctrl+W)"
            onClick={(e) => {
              e.stopPropagation();
              void closeTabAction(doc.id);
            }}
          >
            <X size={12} />
          </button>
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

  const count = documents.length;

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
        {/* 活动标签底部滑轨：独立元素，WAAPI 接管滑动 */}
        <span className="tab-indicator" ref={indicatorRef} />
      </div>
      <button
        className="tab-new-button"
        aria-label="新建标签页"
        onClick={newTabAction}
      >
        <Plus size={14} />
      </button>
      {/* 拖拽区放在滚动容器之外：既不会被裁掉，也不随标签滚动 */}
      <span className="tab-end-zone" data-tauri-drag-region />
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
