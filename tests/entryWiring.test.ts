import { describe, expect, it } from "vitest";
import toolbarSource from "../src/components/TitleToolbar.tsx?raw";
import statusBarSource from "../src/components/StatusBar.tsx?raw";
import appSource from "../src/App.tsx?raw";

/**
 * 入口接线不变量（docs/成熟度差距分析.md §1）。
 *
 * 两处回归的共同特征：功能已完整实现、测试覆盖，但 UI 入口在重构中被删掉后
 * 没接回——代码在、测试绿，常规回归检测抓不到，用户视角等同"功能不存在"：
 *   - 历史版本时间线：timeline.rs + HistoryOverlay 齐备，openHistoryOverlay 零调用（2367d08 删除菜单项）；
 *   - 字数统计：countWords 齐备，useDocStats 被删后无 UI（1313b4d）。
 * 用源码不变量守住入口，避免同类静默丢失再次发生。
 */
describe("历史版本时间线入口", () => {
  it("应用菜单里有「历史版本…」并调用 openHistoryOverlay", () => {
    expect(toolbarSource).toContain('import { openHistoryOverlay } from "../state/historyOverlay"');
    expect(toolbarSource).toContain('label: "历史版本…"');
    expect(toolbarSource).toMatch(/label: "历史版本…"[\s\S]{0,120}openHistoryOverlay\(\)/);
  });

  it("未保存文档（无 path）时置灰", () => {
    expect(toolbarSource).toMatch(/label: "历史版本…",\s*disabled: !activeDoc\?\.path/);
  });

  it("浮层挂载点仍在 App", () => {
    expect(appSource).toContain("{historyOpen && <HistoryOverlay />}");
  });
});

describe("字数统计入口", () => {
  it("状态栏使用 useDocStats 并按开关门控", () => {
    expect(statusBarSource).toContain("useDocStats");
    expect(statusBarSource).toContain("nextStatMode");
    expect(statusBarSource).toContain("STAT_LABELS");
  });

  it("三种口径都在标签表里（字数 / 段落 / 字符）", () => {
    expect(statusBarSource).toMatch(/STAT_LABELS\[statMode\]/);
    expect(statusBarSource).toContain("setStatMode(nextStatMode(statMode))");
  });

  it("「大文件模式」菜单仍列出实时字数统计（该开关是统计的唯一门控）", () => {
    expect(statusBarSource).toContain('{ key: "wordCount", label: "实时字数统计" }');
  });
});
