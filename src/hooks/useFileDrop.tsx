import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isMarkdownPath } from "../models/markdown";
import { insertImagePathAction, openPathAction } from "../state/actions";
import { useDocuments } from "../state/documents";

/** 可插入文档的图片扩展名（与 actions.IMAGE_EXT_BY_MIME 的落盘范围对应） */
const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;

export function useFileDrop(): boolean {
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragActive(true);
        } else if (payload.type === "leave") {
          setDragActive(false);
        } else if (payload.type === "drop") {
          setDragActive(false);
          // 顺序处理：Markdown 打开、图片插入活动文档，其余聚合提示；
          // 串行避免并发打开成功后把拒绝提示清掉
          void (async () => {
            const paths = payload.paths ?? [];
            let opened = 0;
            let inserted = 0;
            let rejected = 0;
            for (const path of paths) {
              if (isMarkdownPath(path)) {
                if (await openPathAction(path)) opened += 1;
                else rejected += 1;
              } else if (IMAGE_PATH_RE.test(path)) {
                if (await insertImagePathAction(path)) inserted += 1;
                else rejected += 1;
              } else {
                rejected += 1;
              }
            }
            const store = useDocuments.getState();
            if (rejected > 0 && opened + inserted > 0) {
              store.setStatus({
                text: `已处理 ${opened + inserted} 个文件,跳过 ${rejected} 个不支持的文件`,
                kind: "info",
              });
            } else if (rejected > 0 && opened + inserted === 0 && paths.length > 1) {
              store.setStatus({
                text: `跳过 ${rejected} 个不支持的文件(仅支持 Markdown 与图片)`,
                kind: "info",
              });
            }
          })();
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

  return dragActive;
}

export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <div className="drop-overlay" />;
}
