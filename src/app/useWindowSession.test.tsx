// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocTab } from "../document/doc-tabs";
import { useSessionPaths } from "./useWindowSession";
import {
  flushPendingWrites,
  resetPendingWritesForTests,
} from "../storage/pending-writes";

const state = vi.hoisted(() => ({
  restored: false,
  write: vi.fn<(paths: string[]) => Promise<void>>(async () => {}),
}));
vi.mock("../platform/ipc", () => ({
  session: { updateSessionPaths: state.write },
}));
vi.mock("../platform/capabilities", () => ({ canUseWindows: true }));
vi.mock("../document/startup-state", () => ({
  useStartupRestored: () => state.restored,
}));

const tabs = (...paths: string[]) =>
  paths.map((path, index) => ({ id: `${index}`, path }) as DocTab);
const wrapper = ({ children }: PropsWithChildren) => (
  <StrictMode>{children}</StrictMode>
);

beforeEach(() => {
  state.restored = false;
  state.write.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  resetPendingWritesForTests();
  vi.useRealTimers();
});

describe("persisting a window's session", () => {
  it("waits for restoration and then keeps later opens and closes", async () => {
    const shown = renderHook(({ files }) => useSessionPaths(files), {
      initialProps: { files: tabs("first.md") },
      wrapper,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.write).not.toHaveBeenCalled();

    state.restored = true;
    shown.rerender({ files: tabs("first.md", "second.md") });
    await vi.advanceTimersByTimeAsync(250);
    expect(state.write).toHaveBeenLastCalledWith(["first.md", "second.md"]);

    shown.rerender({ files: tabs("second.md", "third.md") });
    await vi.advanceTimersByTimeAsync(250);
    expect(state.write).toHaveBeenLastCalledWith(["second.md", "third.md"]);
  });

  it("flushes a tab opened immediately before the window closes", async () => {
    state.restored = true;
    const shown = renderHook(({ files }) => useSessionPaths(files), {
      initialProps: { files: tabs("first.md") },
      wrapper,
    });
    shown.rerender({ files: tabs("first.md", "last.md") });
    await flushPendingWrites();
    expect(state.write).toHaveBeenLastCalledWith(["first.md", "last.md"]);
  });
});
