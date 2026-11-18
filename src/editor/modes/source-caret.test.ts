// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";
import {
  applySourceCaret,
  centerSourceCaret,
  readSourceCaret,
} from "./source-caret";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function source() {
  const scrollDOM = document.createElement("div");
  document.body.append(scrollDOM);
  scrollDOM.scrollTop = 20;
  vi.spyOn(scrollDOM, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 100, 400, 240),
  );
  const view = {
    scrollDOM,
    state: { selection: { main: { head: 7 } }, doc: { length: 20 } },
    dispatch: vi.fn(),
    focus: vi.fn(),
    coordsAtPos: vi.fn(() => ({ top: 220, bottom: 240 })),
  };
  return { view: view as unknown as EditorView, ...view };
}

it("reads source position and places it synchronously with the same viewport distance", () => {
  const { view, dispatch, focus, scrollDOM } = source();
  const caret = readSourceCaret(view);
  expect(caret).toEqual({ offset: 7, viewportY: 120 });
  applySourceCaret(view, caret);
  expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 7 } });
  expect(focus).toHaveBeenCalledOnce();
  expect(scrollDOM.scrollTop).toBe(20);
});

it("clamps the source offset and corrects scroll in zoomed content coordinates", () => {
  const { view, dispatch, scrollDOM } = source();
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    zoom: "2",
  } as CSSStyleDeclaration);
  applySourceCaret(view, { offset: 90, viewportY: 40 });
  expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 20 } });
  expect(scrollDOM.scrollTop).toBe(60);
  applySourceCaret(view, { offset: -3, viewportY: 120 });
  expect(dispatch).toHaveBeenLastCalledWith({ selection: { anchor: 0 } });
});

it("keeps the caret even when its source editor has no layout yet", () => {
  const { view, coordsAtPos, dispatch, scrollDOM } = source();
  coordsAtPos.mockImplementation(() => {
    throw new Error("hidden");
  });
  expect(readSourceCaret(view)).toEqual({ offset: 7, viewportY: null });
  applySourceCaret(view, { offset: 4, viewportY: null });
  centerSourceCaret(view);
  expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 4 } });
  expect(scrollDOM.scrollTop).toBe(20);
});
