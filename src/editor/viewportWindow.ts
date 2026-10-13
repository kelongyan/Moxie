import { EditorState, StateEffect, StateField, Text } from "@codemirror/state";
import { ViewPlugin, ViewUpdate } from "@codemirror/view";

/**
 * 视口窗口：装饰计算的可视范围（viewport ± 行数余量）。
 *
 * 即时渲染（livePreview）与专注模式（focusMode）的单次重算原本是 O(文档)，
 * 大文档下每次按键/光标移动都要全量遍历与扫描（实测 500KB 文档约 50~200ms，
 * 见 docs/渲染优化方案.md O-4）。窗口机制把计算收敛到视口附近的固定行数：
 * 视口外内容不渲染、无需装饰；滚动时由 windowDriver 在微任务里更新窗口补算
 * （窗口边界处的间距/空行近似都在屏幕外，滚入屏幕前会被重算修正）。
 *
 * 窗口字段在创建时即按"光标附近"初始化（initialWindowFor）——视图创建瞬间不再
 * 全量计算；null 仅出现在"直接调用 computeLiveRanges 不传窗口"的场景（测试/脚本），
 * 此时按全量计算兼容。
 */

export interface DecorationWindow {
  from: number;
  to: number;
}

/** 视口前后各保留的行数余量（屏幕约 30~60 行，500 行覆盖滚动补算间隙） */
export const WINDOW_MARGIN_LINES = 500;

export const setWindowEffect = StateEffect.define<DecorationWindow | null>();

/** 视图创建瞬间的初始窗口：以选区（光标）为中心 ±WINDOW_MARGIN_LINES 行。
 *  打开文档时首帧只计算这一窗口（大文档打开不再全量——原全量是打开卡顿的主因），
 *  视图挂载测量后由 windowDriver 用真实视口覆盖。 */
export function initialWindowFor(state: EditorState): DecorationWindow {
  const doc = state.doc;
  const head = Math.max(0, Math.min(state.selection.main.head, doc.length));
  const line = doc.lineAt(head).number;
  const firstLine = Math.max(1, line - WINDOW_MARGIN_LINES);
  const lastLine = Math.min(doc.lines, line + WINDOW_MARGIN_LINES);
  return { from: doc.line(firstLine).from, to: doc.line(lastLine).to };
}

/** 当前计算窗口。创建时按光标附近初始化（initialWindowFor）；编辑时经 mapPos
 *  跟随漂移（窗口边缘的少量误差由下一次视口测量覆盖，不影响视口内渲染）。 */
export const windowField = StateField.define<DecorationWindow | null>({
  create: (state) => initialWindowFor(state),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setWindowEffect)) return effect.value;
    }
    if (value && tr.docChanged) {
      return {
        from: tr.changes.mapPos(value.from, -1),
        to: tr.changes.mapPos(value.to, 1),
      };
    }
    return value;
  },
});

/** 由视口（可见位置）换算窗口：前后各留 WINDOW_MARGIN_LINES 行，文档内夹取 */
export function windowForViewport(
  doc: Text,
  viewportFrom: number,
  viewportTo: number
): DecorationWindow {
  const fromPos = Math.max(0, Math.min(viewportFrom, doc.length));
  const toPos = Math.max(0, Math.min(viewportTo, doc.length));
  const firstLine = Math.max(1, doc.lineAt(fromPos).number - WINDOW_MARGIN_LINES);
  const lastLine = Math.min(doc.lines, doc.lineAt(toPos).number + WINDOW_MARGIN_LINES);
  return { from: doc.line(firstLine).from, to: doc.line(lastLine).to };
}

/**
 * 视口变化 → 微任务更新窗口（不能在 update 循环内直接 dispatch）。
 * - 隐藏/未测量视图（viewport 为空）保留上次窗口；
 * - 窗口未变化时不 dispatch（滚动几行时绝大多数更新被跳过，避免无谓重算）。
 */
export function windowDriver() {
  return ViewPlugin.fromClass(
    class {
      private pending = false;
      update(update: ViewUpdate) {
        if (!update.viewportChanged || this.pending) return;
        this.pending = true;
        const view = update.view;
        queueMicrotask(() => {
          this.pending = false;
          if (!view.dom.isConnected) return;
          const viewport = view.viewport;
          if (viewport.to <= viewport.from) return;
          const next = windowForViewport(view.state.doc, viewport.from, viewport.to);
          const current = view.state.field(windowField, false);
          if (current && current.from === next.from && current.to === next.to) return;
          view.dispatch({ effects: setWindowEffect.of(next) });
        });
      }
    }
  );
}
