// @vitest-environment jsdom
import { expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { HEADING_PLACEHOLDER, PLACEHOLDER_CLASS } from "./lazy-block-dom";
import { createLazyBlocksPlugin } from "./lazy-blocks-state";

it("keeps the outline's selector and legacy exports matched to the editor's actual heading placeholders", async () => {
  const runtime = await import("./lazy-block-views");
  expect(runtime.PLACEHOLDER_CLASS).toBe(PLACEHOLDER_CLASS);
  expect(runtime.HEADING_PLACEHOLDER).toBe(HEADING_PLACEHOLDER);
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "text*", group: "block", toDOM: () => ["p", 0] },
      heading: { content: "text*", group: "block", toDOM: () => ["h2", 0] },
      text: {},
    },
  });
  const doc = schema.node(
    "doc",
    null,
    Array.from({ length: 1600 }, (_, i) =>
      schema.node(
        i === 1500 ? "heading" : "paragraph",
        null,
        schema.text(`${i}`.padEnd(100, ".")),
      ),
    ),
  );
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc, plugins: [createLazyBlocksPlugin()] }),
    nodeViews: runtime.lazyBlockNodeViews(schema, {}),
  });
  try {
    expect(view.dom.children[1500].className).toBe(PLACEHOLDER_CLASS);
    expect(view.dom.querySelectorAll(HEADING_PLACEHOLDER)).toHaveLength(1);
    expect(view.dom.querySelector(HEADING_PLACEHOLDER)).toBe(
      view.dom.children[1500],
    );
    expect(view.dom.children[1499].matches(HEADING_PLACEHOLDER)).toBe(false);
  } finally {
    view.destroy();
  }
});
