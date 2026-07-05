// Theme registry. Appearance mode controls the light/dark base, while palette
// controls the color mood.

export const APPEARANCE_MODES = [
  { id: 'light', en: 'Light', zh: '浅色', icon: 'sun' },
  { id: 'dark', en: 'Dark', zh: '深色', icon: 'moon' },
  { id: 'system', en: 'System', zh: '跟随系统', icon: 'settings' }
]

export const THEME_PALETTES = [
  { id: 'warm', cls: '', en: 'Anthropic Warm', zh: '人文暖灰', swatch: '#b86f52', darkSwatch: '#df9276' },
  { id: 'morandi', cls: 'theme-morandi', en: 'Morandi Sage', zh: '莫兰迪·灰绿', swatch: '#6f7f5d', darkSwatch: '#a5b88d' },
  { id: 'dracula', cls: 'theme-dracula', en: 'Dracula', zh: '德古拉紫', swatch: '#644ac9', darkSwatch: '#bd93f9' },
  { id: 'morandi-blue', cls: 'theme-morandi-blue', en: 'Morandi Mist', zh: '莫兰迪·雾蓝', swatch: '#6f899a', darkSwatch: '#9ab1c6' }
]

export const DEFAULT_APPEARANCE_MODE = 'light'
export const DEFAULT_THEME_PALETTE = 'warm'

export const appearanceModeById = (id) =>
  APPEARANCE_MODES.find((mode) => mode.id === id) || APPEARANCE_MODES[0]

export const paletteById = (id) =>
  THEME_PALETTES.find((palette) => palette.id === id) || THEME_PALETTES[0]

export function resolveAppearanceMode(mode, systemDark = false) {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode === 'dark' ? 'dark' : 'light'
}

export function paletteSwatchForMode(paletteOrId, appearanceMode = DEFAULT_APPEARANCE_MODE, systemDark = false) {
  const palette = typeof paletteOrId === 'string' ? paletteById(paletteOrId) : paletteOrId || THEME_PALETTES[0]
  return resolveAppearanceMode(appearanceMode, systemDark) === 'dark'
    ? palette.darkSwatch || palette.swatch
    : palette.swatch
}

export function resolveThemeClasses(appearanceMode, themePalette, systemDark = false) {
  const base = resolveAppearanceMode(appearanceMode, systemDark)
  const palette = paletteById(themePalette)
  return { base, palette, classes: [base, palette.cls].filter(Boolean) }
}

// Apply a theme to <body>. Returns the resolved theme shape. Preserves any
// app-managed `hm-*` classes (page-width full-width, custom-theme marker).
export function applyTheme(appearanceMode, themePalette, systemDark = false) {
  const resolved = resolveThemeClasses(appearanceMode, themePalette, systemDark)
  const keep = [...document.body.classList].filter((c) => c.startsWith('hm-'))
  document.body.className = [...resolved.classes, ...keep].join(' ')
  return resolved
}
