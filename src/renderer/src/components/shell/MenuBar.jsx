import { useEffect, useMemo, useRef, useState } from 'react'
import { APPEARANCE_MODES, THEME_PALETTES, paletteSwatchForMode } from '../../themes.js'
import { MENU_BAR, MENU_PLACEHOLDER } from './menuConfig.js'

const GITHUB_REPO_URL = 'https://github.com/kelongyan/Moxie'
const ISSUE_URL = 'https://github.com/kelongyan/Moxie/issues'
const MORE_THEMES_URL = 'https://theme.typora.io/'

function isSeparator(item) {
  return item?.type === 'separator'
}

function makeThemeItems({ appearanceMode, systemDark, themePalette, customTheme, customThemes, lang }) {
  const modes = APPEARANCE_MODES.map((item) => ({
    id: `appearance-${item.id}`,
    label: lang === 'zh' ? item.zh : item.en,
    command: 'setAppearanceMode',
    args: item.id,
    status: 'ready',
    checked: appearanceMode === item.id
  }))
  const palettes = THEME_PALETTES.map((item) => ({
    id: `palette-${item.id}`,
    label: lang === 'zh' ? item.zh : item.en,
    command: 'setThemePalette',
    args: item.id,
    status: 'ready',
    checked: !customTheme && item.id === themePalette,
    swatch: paletteSwatchForMode(item, appearanceMode, systemDark)
  }))
  const custom = customThemes.length
    ? customThemes.map((item) => ({
        id: `custom-theme-${item.file}`,
        label: item.name,
        command: 'pickCustomTheme',
        args: item.file,
        status: 'ready',
        checked: customTheme === item.file,
        swatch: 'var(--accent)'
      }))
    : [{ id: 'custom-theme-empty', label: '暂无自定义主题', status: MENU_PLACEHOLDER }]
  return { modes, palettes, custom }
}

function expandItems(items, themeState) {
  const dynamicThemes = makeThemeItems(themeState)
  return items.flatMap((item) => {
    if (item.dynamic === 'appearance-modes') return dynamicThemes.modes
    if (item.dynamic === 'theme-palettes') return dynamicThemes.palettes
    if (item.dynamic === 'custom-themes') return dynamicThemes.custom
    if (item.children) return [{ ...item, children: expandItems(item.children, themeState) }]
    return [item]
  })
}

function MenuItem({ item, depth = 0, onRun }) {
  const [subOpen, setSubOpen] = useState(false)
  if (isSeparator(item)) return <div className="menubar-separator" role="separator" />

  const hasChildren = Array.isArray(item.children) && item.children.length > 0
  const disabled = item.status === MENU_PLACEHOLDER && !item.command && !hasChildren
  const className = [
    'menubar-menu-item',
    hasChildren ? 'has-children' : '',
    disabled ? 'disabled' : '',
    item.checked ? 'checked' : ''
  ].filter(Boolean).join(' ')
  const runItem = () => {
    if (disabled) return
    onRun(item)
  }

  return (
    <div
      className="menubar-submenu-wrap"
      onMouseEnter={() => hasChildren && setSubOpen(true)}
      onMouseLeave={() => hasChildren && setSubOpen(false)}
    >
      <button
        type="button"
        className={className}
        disabled={disabled}
        role="menuitem"
        aria-disabled={disabled || undefined}
        aria-haspopup={hasChildren || undefined}
        aria-expanded={hasChildren ? subOpen : undefined}
        onMouseDown={hasChildren ? undefined : (event) => {
          if (disabled) return
          event.preventDefault()
          runItem()
        }}
        onClick={(event) => {
          if (disabled) return
          if (hasChildren) {
            setSubOpen((v) => !v)
            return
          }
          if (event.detail === 0) runItem()
        }}
      >
        <span className="menubar-menu-label">
          {item.checked && <span className="menubar-check">✓</span>}
          {item.swatch && <span className="menubar-swatch" style={{ background: item.swatch }} />}
          <span>{item.label}</span>
        </span>
        <span className="menubar-menu-meta">
          {item.shortcut && <span className="menubar-shortcut">{item.shortcut}</span>}
          {hasChildren && <span className="menubar-caret">›</span>}
        </span>
      </button>
      {hasChildren && subOpen && (
        <div className={`menubar-dropdown menubar-dropdown-sub depth-${depth + 1}`} role="menu">
          {item.children.map((child, index) => (
            <MenuItem key={child.id || `sep-${index}`} item={child} depth={depth + 1} onRun={onRun} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function MenuBar({
  handlers,
  appearanceMode,
  setAppearanceMode,
  systemDark = false,
  themePalette,
  setThemePalette,
  customTheme,
  customThemes = [],
  onPickCustom,
  onRefreshThemes,
  onOpenSettings,
  onToggleSplit,
  onNotice,
  lang
}) {
  const [openId, setOpenId] = useState(null)
  const ref = useRef(null)
  const menu = useMemo(
    () => MENU_BAR.map((group) => ({
      ...group,
      items: expandItems(group.items, { appearanceMode, systemDark, themePalette, customTheme, customThemes, lang })
    })),
    [appearanceMode, systemDark, themePalette, customTheme, customThemes, lang]
  )

  useEffect(() => {
    if (!openId) return undefined
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpenId(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    const onBlur = () => setOpenId(null)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [openId])

  const runCommand = (item) => {
    if (item.status === MENU_PLACEHOLDER && !item.command) {
      onNotice?.(`${item.label} 即将支持`)
      setOpenId(null)
      return
    }
    const command = item.command
    if (!command) return
    const current = handlers?.current || {}
    const nativeExec = (cmd) => document.execCommand?.(cmd)
    const commands = {
      settings: () => onOpenSettings?.(),
      about: () => onOpenSettings?.('about'),
      toggleSplit: () => onToggleSplit?.(),
      quit: () => window.api.windowClose?.(),
      openGithub: () => window.api.openExternal(GITHUB_REPO_URL),
      reportIssue: () => window.api.openExternal(ISSUE_URL),
      checkUpdate: () => window.api.checkUpdate?.().then((info) => {
        const message = info?.ok
          ? `当前版本 ${info.current || ''}，最新版本 ${info.latest || ''}`
          : '暂时无法检查更新'
        onNotice?.(message)
      }),
      setAppearanceMode: () => setAppearanceMode?.(item.args),
      setThemePalette: () => setThemePalette?.(item.args),
      pickCustomTheme: () => onPickCustom?.(item.args),
      openThemesFolder: () => window.api.themesReveal?.(),
      getMoreThemes: () => window.api.openExternal(MORE_THEMES_URL),
      refreshThemes: () => {
        onRefreshThemes?.()
        onNotice?.('主题已刷新')
      },
      setBlock: () => current.setBlock?.(item.args),
      nativeUndo: () => nativeExec('undo'),
      nativeRedo: () => nativeExec('redo'),
      nativeCut: () => nativeExec('cut'),
      nativeCopy: () => nativeExec('copy'),
      nativePaste: () => nativeExec('paste'),
      nativeSelectAll: () => nativeExec('selectAll'),
      nativeBold: () => nativeExec('bold'),
      nativeItalic: () => nativeExec('italic'),
      nativeUnderline: () => nativeExec('underline'),
      findNext: () => onNotice?.('查找下一个即将支持'),
      findPrev: () => onNotice?.('查找上一个即将支持'),
      zoomReset: () => onNotice?.('缩放菜单即将支持'),
      zoomIn: () => onNotice?.('缩放菜单即将支持'),
      zoomOut: () => onNotice?.('缩放菜单即将支持'),
      toggleFullscreen: () => onNotice?.('全屏菜单即将支持'),
      toggleDevTools: () => onNotice?.('开发者工具菜单即将支持')
    }
    const fn = commands[command] || current[command]
    if (typeof fn === 'function') fn(item.args)
    else onNotice?.(`${item.label} 即将支持`)
    setOpenId(null)
  }

  return (
    <div className="menubar" ref={ref} role="menubar" aria-label="Moxie menu bar">
      <div className="menubar-items drag-no">
        {menu.map((group) => (
          <div
            className="menubar-group"
            key={group.id}
            onMouseEnter={() => {
              if (openId) setOpenId(group.id)
              if (group.id === 'theme') onRefreshThemes?.()
            }}
          >
            <button
              type="button"
              className={`menubar-trigger${openId === group.id ? ' active' : ''}`}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={openId === group.id}
              onClick={() => {
                if (group.id === 'theme' && openId !== group.id) onRefreshThemes?.()
                setOpenId((cur) => (cur === group.id ? null : group.id))
              }}
            >
              {group.label}
            </button>
            {openId === group.id && (
              <div className="menubar-dropdown" role="menu">
                {group.items.map((item, index) => (
                  <MenuItem key={item.id || `sep-${index}`} item={item} onRun={runCommand} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="menubar-drag" aria-hidden="true" />
    </div>
  )
}
