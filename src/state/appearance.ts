import { usePreferences } from "./preferences";

/** 偏好驱动的文档级外观覆盖：界面字体 + 强调色（空值回落主题默认） */

const ACCENT_VARS = [
  "--lac-accent",
  "--lac-accent-hover",
  "--lac-accent-active",
  "--lac-accent-soft",
  "--lac-accent-softer",
  "--lac-selection",
] as const;

function apply() {
  const { uiFont, accentColor } = usePreferences.getState();
  const root = document.documentElement;
  const font = uiFont.trim();
  if (font) {
    root.style.setProperty("--font-ui", `"${font}", "Frex Sans GB", sans-serif`);
  } else {
    root.style.removeProperty("--font-ui");
  }

  const accent = accentColor.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(accent)) {
    root.style.setProperty("--lac-accent", accent);
    root.style.setProperty("--lac-accent-hover", accent);
    root.style.setProperty("--lac-accent-active", accent);
    root.style.setProperty(
      "--lac-accent-soft",
      `color-mix(in srgb, ${accent} 10%, transparent)`
    );
    root.style.setProperty(
      "--lac-accent-softer",
      `color-mix(in srgb, ${accent} 5.5%, transparent)`
    );
    root.style.setProperty(
      "--lac-selection",
      `color-mix(in srgb, ${accent} 30%, transparent)`
    );
  } else {
    for (const name of ACCENT_VARS) root.style.removeProperty(name);
  }
}

/** main.tsx 挂载时调用：立即应用一次，之后跟随偏好变化 */
export function initAppearance(): void {
  apply();
  usePreferences.subscribe(() => apply());
}
