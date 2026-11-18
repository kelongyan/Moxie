/**
 * The synchronous handoff between source mode and the rich editor. This
 * registry has no editor runtime imports: the window may read it before
 * either editor loads, and both views must share the same pending caret.
 */
export interface ModeSwitchCaret {
  /** Offset into the tab's markdown; approximate where its syntax and the
   *  rich document's structure disagree. */
  offset: number;
  /** The caret's distance from the top of the visible pane, in screen px;
   *  null when it was off screen. */
  viewportY: number | null;
}

let pending: ModeSwitchCaret | null = null;
let reporter: ((markdown: string) => ModeSwitchCaret | null) | null = null;

/** Handed across exactly one switch: whoever mounts next takes it. */
export function setPendingCaret(caret: ModeSwitchCaret | null): void {
  pending = caret;
}

export function takePendingCaret(): ModeSwitchCaret | null {
  const caret = pending;
  pending = null;
  return caret;
}

/** The on-screen WYSIWYG editor registers how to read its caret. Returns the
 *  unregister function. */
export function registerCaretReporter(
  report: (markdown: string) => ModeSwitchCaret | null,
): () => void {
  reporter = report;
  return () => {
    if (reporter === report) reporter = null;
  };
}

/** `markdown` is the tab's text as the source view shows it: the file's own
 *  spelling, which re-serializing wouldn't reproduce. */
export function captureEditorCaret(markdown: string): ModeSwitchCaret | null {
  return reporter?.(markdown) ?? null;
}
