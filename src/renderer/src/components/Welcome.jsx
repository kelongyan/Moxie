import { Icon } from './icons.jsx'
import logoUrl from '../assets/logo.png'

function relTime(ts, lang, t) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('time.justNow')
  if (min < 60) return t('time.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('time.hoursAgo', { n: hr })
  const days = Math.floor(hr / 24)
  if (days === 1) return t('time.yesterday')
  try {
    return new Date(ts).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return ''
  }
}

// Welcome / empty-state screen: logo, quick actions, recent files.
export default function Welcome({ t, lang, recents, onNew, onOpen, onOpenFolder, onOpenRecent, onRemoveRecent }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <img className="welcome-logo" src={logoUrl} alt="Moxie" />
        <h1>Moxie</h1>
        <div className="welcome-actions">
          <button className="welcome-action is-primary" onClick={onNew}>
            <Icon name="file-plus" size={14} /> {t('welcome.newFile')}
          </button>
          <button className="welcome-action" onClick={onOpen}>
            <Icon name="file" size={14} /> {t('welcome.openFile')}
          </button>
          <button className="welcome-action" onClick={onOpenFolder}>
            <Icon name="folder" size={14} /> {t('welcome.openFolder')}
          </button>
        </div>

        {recents && recents.length > 0 && (
          <div className="welcome-recents">
            <div className="welcome-recents-head">{t('welcome.recent')}</div>
            <div className="welcome-recents-list">
              {recents.map((r) => (
                <div key={r.path} className="recent-item" onClick={() => onOpenRecent(r.path)} title={r.path}>
                  <Icon name="file" size={16} className="recent-icon" />
                  <span className="recent-main">
                    <span className="recent-name">{r.name}</span>
                    <span className="recent-path">{r.dir}</span>
                  </span>
                  <span className="recent-time">{relTime(r.openedAt, lang, t)}</span>
                  {onRemoveRecent && (
                    <button
                      className="recent-remove"
                      title={t('welcome.removeRecent')}
                      aria-label={t('welcome.removeRecent')}
                      // Stop the click so removing doesn't also open the file.
                      onClick={(e) => { e.stopPropagation(); onRemoveRecent(r.path) }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
