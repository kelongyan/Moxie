import { ReactNode, useRef, useState } from "react";

interface TooltipProps {
  label: string;
  shortcut?: string;
  children: ReactNode;
}

const DELAY_MS = 600;

export function Tooltip({ label, shortcut, children }: TooltipProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const timer = useRef<number | null>(null);

  const handleEnter = (anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    timer.current = window.setTimeout(() => {
      const x = rect.left + rect.width / 2;
      let y = rect.bottom + 7;
      if (y + 34 > window.innerHeight) {
        y = rect.top - 7 - 28;
      }
      setPosition({ x, y });
    }, DELAY_MS);
  };

  const handleLeave = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setPosition(null);
  };

  return (
    <span
      className="tooltip-anchor"
      onMouseEnter={(e) => handleEnter(e.currentTarget)}
      onMouseLeave={handleLeave}
    >
      {children}
      {position && (
        <span
          className="lac-tooltip"
          style={{ left: position.x, top: position.y }}
          role="tooltip"
        >
          {label}
          {shortcut && <span className="shortcut">{shortcut}</span>}
        </span>
      )}
    </span>
  );
}
