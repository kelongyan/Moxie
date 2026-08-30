import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { saveDocumentAction } from "../state/actions";
import { useDocuments } from "../state/documents";
import { usePreferences } from "../state/preferences";
import { promptConfirm } from "../state/prompts";
import {
  finishCleanly,
  flushAllRecoveryNow,
  saveWorkspaceAndFinish,
} from "../state/recovery";
import { promptSaveChoice } from "../state/savePrompt";
import { editorWindowLabels } from "../state/windows";

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

async function isExitConfirmed(): Promise<boolean> {
  try {
    const disk = await invoke<Record<string, unknown>>("settings_load");
    return disk?.hasConfirmedWorkspaceExitPrompt === true;
  } catch {
    return false;
  }
}

async function setExitConfirmed(): Promise<void> {
  try {
    const disk = await invoke<Record<string, unknown>>("settings_load");
    await invoke("settings_save", {
      value: { ...(disk ?? {}), hasConfirmedWorkspaceExitPrompt: true },
    });
  } catch {
    // ignore
  }
}

async function confirmAndProcessDirty(): Promise<boolean> {
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
          const exitBehavior = usePreferences.getState().exitBehavior;
          const dirtyDocs = useDocuments
            .getState()
            .documents.filter((d) => d.isDirty);

          if (exitBehavior === "preserveWorkspace" && isLastWindow) {
            if (dirtyDocs.length > 0 && !(await isExitConfirmed())) {
              const ok = await promptConfirm(
                "保留工作区并退出",
                "未保存的内容将随工作区快照保留,并在下次启动时恢复。要继续吗?",
                "继续"
              );
              if (!ok) return;
              await setExitConfirmed();
            }
            const saved = await saveWorkspaceAndFinish();
            if (!saved) {
              useDocuments
                .getState()
                .setStatus({ text: "工作区保存失败,已取消退出", kind: "error" });
              return;
            }
            closing = true;
            // close() 在 close-requested 处理器内会被吞掉，最终关闭必须用 destroy()
            await getCurrentWindow().destroy();
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
