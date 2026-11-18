// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBlankTab, type DocTab } from "../document/doc-tabs";
import { restoreSessionTabs } from "./restore-session-tabs";

afterEach(() => vi.restoreAllMocks());

function session(
  readDocument: (path: string) => Promise<Partial<DocTab> | null>,
) {
  let files: DocTab[] = [
    { ...makeBlankTab(), id: "initial", path: "first.md" },
  ];
  let active = "initial";
  const choose = vi.fn((id: string) => {
    active = id;
  });
  return {
    files: () => files,
    active: () => active,
    choose,
    open(path: string) {
      files = [...files, { ...makeBlankTab(), id: "reader", path }];
      active = "reader";
    },
    restore: (paths: string[]) =>
      restoreSessionTabs({
        paths,
        liveTabs: () => files,
        activeTabId: () => active,
        readDocument,
        restoreCarets: false,
        setTabs: (update) => {
          files = update(files);
        },
        setActiveTabId: choose,
      }),
  };
}

describe("restoring the remaining session tabs", () => {
  it("adds the remaining tabs together and selects only the final one", async () => {
    const read = vi.fn(async (path: string) => ({
      path,
      content: path,
      savedContent: path,
    }));
    const shown = session(read);
    await shown.restore(["first.md", "second.md", "third.md"]);
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      "second.md",
      "third.md",
    ]);
    expect(shown.files().map((tab) => tab.path)).toEqual([
      "first.md",
      "second.md",
      "third.md",
    ]);
    expect(shown.choose).toHaveBeenCalledTimes(1);
    expect(shown.active()).toBe(shown.files()[2].id);
  });

  it("keeps the reader's current tab if they type while another file loads", async () => {
    let release!: (doc: Partial<DocTab>) => void;
    const shown = session(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = shown.restore(["second.md"]);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    release({ path: "second.md", content: "second", savedContent: "second" });
    await pending;
    expect(shown.active()).toBe("initial");
    expect(shown.choose).not.toHaveBeenCalled();
    expect(shown.files()).toHaveLength(2);
  });

  it("does not duplicate a file the reader opened while restoration waited", async () => {
    let release!: (doc: Partial<DocTab>) => void;
    const shown = session(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = shown.restore(["second.md"]);
    shown.open("second.md");
    release({ path: "second.md", content: "second", savedContent: "second" });
    await pending;
    expect(shown.files().map((tab) => tab.path)).toEqual([
      "first.md",
      "second.md",
    ]);
    expect(shown.active()).toBe("reader");
  });
});
