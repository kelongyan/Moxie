import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPathAction } from "../state/actions";

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
          // 顺序走统一入口：非 Markdown 文件由 openPathAction 校验并提示，
          // 避免并发打开成功后把拒绝提示清掉
          void (async () => {
            for (const path of payload.paths ?? []) {
              await openPathAction(path);
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
