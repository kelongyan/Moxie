import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

import { invoke } from "@tauri-apps/api/core";
import { persistPreferences, usePreferences } from "../src/state/preferences";

describe("侧栏展开状态：启动默认隐藏、不持久化", () => {
  it("hydrate 忽略磁盘上的 sidebarPinned", () => {
    usePreferences.getState().hydrate({ sidebarPinned: true });
    expect(usePreferences.getState().sidebarPinned).toBe(false);
  });

  it("persistPreferences 不写入 sidebarPinned（并清除历史值）", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockClear();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "settings_load") {
        return { sidebarPinned: true, hasConfirmedWorkspaceExitPrompt: true };
      }
      return null;
    });
    await persistPreferences();
    const saveCall = invokeMock.mock.calls.find(([cmd]) => cmd === "settings_save");
    expect(saveCall).toBeTruthy();
    const value = (saveCall?.[1] as { value: Record<string, unknown> }).value;
    expect(value).not.toHaveProperty("sidebarPinned");
    // 其余磁盘键保持合并写回
    expect(value.hasConfirmedWorkspaceExitPrompt).toBe(true);
  });
});