import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import {
  Hash,
  Info,
  LucideIcon,
  Minus,
  Palette,
  PenLine,
  Plus,
  Share,
  SlidersHorizontal,
} from "lucide-react";
import {
  applyTheme,
  usePreferences,
} from "../state/preferences";
import { useT } from "../i18n";
import { THEME_LABELS, ThemeMode, useThemeStore } from "../state/theme";
import type { BlockSpacing } from "../preview/typography";
import brandMark from "../../src-tauri/icons/128x128.png";

const BLOCK_SPACING_LABELS: Record<BlockSpacing, string> = {
  compact: "紧凑",
  standard: "标准",
  relaxed: "宽松",
};

type SectionId =
  | "general"
  | "appearance"
  | "editor"
  | "markdown"
  | "export"
  | "about";

function SettingRow(props: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <div className="settings-title">{props.title}</div>
        {props.description && (
          <div className="settings-desc">{props.description}</div>
        )}
      </div>
      <div className="settings-control">{props.children}</div>
    </div>
  );
}

function Stepper(props: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onReset: () => void;
  defaultValue: number;
  suffix?: string;
}) {
  const t = useT();
  return (
    <span className="stepper-group">
      <span className="stepper">
        <button
          className="stepper-button"
          disabled={props.value <= props.min}
          onClick={() => props.onChange(props.value - 1)}
          aria-label="减小"
        >
          <Minus size={12} />
        </button>
        <span className="stepper-value">
          {props.value}
          {props.suffix ?? ""}
        </span>
        <button
          className="stepper-button"
          disabled={props.value >= props.max}
          onClick={() => props.onChange(props.value + 1)}
          aria-label="增大"
        >
          <Plus size={12} />
        </button>
      </span>
      <button
        className="reset-button"
        disabled={props.value === props.defaultValue}
        onClick={props.onReset}
      >
        {t("恢复默认")}
      </button>
    </span>
  );
}

function SwitchRow(props: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SettingRow title={props.title} description={props.description}>
      <label className="switch">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="switch-track" />
      </label>
    </SettingRow>
  );
}

function SegmentedRow<T extends string>(props: {
  title: string;
  description?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <SettingRow title={props.title} description={props.description}>
      <div className="segmented" role="tablist">
        {props.options.map((opt) => (
          <button
            key={opt.value}
            className={props.value === opt.value ? "active" : ""}
            onClick={() => props.onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </SettingRow>
  );
}

/** 设置分区：外层标题/描述 + 内层设置卡片 */
function SettingsSection(props: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-title">{props.title}</div>
        {props.description && (
          <div className="settings-section-desc">{props.description}</div>
        )}
      </div>
      <div className="settings-group">{props.children}</div>
    </section>
  );
}

function AboutSection() {
  const t = useT();
  const [version, setVersion] = useState("");
  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);
  return (
    <section className="settings-section">
      <div className="settings-group settings-about">
        <img
          className="settings-about-logo"
          src={brandMark}
          alt=""
          draggable={false}
        />
        <div className="settings-about-name">
          Moxie
          {version && (
            <span className="settings-about-version">
              {t("版本")} {version}
            </span>
          )}
        </div>
        <p className="settings-about-desc">
          安静、快速、真正属于 Windows 的本地 Markdown 编辑器。
          不登录、不联网、不上传内容。
        </p>
        <div className="settings-about-meta">
          <div className="settings-about-meta-row">
            <span>{t("性能")}</span>
            <span>
              {t("按文档体量自动分级，无需手动配置")}
            </span>
          </div>
          <div className="settings-about-meta-row">
            <span>{t("数据")}</span>
            <span>{t("全部保存在本地磁盘")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SettingsWindow() {
  const t = useT();
  const prefs = usePreferences();
  const themeMode = useThemeStore((s) => s.mode);
  const [section, setSection] = useState<SectionId>("general");
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    void isAutostartEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);

  const set = prefs.set;

  const toggleAutostart = async (v: boolean) => {
    try {
      if (v) await enableAutostart();
      else await disableAutostart();
      setAutostart(v);
    } catch {
      setAutostart(await isAutostartEnabled().catch(() => v));
    }
  };

  const NAV: { id: SectionId; icon: LucideIcon; label: string }[] = [
    { id: "general", icon: SlidersHorizontal, label: t("通用") },
    { id: "appearance", icon: Palette, label: t("外观") },
    { id: "editor", icon: PenLine, label: t("编辑器") },
    { id: "markdown", icon: Hash, label: "Markdown" },
    { id: "export", icon: Share, label: t("导出") },
    { id: "about", icon: Info, label: t("关于") },
  ];

  return (
    <div className="settings-window">
      <nav className="settings-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={"settings-nav-item" + (section === item.id ? " active" : "")}
            onClick={() => setSection(item.id)}
          >
            <item.icon size={14} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="settings-scroll" key={section}>
        {section === "general" && (
          <>
            <SettingsSection title={t("通用")} description={t("基础行为与系统集成")}>
              <SettingRow title={t("界面语言")} description={t("界面显示语言（英文为实验性，尚未覆盖全部界面）")}>
                <select
                  className="settings-select"
                  value={prefs.lang}
                  onChange={(e) => set({ lang: e.target.value as "zh" | "en" })}
                >
                  <option value="zh">{t("中文")}</option>
                  <option value="en">English</option>
                </select>
              </SettingRow>

              <SettingRow title={t("查找形态")} description={t("查找/替换的呈现方式")}>
                <select
                  className="settings-select"
                  value={prefs.findStyle}
                  onChange={(e) =>
                    set({ findStyle: e.target.value as "window" | "inline" })
                  }
                >
                  <option value="window">{t("独立窗口")}</option>
                  <option value="inline">{t("编辑器内浮层")}</option>
                </select>
              </SettingRow>

              <SettingRow title={t("自动保存")} description={t("定时（30 秒）或窗口失焦时保存已保存过的文档")}>
                <select
                  className="settings-select"
                  value={prefs.autosave}
                  onChange={(e) =>
                    set({
                      autosave: e.target.value as "off" | "interval" | "focus",
                    })
                  }
                >
                  <option value="off">{t("关闭")}</option>
                  <option value="interval">{t("定时保存")}</option>
                  <option value="focus">{t("失焦保存")}</option>
                </select>
              </SettingRow>

              <SwitchRow
                title={t("关闭时最小化到托盘")}
                description={t("开启后点关闭隐藏到托盘,托盘菜单可退出")}
                checked={prefs.closeToTray}
                onChange={(v) => {
                  set({ closeToTray: v });
                  void invoke("tray_set_enabled", { enabled: v }).catch(() => {});
                }}
              />

              <SwitchRow
                title={t("开机自启")}
                description={t("登录 Windows 时自动启动 Moxie")}
                checked={autostart}
                onChange={(v) => void toggleAutostart(v)}
              />
            </SettingsSection>
          </>
        )}

        {section === "appearance" && (
          <>
            <SettingsSection title={t("主题")} description={t("窗口与编辑区的明暗主题")}>
              <SettingRow title={t("外观")}>
                <div className="segmented" role="tablist">
                  {(["system", "light", "dark"] as ThemeMode[]).map((m) => (
                    <button
                      key={m}
                      className={themeMode === m ? "active" : ""}
                      onClick={() => applyTheme(m)}
                    >
                      {THEME_LABELS[m]}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </SettingsSection>

            <SettingsSection title={t("强调色与字体")} description={t("界面外观的个性化")}>
              <SettingRow title={t("强调色")} description={t("界面与光标的强调色（留空使用主题默认）")}>
                <span className="stepper-group">
                  <input
                    type="color"
                    className="settings-color"
                    value={prefs.accentColor || "#2b6cb0"}
                    onChange={(e) => set({ accentColor: e.target.value })}
                  />
                  <button
                    className="reset-button"
                    disabled={!prefs.accentColor}
                    onClick={() => set({ accentColor: "" })}
                  >
                    {t("恢复默认")}
                  </button>
                </span>
              </SettingRow>

              <SettingRow title={t("界面字体")} description={t("界面与正文字体（留空使用默认）")}>
                <input
                  className="settings-input"
                  value={prefs.uiFont}
                  placeholder="Frex Sans GB"
                  spellCheck={false}
                  onChange={(e) => set({ uiFont: e.target.value })}
                />
              </SettingRow>
            </SettingsSection>
          </>
        )}

        {section === "editor" && (
          <>
            <SettingsSection title={t("视图")} description={t("书写面的显示方式")}>
              <SwitchRow
                title={t("文本换行")}
                description={t("超出编辑区宽度时自动折行")}
                checked={prefs.wordWrap}
                onChange={(v) => set({ wordWrap: v })}
              />
              <SwitchRow
                title={t("显示行号")}
                description={t("在编辑区左侧显示行号列")}
                checked={prefs.lineNumbers}
                onChange={(v) => set({ lineNumbers: v })}
              />
              <SwitchRow
                title={t("专注模式")}
                description={t("当前段落之外的行降低透明度")}
                checked={prefs.focusMode}
                onChange={(v) => set({ focusMode: v })}
              />
              <SwitchRow
                title={t("打字机模式")}
                description={t("光标行始终保持屏幕垂直居中")}
                checked={prefs.typewriterMode}
                onChange={(v) => set({ typewriterMode: v })}
              />
            </SettingsSection>

            <SettingsSection title={t("排版")} description={t("正文的字号与间距节奏")}>
              <SettingRow title={t("正文字号")} description={t("范围 9–32")}>
                <Stepper
                  value={prefs.fontSizePt}
                  min={9}
                  max={32}
                  defaultValue={12}
                  onChange={(v) => set({ fontSizePt: v })}
                  onReset={() => set({ fontSizePt: 12 })}
                />
              </SettingRow>
              <SettingRow title={t("编辑器行距")} description={t("行与行之间的额外间距")}>
                <Stepper
                  value={prefs.lineSpacingPt}
                  min={0}
                  max={10}
                  defaultValue={4}
                  onChange={(v) => set({ lineSpacingPt: v })}
                  onReset={() => set({ lineSpacingPt: 4 })}
                />
              </SettingRow>
              <SegmentedRow
                title={t("段间距")}
                description={t("段落与区块之间的留白节奏")}
                value={prefs.blockSpacing}
                options={(["compact", "standard", "relaxed"] as BlockSpacing[]).map((m) => ({
                  value: m,
                  label: BLOCK_SPACING_LABELS[m],
                }))}
                onChange={(m) => set({ blockSpacing: m })}
              />
            </SettingsSection>

            <SettingsSection title={t("缩进与文件")} description={t("缩进行为与图片存放")}>
              <SettingRow title={t("缩进方式")} description={t("Tab 键插入的缩进字符")}>
                <select
                  className="settings-select"
                  value={prefs.indentStyle}
                  onChange={(e) =>
                    set({ indentStyle: e.target.value as "spaces" | "tabs" })
                  }
                >
                  <option value="spaces">{t("使用空格")}</option>
                  <option value="tabs">{t("使用 Tab 字符")}</option>
                </select>
              </SettingRow>
              <SettingRow title={t("Tab 宽度")} description={t("一个缩进级别的宽度")}>
                <select
                  className="settings-select"
                  value={prefs.tabWidth}
                  onChange={(e) =>
                    set({ tabWidth: Number(e.target.value) as 2 | 4 | 8 })
                  }
                >
                  <option value={2}>2 {t("个字符")}</option>
                  <option value={4}>4 {t("个字符")}</option>
                  <option value={8}>8 {t("个字符")}</option>
                </select>
              </SettingRow>
              <SettingRow title={t("图片保存目录")} description={t("粘贴或拖入图片时，相对文档的存放目录")}>
                <input
                  className="settings-input"
                  value={prefs.imageFolder}
                  onChange={(e) => set({ imageFolder: e.target.value })}
                  placeholder="assets"
                  spellCheck={false}
                />
              </SettingRow>
            </SettingsSection>
          </>
        )}

        {section === "markdown" && (
          <>
            <SettingsSection title="Markdown" description={t("解析与渲染选项")}>
              <SettingRow
                title={t("Markdown 单换行")}
                description={t("单个换行渲染为换行;关闭时遵循 GFM,仅在空行处分段")}
              >
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={prefs.markdownBreaks}
                    onChange={(e) => set({ markdownBreaks: e.target.checked })}
                  />
                  <span className="switch-track" />
                </label>
              </SettingRow>

              <SettingRow
                title={t("Markdown 排版美化")}
                description={t("自动替换直引号、破折号等排版符号")}
              >
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={prefs.markdownTypographer}
                    onChange={(e) => set({ markdownTypographer: e.target.checked })}
                  />
                  <span className="switch-track" />
                </label>
              </SettingRow>

              <SettingRow
                title={t("Markdown 原始 HTML")}
                description={t("渲染文档中的 HTML 片段（经本地净化，默认关闭）")}
              >
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={prefs.markdownAllowHtml}
                    onChange={(e) => set({ markdownAllowHtml: e.target.checked })}
                  />
                  <span className="switch-track" />
                </label>
              </SettingRow>
            </SettingsSection>
          </>
        )}

        {section === "export" && (
          <>
            <SettingsSection title={t("导出")} description={t("导出 HTML / Word 的外观")}>
              <SettingRow title={t("导出主题")} description={t("导出 HTML / 富文本使用的配色")}>
                <div className="segmented" role="tablist">
                  {(["auto", "light", "dark"] as const).map((th) => (
                    <button
                      key={th}
                      className={prefs.exportTheme === th ? "active" : ""}
                      onClick={() => set({ exportTheme: th })}
                    >
                      {th === "auto" ? t("跟随当前") : th === "light" ? t("浅色") : t("深色")}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SwitchRow
                title={t("导出正文限宽")}
                description={t("导出 HTML 时正文限制在 960px 内居中")}
                checked={prefs.exportNarrow}
                onChange={(v) => set({ exportNarrow: v })}
              />

              <SwitchRow
                title={t("导出代码行号")}
                description={t("导出 HTML / 富文本时代码块显示行号")}
                checked={prefs.exportCodeLineNumbers}
                onChange={(v) => set({ exportCodeLineNumbers: v })}
              />
            </SettingsSection>
          </>
        )}

        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
