import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

import { buildEditorState } from "../src/editor/extensions";
import { usePreferences } from "../src/state/preferences";
import settingsSource from "../src/components/SettingsWindow.tsx?raw";
import toolbarSource from "../src/components/TitleToolbar.tsx?raw";
import extensionsSource from "../src/editor/extensions.ts?raw";
import prefsSource from "../src/state/preferences.ts?raw";

function stateOf(extra: { autoCloseBrackets?: boolean; spellcheck?: boolean }) {
  return buildEditorState({
    docId: "t",
    initialText: "hello",
    wordWrap: true,
    showLineNumbers: false,
    fontSizePt: 12,
    lineSpacingPt: 4,
    indentUnitText: "  ",
    enableHighlight: true,
    enableFold: false,
    enableLivePreview: false,
    imageSrcResolver: null,
    ...extra,
    onUpdate: () => {},
    onCursor: () => {},
  });
}

describe("自动配对括号（E-01）", () => {
  it("默认开启，且写进磁盘键", () => {
    expect(usePreferences.getState().autoCloseBrackets).toBe(true);
    expect(prefsSource).toContain("isAutoCloseBracketsEnabled");
  });

  it("开启时挂 closeBrackets，且 Markdown 语境不配对引号", () => {
    expect(extensionsSource).toContain("closeBrackets()");
    expect(extensionsSource).toContain(
      'closeBrackets: { brackets: ["(", "[", "{", "`"] }'
    );
    // 收窄后的括号表里不能出现引号（默认配置会配对 ' 与 "）
    const bracketsLine = extensionsSource
      .split("\n")
      .find((line) => line.includes("closeBrackets: { brackets:"));
    expect(bracketsLine).toBeTruthy();
    expect(bracketsLine).not.toContain('"\'"');
    expect(bracketsLine).not.toContain('"\\""');
  });

  it("开关进 EDITOR_KEYS（改设置会重建视图），两种取值都能建状态", () => {
    const on = stateOf({ autoCloseBrackets: true });
    const off = stateOf({ autoCloseBrackets: false });
    expect(on.doc.length).toBe(5);
    expect(off.doc.length).toBe(5);
    expect(prefsSource).toMatch(/"autoCloseBrackets",\s*"spellcheck"/);
  });
});

describe("拼写检查（E-03）", () => {
  it("默认关闭", () => {
    expect(usePreferences.getState().spellcheck).toBe(false);
  });

  it("开启时通过 contentAttributes 覆盖 CodeMirror 默认的 spellcheck=false", () => {
    expect(extensionsSource).toContain(
      'EditorView.contentAttributes.of({ spellcheck: "true" })'
    );
  });

  it("真实视图：开启后 cm-content 的 spellcheck 属性为 true，关闭时为 false", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const onView = new EditorView({
      state: EditorState.create({ extensions: [] }),
      parent: host,
    });
    // 直接验证 facet 覆盖机制本身（buildEditorState 的装配在下方源码不变量里守住）
    const onState = stateOf({ spellcheck: true });
    const onEditor = new EditorView({ state: onState, parent: host });
    expect(onEditor.contentDOM.getAttribute("spellcheck")).toBe("true");
    onEditor.destroy();
    onView.destroy();

    const offEditor = new EditorView({
      state: stateOf({ spellcheck: false }),
      parent: host,
    });
    expect(offEditor.contentDOM.getAttribute("spellcheck")).toBe("false");
    offEditor.destroy();
    host.remove();
  });
});

describe("设置页入口", () => {
  it("编辑器分组里有「自动配对括号」与「拼写检查」两个开关", () => {
    expect(settingsSource).toContain('title={t("自动配对括号")}');
    expect(settingsSource).toContain('title={t("拼写检查")}');
    expect(settingsSource).toContain("checked={prefs.autoCloseBrackets}");
    expect(settingsSource).toContain("checked={prefs.spellcheck}");
  });
});

describe("纯文本粘贴（E-04）与重新载入（N-07）入口", () => {
  it("Ctrl+Shift+V 已接线到 pastePlainExtension", () => {
    expect(extensionsSource).toContain("pastePlainExtension()");
  });

  it("应用菜单有「从磁盘重新载入」，无 path 时置灰", () => {
    expect(toolbarSource).toContain('label: "从磁盘重新载入"');
    expect(toolbarSource).toMatch(
      /label: "从磁盘重新载入",\s*disabled: !activeDoc\?\.path/
    );
    expect(toolbarSource).toContain("reloadActiveFromDiskAction");
  });

  it("应用菜单有「打印 / 导出 PDF…」", () => {
    expect(toolbarSource).toContain('label: "打印 / 导出 PDF…"');
    expect(toolbarSource).toContain("printDocument");
  });
});
