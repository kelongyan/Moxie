import { EditorState, TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * 书写面格式化快捷键（Ctrl+B/I/E/K、Ctrl+Shift+Q）的事务构造。
 * 全部为纯函数：输入 EditorState，输出 TransactionSpec，便于单测。
 */

/** 选区是否已被 marker 包裹 */
function isWrapped(text: string, marker: string): boolean {
  return (
    text.length >= marker.length * 2 &&
    text.startsWith(marker) &&
    text.endsWith(marker)
  );
}

/** 包裹/取消包裹行内标记（**、*、`）；无选区时插入空对并置于中间 */
export function toggleWrapSpec(state: EditorState, marker: string): TransactionSpec {
  const { from, to, empty } = state.selection.main;
  if (!empty) {
    const text = state.sliceDoc(from, to);
    if (isWrapped(text, marker)) {
      const inner = text.slice(marker.length, text.length - marker.length);
      return {
        changes: { from, to, insert: inner },
        selection: { anchor: from, head: from + inner.length },
        userEvent: "input",
      };
    }
    // 选区两侧恰是成对 marker（选中的是标记内部文本）→ 取消外层
    const before = state.sliceDoc(Math.max(0, from - marker.length), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));
    if (before === marker && after === marker) {
      return {
        changes: [
          { from: from - marker.length, to: from, insert: "" },
          { from: to, to: to + marker.length, insert: "" },
        ],
        selection: { anchor: from - marker.length, head: to - marker.length },
        userEvent: "input",
      };
    }
    return {
      changes: { from, to, insert: marker + text + marker },
      selection: { anchor: from + marker.length, head: from + marker.length + text.length },
      userEvent: "input",
    };
  }
  // 无选区：光标两侧恰是成对 marker → 取消并退出
  const before = state.sliceDoc(Math.max(0, from - marker.length), from);
  const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));
  if (before === marker && after === marker) {
    return {
      changes: [
        { from: from - marker.length, to: from },
        { from: to, to: to + marker.length },
      ],
      selection: { anchor: from - marker.length },
      userEvent: "delete",
    };
  }
  return {
    changes: { from, insert: marker + marker },
    selection: { anchor: from + marker.length },
    userEvent: "input",
  };
}

/** 选区转链接：[text](https://) 并选中 url 占位；无选区插入 [](https://) */
export function linkSpec(state: EditorState): TransactionSpec {
  const { from, to, empty } = state.selection.main;
  const text = empty ? "" : state.sliceDoc(from, to);
  const url = "https://";
  const insert = `[${text}](${url})`;
  const urlFrom = from + text.length + 3;
  return {
    changes: { from, to, insert },
    selection: { anchor: urlFrom, head: urlFrom + url.length },
    userEvent: "input",
  };
}

const QUOTE_PREFIX_RE = /^>\s?/;

/**
 * 引用块开关：选区覆盖的行统一加 "> " 前缀；全部已是引用则去除。
 * 空行跳过不加前缀（与常见编辑器行为一致）。
 */
export function toggleQuoteSpec(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const firstLine = state.doc.lineAt(from);
  const lastLine = state.doc.lineAt(to);
  const lines = [];
  for (let n = firstLine.number; n <= lastLine.number; n++) lines.push(state.doc.line(n));

  const allQuoted = lines
    .filter((l) => l.text.trim() !== "")
    .every((l) => QUOTE_PREFIX_RE.test(l.text));

  const changes = [];
  for (const line of lines) {
    if (allQuoted) {
      const m = QUOTE_PREFIX_RE.exec(line.text);
      if (m) {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
      }
    } else {
      if (line.text.trim() === "") continue;
      changes.push({ from: line.from, insert: "> " });
    }
  }
  if (changes.length === 0) return {};
  // 不显式给 selection：CM 会把主选区自动映射过这些增删
  return { changes, userEvent: "input" };
}

export function makeWrapHandler(marker: string) {
  return (view: EditorView): boolean => {
    view.dispatch(toggleWrapSpec(view.state, marker));
    return true;
  };
}

export function makeLinkHandler() {
  return (view: EditorView): boolean => {
    view.dispatch(linkSpec(view.state));
    return true;
  };
}

export function makeQuoteHandler() {
  return (view: EditorView): boolean => {
    view.dispatch(toggleQuoteSpec(view.state));
    return true;
  };
}
