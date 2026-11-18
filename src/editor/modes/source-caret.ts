import type { EditorView } from "@codemirror/view";
import type { ModeSwitchCaret } from "./mode-switch-state";

function zoomOf(el: Element): number {
  return parseFloat(getComputedStyle(el).zoom) || 1;
}

/** The source editor's caret as a markdown offset. CodeMirror measures its
 *  own lines, so the mirror element a textarea needed is gone. */
export function readSourceCaret(view: EditorView): ModeSwitchCaret {
  const offset = view.state.selection.main.head;
  const scroller = view.scrollDOM;
  const box = scroller.getBoundingClientRect();
  let viewportY: number | null = null;
  try {
    const coords = view.coordsAtPos(offset);
    if (coords && coords.top >= box.top && coords.top <= box.bottom)
      viewportY = coords.top - box.top;
  } catch {
    // No layout for that position (hidden): don't restore scroll.
  }
  return { offset, viewportY };
}

/** Places the source caret at a markdown offset and scrolls it to where the
 *  WYSIWYG caret was. `coordsAtPos` is in screen px, scrollTop in zoomed
 *  content px, hence the divide. */
export function applySourceCaret(
  view: EditorView,
  caret: ModeSwitchCaret,
): void {
  const offset = Math.max(0, Math.min(caret.offset, view.state.doc.length));
  view.dispatch({ selection: { anchor: offset } });
  view.focus();
  const scroller = view.scrollDOM;
  const box = scroller.getBoundingClientRect();
  const target = caret.viewportY ?? box.height / 3;
  const zoom = zoomOf(scroller) || 1;
  try {
    const coords = view.coordsAtPos(offset);
    if (coords) scroller.scrollTop += (coords.top - box.top - target) / zoom;
  } catch {
    // No layout yet: the caret is set; scrolling is best effort.
  }
}

/** Typewriter mode: the caret's line in the middle of the source pane. */
export function centerSourceCaret(view: EditorView): void {
  const scroller = view.scrollDOM;
  const box = scroller.getBoundingClientRect();
  const zoom = zoomOf(scroller) || 1;
  try {
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (coords)
      scroller.scrollTop += (coords.top - box.top - box.height / 2) / zoom;
  } catch {
    // No layout yet.
  }
}
