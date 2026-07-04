// Theme registry. Each theme maps to a base (`light`/`dark`, which drives the
// Milkdown/Crepe light/dark rules) plus an optional palette-override class.
// Applied as `document.body.className = base [+ ' ' + cls]`.
export const THEMES = [
  { id: 'light', base: 'light', cls: '', dark: false, en: 'Warm Light', zh: '暖光', swatch: '#c86b35' },
  { id: 'dark', base: 'dark', cls: '', dark: true, en: 'Warm Dark', zh: '暖夜', swatch: '#e69055' },
  { id: 'morandi', base: 'light', cls: 'theme-morandi', dark: false, en: 'Morandi Sage', zh: '莫兰迪·灰绿', swatch: '#7d8a6a' },
  { id: 'morandi-rose', base: 'light', cls: 'theme-morandi-rose', dark: false, en: 'Morandi Rose', zh: '莫兰迪·豆沙', swatch: '#a8807b' },
  { id: 'morandi-blue', base: 'light', cls: 'theme-morandi-blue', dark: false, en: 'Morandi Mist', zh: '莫兰迪·雾蓝', swatch: '#7e94a6' },
  { id: 'morandi-dark', base: 'dark', cls: 'theme-morandi-dark', dark: true, en: 'Morandi Dusk', zh: '莫兰迪·暮', swatch: '#92a3b8' }
]

export const DEFAULT_THEME = 'light'

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0]

// Apply a theme to <body>. Returns the resolved theme def. Preserves any
// app-managed `hm-*` classes (page-width full-width, custom-theme marker) —
// setting className wholesale would otherwise wipe them on every theme switch.
export function applyTheme(id) {
  const def = themeById(id)
  const keep = [...document.body.classList].filter((c) => c.startsWith('hm-'))
  document.body.className = [def.base, def.cls, ...keep].filter(Boolean).join(' ')
  return def
}
