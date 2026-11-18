import { useSyncExternalStore } from "react";

let ready = false;
let restored = false;
const listeners = new Set<() => void>();

/** The initial blank tab is provisional until launch-time data is resolved. */
export function showStartupDocument(): void {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
}

/** Only a complete restoration may replace the persisted session snapshot. */
export function finishStartupRestore(): void {
  if (restored) return;
  ready = true;
  restored = true;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useStartupReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready);
}

export function useStartupRestored(): boolean {
  return useSyncExternalStore(subscribe, () => restored);
}
