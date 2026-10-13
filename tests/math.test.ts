import { describe, expect, it, vi } from "vitest";
import katex from "katex";
import { renderKatex } from "../src/preview/math";

/**
 * KaTeX 渲染缓存（docs/渲染优化方案.md O-5）：同公式重复渲染命中缓存；
 * display 模式是缓存键的一部分；失败结果不入缓存（可重试）。
 */
describe("renderKatex 渲染缓存", () => {
  it("同一公式（同 display 模式）第二次渲染命中缓存", () => {
    const spy = vi.spyOn(katex, "renderToString");
    const a = renderKatex("x^2+y^2=r^2", false);
    const b = renderKatex("x^2+y^2=r^2", false);
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);

    // display 模式不同 = 不同缓存键，需再渲染一次
    renderKatex("x^2+y^2=r^2", true);
    expect(spy).toHaveBeenCalledTimes(2);

    // display 模式的结果也进了缓存
    renderKatex("x^2+y^2=r^2", true);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("渲染失败回退原文，且失败结果不入缓存（可重试）", () => {
    const spy = vi
      .spyOn(katex, "renderToString")
      .mockImplementation(() => {
        throw new Error("boom");
      });
    const failed = renderKatex("\\failing-formula-xyz", false);
    expect(failed).toContain("math-error");
    spy.mockRestore();

    // 恢复后同一公式正常渲染——说明失败结果没有被缓存污染
    const ok = renderKatex("\\failing-formula-xyz", false);
    expect(ok).not.toContain("math-error");
  });
});
