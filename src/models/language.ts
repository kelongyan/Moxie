export type EditorLanguage =
  | "plaintext"
  | "markdown"
  | "json"
  | "html"
  | "javascript"
  | "typescript"
  | "css"
  | "python"
  | "swift"
  | "shell"
  | "yaml"
  | "ccpp"
  | "sql";

const EXTENSION_MAP: Record<string, EditorLanguage> = {
  md: "markdown",
  markdown: "markdown",
  json: "json",
  html: "html",
  htm: "html",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  css: "css",
  py: "python",
  pyw: "python",
  swift: "swift",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yaml: "yaml",
  yml: "yaml",
  c: "ccpp",
  h: "ccpp",
  cc: "ccpp",
  cpp: "ccpp",
  cxx: "ccpp",
  hpp: "ccpp",
  sql: "sql",
};

export const LANGUAGE_LABELS: Record<EditorLanguage, string> = {
  plaintext: "纯文本",
  markdown: "Markdown",
  json: "JSON",
  html: "HTML",
  javascript: "JavaScript",
  typescript: "TypeScript",
  css: "CSS",
  python: "Python",
  swift: "Swift",
  shell: "Shell",
  yaml: "YAML",
  ccpp: "C/C++",
  sql: "SQL",
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_MAP);

export function pathExtension(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function inferLanguage(path: string): EditorLanguage {
  return EXTENSION_MAP[pathExtension(path)] ?? "plaintext";
}

export function baseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}
