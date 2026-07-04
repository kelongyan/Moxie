// Settings page — a full-tab view (kind:'settings') with a left section
// navigator and a focused content column. Typography uses compact controls,
// while the rest of the settings use tight rows/cards.
//
// StatusBar quick-controls (排版/主题/语言) stay where they are — this is their
// full-version home, not a replacement.
import { useI18n, LANGS } from '../i18n.jsx'
import { THEMES } from '../themes.js'
import { Icon } from './icons.jsx'
import Toggle from './ui/Toggle.jsx'
import AdjustGroup from './ui/AdjustGroup.jsx'
import {
  PAGE_WIDTH_PRESETS, PAGE_WIDTH_MIN, PAGE_WIDTH_MAX,
  FONT_SIZE_PRESETS, FONT_SIZE_MIN, FONT_SIZE_MAX,
  LINE_HEIGHT_PRESETS, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX,
  PARA_SPACING_PRESETS, PARA_SPACING_MIN, PARA_SPACING_MAX,
  applyFontSize, applyLineHeight, applyParagraphSpacing, applyPageWidth
} from '../settings.js'

const round1 = (n) => Math.round(n * 10) / 10
const round10 = (n) => Math.round(n / 10) * 10
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
const GITHUB_REPO_URL = 'https://github.com/kelongyan/Moxie'
const SETTINGS_NAV = [
  { id: 'typography', icon: 'text-size', labelKey: 'settings.typography' },
  { id: 'appearance', icon: 'sun', labelKey: 'settings.appearance' },
  { id: 'proofreading', icon: 'check', labelKey: 'settings.proofreading' },
  { id: 'language', icon: 'globe', labelKey: 'settings.language' },
  { id: 'image-host', icon: 'image', labelKey: 'settings.imageHost' },
  { id: 'about', icon: 'github', labelKey: 'settings.about' }
]

function SectionHead({ kicker, title }) {
  return (
    <div className="settings-section-head">
      <span className="settings-section-kicker">{kicker}</span>
      <h2 className="settings-block-title">{title}</h2>
    </div>
  )
}

export default function SettingsView({
  settings, onUpdateSettings,
  theme, setTheme, customThemes = [], customTheme, onPickCustom,
  onOpenThemesFolder, onGetMoreThemes,
  lang, setLang
}) {
  const { t } = useI18n()
  return (
    <div className="settings-page">
      <div className="settings-shell">
        <aside className="settings-nav" aria-label={t('settings.pageTitle')}>
          <div className="settings-nav-head">
            <div className="settings-kicker">Moxie</div>
            <h1>{t('settings.pageTitle')}</h1>
            <p>{t('settings.pageSubtitle')}</p>
          </div>
          <div className="settings-nav-list">
            {SETTINGS_NAV.map((item) => (
              <a key={item.id} className="settings-nav-item" href={`#settings-${item.id}`}>
                <Icon name={item.icon} size={16} />
                <span>{t(item.labelKey)}</span>
              </a>
            ))}
          </div>
        </aside>

        <div className="settings-content">
          <section className="settings-block settings-block-hero" id="settings-typography">
            <SectionHead kicker={t('settings.layoutLabel')} title={t('settings.typography')} />
            <TypographyControls settings={settings} onUpdateSettings={onUpdateSettings} t={t} />
          </section>

          <section className="settings-block" id="settings-appearance">
            <SectionHead kicker={t('settings.appearance')} title={t('settings.appearance')} />
            <div className="settings-swatches">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  className={`settings-swatch${!customTheme && th.id === theme ? ' active' : ''}`}
                  style={{ background: th.swatch }}
                  title={lang === 'zh' ? th.zh : th.en}
                  onClick={() => setTheme(th.id)}
                >
                  <span className="settings-swatch-name">{lang === 'zh' ? th.zh : th.en}</span>
                </button>
              ))}
              {customThemes.map((c) => (
                <button
                  key={c.file}
                  className={`settings-swatch settings-swatch-custom${customTheme === c.file ? ' active' : ''}`}
                  style={{ background: c.swatch || 'var(--accent-soft)' }}
                  title={c.name}
                  onClick={() => onPickCustom && onPickCustom(c.file)}
                >
                  <span className="settings-swatch-name">{c.name}</span>
                </button>
              ))}
            </div>
            <div className="settings-row settings-row-actions">
              <button className="settings-link-btn" onClick={() => onOpenThemesFolder && onOpenThemesFolder()}>{t('settings.openThemesFolder')}</button>
              <button className="settings-link-btn" onClick={() => onGetMoreThemes && onGetMoreThemes()}>{t('settings.getMoreThemes')}</button>
            </div>
          </section>

          <div className="settings-grid">
            <section className="settings-block settings-block-compact" id="settings-proofreading">
              <SectionHead kicker={t('settings.proofreading')} title={t('settings.proofreading')} />
              <div className="settings-row">
                <div className="settings-row-text">
                  <div className="settings-row-label">{t('settings.spellcheck')}</div>
                  <div className="settings-row-desc">{t('settings.spellcheckDesc')}</div>
                </div>
                <Toggle
                  checked={!!settings.spellcheck}
                  onChange={(v) => onUpdateSettings({ spellcheck: v })}
                  label={t('settings.spellcheck')}
                />
              </div>
            </section>

            <section className="settings-block settings-block-compact" id="settings-language">
              <SectionHead kicker={t('settings.language')} title={t('settings.language')} />
              <div className="settings-langs">
                {LANGS.map((l) => (
                  <button key={l.id} className={`settings-lang${l.id === lang ? ' active' : ''}`} onClick={() => setLang(l.id)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="settings-block" id="settings-image-host">
            <SectionHead kicker={t('settings.imageHost')} title={t('settings.imageHost')} />
            <p className="settings-block-desc">{t('settings.imageHostDesc')}</p>
            <input
              className="settings-input" type="text" spellCheck={false}
              placeholder={t('settings.imageHostPlaceholder')}
              value={settings.imageUploadCommand || ''}
              onChange={(e) => onUpdateSettings({ imageUploadCommand: e.target.value })}
            />
          </section>

          <section className="settings-block settings-block-about" id="settings-about">
            <div className="settings-about-panel">
              <div className="settings-about-main">
                <div className="settings-about-title">{t('settings.about')}</div>
                <div className="settings-about-brand">
                  <span className="settings-row-label">Moxie</span>
                  {APP_VERSION && <span className="settings-version">{APP_VERSION}</span>}
                </div>
              </div>
              <button className="settings-link-btn settings-about-link" onClick={() => window.api.openExternal(GITHUB_REPO_URL)}>GitHub</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// Typography: four compact controls.
function TypographyControls({ settings, onUpdateSettings, t }) {
  const { fontSize, lineHeight, paragraphSpacing, pageWidth } = settings
  const fontIdx = FONT_SIZE_PRESETS.findIndex((p) => p.size === fontSize)
  const lhIdx = LINE_HEIGHT_PRESETS.findIndex((p) => p.value === lineHeight)
  const psIdx = PARA_SPACING_PRESETS.findIndex((p) => p.value === paragraphSpacing)
  const isFull = pageWidth === 'full'
  const widthIdx = PAGE_WIDTH_PRESETS.findIndex((p) =>
    p.width === 'full' ? isFull : !isFull && pageWidth === p.width
  )
  return (
    <div className="settings-typo">
      <div className="settings-typo-controls">
        <AdjustGroup
          title={t('settings.fontSize')} valueLabel={fontSize + ' px'}
          presets={FONT_SIZE_PRESETS.map((p) => ({ ...p, label: t('settings.font.' + p.id) }))}
          activeIndex={fontIdx} onPick={(p) => onUpdateSettings({ fontSize: p.size })}
          value={fontSize} min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} round={Math.round}
          onSet={(s) => onUpdateSettings({ fontSize: s })} liveApply={applyFontSize}
        />
        <AdjustGroup
          title={t('settings.lineHeight')} valueLabel={round1(lineHeight).toFixed(1)}
          presets={LINE_HEIGHT_PRESETS.map((p) => ({ ...p, label: t('settings.lineHeightPreset.' + p.id) }))}
          activeIndex={lhIdx} onPick={(p) => onUpdateSettings({ lineHeight: p.value })}
          value={lineHeight} min={LINE_HEIGHT_MIN} max={LINE_HEIGHT_MAX} round={round1}
          onSet={(v) => onUpdateSettings({ lineHeight: v })} liveApply={applyLineHeight}
        />
        <AdjustGroup
          title={t('settings.paragraphSpacing')} valueLabel={round1(paragraphSpacing).toFixed(1) + ' em'}
          presets={PARA_SPACING_PRESETS.map((p) => ({ ...p, label: t('settings.paraSpacingPreset.' + p.id) }))}
          activeIndex={psIdx} onPick={(p) => onUpdateSettings({ paragraphSpacing: p.value })}
          value={paragraphSpacing} min={PARA_SPACING_MIN} max={PARA_SPACING_MAX} round={round1}
          onSet={(v) => onUpdateSettings({ paragraphSpacing: v })} liveApply={applyParagraphSpacing}
        />
        <AdjustGroup
          title={t('settings.pageWidth')} valueLabel={isFull ? t('settings.width.full') : pageWidth + ' px'}
          presets={PAGE_WIDTH_PRESETS.map((p) => ({ ...p, label: t('settings.width.' + p.id) }))}
          activeIndex={widthIdx} onPick={(p) => onUpdateSettings({ pageWidth: p.width })}
          value={isFull ? PAGE_WIDTH_MAX : pageWidth} min={PAGE_WIDTH_MIN} max={PAGE_WIDTH_MAX} round={round10}
          onSet={(w) => onUpdateSettings({ pageWidth: w })} liveApply={applyPageWidth}
        />
      </div>
    </div>
  )
}
