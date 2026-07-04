// Left activity bar: Home / Files / Outline / collapse. Extracted verbatim in
// behavior from App.jsx (phase-2 refactor, US-7).
import { Icon } from '../icons.jsx'
import logoUrl from '../../assets/logo.png'

export default function ActivityBar({ home, sidebarMode, sidebarOpen, settingsActive, t, onHome, onFiles, onOutline, onSettings, onToggleSidebar }) {
  return (
    <div className="activity-bar">
      <div className="activity-section activity-section-top">
        <button
          type="button"
          className={`activity-item activity-home${home ? ' active' : ''}`}
          title={t('nav.home')}
          onClick={onHome}
        >
          <img className="activity-logo" src={logoUrl} alt="Moxie" />
        </button>
        <button
          type="button"
          className={`activity-item${sidebarMode === 'files' ? ' active' : ''}`}
          title={t('cmd.files')}
          onClick={onFiles}
        >
          <Icon name="folder" size={20} />
        </button>
        <button
          type="button"
          className={`activity-item${sidebarMode === 'outline' ? ' active' : ''}`}
          title={t('outline.title')}
          onClick={onOutline}
        >
          <Icon name="outline" size={20} />
        </button>
      </div>
      <div className="activity-spacer" />
      <div className="activity-section activity-section-bottom">
        <button
          type="button"
          className={`activity-item${settingsActive ? ' active' : ''}`}
          title={t('nav.settings')}
          onClick={onSettings}
        >
          <Icon name="gear" size={20} />
        </button>
        <button
          type="button"
          className={`activity-item activity-panel-toggle${sidebarOpen ? ' expanded' : ''}`}
          title={sidebarOpen ? t('side.collapsePane') : t('side.expandPane')}
          onClick={onToggleSidebar}
        >
          <Icon name={sidebarOpen ? 'panel-left-close' : 'panel-left-open'} size={20} />
        </button>
      </div>
    </div>
  )
}
