# Moxie UI 精修方案

> 版本基准：v1.0.0（main 分支）· 撰写日期：2026-08-30
> 适用范围：`src/styles/*` 与 `src/components/*` 的纯视觉/交互精修，不改变窗口结构与业务逻辑
> 目标版本：v1.1（UI 打磨版）

---

## 0. TL;DR：现状一句话与方案一句话

**现状**：Moxie 已经有一套克制、规范的设计令牌（`tokens.css`），但整体 UI"灰得太均匀"——强调色几乎不出现、层级只靠 1px 边框、控件语言不统一（原生 checkbox 混自定义 switch、状态栏用 Unicode 字符混 lucide 图标）、缺少空状态与品牌记忆点，细看处处是毛边。

**方案**：不动骨架、不引依赖，做一次"令牌升级 + 七个区域精修 + 一套浮层规范 + 一个空状态"的精修。分 6 个阶段落地，每阶段都有验收标准，深浅两主题同步走查。

---

## 1. 现状盘点

### 1.1 技术与文件地图

| 层 | 文件 | 说明 |
|---|---|---|
| 设计令牌 | `src/styles/tokens.css`（200 行） | 颜色 / 尺寸 / 字号 / 动效 / 层序，浅深两套 |
| 公共原语 | `src/styles/primitives.css`（146 行） | 图标按钮 / 操作按钮 / 输入域 / 浮层表面 |
| 组件样式 | `src/styles/app.css`（1389 行） | 各组件尺寸与布局 |
| 骨架 | `src/App.tsx` + `TitleToolbar / TabBar / StatusBar / SidebarView / EditorPane` | 主窗口五件套 |
| 浮层 | `ContextMenu / Tooltip / SavePromptDialog / PromptDialogs / FileDialogs / DropOverlay` | 菜单、提示、模态 |
| 独立窗口 | `SettingsWindow / FindReplaceWindow / CodecWindow / MarkdownPreview` | 四个独立 webview |
| 编辑器 | `src/editor/extensions.ts` + `highlightTheme.ts` | CodeMirror 6 主题内嵌在 TS 里 |

技术约束：Tauri 2 + React 18 + Zustand，无边框窗口（`decorations: false`），图标库 lucide-react，UI 文案为中文，CSP 限制 `style-src 'self' 'unsafe-inline'`（预览 iframe 用内联样式，可行）。

### 1.2 已有的好底子（精修时要保住的）

- ✅ 令牌命名统一（`--lac-*`）、间距 4 的倍数体系、Windows px 字号尺度（14/12/11）。
- ✅ `primitives.css` 已把交互三态（hover/pressed/disabled）收敛到单一来源。
- ✅ 全局 `:focus-visible` 键盘焦点环、`prefers-reduced-motion` 全局降级、滚动条细圆头。
- ✅ 深色主题色板（VS Code 系）底子不错，语法高亮色板完整。
- ✅ 无声胜有声的产品气质：无渐变、无大色块，方向正确——问题是"精"不够，不是"花"不够。

### 1.3 问题清单（按优先级）

**P0 — 观感伤害最大的**

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| A1 | **无空状态**：无文档时编辑区是一整片空白，只有一个孤零零的"+"按钮 | `EditorPane.tsx` / 死样式 `app.css:90` | 首次启动的第一印象就是"这个应用什么都没有" |
| A2 | **强调色存在感为零**：全 UI 几乎纯灰，accent 只出现在标签下划线、脏点、选区 | `tokens.css:30` | 品牌色 `#4a52a3` 没有 tints 体系，没有可铺面的 soft 变体，导致不敢用 |
| A3 | **控件语言不统一**：设置页用自定义 switch，查找页用原生 checkbox（Chromium 默认样式，主题下突兀） | `FindReplaceWindow.tsx:160,173` | 一眼假 |
| A4 | **状态栏图标语言混乱**：`↻ 保存中…`、`✓ 已保存` 用 Unicode 字符，其余全是 lucide | `StatusBar.tsx:142,149` | 字符基线与图标不对齐，且无动效 |
| A5 | **对话框没有标题和图标**：modal 只有一行 message + 按钮排，信息层级扁平，危险操作无警示语义 | `SavePromptDialog.tsx` 等五个对话框 | 模态是最贵的 UI，却最简陋 |

**P1 — 细看毛边**

| # | 问题 | 位置 |
|---|---|---|
| B1 | 标签页选中指示器是 2px 直角 inset 硬线，宽 100%，生硬 | `app.css:334` |
| B2 | 标签关闭按钮 18px、X 图标 9px/描边 3，太小太挤 | `TabBar.tsx:217` |
| B3 | 侧栏 section 折叠箭头默认 `opacity: 0`，只有悬停才出现——可发现性差 | `app.css:912` |
| B4 | 标题栏"语言模式"是个假按钮（有 chevron 有 disabled 态，点击无任何反应） | `TitleToolbar.tsx:133` |
| B5 | 状态栏 `行 12,列 34` 半角逗号、`字数:12` 半角冒号，标点体例不统一 | `StatusBar.tsx:49,168` |
| B6 | 设置页主题分段控件 `.segmented.wide` 的 `.wide` 没有对应样式，三段不等宽 | `SettingsWindow.tsx:126` |
| B7 | 设置页缺"显示行号"开关——偏好里存在 `lineNumbers` 且编辑器在读，但 UI 无入口 | `preferences.ts:14` |
| B8 | 括号匹配用"背景+1px 描边"双层强调，视觉过重 | `extensions.ts:145` |
| B9 | 编解码窗口激活芯片是实心 accent 大色块，与整体克制气质不符 | `app.css:779` |
| B10 | 输入域高度三处不一：查找 28px、提示框 30px、下拉 28px | `app.css` 各处 |

**P2 — 技术债（顺手清）**

| # | 问题 | 位置 |
|---|---|---|
| C1 | `.context-menu` 规则定义两次（min-width 168 又改 200） | `app.css:444,455` |
| C2 | `.lac-main`、`.editor-pane` 各定义两次 | `app.css:83/844`、`205/1269` |
| C3 | 死样式 `.lac-editor-placeholder`（无引用）、死令牌 `--fs-16`、`--tooltip-delay-ms` 定义未用 | `app.css:90`、`tokens.css:162,181` |
| C4 | 标签宽度测量字体写死 `16px 'Segoe UI'`，实际渲染 14px，中段截断不准 | `TabBar.tsx:124` |
| C5 | 内置 Noto Sans SC 全量 TTF 达 17.7MB，首包偏重 | `src/assets/fonts/` |

---

## 2. 设计方向

### 2.1 一句话定位

> **"安静的纸，压得住的蓝。"**——表面是安静的纸（靠明度分三层），品牌是压得住的蓝（accent 只做点睛：指示、选中、主按钮、光标）。

### 2.2 四条精修原则

1. **层级靠明度，不靠描边**：chrome（标题/标签/状态栏）→ sidebar → content 三层明度差拉开；1px 边框只做"收边"，不做"分区主力"。
2. **accent 三用**：指示（tab 下划线、打开指示条）、选中（光标、选区、激活态）、主行动（prominent 按钮）。除此之外不铺色。
3. **一套控件语言**：所有可勾选 = 自定义 checkbox/switch；所有状态 = lucide 图标；所有浮层 = 同一圆角/阴影/内边距。
4. **动效只做反馈，不做表演**：80ms 悬停、140ms 弹层、220ms 结构过渡，超出即删。

### 2.3 尺度红线（精修期间不许动的）

- 窗口结构尺寸：标题栏 40 / 标签栏 36 / 状态栏 26 / 侧栏 240。
- 字号台阶 11/12/13/14/20 与 `--font-ui`、`--font-mono` 栈。
- 令牌前缀 `--lac-*` 与现有命名（只新增、不重命名，避免一次性爆改全量引用）。

---

## 3. 令牌体系 v2（`tokens.css` 升级）

### 3.1 新增令牌（追加进浅/深两套）

```css
/* ===== 浅色 ===== */
:root, [data-theme="light"] {
  /* 强调色五件套：解决"不敢用蓝" */
  --lac-accent: #4a52a3;
  --lac-accent-hover: #565eb5;              /* 主按钮悬停 */
  --lac-accent-active: #3f4691;             /* 主按钮按下 */
  --lac-accent-soft: rgba(74, 82, 163, 0.10);   /* 激活底、芯片底 */
  --lac-accent-softer: rgba(74, 82, 163, 0.055); /* 大面积铺色、空状态底 */
  --lac-accent-contrast: #ffffff;

  /* 下沉表面：输入域 / 文本域 / 查找框，让"框"自己读出是框 */
  --lac-bg-inset: #f6f7f9;

  /* 语义色的 soft 底（对话框图标、危险悬停用） */
  --lac-danger-soft: rgba(192, 57, 44, 0.10);
  --lac-warning-soft: rgba(150, 89, 10, 0.12);
  --lac-success-soft: rgba(23, 122, 61, 0.10);

  /* 控件统一高度 */
  --control-h: 30px;
}

/* ===== 深色 ===== */
[data-theme="dark"] {
  --lac-accent: #96a0f5;
  --lac-accent-hover: #a8b1f7;
  --lac-accent-active: #8790ee;
  --lac-accent-soft: rgba(150, 160, 245, 0.16);
  --lac-accent-softer: rgba(150, 160, 245, 0.09);
  --lac-accent-contrast: #14151d;           /* 深色下主按钮文字换深墨 */

  --lac-bg-inset: #17181c;

  --lac-danger-soft: rgba(255, 123, 114, 0.12);
  --lac-warning-soft: rgba(227, 179, 65, 0.12);
  --lac-success-soft: rgba(92, 214, 138, 0.10);
}
```

要点：

- 浅色主按钮文字保持白，**深色主按钮文字改用 `--lac-accent-contrast`（深墨）**——目前深色主题下白字压在 `#96a0f5` 上对比度不足 4.5:1，这是无障碍问题。
- `primitives.css` 的 `.prominent` 改为：

```css
.modal-button.prominent:hover:not(:disabled),
.find-button.prominent:hover:not(:disabled) {
  background: var(--lac-accent-hover);   /* 替换 filter: brightness(1.08) */
}
.modal-button.prominent:active:not(:disabled),
.find-button.prominent:active:not(:disabled) {
  background: var(--lac-accent-active);
}
```

### 3.2 删除/清理令牌

- 删 `--fs-16`（无引用）、删 `--tooltip-delay-ms`（`Tooltip.tsx` 里的 `DELAY_MS = 600` 就是唯一真源）。
- `--fs-editor: 18.5px` 保留但注释改为"由设置页字号 pt 换算覆盖，此值仅兜底"。

---

## 4. 分区域精修方案

> 每区按"现状 → 方案 → 验收"组织；代码片段可直接落地。

### 4.1 标题栏（TitleToolbar）

**现状**：布局合理，但 ① 窗口标题与按钮挤在一起缺乏呼吸；② 无品牌标识；③ 语言模式假按钮；④ 侧栏激活态太弱。

```
┌──────────────────────────────────────────────────────────┐
│ [▤] [M·] Moxie — 未命名.txt        ↶ ↷ │ 语言 ▾ │ [▥] │ ─ □ ✕ │
└──────────────────────────────────────────────────────────┘
  ↑32px   ↑16px 品牌点    ↑spacer      ↑假按钮改真菜单   ↑46px 标准窗控
```

**方案**：

1. **品牌点**：标题前加 16×16 品牌标识（直接复用 `src-tauri/icons/32x32.png`，`<img>` 引入即可，与"未命名"文档场景呼应），与标题间距 8px。
2. **语言按钮改真菜单**：点击弹出 `ContextMenu`，列出 `LANGUAGE_LABELS` 全部语言，选中项打勾，选择后 `patchDocument(doc.id, { language })`。复用现有菜单组件，新增成本约 30 行。这是"看起来能点的东西必须能点"的信任修复，优先级最高。
3. **激活态升级**：侧栏/预览的 `active` 态从灰底改为品牌色暗示：

```css
.tool-button.active {
  background: var(--lac-accent-soft);
  color: var(--lac-accent);
}
```

4. 标题 `max-width` 320→`clamp(160px, 30vw, 360px)`，窄窗时优先保按钮。
5. 窗控按钮保持 46px 宽 + 关闭悬停 `#c42b1c`（已符合 Win11 规范，勿动）。

**验收**：语言按钮可换语言且立即生效；激活按钮有品牌色底；深浅主题下窗控悬停正确。

### 4.2 标签栏（TabBar）

**现状**：选中标签 = 白底 + 顶部 2px 直角硬线；关闭钮 18px 过小；溢出无视觉提示。

**方案**：

1. **圆头指示器 + 进场动效**（本方案观感提升最大的一处）：

```css
.tab::after {
  content: "";
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 0; height: 2.5px;
  border-radius: 2px;
  background: var(--lac-accent);
  transition: width var(--dur-2) var(--ease-out);
}
.tab.selected::after { width: calc(100% - 20px); }
```

替换现有 `box-shadow: inset 0 2px 0 var(--lac-accent)`。切换标签时指示条有 140ms 展开动画，"活"而不闹。

2. **关闭按钮加大**：`.tab-close` 18→20px，X 图标 9/描边3 → 11/描边2，悬停底色用 `--lac-pressed`。

3. **滚动边缘渐隐**（可选，低风险）：

```css
.tab-scroll {
  mask-image: linear-gradient(to right,
    transparent 0, #000 12px, #000 calc(100% - 12px), transparent);
}
```

4. **测量字体修正**（C4）：`TabBar.tsx:124` 改为 `const tabFont = "14px 'Segoe UI', 'Noto Sans SC', sans-serif";`（与 `.tab-name` 实际 14px 一致）。
5. 新建"+"按钮加 `border-radius: var(--radius-sm)` 保持，悬停已有态，补 `:active { transform: scale(0.94) }`。

**验收**：指示条圆头且切换有动画；关闭钮易点（≥20px 命中）；中文名截断位置与显示一致。

### 4.3 侧边栏（SidebarView）

**现状**：结构好，但折叠箭头藏起来、区块之间太挤、行 hover 无过渡。

**方案**：

1. **chevron 常显**：`opacity: 0` → `opacity: 0.65`，悬停 1；颜色 `--lac-text-tertiary`。折叠状态是信息架构的一部分，不该隐藏。
2. **呼吸感**：`.sidebar-scroll` padding `8px 6px` → `10px 8px`，区块间 gap `10px` → `14px`。
3. **行过渡**：`.sidebar-row`、`.group-row` 补 `transition: background var(--anim-hover)`（primitives 已有此模式，此处漏配）。
4. **区块标题降调**：`.section-title` 颜色 `--lac-text` → `--lac-text-tertiary`、字重 600、加 `letter-spacing: 0.02em`——标题是路标不是内容。
5. **空区块提示升级**：`.section-empty` 增加一行 lucide 小图标（`Star`/`FolderPlus`/`History`，14px，tertiary 色），文案保持现有。
6. 底部设置按钮保持，右侧补悬浮提示"设置"已有文字，不动。

**验收**：未悬停时能看到折叠箭头；三个区块间距明显大于行间距；hover 有 80ms 过渡。

### 4.4 状态栏（StatusBar）

**现状**：Unicode 字符图标、标点不统一、信息纯文本无分组感。

**方案**：

1. **图标统一为 lucide**：

```tsx
{activeDoc.ioState === "saving" ? (
  <span className="save-state saving">
    <Loader2 size={12} className="save-spin" /> 保存中…
  </span>
) : activeDoc.isDirty ? (
  <span className="save-state dirty"><span className="dot" /> 未保存</span>
) : (
  <span className="save-state saved"><Check size={12} /> 已保存</span>
)}
```

```css
.save-state { color: var(--lac-text-tertiary); }       /* 常态降噪 */
.save-state.dirty  { color: var(--lac-warning); }
.save-spin { animation: lac-spin 1.2s linear infinite; }
@keyframes lac-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .save-spin { animation: none; } }
```

已保存态从绿色**降为 tertiary 灰 + Check 图标**：绿色是给"未保存"（需注意）让路的，常态不该抢眼。

2. **标点统一**：`行 {n},列 {n}` → `行 {n} · 列 {n}`；`字数:{n}` → `字数 {n}`（去掉半角冒号，与"行/列"的中点分隔一致）。
3. 状态消息区 `status-message` 保持 error 红；补 `min-height` 防空塌（现有 `""` 占位可删，用 CSS 兜底）。
4. 大文件徽标：`Gauge 大文件模式` 触发器加 chip 底色 `--lac-warning-soft` + `--lac-warning` 前景，让"性能降级状态"一眼可辨。

**验收**：保存中有旋转动效且 reduced-motion 下静止；无半角标点混排；大文件徽标可辨识。

### 4.5 编辑器（CodeMirror 主题，`extensions.ts`）

**现状**：骨架好，毛边在光标颜色、行号强调、括号匹配过重。

**方案**（改 `extensions.ts` 内 `EditorView.theme`）：

```ts
".cm-content": {
  caretColor: "var(--lac-accent)",        // ① 光标用品牌色，编辑器是产品灵魂
  padding: "12px 0 28px",                 // ② 顶部 10→12，多一屏呼吸
},
".cm-cursor, .cm-dropCursor": {
  borderLeftColor: "var(--lac-accent)",
  borderLeftWidth: "2px",
},
".cm-lineNumbers .cm-gutterElement": {
  color: "var(--lac-text-tertiary)",      // ③ 行号降为三级灰
  fontFamily: "var(--font-mono)",
  fontSize: "0.85em",
  minWidth: "44px",
  padding: "0 8px",
  fontVariantNumeric: "tabular-nums",
},
".cm-activeLineGutter": {
  backgroundColor: "transparent",
  color: "var(--lac-text-secondary)",     // ④ 当前行号：提亮一档而非全黑
},
".cm-matchingBracket": {
  backgroundColor: "var(--lac-accent-soft)",  // ⑤ 去掉 1px 描边，只留软底
  outline: "none",
},
```

同时 `.cm-foldPlaceholder` 补 `color: var(--lac-text-secondary); border-radius: var(--radius-xs);`。

**验收**：光标为品牌蓝；当前行号柔和提亮；括号匹配不再"闪框"；选区/当前行/查找高亮三色互不干扰（选区叠查找时目测确认）。

### 4.6 Markdown 预览排版（`preview/markdown.ts` 内联样式）

**现状**：能用，但标题无层级锚点、代码块平、引用块弱、表格无表头底。

**方案**（只改模板内 CSS，注释掉的不列）：

```css
body { font-size: 15px; line-height: 1.75; }
article { max-width: min(72ch, 100%); padding: 20px 26px 56px; }

/* 标题锚点：h1/h2 下边线，长文扫读的关键 */
h1 { font-size: 1.6em; margin: 1.2em 0 0.5em; padding-bottom: 0.3em;
     border-bottom: 1px solid ${tokens.border}; }
h2 { font-size: 1.35em; margin: 1.2em 0 0.5em; padding-bottom: 0.25em;
     border-bottom: 1px solid ${tokens.border}; }
h3 { font-size: 1.18em; }
h4, h5, h6 { font-size: 1.02em; }

/* 行内代码：缩小一档、加边线，与正文区分更清楚 */
code { font-size: 0.875em; padding: 0.18em 0.4em; border-radius: 5px;
       border: 1px solid ${tokens.border}; }

/* 代码块：更大的圆角与内边距 */
pre { padding: 14px 16px; border-radius: 10px; border: 1px solid ${tokens.border}; }
pre code { line-height: 1.65; font-size: 0.875em; }

/* 引用块：加软底，扫读时成"块" */
blockquote { margin: 0.8em 0; padding: 0.35em 0.9em;
  border-left: 3px solid ${tokens.borderStrong};
  background: color-mix(in srgb, ${tokens.fg} 3%, ${tokens.bg});
  border-radius: 0 6px 6px 0; }

/* 表格：表头底色 + 收紧行距 */
th { background: ${codeBg}; }
th, td { padding: 6px 16px 6px 0; }
```

**验收**：长文预览有清晰的 h1/h2 锚线；代码块、引用块、表格三种"块"能一眼区分；深色主题下 codeBg 混色正确。

### 4.7 对话框 / 右键菜单 / Tooltip（浮层体系）

这是模态、菜单、提示的统一规范，一次定死，五个对话框全部套用。

#### 4.7.1 对话框结构升级（A5）

现状只有一行 message。统一为 **"图标 + 标题 + 说明 + 操作区"** 四段式：

```
┌─────────────────────────────────────┐
│  (⚠)  未保存的更改                    │   ← 图标 36px 圆底 + 标题 15px/600
│       "笔记.md"尚未保存。              │   ← 说明 13px secondary
│       要在关闭前保存吗？               │
│                                     │
│              [ 不保存 ] [ 取消 ] [ 保存 ] │   ← 主按钮最右、accent 实底
└─────────────────────────────────────┘
```

```css
.modal-panel { min-width: 400px; max-width: 440px; padding: 20px;
  border-radius: var(--radius-md); }
.modal-head { display: flex; gap: 12px; align-items: flex-start;
  margin-bottom: 16px; }
.modal-icon { width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; }
.modal-icon.warn   { background: var(--lac-warning-soft); color: var(--lac-warning); }
.modal-icon.danger { background: var(--lac-danger-soft);  color: var(--lac-danger); }
.modal-icon.info   { background: var(--lac-accent-softer); color: var(--lac-accent); }
.modal-title { font-size: 15px; font-weight: 600; color: var(--lac-text); }
.modal-message { font-size: var(--fs-caption); color: var(--lac-text-secondary);
  margin-top: 3px; line-height: 1.5; }
```

五个对话框套用：SavePrompt（warn/`TriangleAlert`）、Conflict（warn）、Lossy（info/`Info`）、Encoding（info）、Prompt 确认（confirm.danger 时 danger/否则 info）。仅按钮区不再重复 message 行。

按钮统一（primitives.css）：

```css
.modal-button, .modal-choice-button, .find-button {
  height: var(--control-h);          /* 30px，与输入框同高 */
  min-width: 80px; padding: 0 14px;
  border-radius: var(--radius-sm);
  font-size: var(--fs-body);
}
.modal-choice-button { height: 34px; justify-content: flex-start; }
```

#### 4.7.2 自定义 Checkbox（A3，消灭原生控件）

查找/替换页的两个 checkbox 换成与设置页 switch 同语言的自定义样式（纯 CSS，结构不变）：

```css
/* 全局 type=checkbox 视觉接管：尺寸 15px、圆角 4、选中 accent+白勾 */
input[type="checkbox"] {
  appearance: none; -webkit-appearance: none;
  width: 15px; height: 15px; margin: 0;
  border: 1.5px solid var(--lac-border-strong);
  border-radius: 4px; background: var(--lac-bg);
  cursor: pointer; position: relative;
  transition: background var(--anim-hover), border-color var(--anim-hover);
}
input[type="checkbox"]:hover { border-color: var(--lac-text-tertiary); }
input[type="checkbox"]:checked {
  background: var(--lac-accent); border-color: var(--lac-accent);
}
input[type="checkbox"]:checked::after {
  content: ""; position: absolute; left: 4px; top: 1px;
  width: 4px; height: 8px;
  border: solid var(--lac-accent-contrast); border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
```

注意：全局接管会影响原生控件的所有出现处（目前只有查找页两处），一次性统一。

#### 4.7.3 右键菜单（C1 + 细节）

- 合并重复规则；面板 `border-radius: var(--radius-md)`（8px，对齐 Win11 浮层）、padding 5px、阴影 `--sh-2`。
- 菜单项 height 30px、`border-radius: 5px`、padding `0 10px 0 8px`。
- **danger 项专属悬停**：`button.danger:hover { background: var(--lac-danger-soft); }`——现在危险项悬停仍是灰底，语义断裂。
- 快捷键列 `--lac-text-tertiary` 保持，字号 12。

#### 4.7.4 Tooltip

```css
.lac-tooltip {
  padding: 4px 10px; border-radius: var(--radius-sm);
  border: 1px solid var(--lac-border);
  font-size: var(--fs-caption);          /* 14→12，Windows 工具提示尺度 */
  gap: 12px; min-height: 24px;
  box-shadow: var(--sh-2);
}
```

**验收**：五个对话框均有图标+标题；查找页 checkbox 是品牌色自定义样式；危险菜单项悬停红色软底；tooltip 12px。

### 4.8 查找替换 & 编解码窗口

**查找窗口**：

1. `.find-window` padding `20px` → `24px`，gap `16px` → `18px`。
2. 输入框统一 `height: var(--control-h)`、背景 `var(--lac-bg-inset)`（见 3.1）。
3. 按钮排：`全部替换` 保持 prominent；`上一个/下一个` 图标 13→14px，补 `gap: 5px`。
4. checkbox 随 4.7.2 自动统一。

**编解码窗口**：

1. **激活芯片去实心化**（B9）：

```css
.codec-ops button.active {
  background: var(--lac-accent-soft);
  border-color: color-mix(in srgb, var(--lac-accent) 35%, transparent);
  color: var(--lac-accent);
}
```

2. 文本域 `.codec-text`：背景 `var(--lac-bg-inset)`、`border-radius: var(--radius-md)`、padding `10px`。
3. 12 个操作芯片超过一行时自动换行（已有 flex-wrap），给 `.codec-ops` 加 `row-gap: 8px`。

**验收**：两窗输入框与主窗对话框输入框视觉一致；编解码激活态是"软蓝芯片"而非大色块。

### 4.9 设置窗口

1. **补"显示行号"开关行**（B7）——`lineNumbers` 偏好已存在且编辑器在消费，UI 缺入口：

```tsx
<SettingRow title="显示行号" description="在编辑区左侧显示行号列">
  <label className="switch">
    <input type="checkbox" checked={prefs.lineNumbers}
      onChange={(e) => set({ lineNumbers: e.target.checked })} />
    <span className="switch-track" />
  </label>
</SettingRow>
```

2. **分段控件等宽**（B6）：补 `.segmented.wide button { flex: 1; padding: 0 24px; }`。
3. **行分隔线**：删除标题下孤立的 `.settings-divider`，改为行间细线，更接近 Win11 设置的节奏：

```css
.settings-row + .settings-row { border-top: 1px solid var(--lac-border); }
.settings-row { padding: 14px 0; }
```

4. **select 品牌化箭头**（原生箭头深色主题下发灰）：

```css
.settings-select {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b8f9a' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}
```

（深色主题同款 data-uri，stroke 换 `%23a4a8b2`，放在 dark 块内覆盖。）

5. 设置页脚版本号保持；`.settings-heading` 字号 20 保持。

**验收**：行号开关生效（切换后编辑器重建含 gutter）；三段主题切换等宽；select 箭头两主题下清晰。

### 4.10 空状态（A1，新增设计）

**这是本方案最重要的新增界面。** 无文档时 `EditorPane` 渲染 `<EditorEmptyState />`（`documents.length === 0` 时替换 `cm-host`）。

```
                    ┌     ┐
                    │ ✎  │        ← 64px 圆角方，accent-softer 底
                    └     ┘           Feather 图标 28px accent 色

                     开始书写          ← 20px / 600
          打开本地文件，或新建一个空白标签页   ← 13px secondary

            [ 打开文件 ]   [ 新建标签页 ]     ← prominent + 次级

          ─────────────────────────────
           Ctrl O 打开 · Ctrl N 新建 · Ctrl W 关闭标签   ← 12px tertiary，kbd 样式
```

组件骨架：

```tsx
function EditorEmptyState() {
  return (
    <div className="editor-empty">
      <div className="editor-empty-mark"><Feather size={28} /></div>
      <h2 className="editor-empty-title">开始书写</h2>
      <p className="editor-empty-desc">打开本地文件，或新建一个空白标签页</p>
      <div className="editor-empty-actions">
        <button className="modal-button prominent" onClick={() => void openFileAction()}>
          打开文件
        </button>
        <button className="modal-button" onClick={newTabAction}>新建标签页</button>
      </div>
      <div className="editor-empty-hints">
        <span><kbd>Ctrl</kbd> <kbd>O</kbd> 打开</span>
        <span className="dot" />
        <span><kbd>Ctrl</kbd> <kbd>N</kbd> 新建</span>
        <span className="dot" />
        <span><kbd>Ctrl</kbd> <kbd>W</kbd> 关闭标签</span>
      </div>
    </div>
  );
}
```

样式要点：整体 `flex:1` 居中、纵向间距 16/8/20/24、`animation: lac-fade-in var(--dur-3)`；`kbd` 用 `--lac-bg-inset` 底 + 1px 边 + `radius-xs` + 11px mono；同时删除死样式 `.lac-editor-placeholder`（C3）。

**验收**：启动即见空状态（浅/深）；两个按钮全部可用；快捷键提示与 `useShortcuts.ts` 实际绑定一致。

---

## 5. 动效规范（全场景速查）

| 场景 | 时长/缓动 | 令牌 |
|---|---|---|
| 悬停/移出 | 80ms ease-out | `--anim-hover` |
| 按下 | 80ms + `scale(0.98)`（图标钮）/ `brightness`（实底钮） | `--dur-1` |
| 菜单/浮层弹出 | 140ms pop-in（fade + translateY(-2px)） | `--dur-2` |
| 模态/遮罩 | 220ms pop-in + overlay fade | `--dur-3` |
| 侧栏收展 | 220ms ease-out（transform + margin） | `--anim-structural` |
| Tab 指示条展开 | 140ms ease-out（width） | `--dur-2` |
| 保存中旋转 | 1.2s linear infinite | 新增 `lac-spin` |
| 状态文本变更 | 无动画（避免闪动） | — |

红线：不做 stagger、不做弹簧曲线、任何循环动画必须被 `prefers-reduced-motion` 关闭（全局降级已覆盖 `--dur-*`，`lac-spin` 需单独处理，见 4.4）。

---

## 6. 技术债清理清单（阶段 0 一次做完）

- [ ] `app.css` 合并重复规则：`.context-menu`（444/455）、`.lac-main`（83/844）、`.editor-pane`（205/1269）
- [ ] 删除死样式 `.lac-editor-placeholder`（被 4.10 空状态取代）
- [ ] 删除死令牌 `--fs-16`、`--tooltip-delay-ms`
- [ ] `TabBar.tsx:124` 测量字体改 14px（C4）
- [ ] 状态栏/全局文案标点统一（B5）
- [ ] `find-window`、`codec-window` 输入控件高度并入 `--control-h`（B10）

---

## 7. 实施路线图

> 每阶段独立可交付、可回滚；改完即跑 `npm run check` + `npm test`（现有 windows/recovery 等测试不涉及样式，应保持全绿），并按"验收"列手动走查。

### 阶段 0 · 清理与快赢（约半天）

- [x] 第 6 节全部清理项
- [x] 4.4 状态栏图标/标点/大文件徽标（已保存态按降噪原则降为 tertiary 灰）
- [x] 4.7.4 Tooltip 12px
- [x] 4.9 设置页分段等宽 + select 箭头
- [x] B2 关闭按钮加大
- [x] 4.10 空状态（含 main.tsx 移除启动自动新建空白标签、EditorPane 视图回收重排）
- [x] 预拉阶段 1 令牌：`--control-h`、`--lac-bg-inset`、`--lac-accent-softer`、语义 soft 三色（空状态与状态栏徽标依赖）

**验收**：无功能变化（空状态为计划内新增）；`npm run check` 绿。

### 阶段 1 · 令牌 v2（约 1 天）

- [ ] 3.1 强调色四件套：`--lac-accent-hover` / `--lac-accent-active` / `--lac-accent-soft` / `--lac-accent-contrast`（`--lac-accent-softer`、`--lac-bg-inset`、语义 soft 底、`--control-h` 已随阶段 0 预拉）
- [ ] `primitives.css` prominent 按钮改 accent-hover/active（深色文字换 `--lac-accent-contrast`）
- [ ] 全局 checkbox 视觉接管（4.7.2）

**验收**：深色主题下"全部替换"主按钮文字对比度 ≥ 4.5:1；查找页 checkbox 为品牌样式；两主题整体无回归。

### 阶段 2 · 主窗口四栏（1–2 天）

- [x] 4.1 标题栏：品牌点、语言真菜单、激活态
- [x] 4.2 标签栏：圆头指示器动效、测量字体（滚动渐隐经评估暂缓：静态 mask 在未溢出时会误伤首/尾标签边缘，待有溢出指示需求时配合 JS 滚动态实现）
- [x] 4.3 侧边栏：chevron 常显、间距、标题降调、行过渡、空态图标
- [x] 4.5 编辑器：光标/行号/括号匹配

**验收**：语言可切换；标签切换有指示动效；侧栏信息层级清爽；编辑器三态高亮不互相踩。（已实机截图验证通过：浅色全场景 + 深色设置/空状态/查找窗口）

### 阶段 3 · 浮层体系（1 天）

- [x] 4.7.1 对话框四段式改造（5 个对话框；标题字号用令牌 `--fs-body`/600，未引入 15px 裸值）
- [x] 4.7.3 右键菜单合并 + danger 悬停（重复规则已于阶段 0 合并）
- [x] 4.8 查找/编解码窗口精修（输入域 inset 底、编解码激活芯片软底、行距与按钮尺寸统一）

**验收**：所有模态有图标+标题（实机验证：危险确认框浅/深两主题、输入对话框、保存确认框均通过；Conflict/Lossy/Encoding 与确认框共用同一结构，代码走查通过）；Esc、焦点陷阱、遮罩点击关闭行为不变（`useFocusTrap` 未改动）。

### 阶段 4 · 预览排版 + 空状态（1 天）

- [x] 4.6 Markdown 预览 CSS（标题锚线/行内代码边线/代码块/引用块软底/表头底色；测试锚定关键值）
- [x] 4.10 空状态组件 + 删死样式（阶段 0 已完成）
- [x] 4.9 设置页行号开关 + 行间分隔线（实机验证：开关生效、行号列随之增减、分隔线节奏正确）

**验收**：长文预览有标题锚线（CSS 由测试锚定；实机预览截图受下方崩溃问题阻碍，建议人工打开预览复核视觉）；首启空状态完整可交互（已验证）；设置行号开关生效（已验证）。

### 阶段 5 · 全量走查（半天）

- [x] 手动矩阵（实机走查 + 截图存档 `docs/ui-screenshots/`，共 8 张基线）：
  - 浅色：主窗有文档 / 设置 / 查找替换 / 编解码 / 保存确认框
  - 深色：主窗 / 设置 / 保存确认框
  - 说明：右键菜单与 Tooltip 悬停无法由自动化派发（`contextmenu`/`hover` 事件），列为人工复核项；空状态已在阶段 0/2 验证
- [x] 键盘焦点环抽查：分段控件激活态焦点环（dark-settings.png）、SavePrompt 主按钮焦点环、语言菜单首项焦点框均已确认
- [x] `npm run check`、`npm test`（52/52）、`cargo test` 全绿
- [x] 截图存档 `docs/ui-screenshots/` 作为 v1.1 基线

---

## 8. 风险与守则

> **崩溃修复记录（阶段 2 期间发现）**：运行时关闭最后一个标签页会使 WebView2 渲染进程崩溃（白屏且无法刷新恢复）。经差分测试确认 **v1.0.0 原始代码即存在**，与 UI 精修无关；触发条件与具体派发路径相关（键盘 Ctrl+W 关闭不崩）。修复：`closeTabAction` 在关闭最后一个标签后同步重建空白未命名标签（与 `windows.ts`"移入新窗口"的兜底模式一致），使 React 永远不渲染空文档中间态。修复后键盘路径实机验证通过；建议发布前人工用真实鼠标点 X 复核一次。
>
> **补充（阶段 4 期间）**：本自动化会话中渲染进程崩溃呈现多条触发路径（UIA 点 X 关闭恢复文档、UIA 语言菜单切换 Markdown、键盘打开 Markdown 预览 iframe），而另一些同构操作（键盘语言切换、UIA 行号开关触发的视图重建、键盘关闭最后标签）均不崩溃——触发模式不稳定、无 JS 报错、无崩溃转储，高度疑似自动化会话环境下 WebView2 渲染进程的 environment 级不稳定，而非前端代码缺陷（v1.0.0 基线同样复现）。崩溃恢复机制工作正常（重启后状态栏提示"已从上次异常退出中恢复"）。**建议**：在正常桌面会话人工复核上述操作；若仍复现，优先升级 WebView2 Runtime / 检查 GPU 加速 / 对比 release 构建。

1. **不引入任何新依赖**——本方案全部用现有 lucide-react + 纯 CSS 实现。
2. **深浅必须成对改**：每处颜色改动同时落到两个主题块；只允许引用令牌，不允许组件里写裸色值（`window-controls` 的系统红 `#c42b1c` 除外，那是 Windows 语义色）。
3. **交互行为零变更区**：焦点陷阱、Esc 关闭、拖拽排序、恢复快照逻辑一律不碰；只改渲染层。
4. **CSP**：预览 iframe 与 select 箭头的 data-uri 内联样式均在现有 `style-src 'unsafe-inline'` 白名单内，无需改 `tauri.conf.json`。
5. **字体体积（C5）**：17.7MB 全量 Noto Sans SC 暂不处理（本地加载、`font-display: swap` 已兜底）。列为 v1.2 候选：用 cn-font-split 做按需子集化，或调整字体栈把系统"微软雅黑 UI"提前以直接跳过加载。
6. **回滚**：阶段按 commit 提交，任一阶段可独立 revert。

---

## 9. 不做什么（避免过度设计）

- ❌ 不换 accent 色相（靛蓝与"安静"气质匹配，只补梯度不改调性）。
- ❌ 不加渐变、玻璃拟态、大面积彩色。
- ❌ 不引入组件库 / Tailwind / CSS-in-JS。
- ❌ 不改窗口骨架尺寸与布局结构（标题/标签/状态栏三行 + 侧栏 + 编辑区）。
- ❌ 不做文件树（Moxie 的产品决策是"文件列表侧栏"，不是 IDE 工作区）。

---

*本方案基于对 v1.0.0 全部 UI 源码（5 个样式/主题文件 + 14 个组件）的逐行阅读；所有行号引用以 main 分支当前状态为准。*
