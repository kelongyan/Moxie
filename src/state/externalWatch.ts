import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useDocuments } from "./documents";
import { promptConfirm } from "./prompts";

interface FileRevisionSnapshot {
  identity: string;
  modifiedMs: number;
  size: number;
}

/** 已监听的目录集合（去重，避免重复 invoke） */
let watchedDirsKey = "";

/** 自身写盘时间戳：写盘也会触发 notify 事件，1.5s 内的同路径变更忽略 */
const selfWrites = new Map<string, number>();
const SELF_WRITE_MS = 1500;

export function markSelfWrite(path: string) {
  selfWrites.set(path, Date.now());
}

/** 把当前打开文档的目录集合同步给后端（幂等） */
export async function syncWatchedDirs(): Promise<void> {
  const dirs = new Set<string>();
  for (const doc of useDocuments.getState().documents) {
    if (!doc.path) continue;
    const idx = Math.max(doc.path.lastIndexOf("\\"), doc.path.lastIndexOf("/"));
    if (idx > 0) dirs.add(doc.path.slice(0, idx));
  }
  const key = [...dirs].sort().join("|");
  if (key === watchedDirsKey) return;
  watchedDirsKey = key;
  try {
    await invoke("fs_watch", { dirs: [...dirs] });
  } catch {
    // 监听不可用时静默降级（仍有保存时冲突检测兜底）
  }
}

/** App 挂载时启用；返回清理函数 */
export function initExternalWatch(): () => void {
  void syncWatchedDirs();
  const unsubStore = useDocuments.subscribe((state, prev) => {
    if (state.documents !== prev.documents) void syncWatchedDirs();
  });
  const promise = listen<string[]>("fs:changed", (event) => {
    void handleChanged(event.payload ?? []);
  });
  return () => {
    unsubStore();
    void promise.then((fn) => fn());
  };
}

async function handleChanged(paths: string[]) {
  const now = Date.now();
  for (const path of paths) {
    const doc = useDocuments.getState().documents.find((d) => d.path === path);
    if (!doc) continue;
    const selfAt = selfWrites.get(path);
    if (selfAt !== undefined) {
      if (now - selfAt < SELF_WRITE_MS) continue;
      selfWrites.delete(path);
    }
    let rev: FileRevisionSnapshot | null = null;
    try {
      rev = await invoke<FileRevisionSnapshot>("get_file_revision", { path });
    } catch {
      continue;
    }
    const known = useDocuments
      .getState()
      .documents.find((d) => d.id === doc.id)?.fileRevision;
    const changed =
      !known ||
      rev.identity !== known.identity ||
      rev.modifiedMs !== known.modifiedMs ||
      rev.size !== known.size;
    if (!changed) continue;

    if (!doc.isDirty) {
      await reloadDoc(doc.id, path);
    } else {
      const ok = await promptConfirm(
        "文件已在磁盘被修改",
        `“${doc.name}”在外部被修改,当前有未保存内容。重新载入将覆盖这些内容。`,
        "重新载入"
      );
      if (ok) {
        await reloadDoc(doc.id, path);
      } else {
        useDocuments
          .getState()
          .setStatus({ text: "已保留当前内容,可稍后另存为", kind: "info" });
      }
    }
  }
}

async function reloadDoc(docId: string, path: string) {
  // 动态 import 避免 actions ↔ externalWatch 循环依赖
  const { reloadFromDiskAction } = await import("./actions");
  await reloadFromDiskAction(docId, path);
}
