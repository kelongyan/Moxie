import { describe, expect, it } from "vitest";
import { buildRestorePlan } from "../src/state/recovery";

describe("buildRestorePlan", () => {
  it("crash entries take priority over workspace docs with same path", () => {
    const plan = buildRestorePlan(
      [
        {
          meta: { docId: "c1", path: "C:\\a.txt", isDirty: true },
          content: "crash-content",
        },
      ],
      [
        {
          meta: { docId: "w1", path: "C:\\a.txt", isDirty: false },
          content: "workspace-content",
        },
        {
          meta: { docId: "w2", path: "C:\\b.txt", isDirty: false },
          content: "b-content",
        },
      ]
    );
    expect(plan).toHaveLength(2);
    expect(plan[0].source).toBe("crash");
    expect(plan[0].content).toBe("crash-content");
    expect(plan[1].content).toBe("b-content");
  });

  it("keeps workspace order for non-conflicting docs", () => {
    const plan = buildRestorePlan(
      [],
      [
        { meta: { docId: "a", path: null }, content: "1" },
        { meta: { docId: "b", path: null }, content: "2" },
      ]
    );
    expect(plan.map((p) => p.content)).toEqual(["1", "2"]);
  });

  it("dedupes untitled docs by docId", () => {
    const plan = buildRestorePlan(
      [
        { meta: { docId: "x", path: null }, content: "crash" },
        { meta: { docId: "x", path: null }, content: "crash-dup" },
      ],
      [{ meta: { docId: "x", path: null }, content: "ws" }]
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].content).toBe("crash");
  });
});
