import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const src = fileURLToPath(new URL("../", import.meta.url));
const imports = new Map<string, string[]>();

/** Follow only runtime imports: a type or an import() cannot make a module
 * part of the window's initial dependency graph. */
function staticDependencies(entry: string): Set<string> {
  const seen = new Set<string>();
  function visit(path: string) {
    if (seen.has(path)) return;
    seen.add(path);
    if (!path.startsWith(src)) return;
    let dependencies = imports.get(path);
    if (!dependencies) {
      const ast = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      dependencies = [];
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
          continue;
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          if (clause?.isTypeOnly) continue;
          const bindings = clause?.namedBindings;
          if (
            !clause?.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.every((item) => item.isTypeOnly)
          )
            continue;
        } else if (
          node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.every((item) => item.isTypeOnly))
        )
          continue;
        const specifier = node.moduleSpecifier;
        if (!specifier || !ts.isStringLiteral(specifier)) continue;
        const spec = specifier.text;
        if (!spec.startsWith(".")) dependencies.push(spec);
        else {
          const base = resolve(dirname(path), spec);
          const target = [".ts", ".tsx", "/index.ts", "/index.tsx"]
            .map((extension) => base + extension)
            .find(existsSync);
          if (target) dependencies.push(target);
        }
      }
      imports.set(path, dependencies);
    }
    dependencies.forEach(visit);
  }
  visit(resolve(src, entry));
  return seen;
}

it.each([
  ["document-view/EditorPane.tsx", /^@milkdown\//],
  ["app/useSourceModes.ts", /^@milkdown\//],
  ["app/useGlobalShortcuts.ts", /^@milkdown\//],
  ["sidebar/Outline.tsx", /^@milkdown\//],
  ["plugins/contributions/editor-key-capture.ts", /^@milkdown\//],
  ["plugins/manager.ts", /^@milkdown\//],
  ["sidebar/move-links.ts", /^mdast-util-from-markdown$/],
  ["editor/lazy-blocks/lazy-block-dom.ts", /^@milkdown\//],
  ["app/MainPane.tsx", /[\\/]plugin-code-blocks\.ts$/],
  ["plugins/contributions/will-save.ts", /[\\/]save-blocks\.ts$/],
  [
    "document-view/EditorChatPortals.tsx",
    /[\\/](EditorAgentPanel|InlineChat|ChatBody)\.tsx$/,
  ],
])(
  "%s keeps first-use dependencies behind its lazy boundary",
  (entry, heavy) => {
    expect(
      [...staticDependencies(entry)].filter((path) => heavy.test(path)),
    ).toEqual([]);
  },
);
