import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { answerSavePrompt, useSavePrompt } from "../state/savePrompt";
import { useFocusTrap } from "../hooks/useFocusTrap";

export function SavePromptDialog() {
  const docName = useSavePrompt((s) => s.docName);
  const trap = useFocusTrap<HTMLDivElement>(!!docName);

  useEffect(() => {
    if (!docName) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answerSavePrompt("cancel");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docName]);

  if (!docName) return null;

  return (
    <div className="modal-overlay" onMouseDown={() => answerSavePrompt("cancel")}>
      <div
        ref={trap}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="未保存的更改"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-icon warn">
            <TriangleAlert size={18} />
          </span>
          <div className="modal-head-text">
            <div className="modal-title">未保存的更改</div>
            <p className="modal-message">“{docName}”尚未保存。要在关闭前保存吗?</p>
          </div>
        </div>
        <div className="modal-buttons">
          <button className="modal-button" onClick={() => answerSavePrompt("cancel")}>
            取消
          </button>
          <button className="modal-button" onClick={() => answerSavePrompt("discard")}>
            不保存
          </button>
          <button
            className="modal-button prominent"
            autoFocus
            onClick={() => answerSavePrompt("save")}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
