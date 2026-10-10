import { useEffect } from "react";
import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import { saveDocumentAction } from "../state/actions";
import { useDocuments } from "../state/documents";
import { usePreferences } from "../state/preferences";
import { promptSaveChoice } from "../state/savePrompt";
import { editorWindowLabels } from "../state/windows";
import { finishCleanly, flushAllRecoveryNow } from "../state/recovery";

let closing = false;
let prompting = false;

async function waitSavingSettled(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const anySaving = useDocuments
      .getState()
      .documents.some((d) => d.ioState === "saving");
    if (!anySaving) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function confirmAndProcessDirty(): Promise<boolean> {
  const dirtyDocs = useDocuments.getState().documents.filter((d) => d.isDirty);
  for (const doc of [...dirtyDocs]) {
    const current = useDocuments.getState().documents.find((d) => d.id === doc.id);
    if (!current || !current.isDirty) continue;
    const choice = await promptSaveChoice(current.name);
    if (choice === "cancel") return false;
    if (choice === "save") {
      const saved = await saveDocumentAction(current.id);
      if (!saved) return false;
    }
  }
  return true;
}

export function useCloseGuard() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (closing) return;
        event.preventDefault();
        if (prompting) return;
        prompting = true;
        try {
          await waitSavingSettled();
          flushAllRecoveryNow();

          const labels = await editorWindowLabels();
          const isLastWindow = labels.length <= 1;

          // 关闭到托盘：隐藏全部窗口，内容保持在内存（恢复机制持续兜底）
          if (usePreferences.getState().closeToTray && isLastWindow) {
            const wins = await getAllWindows();
            for (const w of wins) await w.hide().catch(() => {});
            return;
          }

          const approved = await confirmAndProcessDirty();
          if (!approved) return;

          if (isLastWindow) {
            await finishCleanly();
          }
          closing = true;
          await getCurrentWindow().destroy();
        } catch {
          // 守卫流程异常时兜底退出，避免窗口无法关闭
          closing = true;
          try {
            await getCurrentWindow().destroy();
          } catch {
            // 忽略
          }
        } finally {
          prompting = false;
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
