// Apply a user CSS theme (e.g. a migrated Typora theme) by injecting it into a
// dedicated <style> tag, on top of the built-in base theme. Passing null/empty
// removes it. A body marker (.hm-has-custom-theme) lets app.css yield the
// writing-area background/width to the theme while a custom theme is active.
//
// The editor's content element also carries Typora's `#write` / `markdown-body`
// hooks (added in Editor.jsx) so the theme's selectors match our DOM.

let styleEl = null

export function applyCustomTheme(css) {
  if (!css) {
    if (styleEl) styleEl.textContent = ''
    document.body.classList.remove('hm-has-custom-theme')
    return
  }
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'hm-custom-theme'
    // Append last so it overrides the bundled app/Crepe CSS for equal specificity.
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = css
  document.body.classList.add('hm-has-custom-theme')
}
