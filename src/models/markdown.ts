/** Moxie 是 Markdown 专用编辑器：文件类型判定只认 Markdown 扩展名 */

export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkd", "mkdown"];

export function baseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

export function pathExtension(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(pathExtension(path));
}
