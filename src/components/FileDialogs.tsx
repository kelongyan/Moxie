import { useEffect } from "react";
import { ENCODING_CHOICES, EncodingChoiceId } from "../models/encoding";
import { answerEncoding, answerConflict, answerLossy, useFileDialogs } from "../state/fileDialogs";
import { useFocusTrap } from "../hooks/useFocusTrap";

function useEscape(onEscape: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, active]);
}

export function EncodingDialog() {
  const fileName = useFileDialogs((s) => s.encodingFile);
  const trap = useFocusTrap<HTMLDivElement>(fileName !== null);
  useEscape(() => answerEncoding(null), fileName !== null);
  if (!fileName) return null;

  const choose = (id: EncodingChoiceId) => answerEncoding(id);

  return (
    <div className="modal-overlay" onMouseDown={() => answerEncoding(null)}>
      <div
        ref={trap}
        className="modal-panel wide"
        role="dialog"
        aria-modal="true"
        aria-label="选择编码"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="modal-message">
          无法将“{fileName}”解码为 UTF-8。请选择要使用的编码:
        </p>
        <div className="modal-choices">
          {ENCODING_CHOICES.map((choice, index) => (
            <button
              key={choice.id}
              className="modal-choice-button"
              autoFocus={index === 0}
              onClick={() => choose(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="modal-button" onClick={() => answerEncoding(null)}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConflictDialog() {
  const fileName = useFileDialogs((s) => s.conflictFile);
  const trap = useFocusTrap<HTMLDivElement>(fileName !== null);
  useEscape(() => answerConflict("cancel"), fileName !== null);
  if (!fileName) return null;

  return (
    <div className="modal-overlay" onMouseDown={() => answerConflict("cancel")}>
      <div
        ref={trap}
        className="modal-panel wide"
        role="dialog"
        aria-modal="true"
        aria-label="外部修改冲突"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="modal-message">
          “{fileName}”在磁盘上已被其他程序修改。如何处理?
        </p>
        <div className="modal-choices">
          <button
            className="modal-choice-button"
            autoFocus
            onClick={() => answerConflict("reload")}
          >
            重新载入(放弃本地修改)
          </button>
          <button className="modal-choice-button" onClick={() => answerConflict("save-as")}>
            另存为…
          </button>
          <button className="modal-choice-button" onClick={() => answerConflict("overwrite")}>
            仍然覆盖磁盘版本
          </button>
        </div>
        <div className="modal-buttons">
          <button className="modal-button" onClick={() => answerConflict("cancel")}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export function LossyDialog() {
  const fileName = useFileDialogs((s) => s.lossyFile);
  const trap = useFocusTrap<HTMLDivElement>(fileName !== null);
  useEscape(() => answerLossy("cancel"), fileName !== null);
  if (!fileName) return null;

  return (
    <div className="modal-overlay" onMouseDown={() => answerLossy("cancel")}>
      <div
        ref={trap}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="编码无法表示的字符"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="modal-message">
          “{fileName}”包含当前编码无法表示的字符。要改用 UTF-8 保存吗?
        </p>
        <div className="modal-buttons">
          <button className="modal-button" onClick={() => answerLossy("cancel")}>
            取消
          </button>
          <button
            className="modal-button prominent"
            autoFocus
            onClick={() => answerLossy("save-utf8")}
          >
            以 UTF-8 保存
          </button>
        </div>
      </div>
    </div>
  );
}
