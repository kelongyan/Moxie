import { Fragment, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check } from "lucide-react";

export interface MenuItem {
  label: string;
  danger?: boolean;
  checked?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 210;
const ITEM_HEIGHT = 30;

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    itemRefs.current[0]?.focus();
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown"
        ? (idx + 1) % buttons.length
        : (idx - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH);
  const clampedY = Math.min(y, window.innerHeight - items.length * ITEM_HEIGHT - 16);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: clampedX, top: clampedY }}
      role="menu"
      onKeyDown={onListKeyDown}
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {item.separatorBefore && index > 0 && (
            <div className="context-menu-sep" />
          )}
          <button
            role="menuitem"
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={item.danger ? "danger" : undefined}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          >
            <span className="cm-check">
              {item.checked && <Check size={13} strokeWidth={2.5} />}
            </span>
            <span className="cm-label">{item.label}</span>
            {item.shortcut && <span className="cm-shortcut">{item.shortcut}</span>}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
