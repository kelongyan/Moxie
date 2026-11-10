import { useState } from "react";
import { useSettingsOpening } from "./SettingsLayer";
import { useTutorial } from "../onboarding/useTutorial";
import { useTutorialDocumentEvaluation } from "../onboarding/useTutorialDocumentEvaluation";
import { useAppUpdate } from "./useAppUpdate";
import { useZoom } from "./useZoom";
import { useDraftAutosave } from "../document/draft-autosave";
import { useMoxieAi, useMoxieAiResume } from "../ai/MoxieAiSwitch";
import { useTabState } from "./tabs/useTabState";
import { useSidePanels } from "./useSidePanels";
import { useWordImported } from "./AppNotices";
import type { PendingClose } from "./close-flow";
import { useKeepTabs } from "../document/reload-tabs";
import type { Settings, useSettings } from "../prefs/SettingsContext";

/**
 * A window's frame: tabs, the close prompt, Moxie AI's switch, side panels,
 * Settings, updates, zoom, the tour and draft recovery.
 */
export function useWindowShell({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: ReturnType<typeof useSettings>["setSettings"];
}) {
  const tabState = useTabState();
  // The one save/discard/cancel prompt.
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const moxieAi = useMoxieAi();
  useMoxieAiResume();
  const panels = useSidePanels(moxieAi.on);
  const settingsOpening = useSettingsOpening();
  const appUpdate = useAppUpdate(settings.updateChannel);
  useZoom(settings.zoom, (zoom) => setSettings({ zoom }));
  const tutorial = useTutorial(moxieAi.on);
  const evaluateTutorialDocumentChange =
    useTutorialDocumentEvaluation(tutorial);
  const cancelDraftFlushes = useDraftAutosave(
    tabState.tabs,
    settings.enableDraftRecovery,
  );
  useKeepTabs(
    tabState.tabs,
    tabState.activeTabId,
    settings.enableDraftRecovery,
    tabState.liveTabs,
  );
  const [draftsRestoredCount, setDraftsRestoredCount] = useState(0);
  const wordImported = useWordImported();
  return {
    tabState,
    pendingClose,
    setPendingClose,
    moxieAi,
    panels,
    settingsOpening,
    appUpdate,
    tutorial,
    evaluateTutorialDocumentChange,
    cancelDraftFlushes,
    draftsRestoredCount,
    setDraftsRestoredCount,
    wordImported,
  };
}

export type WindowShell = ReturnType<typeof useWindowShell>;
