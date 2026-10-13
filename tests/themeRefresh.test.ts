import { beforeAll, describe, expect, it, vi } from "vitest";
import { initTheme, onThemeChange, useThemeStore } from "../src/state/theme";

/**
 * 主题变更通知（docs/渲染优化方案.md O-6）：手动切换与 system 跟随两条路径
 * 都要在"解析后主题真实变化"时通知订阅者，同值重复不重复通知。
 * 编辑器侧据此刷新 mermaid 等主题相关装饰（EditorPane 订阅 → refreshLivePreview）。
 */

let systemDark = false;
const changeCallbacks: Array<() => void> = [];

function installMediaStub() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return systemDark;
    },
    media: query,
    onchange: null,
    addEventListener: (type: string, cb: () => void) => {
      if (type === "change") changeCallbacks.push(cb);
    },
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeAll(() => {
  installMediaStub();
  initTheme();
});

describe("onThemeChange 主题变更通知", () => {
  it("解析主题真实变化时通知；同值重复不通知；退订后不再收到", () => {
    const seen: string[] = [];
    const off = onThemeChange((r) => seen.push(r));

    useThemeStore.getState().setMode("dark"); // light → dark
    expect(seen).toEqual(["dark"]);

    useThemeStore.getState().setMode("dark"); // 同值重复设置：不通知
    expect(seen).toEqual(["dark"]);

    useThemeStore.getState().setMode("light"); // dark → light
    expect(seen).toEqual(["dark", "light"]);

    off();
    useThemeStore.getState().setMode("dark");
    expect(seen).toEqual(["dark", "light"]); // 已退订，不再收到

    useThemeStore.getState().setMode("system"); // 复位（systemDark=false → light）
  });

  it("system 模式下系统偏好变化（matchMedia change）触发通知", () => {
    useThemeStore.getState().setMode("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    const seen: string[] = [];
    const off = onThemeChange((r) => seen.push(r));

    systemDark = true;
    for (const cb of [...changeCallbacks]) cb();
    expect(seen).toEqual(["dark"]);
    expect(document.documentElement.dataset.theme).toBe("dark");

    systemDark = false;
    for (const cb of [...changeCallbacks]) cb();
    expect(seen).toEqual(["dark", "light"]);

    off();
  });
});
