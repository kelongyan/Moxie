import { create } from "zustand";

export type SaveChoice = "save" | "discard" | "cancel";

interface SavePromptState {
  docName: string | null;
  resolve: ((choice: SaveChoice) => void) | null;
}

export const useSavePrompt = create<SavePromptState>(() => ({
  docName: null,
  resolve: null,
}));

export function promptSaveChoice(docName: string): Promise<SaveChoice> {
  const current = useSavePrompt.getState().resolve;
  if (current) current("cancel");
  return new Promise((resolve) => {
    useSavePrompt.setState({ docName, resolve });
  });
}

export function answerSavePrompt(choice: SaveChoice) {
  const { resolve } = useSavePrompt.getState();
  useSavePrompt.setState({ docName: null, resolve: null });
  if (resolve) resolve(choice);
}
