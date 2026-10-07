import { saveDocumentAction } from "./actions";
import { useDocuments } from "./documents";
import { usePreferences } from "./preferences";

const INTERVAL_MS = 30_000;

/** 定时/失焦自动保存：只处理"已有磁盘路径且未在保存中"的脏文档，未命名文档仍走手动保存 */
function saveAllPathedDirty() {
  const docs = useDocuments.getState().documents;
  for (const doc of docs) {
    if (!doc.path || !doc.isDirty || doc.ioState === "saving") continue;
    // 逐个查最新状态：前一个的保存可能改动 store
    const current = useDocuments
      .getState()
      .documents.find((d) => d.id === doc.id);
    if (!current || !current.path || !current.isDirty) continue;
    void saveDocumentAction(current.id);
  }
}

/** App 挂载时启用；返回清理函数 */
export function initAutosave(): () => void {
  const timer = window.setInterval(() => {
    if (usePreferences.getState().autosave === "interval") {
      saveAllPathedDirty();
    }
  }, INTERVAL_MS);

  const onBlur = () => {
    if (usePreferences.getState().autosave === "focus") {
      saveAllPathedDirty();
    }
  };
  window.addEventListener("blur", onBlur);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener("blur", onBlur);
  };
}
