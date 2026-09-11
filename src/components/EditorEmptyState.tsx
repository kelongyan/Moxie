import { baseName } from "../models/language";
import { newTabAction, openFileAction, openPathAction } from "../state/actions";
import { dirName, useSidebar } from "../state/sidebar";
import brandMark from "../../src-tauri/icons/128x128.png";

/** 欢迎页最多展示的最近文件条数 */
const RECENT_LIMIT = 5;

export function EditorEmptyState() {
  const recent = useSidebar((s) => s.recent);
  const missing = useSidebar((s) => s.missing);

  const items = recent
    .filter((entry) => !missing[entry.path])
    .slice(0, RECENT_LIMIT);

  return (
    <div className="editor-empty">
      <img
        className="editor-empty-brand"
        src={brandMark}
        alt=""
        draggable={false}
      />
      <h2 className="editor-empty-title">Moxie</h2>
      <p className="editor-empty-desc">安静、快速、本地优先的书写工具</p>

      <div className="editor-empty-actions">
        <button className="modal-button prominent" onClick={newTabAction}>
          新建文件
        </button>
        <button className="modal-button" onClick={() => void openFileAction()}>
          打开文件
        </button>
      </div>

      {items.length > 0 && (
        <div className="editor-empty-recent">
          <div className="editor-empty-recent-title">最近</div>
          {items.map((entry) => (
            <button
              key={entry.path}
              className="editor-empty-recent-item"
              title={entry.path}
              onClick={() => void openPathAction(entry.path)}
            >
              <span className="recent-name">{baseName(entry.path)}</span>
              <span className="recent-dir">{dirName(entry.path)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="editor-empty-hints">
        <span>
          <kbd>Ctrl</kbd> <kbd>N</kbd> 新建
        </span>
        <span className="hint-dot" />
        <span>
          <kbd>Ctrl</kbd> <kbd>O</kbd> 打开
        </span>
        <span className="hint-dot" />
        <span>拖入文件即可打开</span>
      </div>
    </div>
  );
}
