// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense, type ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../prefs/settings-types";
import en from "../i18n/locales/en";
import { loadedModules } from "../lazy/lazy-module";
import { EditorChatPortals } from "./EditorChatPortals";

const loading = vi.hoisted(() => {
  let releasePanel!: () => void;
  let releaseQuick!: () => void;
  const panel = new Promise<void>((resolve) => {
    releasePanel = resolve;
  });
  const quick = new Promise<void>((resolve) => {
    releaseQuick = resolve;
  });
  return {
    panel,
    quick,
    releasePanel,
    releaseQuick,
    panelImport: vi.fn(),
    quickImport: vi.fn(),
    panelProps: vi.fn(),
    quickProps: vi.fn(),
  };
});

vi.mock("./EditorAgentPanel", async () => {
  loading.panelImport();
  await loading.panel;
  return {
    EditorAgentPanel: (props: unknown) => {
      loading.panelProps(props);
      return <div>Panel ready</div>;
    },
  };
});
vi.mock("../ai/chat/quick-ask/InlineChat", async () => {
  loading.quickImport();
  await loading.quick;
  return {
    InlineChat: (props: unknown) => {
      loading.quickProps(props);
      return <div>Quick Ask ready</div>;
    },
  };
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

it("loads each chat on first open without hiding the editor or replacing its conversations and proposals", async () => {
  const panelHost = document.createElement("div");
  const quickHost = document.createElement("div");
  document.body.append(panelHost, quickHost);
  const conversation = { history: [{ kind: "User", text: "keep this" }] };
  const quickConversation = { history: [] };
  const pendingEdits = {
    decidable: [{ callId: "before-close" }],
    status: vi.fn(() => "pending"),
  };
  const showProposals = vi.fn();
  type Props = ComponentProps<typeof EditorChatPortals>;
  const props = {
    setup: { run: vi.fn(), inlineChat: { visible: false, chatInfo: null } },
    chat: {
      panelContainer: null,
      conversation,
      quickConversation,
      pendingEdits,
      controls: { chatGuard: null, quickAskHost: quickHost },
      review: {},
      bridge: {},
      proposals: { showProposals },
    },
    review: { notes: {} },
    filePath: "/note.md",
    phone: false,
    tourMode: null,
    settings: { ...DEFAULT_SETTINGS, moxieAi: true },
    t: en,
  } as unknown as Props;
  const draw = () => (
    <Suspense fallback={<div>Editor suspended</div>}>
      <p>Editor stays visible</p>
      <EditorChatPortals {...props} />
    </Suspense>
  );
  const shown = render(draw());
  expect(loading.panelImport).not.toHaveBeenCalled();
  expect(loading.quickImport).not.toHaveBeenCalled();

  props.chat.panelContainer = panelHost;
  shown.rerender(draw());
  expect(screen.queryByText("Editor suspended")).toBeNull();
  expect(screen.getByText("Editor stays visible").style.display).not.toBe(
    "none",
  );
  expect(loadedModules()).not.toContain("editor-agent-panel");
  await act(async () => {
    loading.releasePanel();
  });
  await screen.findByText("Panel ready");
  expect(loading.panelProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      conversation,
      pendingEdits,
      showProposals,
    }),
  );
  expect(loading.quickImport).not.toHaveBeenCalled();

  props.chat.panelContainer = null;
  shown.rerender(draw());
  expect(screen.queryByText("Panel ready")).toBeNull();
  // A stream may finish while the panel is closed; its owner remains the
  // editor, and the reopened view receives the current proposal collection.
  pendingEdits.decidable.push({ callId: "while-closed" });
  props.chat.panelContainer = panelHost;
  shown.rerender(draw());
  expect(screen.getByText("Panel ready")).toBeDefined();
  expect(loading.panelProps.mock.lastCall?.[0].pendingEdits).toBe(pendingEdits);
  expect(loading.panelImport).toHaveBeenCalledOnce();

  props.setup.inlineChat.visible = true;
  props.setup.inlineChat.chatInfo = {
    document: { markdown: "selected", blocks: [] },
    selectedText: "selected",
    selectionMarkdown: "selected",
    range: { from: 1, to: 9 },
    anchor: 1,
    widgetPos: 10,
  };
  shown.rerender(draw());
  expect(screen.queryByText("Editor suspended")).toBeNull();
  expect(screen.getByText("Panel ready")).toBeDefined();
  await act(async () => {
    loading.releaseQuick();
  });
  await screen.findByText("Quick Ask ready");
  expect(loading.quickProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      conversation: quickConversation,
      onProposals: showProposals,
      proposalStatus: pendingEdits.status,
      pendingCount: 2,
      selectedText: "selected",
    }),
  );
  props.setup.inlineChat.visible = false;
  shown.rerender(draw());
  expect(screen.queryByText("Quick Ask ready")).toBeNull();
  props.setup.inlineChat.visible = true;
  shown.rerender(draw());
  expect(screen.getByText("Quick Ask ready")).toBeDefined();
  expect(loading.quickImport).toHaveBeenCalledOnce();
});
