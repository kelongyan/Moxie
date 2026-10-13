import { syntaxTree } from "@codemirror/language";
import { EditorState, Extension, Range, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { setWindowEffect, windowField } from "./viewportWindow";

/**
 * 专注模式：当前顶层块之外的行降透明度（Typora 式）。
 * 行装饰只加 class、不带 style 属性，可与 livePreview 的行装饰安全叠加。
 * 降透明度只发窗口内（viewport ± 行数余量，见 viewportWindow）的非当前块行——
 * 视口外不渲染、无需装饰；窗口由 livePreview 注册的 windowField/windowDriver
 * 维护，未注册时（独立使用本扩展）回退全量。滚动补算随窗口更新（setWindowEffect）触发。
 */
export function focusMode(): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return computeDim(state);
    },
    update(value, tr) {
      if (
        tr.docChanged ||
        tr.selection ||
        tr.effects.some((e) => e.is(setWindowEffect))
      ) {
        return computeDim(tr.state);
      }
      return value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return [field];
}

/** 光标所在顶层块之外的行 → md-dim；拖选（非折叠选区）与空白区不降透明度 */
function computeDim(state: EditorState): DecorationSet {
  try {
    const { main } = state.selection;
    if (!main.empty) return Decoration.none;
    const doc = state.doc;
    const tree = syntaxTree(state);
    let block: { from: number; to: number } | null = null;
    for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
      if (n.from <= main.head && n.to >= main.head) {
        block = { from: n.from, to: n.to };
        break;
      }
    }
    if (!block) return Decoration.none;
    const firstLine = doc.lineAt(block.from).number;
    const lastLine = doc.lineAt(Math.max(block.from, block.to - 1)).number;
    const window = state.field(windowField, false) ?? null;
    const startLine = window
      ? doc.lineAt(Math.max(0, Math.min(window.from, doc.length))).number
      : 1;
    const endLine = window
      ? doc.lineAt(Math.max(0, Math.min(window.to, doc.length))).number
      : doc.lines;
    const ranges: Range<Decoration>[] = [];
    for (let ln = startLine; ln <= endLine; ln++) {
      if (ln >= firstLine && ln <= lastLine) continue;
      ranges.push(Decoration.line({ class: "md-dim" }).range(doc.line(ln).from));
    }
    return Decoration.set(ranges, true);
  } catch {
    return Decoration.none;
  }
}

/**
 * 打字机模式：选区变化后把光标行滚动到屏幕垂直居中。
 * dispatch 必须离开 update 循环，在微任务里执行。
 */
export function typewriterMode(): Extension {
  return ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (!update.selectionSet || !update.view.dom.isConnected) return;
        const view = update.view;
        queueMicrotask(() => {
          if (!view.dom.isConnected) return;
          const pos = view.state.selection.main.head;
          view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) });
        });
      }
    }
  );
}
