import { expect, test } from "@playwright/test";
import { openApp, release } from "./helpers";

test("does not build an empty editor while launch data is still pending", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__devInvokeResults = {
      take_detached_tab: { __hold: true, value: null },
    };
  });
  await openApp(page, { settings: { language: "en" }, ready: ".app-shell" });
  await expect(page.locator(".ProseMirror")).toHaveCount(0);
  await release(page, "take_detached_tab");
  await expect(
    page.locator('[data-active-tab="true"] .ProseMirror'),
  ).toBeVisible();
});

test("restores a batch without mounting all the background editors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const paths = Array.from(
      { length: 10 },
      (_, index) => `/notes/${index}.md`,
    );
    w.__devFiles = Object.fromEntries(
      paths.map((path, index) => [path, `# Document ${index}\n\nSaved text.`]),
    );
    w.__devInvokeResults = { take_pending_window_paths: paths };
  });
  await openApp(page, { settings: { language: "en" } });
  await expect(page.getByRole("tab")).toHaveCount(10);
  await expect(
    page.locator('[data-active-tab="true"] .ProseMirror h1'),
  ).toContainText("Document 9");
  // The first document can be shown while the rest load. Intermediate ones
  // stay as tab data until chosen instead of constructing ten editors.
  await expect
    .poll(() => page.locator(".ProseMirror").count())
    .toBeLessThanOrEqual(2);
  await page.getByRole("tab", { name: "4.md", exact: true }).click();
  await expect(
    page.locator('[data-active-tab="true"] .ProseMirror h1'),
  ).toContainText("Document 4");
});
