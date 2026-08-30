import { useEffect } from "react";
import {
  closeTabAction,
  jsonFormatActive,
  newTabAction,
  openFileAction,
  saveActiveAction,
  saveAsAction,
} from "../state/actions";
import { useDocuments } from "../state/documents";
import { openFindWindow } from "../state/findWindow";
import { forwardFindNavigation, hasActiveFindQuery } from "../state/findSession";
import { openCodecWindow } from "../state/codecWindow";
import { usePreferences } from "../state/preferences";
import { openSettingsWindow } from "../state/settingsWindow";

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();

      if (e.altKey) {
        if (key === "f") {
          e.preventDefault();
          void openFindWindow("replace");
        } else if (key === "l" && !e.shiftKey) {
          e.preventDefault();
          void jsonFormatActive("pretty");
        } else if (key === "l" && e.shiftKey) {
          e.preventDefault();
          void jsonFormatActive("minify");
        } else if (key === "d") {
          e.preventDefault();
          void openCodecWindow("smart-decode");
        }
        return;
      }

      const state = useDocuments.getState();

      if (!e.shiftKey && key === "t") {
        e.preventDefault();
        newTabAction();
      } else if (!e.shiftKey && key === "n") {
        e.preventDefault();
        newTabAction();
      } else if (!e.shiftKey && key === "o") {
        e.preventDefault();
        void openFileAction();
      } else if (!e.shiftKey && key === "s") {
        e.preventDefault();
        void saveActiveAction();
      } else if (e.shiftKey && key === "s") {
        e.preventDefault();
        void saveAsAction();
      } else if (!e.shiftKey && key === "w") {
        e.preventDefault();
        if (state.activeId) void closeTabAction(state.activeId);
      } else if (!e.shiftKey && key === "f") {
        e.preventDefault();
        void openFindWindow("find");
      } else if (e.shiftKey && key === "b") {
        e.preventDefault();
        const prefs = usePreferences.getState();
        prefs.set({ sidebarPinned: !prefs.sidebarPinned });
      } else if (e.shiftKey && key === "p") {
        e.preventDefault();
        const docs = useDocuments.getState();
        const doc = docs.documents.find((d) => d.id === docs.activeId);
        if (doc && doc.language === "markdown") {
          docs.patchDocument(doc.id, { previewVisible: !doc.previewVisible });
        }
      } else if (!e.shiftKey && e.key === ",") {
        e.preventDefault();
        void openSettingsWindow();
      } else if (!e.shiftKey && key === "g") {
        e.preventDefault();
        if (hasActiveFindQuery()) forwardFindNavigation(1);
        else void openFindWindow("find");
      } else if (e.shiftKey && key === "g") {
        e.preventDefault();
        if (hasActiveFindQuery()) forwardFindNavigation(-1);
        else void openFindWindow("find");
      } else if (key === "tab") {
        e.preventDefault();
        state.cycleTab(e.shiftKey ? -1 : 1);
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const doc = state.documents[Number(e.key) - 1];
        if (doc) state.setActive(doc.id);
      }
    };

    const onAltCtrlArrow = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        useDocuments.getState().cycleTab(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        useDocuments.getState().cycleTab(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onAltCtrlArrow);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onAltCtrlArrow);
    };
  }, []);
}
