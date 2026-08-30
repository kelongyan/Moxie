import { EditorView } from "@codemirror/view";

export const ORDERED = /^(\s*)(\d+)([.)])(\s+)(.*)$/;
export const UNORDERED = /^(\s*)([-*+])(\s+)(.*)$/;
export const EMPTY_ITEM = /^(\s*)(?:\d+[.)]|[-*+])[ \t]*$/;
const ORDERED_PREFIX = /^(\s*)(\d+)([.)])(\s+)/;
const RENUMBER_ITEM_LIMIT = 500;

export type Continuation =
  | { kind: "insert"; text: string }
  | { kind: "exit"; indent: string };

export function continuationForLine(lineText: string): Continuation | null {
  const empty = EMPTY_ITEM.exec(lineText);
  if (empty) return { kind: "exit", indent: empty[1] };

  const ordered = ORDERED.exec(lineText);
  if (ordered) {
    const [, indent, num, delim] = ordered;
    return { kind: "insert", text: `${indent}${Number(num) + 1}${delim} ` };
  }

  const unordered = UNORDERED.exec(lineText);
  if (unordered) {
    const [, indent, bullet] = unordered;
    return { kind: "insert", text: `${indent}${bullet} ` };
  }

  return null;
}

export function computeRenumbering(
  lines: string[],
  cursorIdx: number
): { lineIdx: number; newNumber: number }[] | null {
  const first = ORDERED_PREFIX.exec(lines[cursorIdx]);
  if (!first) return null;
  const indent = first[1];
  const delim = first[3];

  let startIdx = cursorIdx;
  for (let n = cursorIdx - 1; n >= 0; n--) {
    const m = ORDERED_PREFIX.exec(lines[n]);
    if (!m || m[1] !== indent || m[3] !== delim) break;
    startIdx = n;
  }
  let endIdx = cursorIdx;
  for (let n = cursorIdx + 1; n < lines.length; n++) {
    const m = ORDERED_PREFIX.exec(lines[n]);
    if (!m || m[1] !== indent || m[3] !== delim) break;
    endIdx = n;
  }

  const count = endIdx - startIdx + 1;
  if (count <= 1 || count > RENUMBER_ITEM_LIMIT) return null;

  let num = Number(ORDERED_PREFIX.exec(lines[startIdx])![2]);
  const changes: { lineIdx: number; newNumber: number }[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const m = ORDERED_PREFIX.exec(lines[i])!;
    if (Number(m[2]) !== num) {
      changes.push({ lineIdx: i, newNumber: num });
    }
    num++;
  }
  return changes;
}

export function markdownEnterHandler(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (range.from !== range.to) return false;
  const line = state.doc.lineAt(range.head);

  const empty = EMPTY_ITEM.exec(line.text);
  if (empty && range.head >= line.from + empty[1].length) {
    view.dispatch({
      changes: { from: line.from + empty[1].length, to: line.to, insert: "" },
      selection: { anchor: line.from + empty[1].length },
      userEvent: "delete",
      scrollIntoView: true,
    });
    return true;
  }

  const ordered = ORDERED.exec(line.text);
  if (ordered) {
    const [, indent, num, delim] = ordered;
    const markerEnd = line.from + indent.length + num.length + delim.length + 1;
    if (range.head < markerEnd) return false;
    const insert = `\n${indent}${Number(num) + 1}${delim} `;
    view.dispatch(state.replaceSelection(insert), {
      userEvent: "input",
      scrollIntoView: true,
    });
    renumberOrderedList(view);
    return true;
  }

  const unordered = UNORDERED.exec(line.text);
  if (unordered) {
    const [, indent, bullet] = unordered;
    const markerEnd = line.from + indent.length + bullet.length + 1;
    if (range.head < markerEnd) return false;
    const insert = `\n${indent}${bullet} `;
    view.dispatch(state.replaceSelection(insert), {
      userEvent: "input",
      scrollIntoView: true,
    });
    return true;
  }

  return false;
}

export function renumberOrderedList(view: EditorView) {
  const { state } = view;
  const cursorLine = state.doc.lineAt(state.selection.main.head);
  const first = ORDERED_PREFIX.exec(cursorLine.text);
  if (!first) return;
  const indent = first[1];
  const delim = first[3];

  let startIdx = cursorLine.number;
  for (let n = cursorLine.number - 1; n >= 1; n--) {
    const m = ORDERED_PREFIX.exec(state.doc.line(n).text);
    if (!m || m[1] !== indent || m[3] !== delim) break;
    startIdx = n;
  }
  let endIdx = cursorLine.number;
  for (let n = cursorLine.number + 1; n <= state.doc.lines; n++) {
    const m = ORDERED_PREFIX.exec(state.doc.line(n).text);
    if (!m || m[1] !== indent || m[3] !== delim) break;
    endIdx = n;
  }

  const count = endIdx - startIdx + 1;
  if (count <= 1 || count > RENUMBER_ITEM_LIMIT) return;

  let num = Number(ORDERED_PREFIX.exec(state.doc.line(startIdx).text)![2]);
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const l = state.doc.line(i);
    const m = ORDERED_PREFIX.exec(l.text)!;
    if (m[2] !== String(num)) {
      changes.push({
        from: l.from + m[1].length,
        to: l.from + m[1].length + m[2].length,
        insert: String(num),
      });
    }
    num++;
  }
  if (changes.length > 0) {
    view.dispatch({ changes, userEvent: "input" });
  }
}
