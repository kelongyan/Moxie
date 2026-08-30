import { Feather } from "lucide-react";
import { newTabAction, openFileAction } from "../state/actions";

export function EditorEmptyState() {
  return (
    <div className="editor-empty">
      <div className="editor-empty-mark">
        <Feather size={28} />
      </div>
      <h2 className="editor-empty-title">开始书写</h2>
      <p className="editor-empty-desc">打开本地文件，或新建一个空白标签页</p>
      <div className="editor-empty-actions">
        <button
          className="modal-button prominent"
          onClick={() => void openFileAction()}
        >
          打开文件
        </button>
        <button className="modal-button" onClick={newTabAction}>
          新建标签页
        </button>
      </div>
      <div className="editor-empty-hints">
        <span>
          <kbd>Ctrl</kbd> <kbd>O</kbd> 打开
        </span>
        <span className="hint-dot" />
        <span>
          <kbd>Ctrl</kbd> <kbd>N</kbd> 新建
        </span>
        <span className="hint-dot" />
        <span>
          <kbd>Ctrl</kbd> <kbd>W</kbd> 关闭标签
        </span>
      </div>
    </div>
  );
}
