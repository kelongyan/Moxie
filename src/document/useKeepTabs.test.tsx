// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DocTab } from "./doc-tabs";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});

it("starts snapshotting after restoration even if the tab array did not change", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const { useKeepTabs, keptTabsRestored, readKeptTabs } =
    await import("./reload-tabs");
  const tabs = [
    {
      id: "draft",
      path: null,
      content: "unsaved writing",
      savedContent: "",
      reloadKey: 0,
      diskMtime: null,
      sourceMode: false,
    },
  ] as DocTab[];
  renderHook(() => useKeepTabs(tabs, "draft", true, () => tabs));
  await vi.advanceTimersByTimeAsync(1000);
  expect(readKeptTabs()).toBeNull();
  act(() => keptTabsRestored());
  await vi.advanceTimersByTimeAsync(1000);
  expect(readKeptTabs()?.tabs[0].text?.content).toBe("unsaved writing");
});
