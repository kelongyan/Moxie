import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
md.use(taskLists);

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export interface PreviewTokens {
  scheme: "light" | "dark";
  bg: string;
  surface: string;
  fg: string;
  secondary: string;
  border: string;
  borderStrong: string;
  accent: string;
  fontUi: string;
  fontMono: string;
}

/** 从主文档读取当前主题令牌，预览 iframe 与应用保持单一色源 */
export function collectPreviewTokens(): PreviewTokens {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    scheme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    bg: v("--lac-bg-sidebar"),
    surface: v("--lac-bg"),
    fg: v("--lac-text"),
    secondary: v("--lac-text-secondary"),
    border: v("--lac-border"),
    borderStrong: v("--lac-border-strong"),
    accent: v("--lac-accent"),
    fontUi: v("--font-ui"),
    fontMono: v("--font-mono"),
  };
}

const CHECK_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3.5 8.5l3 3 6-6.5'/></svg>\")";

export function renderMarkdown(
  text: string,
  tokens: PreviewTokens,
  title: string
): string {
  const body = md.render(text);
  const codeBg = `color-mix(in srgb, ${tokens.fg} 6%, ${tokens.bg})`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeAttribute(title)}</title>
<style>
  html { color-scheme: ${tokens.scheme}; }
  html, body { margin: 0; padding: 0; background: ${tokens.bg}; }
  body {
    color: ${tokens.fg};
    font-family: ${tokens.fontUi};
    font-size: 15px;
    line-height: 1.75;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: ${tokens.borderStrong};
    border: 2px solid transparent;
    border-radius: 999px;
    background-clip: content-box;
  }
  article { max-width: min(72ch, 100%); margin: 0; padding: 20px 26px 56px; }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; line-height: 1.35; }
  h1 { font-size: 1.6em; margin: 1.2em 0 0.5em; padding-bottom: 0.3em;
       border-bottom: 1px solid ${tokens.border}; }
  h2 { font-size: 1.35em; margin: 1.2em 0 0.5em; padding-bottom: 0.25em;
       border-bottom: 1px solid ${tokens.border}; }
  h3 { font-size: 1.18em; margin: 1.15em 0 0.45em; }
  h4, h5, h6 { font-size: 1.02em; margin: 1.15em 0 0.45em; }
  p { margin: 0.55em 0; }
  a { color: ${tokens.accent}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 1.6em; margin: 0.5em 0; }
  li { margin: 0.15em 0; }
  li.task-list-item { list-style: none; margin-left: -1.4em; }
  li.task-list-item input {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    margin: 0 0.5em 0 0;
    border: 1px solid ${tokens.borderStrong};
    border-radius: 4px;
    background: ${tokens.surface};
    vertical-align: -2px;
  }
  li.task-list-item input:checked {
    background: ${tokens.accent} ${CHECK_SVG} center/10px no-repeat;
    border-color: ${tokens.accent};
  }
  blockquote {
    margin: 0.8em 0; padding: 0.35em 0.9em;
    border-left: 3px solid ${tokens.borderStrong};
    background: color-mix(in srgb, ${tokens.fg} 3%, ${tokens.bg});
    border-radius: 0 6px 6px 0;
    color: ${tokens.secondary};
  }
  code {
    font-family: ${tokens.fontMono};
    font-size: 0.875em;
    background: ${codeBg};
    padding: 0.18em 0.4em;
    border-radius: 5px;
    border: 1px solid ${tokens.border};
  }
  pre {
    background: ${codeBg};
    border: 1px solid ${tokens.border};
    padding: 14px 16px;
    border-radius: 10px;
    overflow-x: auto;
  }
  pre code { background: transparent; padding: 0; border: none; font-size: 0.875em; line-height: 1.65; }
  table { border-collapse: collapse; margin: 0.8em 0; font-variant-numeric: tabular-nums; }
  th, td {
    border: none;
    border-bottom: 1px solid ${tokens.border};
    padding: 6px 16px 6px 0;
    text-align: left;
  }
  th { font-weight: 600; background: ${codeBg}; border-bottom-color: ${tokens.borderStrong}; }
  hr { border: none; border-top: 1px solid ${tokens.border}; margin: 1.4em 0; }
  img { max-width: 100%; }
</style>
</head>
<body>
<article>${body}</article>
</body>
</html>`;
}
