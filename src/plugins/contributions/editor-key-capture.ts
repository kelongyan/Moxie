import type { EditorView } from "@milkdown/kit/prose/view";
import { isMacPlatform } from "../../platform/os";
import { isImeKeydown } from "../../utils/ime";
import { keyName } from "./editor-keys";

/** The window's capture-phase shortcut handler runs before the editor's
 * key handler. Both read this same state synchronously, without the window
 * loading the editor engine just to ask whether it owns a key. */
export interface KeyCapture {
  /** "all": every key but the app's shortcuts (unless named in `keys`) and an
   *  input method's; "some": only `keys`. */
  mode: "all" | "some";
  keys: string[];
}

export interface Owner {
  plugin: string;
  name: string;
  capture: KeyCapture;
  deliver: (key: string) => void;
  lastKeyAt: number;
}

/** What the plugin with the keys and its editor share: who holds them, the
 *  editor that last had them, Visual mode's ends (characters: where it
 *  started and where the cursor is, both in the selection), the column
 *  up/down moves keep, and the cursor it asked for. */
export const held: {
  owner: Owner | null;
  view: EditorView | null;
  visual: { anchor: number; head: number } | null;
  goalX: number | null;
  cursorStyle: "bar" | "block";
} = { owner: null, view: null, visual: null, goalX: null, cursorStyle: "bar" };

/** The plugin holding the keyboard, if one does. */
export function keyHolder(): { id: string; name: string } | null {
  return held.owner && { id: held.owner.plugin, name: held.owner.name };
}

export function capturedKey(
  event: KeyboardEvent,
  capture: KeyCapture,
): string | null {
  if (isImeKeydown(event)) return null;
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key))
    return null;
  const name = keyName(event);
  if (capture.mode === "some") return capture.keys.includes(name) ? name : null;
  // The app's shortcuts stay its own unless named: ⌘ on a Mac, Ctrl elsewhere.
  const mod = isMacPlatform() ? event.metaKey : event.ctrlKey || event.metaKey;
  if (mod && !capture.keys.includes(name)) return null;
  return name;
}

/** Whether a plugin holds this key in the focused editor, so the window's
 *  shortcuts leave it alone (Emacs's C-/ is undo, not Toggle Source Mode). */
export function heldByPlugin(event: KeyboardEvent): boolean {
  const view = held.view;
  if (!held.owner || !view || view.isDestroyed || !view.hasFocus())
    return false;
  return capturedKey(event, held.owner.capture) !== null;
}
