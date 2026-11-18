import { makeBlankTab, type DocTab } from "./doc-tabs";

/** Read a session in order without activating and mounting every intermediate
 * tab. Yield between bounded groups so large sessions still accept input. */
export async function readRestoredTabs(
  paths: readonly string[],
  read: (path: string) => Promise<Partial<DocTab> | null>,
): Promise<DocTab[]> {
  const tabs: DocTab[] = [];
  const unique = [...new Set(paths)];
  for (let start = 0; start < unique.length; start += 4) {
    const group = await Promise.all(
      unique.slice(start, start + 4).map(async (path) => {
        try {
          const doc = await read(path);
          return doc ? { ...makeBlankTab(), ...doc } : null;
        } catch {
          // One deleted or inaccessible document must not lose the rest.
          return null;
        }
      }),
    );
    for (const tab of group) if (tab) tabs.push(tab);
    if (start + 4 < unique.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return tabs;
}
