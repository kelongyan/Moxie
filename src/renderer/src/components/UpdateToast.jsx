import { Icon } from './icons.jsx'

// Render inline **bold** / `code` / [text](url) as React elements (no innerHTML → XSS-safe).
function renderInline(text) {
  const parts = []
  let rest = text
  let key = 0
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\([^)]+\)/
  let m
  while ((m = rest.match(re))) {
    if (m.index > 0) parts.push(rest.slice(0, m.index))
    if (m[1] != null) parts.push(<b key={key++}>{m[1]}</b>)
    else if (m[2] != null) parts.push(<code key={key++}>{m[2]}</code>)
    else parts.push(m[3]) // link → show its text only
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) parts.push(rest)
  return parts
}

// Lightweight Markdown → React for release notes (headings, bullets, paragraphs).
function renderNotes(md) {
  const out = []
  let list = []
  const flush = (k) => {
    if (list.length) {
      out.push(
        <ul className="update-notes-list" key={'ul' + k}>
          {list}
        </ul>
      )
      list = []
    }
  }
  ;(md || '').split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line) {
      flush(i)
      return
    }
    const h = line.match(/^#{1,6}\s+(.*)$/)
    const li = line.match(/^[-*]\s+(.*)$/)
    if (h) {
      flush(i)
      out.push(
        <div className="update-notes-h" key={i}>
          {renderInline(h[1])}
        </div>
      )
    } else if (li) {
      list.push(<li key={i}>{renderInline(li[1])}</li>)
    } else {
      flush(i)
      out.push(
        <div className="update-notes-p" key={i}>
          {renderInline(line)}
        </div>
      )
    }
  })
  flush('end')
  return out
}

// Notify-only "new version available" toast — slides in at the bottom-right.
// Shows the GitHub release notes (auto-loaded) so the user sees what changed.
export default function UpdateToast({ t, latest, current, notes, onDownload, onDismiss }) {
  const hasNotes = !!(notes && notes.trim())
  return (
    <div className="update-toast" role="alert">
      <button className="update-toast-close" onClick={onDismiss} title={t('update.later')}>
        <Icon name="close" size={13} />
      </button>
      <div className="update-toast-head">
        <span className="update-toast-icon">
          <Icon name="sparkle" size={18} />
        </span>
        <div className="update-toast-text">
          <div className="update-toast-title">{t('update.title')}</div>
          <div className="update-toast-sub">
            <span className="update-ver-old">v{current}</span>
            <span className="update-ver-arrow">→</span>
            <span className="update-ver-new">v{latest}</span>
          </div>
        </div>
      </div>
      {hasNotes && (
        <div className="update-toast-notes">
          <div className="update-toast-notes-label">{t('update.whatsNew')}</div>
          <div className="update-toast-notes-body">{renderNotes(notes)}</div>
        </div>
      )}
      <div className="update-toast-foot">
        <button className="update-toast-primary" onClick={onDownload}>
          {t('update.download')}
        </button>
      </div>
    </div>
  )
}
