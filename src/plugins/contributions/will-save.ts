import { lazyModule } from "../../lazy/lazy-module";
import type { TextBlock } from "./save-blocks";

const executor = lazyModule(
  "plugin-will-save",
  () => import("./will-save-executor"),
);

/**
 * Plugins that may change a document just before it is saved. Each is asked
 * in turn, in plugin id order, given the text as the one before left it and
 * at most a second, so a broken plugin never holds up a save. Only the
 * blocks it changed are written back, and a change that would change again
 * on a second run is dropped.
 */
export interface WillSaveRequest {
  path: string;
  text: string;
  trigger: "manual" | "auto";
  blocks: TextBlock[];
}

/** The plugin's text for the document, or null for no change. */
export type WillSaveListener = (
  request: WillSaveRequest,
) => Promise<string | null>;

const listeners = new Map<string, WillSaveListener>();

/** How long a save waits for one plugin. */
export const WILL_SAVE_MS = 1000;

export function setWillSave(
  plugin: string,
  on: boolean,
  ask: WillSaveListener,
): void {
  if (on) listeners.set(plugin, ask);
  else listeners.delete(plugin);
}

/** Every listener, by plugin id: the order never depends on which started first. */
export function inIdOrder<T>(map: ReadonlyMap<string, T>): [string, T][] {
  return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The text to save: as each listening plugin changed it, in turn. */
export async function runWillSave(
  path: string,
  text: string,
  trigger: WillSaveRequest["trigger"] = "manual",
): Promise<string> {
  // Snapshot before the first await: registrations during a save belong to
  // the next save, including while the parser is loading for the first one.
  const ordered = inIdOrder(listeners);
  if (!ordered.length) return text;
  const { runListeners } = executor.peek() ?? (await executor.load());
  return runListeners(ordered, { path, text, trigger }, WILL_SAVE_MS);
}

/** Whether any plugin listens: saving skips the round trip when none does. */
export function hasWillSave(): boolean {
  return listeners.size > 0;
}

export function forgetWillSave(plugin: string): void {
  listeners.delete(plugin);
}
