import type { DocumentPlace } from "../plugins/app-bridge";
import { lastCaret } from "./last-carets";
import type { TabJump } from "../editor/tab-jump";

export function openingJump(
  open: {
    anchor?: string;
    place?: DocumentPlace;
    restoreCaret?: boolean;
  },
  path: string,
  diskMtime: number | null,
  restoreCarets: boolean,
): TabJump | null {
  if (open.place) return { kind: "place", place: open.place };
  if (open.anchor) return { kind: "heading", anchor: open.anchor };
  const at =
    open.restoreCaret && restoreCarets ? lastCaret(path, diskMtime) : null;
  return at && { kind: "caret", at };
}
