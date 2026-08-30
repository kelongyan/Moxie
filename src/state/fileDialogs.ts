import { create } from "zustand";
import { EncodingChoiceId } from "../models/encoding";

export type ConflictChoice = "cancel" | "reload" | "save-as" | "overwrite";
export type LossyChoice = "cancel" | "save-utf8";

interface FileDialogsState {
  encodingFile: string | null;
  resolveEncoding: ((choice: EncodingChoiceId | null) => void) | null;
  conflictFile: string | null;
  resolveConflict: ((choice: ConflictChoice) => void) | null;
  lossyFile: string | null;
  resolveLossy: ((choice: LossyChoice) => void) | null;
}

export const useFileDialogs = create<FileDialogsState>(() => ({
  encodingFile: null,
  resolveEncoding: null,
  conflictFile: null,
  resolveConflict: null,
  lossyFile: null,
  resolveLossy: null,
}));

export function promptEncodingChoice(fileName: string): Promise<EncodingChoiceId | null> {
  return new Promise((resolve) => {
    useFileDialogs.setState({ encodingFile: fileName, resolveEncoding: resolve });
  });
}

export function answerEncoding(choice: EncodingChoiceId | null) {
  const { resolveEncoding } = useFileDialogs.getState();
  useFileDialogs.setState({ encodingFile: null, resolveEncoding: null });
  if (resolveEncoding) resolveEncoding(choice);
}

export function promptConflictChoice(fileName: string): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    useFileDialogs.setState({ conflictFile: fileName, resolveConflict: resolve });
  });
}

export function answerConflict(choice: ConflictChoice) {
  const { resolveConflict } = useFileDialogs.getState();
  useFileDialogs.setState({ conflictFile: null, resolveConflict: null });
  if (resolveConflict) resolveConflict(choice);
}

export function promptLossyChoice(fileName: string): Promise<LossyChoice> {
  return new Promise((resolve) => {
    useFileDialogs.setState({ lossyFile: fileName, resolveLossy: resolve });
  });
}

export function answerLossy(choice: LossyChoice) {
  const { resolveLossy } = useFileDialogs.getState();
  useFileDialogs.setState({ lossyFile: null, resolveLossy: null });
  if (resolveLossy) resolveLossy(choice);
}
