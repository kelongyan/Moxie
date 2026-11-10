import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../prefs/SettingsContext";
import { announce } from "../ui/announce";
import { AssistantIcon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";
import { Presence } from "../ui/usePresence";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import "./moxie-ai-switch.css";

/** How long "Pause for an hour" keeps Moxie AI off. */
export const MOXIE_AI_PAUSE_MS = 60 * 60 * 1000;

/** Moxie AI's master switch and the ways to flip it. Turning it on or off
 *  clears a pause. `toggle` announces the new state, since nothing under the
 *  focus changes when the menu or shortcut flips it. */
export function useMoxieAi() {
  const { t, settings, setSettings } = useSettings();
  const on = settings.moxieAi;
  const set = (next: boolean) =>
    setSettings({ moxieAi: next, moxieAiResumeAt: null });
  return {
    on,
    resumeAt: on ? null : settings.moxieAiResumeAt,
    set,
    pause: () => {
      setSettings({
        moxieAi: false,
        moxieAiResumeAt: Date.now() + MOXIE_AI_PAUSE_MS,
      });
      announce(t.announceMoxieAiOff);
    },
    toggle: () => {
      set(!on);
      announce(on ? t.announceMoxieAiOff : t.announceMoxieAiOn);
    },
  };
}

/** Ends a pause when its time comes, including one that ran out while Moxie
 *  was closed. Mounted once, in the main window. */
export function useMoxieAiResume() {
  const { settings, setSettings } = useSettings();
  const { moxieAi, moxieAiResumeAt } = settings;
  useEffect(() => {
    if (moxieAi || moxieAiResumeAt === null) return;
    const resume = () =>
      setSettings({ moxieAi: true, moxieAiResumeAt: null });
    const wait = moxieAiResumeAt - Date.now();
    if (wait <= 0) {
      resume();
      return;
    }
    // A timer longer than 2^31 ms fires at once; a pause is an hour.
    const timer = window.setTimeout(resume, Math.min(wait, 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [moxieAi, moxieAiResumeAt, setSettings]);
}

/**
 * Moxie AI's button in the window bar: opens the AI panel, struck through
 * while off. Right-click pauses or turns it off; while off, a click offers to
 * turn it back on.
 */
export function MoxieAiButton({
  className,
  panelOpen,
  showPanel,
  shortcut,
  onTogglePanel,
}: {
  className: string;
  panelOpen: boolean;
  /** The AI panel can be opened: chat is on, or the tour needs it. */
  showPanel: boolean;
  /** The AI panel's shortcut, as shown in the tooltip. */
  shortcut: string;
  onTogglePanel: () => void;
}) {
  const { t } = useSettings();
  const ai = useMoxieAi();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // On with chat turned off there is nothing to open; the switch is in Settings.
  if (ai.on && !showPanel) return null;

  const openMenu = (e: MouseEvent<HTMLButtonElement>, atPointer: boolean) => {
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setMenu(
      atPointer
        ? { x: e.clientX, y: e.clientY }
        : { x: box.left, y: box.bottom + 2 },
    );
  };
  const until = ai.resumeAt
    ? new Date(ai.resumeAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const tip = ai.on
    ? `${t.agentPanelTitle} (${shortcut}) · ${t.moxieAiMenuHint}`
    : until
      ? t.moxieAiPausedTooltip.replace("{time}", until)
      : t.moxieAiOffTooltip;
  const items: (ContextMenuItem | "separator")[] = ai.on
    ? [
        // The panel has no close button of its own on the desktop: this
        // button opens and closes it, and its menu says so too.
        ...(panelOpen
          ? [
              { label: t.moxieAiClosePanel, onSelect: onTogglePanel },
              "separator" as const,
            ]
          : []),
        { label: t.moxieAiPause, onSelect: ai.pause },
        { label: t.moxieAiTurnOff, onSelect: () => ai.toggle() },
      ]
    : [{ label: t.moxieAiTurnOn, onSelect: () => ai.toggle() }];

  return (
    <>
      <Tooltip text={tip}>
        <button
          type="button"
          className={`${className}${ai.on && panelOpen ? " window-bar-toggle-on" : ""}${ai.on ? "" : " moxie-ai-button-off"}`}
          aria-pressed={ai.on ? panelOpen : undefined}
          aria-label={ai.on ? t.agentPanelTitle : t.moxieAiOff}
          aria-haspopup="menu"
          onClick={(e) => (ai.on ? onTogglePanel() : openMenu(e, false))}
          onContextMenu={(e) => openMenu(e, e.button === 2)}
        >
          <AssistantIcon off={!ai.on} />
        </button>
      </Tooltip>
      {/* On <body>: the bar's status group takes no pointer events. */}
      {createPortal(
        <Presence show={menu !== null} exitMs={120}>
          {menu && (
            <ContextMenu
              x={menu.x}
              y={menu.y}
              title={t.agentPanelTitle}
              items={items}
              onClose={() => setMenu(null)}
            />
          )}
        </Presence>,
        document.body,
      )}
    </>
  );
}

/** What an AI surface shows in its place while Moxie AI is off: that it
 *  is off, and the way to turn it back on. */
export function MoxieAiOffNote({ className }: { className?: string }) {
  const { t } = useSettings();
  const { set } = useMoxieAi();
  return (
    <div className={className ? `moxie-ai-off ${className}` : "moxie-ai-off"}>
      <p>{t.moxieAiOff}</p>
      <button type="button" className="text-button" onClick={() => set(true)}>
        {t.moxieAiTurnOn}
      </button>
    </div>
  );
}
