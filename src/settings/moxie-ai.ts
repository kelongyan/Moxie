import type { Settings } from "../prefs/SettingsContext";

/** What Moxie AI may do now: the master switch over each feature's own
 *  setting. Always read this, never a feature's setting alone. `inTour`
 *  offers chat in the practice tab even with chat off. */
export function aiFeatures(
  settings: Pick<
    Settings,
    "moxieAi" | "enableCompletion" | "enableGrammarCheck" | "enableAskAi"
  >,
  inTour = false,
) {
  const on = settings.moxieAi;
  return {
    on,
    completion: on && settings.enableCompletion,
    grammar: on && settings.enableGrammarCheck,
    chat: on && (settings.enableAskAi || inTour),
  };
}
