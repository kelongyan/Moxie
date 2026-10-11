import { describe, expect, it } from "vitest";
import appSource from "../src/App.tsx?raw";
import toolbarSource from "../src/components/TitleToolbar.tsx?raw";

/**
 * 标签栏曾在顶栏 Typora 化重构（6faf7ad）中被摘掉挂载点：组件与整套样式都留在仓库里，
 * 却不再被渲染，界面上于是没有任何入口管理已打开文档（只剩 Ctrl+Tab 快捷键盲切）。
 * 用源码不变量守住挂载点，避免"组件在、没人用"再次静默发生。
 */
describe("标签栏挂载点", () => {
  it("App 在 TitleToolbar 内渲染 TabBar", () => {
    expect(appSource).toContain('import { TabBar } from "./components/TabBar"');
    expect(appSource).toMatch(/<TitleToolbar[\s\S]*?<TabBar \/>[\s\S]*?<\/TitleToolbar>/);
  });

  it("TitleToolbar 把 children 渲染在菜单栏与窗口控制之间的中段", () => {
    expect(toolbarSource).toContain("children?: ReactNode");
    expect(toolbarSource).toContain('<div className="titlebar-center">{children}</div>');
  });
});
