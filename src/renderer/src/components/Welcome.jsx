import { Icon } from './icons.jsx'
import logoUrl from '../assets/logo.png'

// Welcome / empty-state screen: logo and quick actions.
export default function Welcome({ t, onNew, onOpen, onOpenFolder }) {
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
      </div>
    </div>
  )
}
