// Theme registry. Appearance mode controls the light/dark base, while palette
// controls the color mood. Legacy single-id themes are still mapped so old
// sessions keep a reasonable visual equivalent.

export const APPEARANCE_MODES = [
  { id: 'light', en: 'Light', zh: '浅色', icon: 'sun' },
  { id: 'dark', en: 'Dark', zh: '深色', icon: 'moon' },
  { id: 'system', en: 'System', zh: '跟随系统', icon: 'settings' }
]

export const THEME_PALETTES = [
  { id: 'warm', cls: '', en: 'Anthropic Warm', zh: '人文暖灰', swatch: '#b86f52', darkSwatch: '#df9276' },
  { id: 'morandi', cls: 'theme-morandi', en: 'Morandi Sage', zh: '莫兰迪·灰绿', swatch: '#7d8a6a' },
  { id: 'morandi-rose', cls: 'theme-morandi-rose', en: 'Morandi Rose', zh: '莫兰迪·豆沙', swatch: '#a8807b' },
  { id: 'morandi-blue', cls: 'theme-morandi-blue', en: 'Morandi Mist', zh: '莫兰迪·雾蓝', swatch: '#7e94a6' }
]

export const DEFAULT_APPEARANCE_MODE = 'light'
export const DEFAULT_THEME_PALETTE = 'warm'
export const DEFAULT_THEME = 'light'

const LEGACY_THEME_MAP = {
  light: { appearanceMode: 'light', themePalette: 'warm' },
  dark: { appearanceMode: 'dark', themePalette: 'warm' },
  morandi: { appearanceMode: 'light', themePalette: 'morandi' },
  'morandi-rose': { appearanceMode: 'light', themePalette: 'morandi-rose' },
  'morandi-blue': { appearanceMode: 'light', themePalette: 'morandi-blue' },
  'morandi-dark': { appearanceMode: 'dark', themePalette: 'morandi-blue' }
}

export const THEMES = [
  { id: 'light', base: 'light', cls: '', dark: false, en: 'Anthropic Light', zh: '人文浅色', swatch: '#b86f52' },
  { id: 'dark', base: 'dark', cls: '', dark: true, en: 'Anthropic Dark', zh: '人文深色', swatch: '#df9276' },
  { id: 'morandi', base: 'light', cls: 'theme-morandi', dark: false, en: 'Morandi Sage', zh: '莫兰迪·灰绿', swatch: '#7d8a6a' },
  { id: 'morandi-rose', base: 'light', cls: 'theme-morandi-rose', dark: false, en: 'Morandi Rose', zh: '莫兰迪·豆沙', swatch: '#a8807b' },
  { id: 'morandi-blue', base: 'light', cls: 'theme-morandi-blue', dark: false, en: 'Morandi Mist', zh: '莫兰迪·雾蓝', swatch: '#7e94a6' },
  { id: 'morandi-dark', base: 'dark', cls: 'theme-morandi-dark', dark: true, en: 'Morandi Dusk', zh: '莫兰迪·暮', swatch: '#92a3b8' }
]

export const appearanceModeById = (id) =>
  APPEARANCE_MODES.find((mode) => mode.id === id) || APPEARANCE_MODES[0]

export const paletteById = (id) =>
  THEME_PALETTES.find((palette) => palette.id === id) || THEME_PALETTES[0]

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0]

export function legacyThemeToAppearance(theme) {
  return LEGACY_THEME_MAP[theme] || {
    appearanceMode: DEFAULT_APPEARANCE_MODE,
    themePalette: DEFAULT_THEME_PALETTE
  }
}

export function appearanceToLegacyTheme(appearanceMode, themePalette) {
  const mode = appearanceMode === 'dark' ? 'dark' : 'light'
  const palette = paletteById(themePalette).id
  if (palette === 'warm') return mode
  if (mode === 'dark' && palette === 'morandi-blue') return 'morandi-dark'
  return palette
}

export function resolveAppearanceMode(mode, systemDark = false) {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode === 'dark' ? 'dark' : 'light'
}

export function resolveThemeClasses(appearanceMode, themePalette, systemDark = false) {
  const base = resolveAppearanceMode(appearanceMode, systemDark)
  const palette = paletteById(themePalette)
  return { base, palette, classes: [base, palette.cls].filter(Boolean) }
}

// Apply a theme to <body>. Returns the resolved theme shape. Preserves any
// app-managed `hm-*` classes (page-width full-width, custom-theme marker).
export function applyTheme(appearanceMode, themePalette, systemDark = false) {
  if (themePalette == null && typeof appearanceMode === 'string') {
    const legacy = legacyThemeToAppearance(appearanceMode)
    appearanceMode = legacy.appearanceMode
    themePalette = legacy.themePalette
  }
  const resolved = resolveThemeClasses(appearanceMode, themePalette, systemDark)
  const keep = [...document.body.classList].filter((c) => c.startsWith('hm-'))
  document.body.className = [...resolved.classes, ...keep].join(' ')
  return resolved
}
