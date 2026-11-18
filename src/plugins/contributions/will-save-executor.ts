import { logPluginMessage } from "../store/plugin-log";
import { mergeWholeText, textBlocks } from "./save-blocks";
import type { WillSaveListener, WillSaveRequest } from "./will-save";

type Request = Omit<WillSaveRequest, "blocks">;

async function answer(
  ask: WillSaveListener,
  request: Request,
  until: number,
): Promise<string> {
  const reply = await Promise.race([
    ask({ ...request, blocks: textBlocks(request.text) }).catch(() => null),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), Math.max(0, until - Date.now())),
    ),
  ]);
  return typeof reply === "string" ? reply : request.text;
}

/** The parser and block merging are needed only when a save has listeners. */
export async function runListeners(
  listeners: readonly (readonly [string, WillSaveListener])[],
  request: Request,
  timeout: number,
): Promise<string> {
  let current = request.text;
  for (const [plugin, ask] of listeners) {
    const until = Date.now() + timeout;
    const once = await answer(ask, { ...request, text: current }, until);
    if (once === current) continue;
    const log = (why: string) =>
      logPluginMessage(plugin, "warn", `Not saved: ${why}.`);
    // Lint rules that fight each other would change it on every save.
    const twice = await answer(ask, { ...request, text: once }, until);
    if (twice !== once) {
      log("its change changes again when it runs a second time");
      continue;
    }
    current = mergeWholeText(current, once, log);
  }
  return current;
}
