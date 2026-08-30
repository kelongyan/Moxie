import { create } from "zustand";

interface PromptRequest {
  title: string;
  initialValue: string;
  resolve: ((value: string | null) => void) | null;
}

interface ConfirmRequest {
  title: string;
  message: string;
  okLabel: string;
  danger?: boolean;
  resolve: ((ok: boolean) => void) | null;
}

interface PromptsState {
  prompt: PromptRequest | null;
  confirm: ConfirmRequest | null;
}

export const usePrompts = create<PromptsState>(() => ({
  prompt: null,
  confirm: null,
}));

export function promptInput(title: string, initialValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    usePrompts.setState({
      prompt: { title, initialValue, resolve },
    });
  });
}

export function answerPrompt(value: string | null) {
  const { prompt } = usePrompts.getState();
  usePrompts.setState({ prompt: null });
  prompt?.resolve?.(value);
}

export function promptConfirm(
  title: string,
  message: string,
  okLabel = "确定",
  danger = false
): Promise<boolean> {
  return new Promise((resolve) => {
    usePrompts.setState({
      confirm: { title, message, okLabel, danger, resolve },
    });
  });
}

export function answerConfirm(ok: boolean) {
  const { confirm } = usePrompts.getState();
  usePrompts.setState({ confirm: null });
  confirm?.resolve?.(ok);
}
