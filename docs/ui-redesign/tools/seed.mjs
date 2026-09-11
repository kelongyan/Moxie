import fs from "node:fs";
import path from "node:path";

// usage: node seed.mjs <dataDir> <theme> <empty|full>
const [dataDir, theme, mode] = process.argv.slice(2);
const WIN = (p) => p.replace(/\//g, "\\");

fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "Workspace", "Workspace-1"), { recursive: true });

const recent = ["F:/Moxie/samples/typora-style-preview.md", "F:/Moxie/README.md"];
fs.writeFileSync(
  path.join(dataDir, "preferences.json"),
  JSON.stringify(
    {
      recent_file_paths: mode === "full" ? recent : [],
      preferences: {
        appTheme: theme,
        isStatusBarVisible: true,
        sidebarPinned: true,
        isWordWrapEnabled: true,
        isLineNumbersVisible: true,
      },
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(dataDir, "SidebarLibrary.json"),
  JSON.stringify(
    mode === "full"
      ? {
          favorites: [
            "F:/Moxie/samples/typora-style-preview.md",
            "F:/Moxie/README.md",
          ],
          groups: [
            {
              id: "g-1",
              name: "项目文件",
              expanded: true,
              paths: ["F:/Moxie/package.json", "F:/Moxie/src/App.tsx"],
            },
          ],
          sections: { favorites: true, groups: true, recent: true },
        }
      : {},
    null,
    2
  )
);

if (mode !== "full") {
  console.log("seeded empty:", dataDir, theme);
  process.exit(0);
}

// ---- docs ----
const sample = fs.readFileSync("F:/Moxie/samples/typora-style-preview.md", "utf8");
const code = fs.readFileSync("F:/Moxie/src/state/documents.ts", "utf8");

const logLines = [];
for (let i = 1; i <= 260; i++) {
  const t = `2026-09-11 10:${String(i % 60).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`;
  const level = i % 17 === 0 ? "ERROR" : i % 5 === 0 ? "WARN" : "INFO";
  logLines.push(
    `[${t}] ${level}  sync.worker  batch=${i}  items=${(i * 37) % 500}  elapsed=${(i % 43) + 2}ms  ${level === "ERROR" ? "retry scheduled (attempt " + (i % 3 + 1) + ")" : "ok"}`
  );
}
const logText = logLines.join("\n") + "\n";

const untitled = `# 会议纪要草稿

- 讨论 Moxie 的界面重构方向
- 目标：更安静、更克制，向 Typora 的排版气质靠拢
- 待定：标签栏与状态栏的信息密度

> 下次评审带上深浅两套主题的对照稿。
`;

const flashDoc = `# 保存状态验证

这一段用于验证状态栏的"已保存"降噪：编辑后应显示"未保存"，保存后闪现"已保存"。
`;

const docs = [
  {
    docId: "doc-1",
    name: "typora-style-preview.md",
    path: "F:/Moxie/samples/typora-style-preview.md",
    language: "markdown",
    previewVisible: true,
    text: sample,
  },
  {
    docId: "doc-2",
    name: "documents.ts",
    path: "F:/Moxie/src/state/documents.ts",
    language: "typescript",
    previewVisible: false,
    text: code,
  },
  {
    docId: "doc-3",
    name: "sync-worker.log",
    path: path.join(dataDir, "sync-worker.log"),
    language: "plaintext",
    previewVisible: false,
    text: logText,
    perfTier: "large",
    perfBytes: 25_400_000,
  },
  {
    docId: "doc-4",
    name: "未命名",
    path: null,
    language: "markdown",
    previewVisible: false,
    text: untitled,
    isDirty: true,
  },
  {
    docId: "doc-5",
    name: "flash-test.md",
    path: path.join(dataDir, "flash-test.md"),
    language: "markdown",
    previewVisible: false,
    text: flashDoc,
  },
];

fs.writeFileSync(path.join(dataDir, "sync-worker.log"), logText);
fs.writeFileSync(path.join(dataDir, "flash-test.md"), flashDoc);
fs.writeFileSync(
  path.join(dataDir, "Workspace", "CurrentWorkspace.json"),
  JSON.stringify({ workspace: "Workspace-1" })
);
fs.writeFileSync(
  path.join(dataDir, "Workspace", "Workspace-1", "Manifest.json"),
  JSON.stringify(
    {
      version: 1,
      savedAt: 0,
      activeDocId: "doc-1",
      docs: docs.map((d) => ({
        docId: d.docId,
        name: d.name,
        path: d.path,
        language: d.language,
        encoding: "utf-8",
        lineEnding: "lf",
        isDirty: Boolean(d.isDirty),
        cursorLine: 1,
        cursorColumn: 1,
        previewVisible: d.previewVisible,
        perfTier: d.perfTier ?? "standard",
        perfBytes: d.perfBytes ?? d.text.length,
      })),
    },
    null,
    2
  )
);
for (const d of docs) {
  fs.writeFileSync(
    path.join(dataDir, "Workspace", "Workspace-1", `${d.docId}.utf8`),
    d.text
  );
}
console.log("seeded full:", dataDir, theme, "docs:", docs.length, WIN(dataDir));
