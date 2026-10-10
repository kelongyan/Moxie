import { describe, expect, it } from "vitest";
import { buildRestorePlan } from "../src/state/recovery";

describe("buildRestorePlan（仅崩溃恢复）", () => {
  it("dedupes crash entries by path, keeping the first", () => {
    const plan = buildRestorePlan([
      { meta: { docId: "c1", path: "C:\\a.txt" }, content: "first" },
      { meta: { docId: "c2", path: "C:\\a.txt" }, content: "dup" },
      { meta: { docId: "c3", path: "C:\\b.txt" }, content: "b" },
    ]);
    expect(plan).toHaveLength(2);
    expect(plan[0].content).toBe("first");
    expect(plan[1].content).toBe("b");
  });

  it("dedupes untitled docs by docId", () => {
    const plan = buildRestorePlan([
      { meta: { docId: "x", path: null }, content: "crash" },
      { meta: { docId: "x", path: null }, content: "crash-dup" },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0].content).toBe("crash");
  });

  it("keeps entry order", () => {
    const plan = buildRestorePlan([
      { meta: { docId: "a", path: null }, content: "1" },
      { meta: { docId: "b", path: null }, content: "2" },
    ]);
    expect(plan.map((p) => p.content)).toEqual(["1", "2"]);
  });
});
