import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { pathExtension } from "../models/language";
import { SUPPORTED_EXTENSIONS } from "../models/language";
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
          const paths = (payload.paths ?? []).filter((p) =>
            SUPPORTED_EXTENSIONS.includes(pathExtension(p))
          );
          for (const path of paths) {
            void openPathAction(path);
          }
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
