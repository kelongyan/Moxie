// Top chrome: desktop gets a Typora-style menu row plus the existing tab row;
// mobile keeps the single compact toolbar.
import Tabs from '../Tabs.jsx'
import { Icon } from '../icons.jsx'
import ImageHostButton from '../ImageHostButton.jsx'
import WindowControls from '../WindowControls.jsx'
import MenuBar from './MenuBar.jsx'

export default function Topbar({
  isMobile,
  t,
  tabs,
  activeId,
  splitId,
  focusedPane,
  split,
  imageUploadCommand,
  handlers,
  appearanceMode,
  setAppearanceMode,
  themePalette,
  setThemePalette,
  customTheme,
  customThemes,
  onPickCustom,
  onRefreshThemes,
  onActivate,
  onClose,
  onNew,
  onCloseOthers,
  onOpenRight,
  onRename,
  onDuplicate,
  onDelete,
  onExportPdf,
  onToggleSidebar,
  onToggleSplit,
  onImageHostChange,
  onOpenPalette,
  onOpenSettings,
  onNotice,
  lang
}) {
  return (
    <div className="top-chrome">
      {!isMobile && (
        <div className="menubar-row">
          <MenuBar
            handlers={handlers}
            appearanceMode={appearanceMode}
            setAppearanceMode={setAppearanceMode}
            themePalette={themePalette}
            setThemePalette={setThemePalette}
            customTheme={customTheme}
            customThemes={customThemes}
            onPickCustom={onPickCustom}
            onRefreshThemes={onRefreshThemes}
            onOpenSettings={onOpenSettings}
            onToggleSplit={onToggleSplit}
            onNotice={onNotice}
            lang={lang}
          />
          {window.api.platform === 'win32' && <WindowControls t={t} />}
        </div>
      )}
      <div className="topbar">
        {isMobile && (
          <button
            className="icon-btn drag-no hm-menu-btn"
            title={t('cmd.files')}
            onClick={onToggleSidebar}
          >
            <Icon name="menu" size={20} />
          </button>
        )}
        <Tabs
          tabs={tabs}
          activeId={activeId}
          splitId={splitId}
          focusedPane={focusedPane}
          onActivate={onActivate}
          onClose={onClose}
          onNew={onNew}
          onCloseOthers={onCloseOthers}
          onOpenRight={onOpenRight}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExportPdf={onExportPdf}
        />
        <div className="topbar-spacer" />
        <button className="icon-btn drag-no" title={`${t('welcome.newFile')} (Ctrl+N)`} onClick={onNew}>
          <Icon name="plus" size={18} />
        </button>
        {!isMobile && (
          <button
            className={`icon-btn drag-no${split ? ' active' : ''}`}
            title={split ? t('split.close') : t('split.toggle')}
            onClick={onToggleSplit}
          >
            <Icon name="columns" size={16} />
          </button>
        )}
        {!isMobile && (
          <ImageHostButton
            t={t}
            command={imageUploadCommand}
            onChange={onImageHostChange}
          />
        )}
        <button className="icon-btn drag-no" title="Command palette (Ctrl+P)" onClick={onOpenPalette}>
          <Icon name="command" size={16} />
        </button>
        {isMobile && window.api.platform === 'win32' && <WindowControls t={t} />}
      </div>
    </div>
  )
}
