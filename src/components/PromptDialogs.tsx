import { useEffect, useRef } from "react";
import { answerConfirm, answerPrompt, usePrompts } from "../state/prompts";
import { useFocusTrap } from "../hooks/useFocusTrap";

export function PromptDialogs() {
  const prompt = usePrompts((s) => s.prompt);
  const confirm = usePrompts((s) => s.confirm);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const promptTrap = useFocusTrap<HTMLDivElement>(!!prompt);
  const confirmTrap = useFocusTrap<HTMLDivElement>(!!confirm && !prompt);

  useEffect(() => {
    if (prompt) {
      const t = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => window.clearTimeout(t);
    }
  }, [prompt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (prompt) answerPrompt(null);
      else if (confirm) answerConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prompt, confirm]);

  if (!prompt && !confirm) return null;

  if (prompt) {
    return (
      <div className="modal-overlay" onMouseDown={() => answerPrompt(null)}>
        <div
          ref={promptTrap}
          className="modal-panel"
          role="dialog"
          aria-modal="true"
          aria-label={prompt.title}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="modal-message">{prompt.title}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = inputRef.current?.value ?? "";
              if (value.trim()) answerPrompt(value);
            }}
          >
            <input
              ref={inputRef}
              className="prompt-input"
              defaultValue={prompt.initialValue}
              spellCheck={false}
            />
            <div className="modal-buttons">
              <button type="button" className="modal-button" onClick={() => answerPrompt(null)}>
                取消
              </button>
              <button type="submit" className="modal-button prominent">
                确定
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onMouseDown={() => answerConfirm(false)}>
      <div
        ref={confirmTrap}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={confirm!.title ?? "确认"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="modal-message">{confirm!.message}</p>
        <div className="modal-buttons">
          <button className="modal-button" onClick={() => answerConfirm(false)}>
            取消
          </button>
          <button
            className={"modal-button" + (confirm!.danger ? " danger" : " prominent")}
            autoFocus
            onClick={() => answerConfirm(true)}
          >
            {confirm!.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
