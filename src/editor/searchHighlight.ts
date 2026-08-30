import {
  Decoration,
  DecorationSet,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";

export interface SearchHighlightPayload {
  matches: { from: number; to: number }[];
  current: number;
}

export const setSearchMatches = StateEffect.define<SearchHighlightPayload>();

const matchMark = Decoration.mark({ class: "lac-find-match" });
const currentMark = Decoration.mark({ class: "lac-find-match current" });

export const searchHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSearchMatches)) {
        const builder = new RangeSetBuilder<Decoration>();
        effect.value.matches.forEach((match, index) => {
          if (match.from >= match.to || match.to > tr.state.doc.length) return;
          builder.add(
            match.from,
            match.to,
            index === effect.value.current ? currentMark : matchMark
          );
        });
        value = builder.finish();
      }
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function clearSearchHighlight(view: EditorView) {
  view.dispatch({ effects: setSearchMatches.of({ matches: [], current: -1 }) });
}
