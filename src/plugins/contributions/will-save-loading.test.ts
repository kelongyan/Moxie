import { afterEach, expect, it, vi } from "vitest";
import { loadedModules } from "../../lazy/lazy-module";
import {
  forgetWillSave,
  hasWillSave,
  runWillSave,
  setWillSave,
} from "./will-save";

afterEach(() => {
  for (const id of ["a.first", "b.second", "c.later"]) forgetWillSave(id);
});

it("loads the save executor only for a save with listeners, keeping that save's snapshot", async () => {
  expect(hasWillSave()).toBe(false);
  expect(await runWillSave("/note.md", "original")).toBe("original");
  expect(loadedModules()).not.toContain("plugin-will-save");

  const seen: string[] = [];
  const first = vi.fn(async ({ text }: { text: string }) => {
    seen.push("a");
    return text.replace("original", "edited");
  });
  const second = vi.fn(async ({ text }: { text: string }) => {
    seen.push("b");
    return text;
  });
  const later = vi.fn(async () => null);
  setWillSave("b.second", true, second);
  setWillSave("a.first", true, first);
  expect(hasWillSave()).toBe(true);

  const saving = runWillSave("/note.md", "original", "auto");
  // A listener removed/replaced while import() is pending still belongs to
  // this save; one registered afterwards starts with the next save.
  forgetWillSave("a.first");
  setWillSave("b.second", true, later);
  setWillSave("c.later", true, later);
  expect(await saving).toBe("edited");
  expect(seen).toEqual(["a", "a", "b"]);
  expect(first.mock.calls[0][0]).toMatchObject({
    path: "/note.md",
    trigger: "auto",
    blocks: [expect.objectContaining({ markdown: "original" })],
  });
  expect(later).not.toHaveBeenCalled();
  expect(loadedModules()).toContain("plugin-will-save");

  const next = runWillSave("/note.md", "next");
  expect(later).toHaveBeenCalledTimes(1);
  expect(await next).toBe("next");
  expect(later).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(1);
});
