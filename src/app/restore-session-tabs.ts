import { setTabJump } from "../editor/tab-jump";
import { lastViewMode } from "../editor/modes/view-mode";
import type { DocTab } from "../document/doc-tabs";
import { readRestoredTabs } from "../document/restore-documents";
import { openingJump } from "../document/file-opening-jump";

const fileOf = (tab: DocTab) =>
  tab.path ?? tab.view?.resource ?? tab.importedFrom;

/** Reads restored tabs in bounded groups before adding them in one render. */
export async function restoreSessionTabs(options: {
  paths: string[];
  liveTabs: () => DocTab[];
  activeTabId: () => string;
  readDocument: (path: string) => Promise<Partial<DocTab> | null>;
  restoreCarets: boolean;
  setTabs: (update: (tabs: DocTab[]) => DocTab[]) => void;
  setActiveTabId: (id: string) => void;
}) {
  const initialId = options.activeTabId();
  let interacted = false;
  const markInteraction = () => {
    interacted = true;
  };
  document.addEventListener("keydown", markInteraction, true);
  document.addEventListener("pointerdown", markInteraction, true);
  const existing = new Set(options.liveTabs().map(fileOf));

  try {
    const read = await readRestoredTabs(
      options.paths.filter((path) => !existing.has(path)),
      options.readDocument,
    );
    const opened = new Set(options.liveTabs().map(fileOf));
    const restored = read.filter(
      (tab) => !fileOf(tab) || !opened.has(fileOf(tab)),
    );
    if (!restored.length) return;
    for (const tab of restored) {
      if (!tab.view) Object.assign(tab, lastViewMode());
      const jump =
        tab.path &&
        openingJump(
          { restoreCaret: true },
          tab.path,
          tab.diskMtime,
          options.restoreCarets,
        );
      if (jump) setTabJump(tab.id, jump);
    }
    options.setTabs((tabs) => [...tabs, ...restored]);
    if (!interacted && initialId === options.activeTabId())
      options.setActiveTabId(restored[restored.length - 1].id);
  } finally {
    document.removeEventListener("keydown", markInteraction, true);
    document.removeEventListener("pointerdown", markInteraction, true);
  }
}
