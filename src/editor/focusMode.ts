import { syntaxTree } from "@codemirror/language";
import { EditorState, Extension, Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

/**
 * 专注模式：当前顶层块之外的行降透明度（Typora 式）。
 * 行装饰只加 class、不带 style 属性，可与 livePreview 的行装饰安全叠加。
 */
export function focusMode(): Extension {
  const recompute = StateEffect.define<null>();

  const field = StateField.define<DecorationSet>({
    create(state) {
      return computeDim(state);
    },
    update(value, tr) {
      if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(recompute))) {
        return computeDim(tr.state);
      }
      return value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const viewportDriver = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (!update.viewportChanged) return;
        const view = update.view;
        queueMicrotask(() => {
          if (view.dom.isConnected) view.dispatch({ effects: recompute.of(null) });
        });
      }
    }
  );

  return [field, viewportDriver];
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
    const ranges: Range<Decoration>[] = [];
    for (let ln = 1; ln <= doc.lines; ln++) {
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
