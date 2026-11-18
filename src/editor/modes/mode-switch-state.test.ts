import { afterEach, expect, it, vi } from "vitest";
import {
  captureEditorCaret,
  registerCaretReporter,
  setPendingCaret,
  takePendingCaret,
} from "./mode-switch-state";

afterEach(() => {
  setPendingCaret(null);
  registerCaretReporter(() => null)();
});

it("hands a caret set before the rich runtime loads to that runtime exactly once", async () => {
  const caret = { offset: 17, viewportY: 42 };
  setPendingCaret(caret);
  const runtime = await import("./mode-switch");
  expect(runtime.takePendingCaret()).toBe(caret);
  expect(takePendingCaret()).toBeNull();

  runtime.setPendingCaret(caret);
  expect(takePendingCaret()).toBe(caret);
  expect(runtime.takePendingCaret()).toBeNull();
});

it("captures synchronously through the same reporter and ignores an older editor's cleanup", async () => {
  const runtime = await import("./mode-switch");
  const unregisterOld = runtime.registerCaretReporter(() => ({
    offset: 1,
    viewportY: null,
  }));
  const caret = { offset: 9, viewportY: 15 };
  const report = vi.fn(() => caret);
  const unregister = runtime.registerCaretReporter(report);
  unregisterOld();
  expect(captureEditorCaret("raw *markdown*")).toBe(caret);
  expect(report).toHaveBeenCalledWith("raw *markdown*");
  expect(runtime.captureEditorCaret("again")).toBe(caret);
  unregister();
  expect(captureEditorCaret("after unmount")).toBeNull();
});
