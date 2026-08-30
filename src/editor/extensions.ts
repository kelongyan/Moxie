import { EditorState, Extension, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentUnit,
} from "@codemirror/language";
import { highlightExtension } from "./highlightTheme";
import { languageExtensions } from "./languages";
import {
  markdownEnterHandler,
  renumberOrderedList,
} from "./listContinuation";
import { searchHighlightField } from "./searchHighlight";
import { EditorLanguage } from "../models/language";
import { PT_TO_PX } from "../state/preferences";

export interface EditorOptions {
  docId: string;
  initialText: string;
  language: EditorLanguage;
  wordWrap: boolean;
  showLineNumbers: boolean;
  fontSizePt: number;
  lineSpacingPt: number;
  indentUnitText: string;
  enableHighlight: boolean;
  enableFold: boolean;
  onUpdate: (update: { docChanged: boolean; state: EditorState }) => void;
  onCursor: (line: number, column: number) => void;
}

function makeEnterHandler(unit: string) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const range = state.selection.main;
    const line = state.doc.lineAt(range.head);
    const before = line.text.slice(0, range.head - line.from);
    const indent = /^[\t ]*/.exec(before)?.[0] ?? "";
    const extra = /[{[]$/.test(before.trimEnd()) ? unit : "";
    view.dispatch(state.replaceSelection(`\n${indent}${extra}`), {
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
}

function makeTabHandler(unit: string) {
  return (view: EditorView): boolean => {
    view.dispatch(view.state.replaceSelection(unit), {
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
}

function makeShiftTabHandler(tabWidth: number) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const range = state.selection.main;
    const line = state.doc.lineAt(range.from);
    const leading = /^[\t ]*/.exec(line.text)?.[0] ?? "";
    if (leading.length === 0) return true;
    const removeCount = leading.startsWith("\t")
      ? 1
      : Math.min(tabWidth, leading.length);
    view.dispatch({
      changes: { from: line.from, to: line.from + removeCount },
      selection: {
        anchor: Math.max(line.from, range.anchor - removeCount),
        head: Math.max(line.from, range.head - removeCount),
      },
      userEvent: "delete",
    });
    return true;
  };
}

export function buildEditorState(options: EditorOptions): EditorState {
  const fontSizePx = options.fontSizePt * PT_TO_PX;
  const lineSpacingPx = options.lineSpacingPt * PT_TO_PX;
  const tabWidth = options.indentUnitText === "\t" ? 4 : options.indentUnitText.length;
  const isMarkdown = options.language === "markdown";

  const theme = EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: `${fontSizePx}px`,
        backgroundColor: "var(--lac-bg)",
        color: "var(--lac-text)",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: `calc(1.2em + ${lineSpacingPx}px)`,
      },
      ".cm-content": {
        caretColor: "var(--lac-text)",
        padding: "10px 0 24px",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--lac-text)",
        borderLeftWidth: "2px",
      },
      "& .cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "var(--lac-selection)",
      },
      ".cm-activeLine": { backgroundColor: "var(--lac-current-line)" },
      ".cm-gutters": {
        backgroundColor: "var(--lac-bg)",
        color: "var(--lac-text-secondary)",
        border: "none",
        borderRight: "1px solid var(--lac-border)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        fontFamily: "var(--font-mono)",
        fontSize: "0.85em",
        minWidth: "44px",
        padding: "0 8px",
        fontVariantNumeric: "tabular-nums",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--lac-text)",
      },
      ".cm-matchingBracket": {
        backgroundColor: "var(--lac-delimiter-match)",
        outline: "1px solid var(--lac-accent)",
      },
      ".cm-foldGutter .cm-gutterElement": {
        padding: "0 4px",
        cursor: "pointer",
      },
      ".cm-foldPlaceholder": {
        fontFamily: "var(--font-mono)",
        border: "1px solid var(--lac-border)",
      },
    },
    { dark: document.documentElement.dataset.theme === "dark" }
  );

  const enterBindings = isMarkdown
    ? [
        { key: "Enter", run: markdownEnterHandler },
        { key: "Enter", run: makeEnterHandler(options.indentUnitText) },
      ]
    : [{ key: "Enter", run: makeEnterHandler(options.indentUnitText) }];

  const customKeys = keymap.of([
    ...enterBindings,
    { key: "Tab", run: makeTabHandler(options.indentUnitText) },
    { key: "Shift-Tab", run: makeShiftTabHandler(tabWidth) },
    { key: "Mod-z", run: undo },
    { key: "Mod-Shift-z", run: redo },
  ]);

  const extensions: Extension[] = [
    theme,
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    searchHighlightField,
    indentUnit.of(options.indentUnitText),
    Prec.highest(customKeys),
    keymap.of([...foldKeymap, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) {
        const { state } = update;
        const head = state.selection.main.head;
        const line = state.doc.lineAt(head);
        options.onCursor(line.number, head - line.from + 1);
      }
      if (update.docChanged) {
        options.onUpdate({ docChanged: true, state: update.state });
      }
    }),
  ];

  if (options.enableHighlight) {
    extensions.push(highlightExtension());
    extensions.push(bracketMatching());
    extensions.push(...languageExtensions(options.language));
  }
  if (options.enableFold) {
    extensions.push(codeFolding());
    extensions.push(
      foldGutter({
        markerDOM: (open) => {
          const el = document.createElement("span");
          el.className = "fold-marker";
          el.innerHTML = open
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
          return el;
        },
      })
    );
  }

  if (isMarkdown) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || !update.view) return;
        let crossed = false;
        let touchesNumber = false;
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const insertedText = inserted.toString();
          if (insertedText.includes("\n")) crossed = true;
          if (fromA !== toA) {
            const removed = update.startState.sliceDoc(fromA, toA);
            if (removed.includes("\n")) crossed = true;
          }
          if (!crossed) return;
          const beforeText = update.startState.sliceDoc(0, fromA);
          const lineNumber = beforeText.split("\n").length;
          if (lineNumber > update.startState.doc.lines) return;
          const lineObj = update.startState.doc.line(lineNumber);
          const m = /^(\s*)(\d+)[.)]/.exec(lineObj.text);
          if (m) {
            const numStart = lineObj.from + m[1].length;
            const numEnd = numStart + m[2].length;
            if (fromA < numEnd && toA > numStart) touchesNumber = true;
          }
        });
        if (crossed && !touchesNumber) {
          renumberOrderedList(update.view);
        }
      })
    );
  }

  if (options.showLineNumbers) {
    extensions.push(lineNumbers());
  }
  if (options.wordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  return EditorState.create({ doc: options.initialText, extensions });
}
