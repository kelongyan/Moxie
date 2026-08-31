import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Minus, Plus } from "lucide-react";
import {
  applyTheme,
  usePreferences,
} from "../state/preferences";
import { THEME_LABELS, ThemeMode, useThemeStore } from "../state/theme";

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
        恢复默认
      </button>
    </span>
  );
}

export function SettingsWindow() {
  const prefs = usePreferences();
  const themeMode = useThemeStore((s) => s.mode);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

  useEffect(() => {
    const scroll = document.querySelector<HTMLElement>(".settings-scroll");
    if (!scroll) return;
    const contentHeight = scroll.scrollHeight;
    const height = Math.min(820, Math.max(420, contentHeight));
    void getCurrentWindow().setSize(new LogicalSize(540, height)).catch(() => {});
  }, []);

  const set = prefs.set;

  return (
    <div className="settings-window">
      <div className="settings-scroll">
        <h1 className="settings-heading">通用设置</h1>

        <SettingRow title="缩进方式" description="Tab 键插入的缩进字符">
          <select
            className="settings-select"
            value={prefs.indentStyle}
            onChange={(e) =>
              set({ indentStyle: e.target.value as "spaces" | "tabs" })
            }
          >
            <option value="spaces">使用空格</option>
            <option value="tabs">使用 Tab 字符</option>
          </select>
        </SettingRow>

        <SettingRow title="Tab 宽度" description="一个缩进级别的宽度">
          <select
            className="settings-select"
            value={prefs.tabWidth}
            onChange={(e) =>
              set({ tabWidth: Number(e.target.value) as 2 | 4 | 8 })
            }
          >
            <option value={2}>2 个字符</option>
            <option value={4}>4 个字符</option>
            <option value={8}>8 个字符</option>
          </select>
        </SettingRow>

        <SettingRow title="外观" description="窗口与编辑区的明暗主题">
          <div className="segmented wide" role="tablist">
            {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                className={themeMode === mode ? "active" : ""}
                onClick={() => applyTheme(mode)}
              >
                {THEME_LABELS[mode]}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          title="性能"
          description="大于 20MB 或 25 万行自动进入大文件模式,大于 50MB 启用严格保护"
        >
          <span className="settings-static">自动管理</span>
        </SettingRow>

        <SettingRow title="文本换行" description="超出编辑区宽度时自动折行">
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.wordWrap}
              onChange={(e) => set({ wordWrap: e.target.checked })}
            />
            <span className="switch-track" />
          </label>
        </SettingRow>

        <SettingRow title="显示行号" description="在编辑区左侧显示行号列">
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.lineNumbers}
              onChange={(e) => set({ lineNumbers: e.target.checked })}
            />
            <span className="switch-track" />
          </label>
        </SettingRow>

        <SettingRow title="退出行为" description="退出应用时对未保存内容的处理">
          <select
            className="settings-select wide"
            value={prefs.exitBehavior}
            onChange={(e) =>
              set({
                exitBehavior: e.target.value as
                  | "preserveWorkspace"
                  | "askToSave",
              })
            }
          >
            <option value="preserveWorkspace">保留工作区并退出</option>
            <option value="askToSave">每次检查未保存文件</option>
          </select>
        </SettingRow>

        <SettingRow title="编辑器字体" description="正文字号,范围 9–32">
          <Stepper
            value={prefs.fontSizePt}
            min={9}
            max={32}
            defaultValue={13.5}
            onChange={(v) => set({ fontSizePt: v })}
            onReset={() => set({ fontSizePt: 13.5 })}
          />
        </SettingRow>

        <SettingRow title="编辑器行距" description="行与行之间的额外间距">
          <Stepper
            value={prefs.lineSpacingPt}
            min={0}
            max={10}
            defaultValue={4}
            onChange={(v) => set({ lineSpacingPt: v })}
            onReset={() => set({ lineSpacingPt: 4 })}
          />
        </SettingRow>

        <SettingRow
          title="Markdown 单换行"
          description="单个换行渲染为换行;关闭时遵循 GFM,仅在空行处分段"
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
          title="Markdown 排版美化"
          description="自动替换直引号、破折号等排版符号"
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
          title="Markdown 原始 HTML"
          description="渲染文档中的 HTML 片段（经本地净化，默认关闭）"
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

        <div className="settings-divider" />
        <div className="settings-footer">
          <span>Moxie</span>
          {version && <span className="dim">版本 {version}</span>}
        </div>
      </div>
    </div>
  );
}
