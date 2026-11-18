import { useEffect, useRef } from "react";
import { thisWindow } from "../platform/this-window";
import { canUseWindows } from "../platform/capabilities";
import { session } from "../platform/ipc";
import type { DocTab } from "../document/doc-tabs";
import { coalescedWrite } from "../storage/coalesced-write";
import { useStartupRestored } from "../document/startup-state";

/** The OS title names the document, for the taskbar, Alt+Tab and window lists. */
export function useWindowTitle(activeTitle: string): void {
  useEffect(() => {
    if (!canUseWindows) return;
    void thisWindow()
      .setTitle(`${activeTitle} - Moxie`)
      .catch(() => {});
  }, [activeTitle]);
}

/**
 * Reports this window's on-disk tab paths to Rust so a relaunch can restore
 * them. Keyed on the joined paths so content edits don't trigger a round trip.
 */
export function useSessionPaths(tabs: DocTab[]): void {
  const ready = useStartupRestored();
  const writes = useRef<ReturnType<typeof coalescedWrite<string[]>> | null>(
    null,
  );
  useEffect(() => {
    const queue = coalescedWrite<string[]>(
      (paths) => session.updateSessionPaths(paths),
      250,
    );
    writes.current = queue;
    return () => {
      queue.dispose();
      writes.current = null;
    };
  }, []);
  // A plugin's tab of a file (a PDF) reopens through its plugin.
  const pathOf = (tab: DocTab) => tab.path ?? tab.view?.resource ?? null;
  const sessionPathsKey = tabs.map((tab) => pathOf(tab) ?? "").join("\n");
  useEffect(() => {
    if (!canUseWindows || !ready) return;
    writes.current?.set(sessionPathsKey.split("\n").filter(Boolean));
  }, [sessionPathsKey, ready, writes]);
}
