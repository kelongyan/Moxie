import { flushDocument, viewFor } from "../editor/registry";
import { activeDocument, useDocuments } from "./documents";

export async function initCodecSession() {
  const { listen } = await import("@tauri-apps/api/event");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();

  const unlistenGet = await listen("codec:get-input", async () => {
    const doc = activeDocument();
    if (!doc) {
      await win.emit("codec:input", { text: "", hasSelection: false });
      return;
    }
    flushDocument(doc.id);
    const view = viewFor(doc.id);
    if (!view) {
      await win.emit("codec:input", { text: "", hasSelection: false });
      return;
    }
    const sel = view.state.selection.main;
    const hasSelection = sel.from !== sel.to;
    const text = hasSelection
      ? view.state.sliceDoc(sel.from, sel.to)
      : view.state.doc.toString();
    await win.emit("codec:input", { text, hasSelection });
  });

  const unlistenReplace = await listen<{ text: string }>(
    "codec:replace",
    async (event) => {
      const doc = activeDocument();
      if (!doc) return;
      const view = viewFor(doc.id);
      if (!view) return;
      const sel = view.state.selection.main;
      const hasSelection = sel.from !== sel.to;
      const changes = hasSelection
        ? { from: sel.from, to: sel.to, insert: event.payload.text }
        : { from: 0, to: view.state.doc.length, insert: event.payload.text };
      view.dispatch({
        changes,
        selection: {
          anchor: hasSelection ? sel.from : 0,
          head: hasSelection
            ? sel.from + event.payload.text.length
            : event.payload.text.length,
        },
        userEvent: "input",
      });
      await view.focus();
      useDocuments.getState().setStatus(null);
    }
  );

  return () => {
    unlistenGet();
    unlistenReplace();
  };
}
