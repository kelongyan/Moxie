import { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * 纯文本粘贴（Ctrl+Shift+V）。
 *
 * CodeMirror 默认的 paste 处理器只消费 `text/plain`，所以普通 Ctrl+V 本就是
 * 纯文本；这里补的是**显式入口**：按键后直接读系统剪贴板并插入，行为可预测
 * （网页/Word 复制来的内容不会带样式残留）。
 *
 * 可靠性设计：`navigator.clipboard.readText()` 需要用户激活且可能被拒。
 * 按键时置一次性标记，随后由浏览器派发的 paste 事件同步读 `text/plain`——
 * 若 readText 失败，标记仍在，paste 处理器会接住这次按键完成粘贴，
 * 不会出现"按了键什么都没粘上"。
 */
export function pastePlainExtension(): Extension {
  let pending = false;

  const insertPlain = (view: EditorView, text: string): boolean => {
    if (text) {
      // 统一换行，避免 CRLF 混入内部统一为 LF 的文档
      const normalized = text.replace(/\r\n?/g, "\n");
      view.dispatch(view.state.replaceSelection(normalized), {
        scrollIntoView: true,
        userEvent: "input.paste",
      });
    }
    return true;
  };

  return [
    keymap.of([
      {
        key: "Mod-Shift-v",
        run: (view) => {
          if (!navigator.clipboard?.readText) return false;
          pending = true;
          void navigator.clipboard
            .readText()
            .then((text) => {
              pending = false;
              insertPlain(view, text);
            })
            .catch(() => {
              // 保留 pending：紧接着的 paste 事件会读到同一份纯文本
              view.focus();
            });
          return true;
        },
      },
    ]),
    EditorView.domEventHandlers({
      paste(event, view) {
        if (!pending) return false;
        pending = false;
        const plain = event.clipboardData?.getData("text/plain") ?? "";
        if (!plain) return false;
        event.preventDefault();
        insertPlain(view, plain);
        return true;
      },
    }),
  ];
}
