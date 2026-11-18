/** Shared by the editor's block views and the outline, which reads their
 * DOM before the editor runtime has necessarily loaded. */
export const PLACEHOLDER_CLASS = "lazy-block";

/** On a heading's placeholder, so the outline still finds every top-level
 *  heading in the DOM, in order. */
export const HEADING_PLACEHOLDER = `.${PLACEHOLDER_CLASS}[data-heading]`;
