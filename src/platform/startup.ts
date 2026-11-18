import { emitTo } from "@tauri-apps/api/event";
import { readBoot } from "../storage/boot";

type Phase = "main" | "shell" | "document" | "restored" | "settled";
const marked = new Set<Phase>();

/** Phase names only: a trace must never contain the writing or its path. */
export function markStartup(phase: Phase): void {
  if (marked.has(phase)) return;
  marked.add(phase);
  performance.mark(`moxie:${phase}`);
  if (readBoot()?.startupTrace)
    void emitTo({ kind: "App" }, "moxie-startup-phase", {
      phase,
      at: performance.now(),
    }).catch(() => {});
}

/** Measures the real app and diagnostic builds through the same DOM milestones. */
export function observeStartup(onDocument?: () => void): void {
  markStartup("main");
  let shell = false;
  const observer = new MutationObserver(() => {
    if (!shell && document.querySelector(".app-shell")) {
      shell = true;
      markStartup("shell");
    }
    const content = document.querySelector(
      '[data-active-tab="true"] :is(.ProseMirror, .cm-content, .start-page, .plugin-tab-pane)',
    );
    if (!content) return;
    observer.disconnect();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const boot = readBoot();
        markStartup("document");
        onDocument?.();
        if (boot)
          void emitTo(
            { kind: "App" },
            "moxie-document-ready",
            boot.label,
          ).catch(() => {});
        if (boot?.startupTrace) setTimeout(() => markStartup("settled"), 2000);
      });
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
