import { describe, expect, it, vi } from "vitest";
import { readRestoredTabs } from "./restore-documents";

describe("reading a restored session", () => {
  it("keeps the session order even when later files finish first", async () => {
    let first!: (value: { path: string }) => void;
    const pending = readRestoredTabs(["a.md", "b.md", "a.md"], (path) =>
      path === "a.md"
        ? new Promise((resolve) => {
            first = resolve;
          })
        : Promise.resolve({ path }),
    );
    first({ path: "a.md" });
    expect((await pending).map((tab) => tab.path)).toEqual(["a.md", "b.md"]);
  });

  it("restores readable documents after a missing file", async () => {
    const read = vi.fn(async (path: string) => {
      if (path === "gone.md") throw new Error("missing");
      return { path, content: path, savedContent: path };
    });
    const tabs = await readRestoredTabs(["gone.md", "a.md", "b.md"], read);
    expect(tabs.map((tab) => tab.path)).toEqual(["a.md", "b.md"]);
    expect(tabs.every((tab) => tab.content === tab.savedContent)).toBe(true);
  });

  it("limits concurrent reads instead of flooding the backend", async () => {
    let running = 0;
    let peak = 0;
    await readRestoredTabs(
      Array.from({ length: 11 }, (_, n) => `${n}.md`),
      async (path) => {
        peak = Math.max(peak, ++running);
        await new Promise((resolve) => setTimeout(resolve, 0));
        running--;
        return { path };
      },
    );
    expect(peak).toBe(4);
  });
});
