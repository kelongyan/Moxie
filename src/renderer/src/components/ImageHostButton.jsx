import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'

// Top-bar button that configures the image host (a Typora-style custom upload
// command). Opens a small popover beneath itself — no full settings page. The
// command is held in App's settings; we just edit it here. A filled dot on the
// icon hints when a command is set.
export default function ImageHostButton({ t, command, onChange }) {
  const [open, setOpen] = useState(false)
  // Anchor coords for the popover. It's position:fixed (not absolute) so the
  // top bar's `overflow:hidden` can't clip it; we measure the button on open.
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const btnRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen((v) => !v)
  }

  const configured = !!(command || '').trim()
  return (
    <div className="hm-imghost" ref={ref}>
      <button
        ref={btnRef}
        className={`icon-btn drag-no${configured ? ' hm-imghost-on' : ''}`}
        title={t('imghost.button')}
        onClick={toggle}
      >
        <Icon name="image" size={16} />
      </button>
      {open && (
        <div
          className="hm-pop hm-imghost-pop"
          style={pos ? { top: pos.top, right: pos.right } : undefined}
        >
          <div className="hm-pop-head">
            <span className="hm-pop-title">{t('settings.imageHost')}</span>
            <span className={`hm-pop-tag${configured ? ' on' : ''}`}>
              {configured ? t('imghost.on') : t('imghost.off')}
            </span>
          </div>
          <input
            type="text"
            className="hm-cmd-input"
            spellCheck={false}
            autoFocus
            placeholder={t('settings.imageHostPlaceholder')}
            value={command}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setOpen(false)
            }}
          />
          <div className="hm-pop-hint">{t('settings.imageHostHint')}</div>
        </div>
      )}
    </div>
  )
}
