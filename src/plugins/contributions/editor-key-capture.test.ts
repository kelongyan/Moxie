// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import {
  capturedKey,
  held,
  heldByPlugin,
  keyHolder,
} from "./editor-key-capture";
import type { KeyCapture } from "./editor-input-state";

vi.mock("../../platform/ipc-app", () => ({
  inputSourceIpc: { setRoman: vi.fn(async () => {}) },
}));

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  held.owner = null;
  held.cursorStyle = "bar";
  vi.restoreAllMocks();
});

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

it("shares the capture with the later-loaded editor and keeps querying and delivery synchronous", async () => {
  const undo = key({ key: "/", ctrlKey: true });
  expect(heldByPlugin(undo)).toBe(false);
  const input = await import("./editor-input");
  const state = await import("./editor-input-state");
  expect(state.held).toBe(held);
  expect(input.heldByPlugin).toBe(heldByPlugin);
  expect(input.keyHolder).toBe(keyHolder);

  const schema = new Schema({
    nodes: {
      doc: { content: "paragraph+" },
      paragraph: { content: "text*", toDOM: () => ["p", 0] },
      text: {},
    },
  });
  const plugin = input.createEditorInputPlugin();
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ schema, plugins: [plugin] }),
  });
  views.push(view);
  const focus = vi.spyOn(view, "hasFocus").mockReturnValue(true);
  const deliver = vi.fn();
  const capture: KeyCapture = { mode: "some", keys: ["ctrl+/"] };
  expect(input.setKeyCapture("test.keys", capture, deliver, "Test keys")).toBe(
    true,
  );
  expect(keyHolder()).toEqual({ id: "test.keys", name: "Test keys" });
  expect(heldByPlugin(undo)).toBe(true);
  expect(deliver).not.toHaveBeenCalled();
  expect(held.owner?.lastKeyAt).toBe(0);
  expect(plugin.props.handleKeyDown!.call(plugin, view, undo)).toBe(true);
  expect(deliver).toHaveBeenCalledExactlyOnceWith("ctrl+/");
  expect(held.owner?.lastKeyAt).toBeGreaterThan(0);

  state.setCursorStyle("block");
  expect(held.cursorStyle).toBe("block");
  focus.mockReturnValue(false);
  expect(heldByPlugin(undo)).toBe(false);
  focus.mockReturnValue(true);
  expect(heldByPlugin(undo)).toBe(true);
  input.releaseKeys("someone.else");
  expect(heldByPlugin(undo)).toBe(true);
  input.releaseKeys("test.keys");
  expect(heldByPlugin(undo)).toBe(false);
  expect(keyHolder()).toBeNull();
  expect(held.cursorStyle).toBe("bar");

  input.setKeyCapture("test.keys", capture, deliver);
  view.destroy();
  views.pop();
  expect(held.view).toBeNull();
  expect(heldByPlugin(undo)).toBe(false);
});

it.each(["Win32", "MacIntel"])(
  "preserves %s shortcut exceptions and named captures",
  (platform) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const all: KeyCapture = { mode: "all", keys: [] };
    const appKey =
      platform === "MacIntel"
        ? key({ key: "/", metaKey: true })
        : key({ key: "/", ctrlKey: true });
    const name = platform === "MacIntel" ? "meta+/" : "ctrl+/";
    expect(capturedKey(key({ key: "j" }), all)).toBe("j");
    expect(capturedKey(appKey, all)).toBeNull();
    expect(capturedKey(appKey, { ...all, keys: [name] })).toBe(name);
    expect(
      capturedKey(key({ key: "j" }), { mode: "some", keys: [name] }),
    ).toBeNull();
    expect(capturedKey(appKey, { mode: "some", keys: [name] })).toBe(name);
    expect(capturedKey(key({ key: "f", ctrlKey: true }), all)).toBe(
      platform === "MacIntel" ? "ctrl+f" : null,
    );
  },
);

it("leaves composition and modifier-only keydowns to the input method", () => {
  for (const event of [
    key({ key: "j", isComposing: true }),
    key({ key: "j", keyCode: 229 }),
    ...["Shift", "Control", "Alt", "Meta", "CapsLock"].map((name) =>
      key({ key: name }),
    ),
  ]) {
    expect(capturedKey(event, { mode: "all", keys: [] })).toBeNull();
    expect(capturedKey(event, { mode: "some", keys: [event.key] })).toBeNull();
  }
});
