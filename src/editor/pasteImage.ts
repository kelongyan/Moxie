import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * 图片粘贴：拦截 paste 事件里的图片项转交 onImagePaste（落盘与插入由
 * actions.insertImageFileAction 统一处理，粘贴与拖拽共用一条链路）。
 */
export function pasteImageExtension(
  onImagePaste: (file: File) => void
): Extension {
  return EditorView.domEventHandlers({
    paste(event) {
      const items = event.clipboardData?.items;
      if (!items) return false;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          event.preventDefault();
          onImagePaste(file);
          return true;
        }
      }
      return false;
    },
  });
}
