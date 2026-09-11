# TizuMark 内容渲染样式复刻方案（v2.2）

> 基准：Moxie main（2c96053）+ TizuMark-Markdown-Editor（src/styles.css 1769–2600 行渲染段 + src/unified-renderer.js）
> 范围：`src/preview/markdown.ts`（renderShell）、`src/preview/markdownCore.ts`（插件层）、`src/styles/tokens.css`（新增令牌）、`src/preview/render.worker.ts`、`tests/*`
> 关系：取代 `docs/排版优化方案.md`（v2.1）——排版参数以 TizuMark 为复刻基准；v2.1 中与 TizuMark 不冲突的修复（行内 code 撑行修正等）见 §6 偏差决策。
> 红线不变：沙箱 iframe 不执行脚本（README 产品承诺）、--lac-* 令牌体系、深浅成对、不引入 UI 组件库。

---

## 0. TL;DR

**TizuMark 是什么**：Tauri 2 + CodeMirror 5 + 原生 JS 的 Markdown 编辑器，渲染管线为 unified/remark/rehype + highlight.js(github 主题) + KaTeX + mermaid，渲染逻辑在 `unified-renderer.js`（HTML 结构），视觉全在 `styles.css` 的 `.preview-content` 段。

**复刻什么**：内容渲染的**视觉语言**——正文 1.7 行高、标题 24/12 统一节奏 + h1/h2 底边线、GitHub 风全边框斑马纹表格、带边框行内代码、`> [!NOTE]` 五色 Callout、[TOC] 目录卡片、==mark== 高亮、多级列表样式（disc→circle→square、1.→1)→①）、代码块行号+300px 按需滚动、渐变 hr、脚注样式、emoji 短代码、（可选）mermaid。

**怎么复刻**：TizuMark 的 HTML 结构 + CSS 参数 1:1 移植进 Moxie 的 `renderShell`（预览+导出共用）与 `markdownCore.ts` 插件层；TizuMark 的 CSS 变量映射到 `--lac-*` 令牌；受"沙箱无脚本"红线约束的交互（复制按钮、lightbox）以无脚本方式实现或明确不做。

**预期**：同一篇 demo.md 在两个软件里预览视觉基本无差（除语法高亮色板与受限交互）。

---

## 1. TizuMark 渲染体系拆解

### 1.1 渲染链路（参考）

```
源码 → 预处理（$$/$ 数学占位、callout、定义列表、容器表格、脚注抽取、列表缩进归一化）
     → unified（remark-parse + gfm + rehype-raw + sanitize + heading-ids）
     → 后处理（数学恢复、callout 恢复、净化、==mark==、脚注渲染、abbr）
     → DOM 后处理链（[TOC]、emoji 短代码、KaTeX auto-render、mermaid、
        复制按钮、hljs 逐行高亮+行号、图片处理、滚动同步）
```

### 1.2 HTML 结构特征（复刻目标结构）

| 元素 | TizuMark 输出结构 |
|---|---|
| 标题 | `<h1 id="slug" data-source-line="N">` |
| Callout | `<div class="alert alert-note"><div class="alert-title">[svg]Note</div><div class="alert-content">…markdown…</div></div>` |
| 代码块 | `<pre><code class="language-x hljs"><div class="code-scroll"><span class="code-line"><span class="code-line-num">1</span><span class="code-line-text">…</span></span>…` |
| 行内数学 | `$…$` → KaTeX 行内；块级 `.math-display` → KaTeX display |
| mermaid | `<div class="mermaid-container">svg</div>` |
| TOC | `<div class="toc-wrapper"><div class="toc">…点状列表…</div></div>` |
| 脚注 | `<sup class="footnote-ref"><a href="#fn-x">[x]</a></sup>` + `<hr class="footnotes-sep">` + `<section class="footnotes"><ol><li id="fn-x" class="footnote-definition">` |
| 高亮 | `==text==` → `<mark>` |
| 图片 | `<img referrerpolicy="no-referrer">` |

### 1.3 样式参数全表（`.preview-content`，复刻基准值）

**容器与正文**

| 项 | 值 | Moxie 现状 | 映射 |
|---|---|---|---|
| 行高 | **1.7** | 1.75 | 对齐 1.7 |
| 容器内边距 | 16px 24px（纯预览 32px） | article 48px 32px 56px | 预览模式对齐 24px；限宽见 §6 决策 |
| 行宽 | **全宽**（无限宽） | min(74ch, 100%) | 对齐全宽（保留 Moxie 限宽为可选开关，见 §6） |
| 正文字重 | 400 / 加粗 700（--preview-weight 可调） | 400/650 | 对齐（强/标题 700） |
| 链接 | accent 无下划线，hover 下划线；`a[href^=http]::after` 加 ↗ 角标 | accent 无下划线 | 对齐 + ↗ 角标 |

**标题（全部统一 margin: 24px 0 12px，行高 1.3，字重 700）**

| 级 | 字号 | 颜色 | 底边线 |
|---|---|---|---|
| h1 | 2em | text-primary | **2px 实线**（heading-h1-color），padding-bottom 10px |
| h2 | 1.5em | heading-h2-color（略柔） | **1px 实线**（border-color），padding-bottom 8px |
| h3 | 1.25em | text | 无 |
| h4 | 1.1em | text | 无 |
| h5 | 1em | **text-secondary** | 无 |
| h6 | 0.9em | text-secondary | 无 |

**段落与列表**

| 项 | 值 |
|---|---|
| p | margin-bottom **14px**（单侧） |
| ul/ol | padding-left **24px**，margin-bottom 14px |
| li / li>p | margin-bottom **4px** |
| 嵌套列表 | margin **4px 0**（紧凑） |
| 无序 marker | disc → circle → square → disc |
| 有序 marker | decimal → `1)`（@counter-style paren-decimal） → `⓪①②…`（circled-decimal） |
| 任务列表 | checkbox 16px、成功绿选中、混合列表恢复 disc marker |

**代码**

| 项 | 值 |
|---|---|
| 行内 code | padding **2px 6px**，code-bg 底，**1px 边框**，圆角 4px，字号 **0.88em** |
| pre | padding **16px**，code-bg 底，**1px 边框**，圆角 **6px**，margin **16px 0**，max-height **300px** 按需滚动 |
| 代码行 | line-height **1.8**，行号 3em 宽右对齐（默认隐藏，可开） |
| hljs | github.min.css（可切换主题），.hljs 背景透明化修复 |
| 复制按钮 | hover 显现（**沙箱红线内不做**，见 §6） |

**表格（GitHub 风全边框）**

| 项 | 值 |
|---|---|
| table | width 100%、display block、overflow-x auto、margin 16px 0 |
| th/td | padding **8px 12px**、**1px 全边框**、默认左对齐（align 属性支持 center/right） |
| thead | **2px 底边线**，th 背景 bg-secondary、字重 600 |
| 斑马纹 | 偶数行 bg-secondary；hover 行 accent-subtle |

**其他块级**

| 项 | 值 |
|---|---|
| blockquote | padding 12px 20px、margin 0 0 16px、**4px accent 左线**、accent-subtle 底、右圆角 6px、secondary 文字；首 strong 时左线变 warning 色 |
| hr | 1px **横向渐变线**，margin **32px 0** |
| img | max-width 100%、圆角 4px、点击 lightbox（沙箱内不做） |
| dl | dl mb 16px；dt 600 / mt 8px；dd ml 24px secondary |
| mermaid | 容器卡片：bg-secondary 底 + 1px 边框 + 圆角 8px + padding 16px 居中 |
| KaTeX | 字号 **1.1em**；display 块 margin 16px 0 + 横向滚动 |
| 脚注 | 定义项 0.9em + 3px accent 左线 + padding-left 16px；sep hr 32px/16px；section 0.92em secondary；ref 点击闪烁动画 |

**行内装饰**

| 项 | 值 |
|---|---|
| mark | warning 底 + text 色、padding 1px 4px、圆角 3px |
| kbd | 2px 7px、code-bg、1px 边（下 2px）、inset 内阴影、mono 0.82em |
| del | secondary 色 |
| abbr | 点状下划线 + cursor help |
| emoji | 短代码 `:smile:` 原生 emoji |

**Callout（`> [!TYPE]`，五色）**

| 项 | 值 |
|---|---|
| 容器 | 圆角 10px、padding 14px 18px、margin 16px 0、**4px 左色线**、渐变底（主色 8%→4%）、inset 1px 主色 10% 描边、blur(8px) |
| 标题 | 700、0.95em、字距 0.3px、Lucide 图标 18px + 主色标题 |
| 内容 | 0.92em |
| 五色 | note=蓝(accent) / tip=绿(success) / important=紫 #8b5cf6 / warning=橙 / caution=红；深色模式底色 12%→6%、描边 15% |

### 1.4 语法高亮

- TizuMark：highlight.js 11.11.1 + `github.min.css`（`id="highlight-theme"` 可热切换），逐行高亮（行号结构兼容）。
- Moxie：自研 highlightExtension + `--syn-*` 两套令牌（浅/深成对，红线资产）。
- **决策**：代码块**外观**（背景/边框/圆角/行高/行号）全量对齐 TizuMark；**色板保持 `--syn-*`**（不引入 hljs 主题，否则破坏深浅成对与单一色源）。若龙哥想连色板也 GitHub 化，作为可选项把 `--syn-*` 值更新为 github 色板（列于阶段 4）。

---

## 2. Moxie 现状对照与差距清单

| # | 能力 | TizuMark | Moxie | 差距动作 |
|---|---|---|---|---|
| 1 | 正文行高/字重 | 1.7 / 400-700 | 1.75 / 400-650 | 改 renderShell |
| 2 | 标题节奏+底线 | 24/12 统一 + h1 2px / h2 1px 底线 | em 梯度 + hairline | 改 renderShell |
| 3 | 段距 | 14px 单侧 | 0.8em 双侧 | 改 renderShell |
| 4 | 行宽 | 全宽 | 74ch | 改（保留开关，§6） |
| 5 | 列表多级样式 | 四级 marker + 有序 1./1)/① | 默认 | 新增 CSS |
| 6 | 表格 | 全边框+斑马纹+hover+2px thead | hairline 行线 | 改 renderShell |
| 7 | 行内 code | 带边框 0.88em | 无边框 0.84em | 改 |
| 8 | 代码块结构 | .code-line 行号 + 300px 滚动 | 纯 pre | **新增**（worker 生成结构） |
| 9 | Callout | 5 种 | 无 | **新增**（markdown-it 规则） |
| 10 | [TOC] | 有 | 无 | **新增**（渲染期生成） |
| 11 | ==mark== | 有 | 无 | **新增**（markdown-it 规则） |
| 12 | kbd/del/abbr/↗ | 有 | 部分（del 由 GFM） | 新增样式/规则 |
| 13 | hr | 渐变 32px | 渐变 1.8em | 改 |
| 14 | 脚注样式 | accent 左线定义项 | 简单 | 改 renderShell |
| 15 | emoji 短代码 | 有 | markdown-it-emoji 已装 | 确认启用 |
| 16 | KaTeX | 1.1em + 16px margin | 1.05em + 0.2em | 改 |
| 17 | mermaid | 有 | 无 | 阶段 4 可选（worker 渲染静态 SVG） |
| 18 | 复制按钮/lightbox | 有 | 无 | 不做（沙箱红线） |
| 19 | 图片 no-referrer | 有 | 无（本地文件机制不同） | 不适用 |
| 20 | 滚动同步/大纲 | 有 | 有（自有实现） | 不动 |

---

## 3. 变量映射（TizuMark → --lac-* 令牌）

| TizuMark | Moxie 令牌 | 说明 |
|---|---|---|
| --bg-primary / --preview-bg | --lac-bg | 预览底=内容面（现状一致） |
| --text-primary | --lac-text | |
| --text-secondary | --lac-text-secondary | |
| --border-color | --lac-border | |
| --accent-color / -subtle / -muted | --lac-accent / -soft / -softer | |
| --code-bg | --lac-bg-inset | 代码底与输入域同源 |
| --color-success/warning/danger | --lac-success/warning/danger | |
| --heading-h1/h2-color | --lac-text（新增 --lac-heading-h2: 文字色微柔） | h2 用 `--lac-text-secondary`→ 不对，TizuMark h2 是略深主色 → 新增 `--lac-heading-2` |
| --alert-note/tip/important/warning/caution-rgb | 新增 `--lac-alert-note/tip/important/warning/caution`（RGB 三元组形态，供 color-mix/rgba） | note=accent 系、tip=success、warning/danger 复用、important 新增紫 #8b5cf6 系；深浅两套成对 |
| --toc-bg / --toc-border | 用 color-mix(accent 6%, bg) 现算 | 不新增静态渐变令牌 |
| --font-preview | --font-ui | Moxie 保持 Frex Sans GB 栈 |

组件内禁裸色值红线：callout 渐变与图标色一律走新增令牌；深浅两套同步落 tokens.css。

---

## 4. 分阶段实施路线图

> 每阶段独立可交付、可回滚、全测试通过后提交；阶段结束用 demo.md 双端截图对比。

### 阶段 0 · 基线与决策（0.5 天）

- 用 `TizuMark-Markdown-Editor/demo.md`（覆盖 callout/表格/代码/公式/脚注/emoji）在两端渲染，截图归档 `docs/typo-replica/before/`。
- 落定 §6 三个偏差决策（行宽、行内 code 撑行、高亮色板）。
- tokens.css 新增 alert 五色 + heading-2 令牌（深浅两套）。
- **验收**：决策记录写入本方案 §6；令牌就位。

### 阶段 1 · 预览排版全量对齐（1 天）

改动：`renderShell` 内联 CSS 重写 + `markdown.ts` 的 token 采集（新增 alert 色变量透传）。

- 正文 1.7 / 400-700 字重联动、容器 padding 16px 24px、全宽（开关另议）。
- 标题 24/12 + 字号梯度 + h1/h2 底线；p 14px 单侧。
- 列表 24px/14px/4px + 嵌套 4px + 四级 marker（`:where()` 零特异性写法）+ 有序 @counter-style 三级。
- 表格全边框 + 斑马纹 + hover + thead 2px + align 支持。
- 行内 code 带边框 0.88em；pre 16px/1px 边框/6px 圆角/行高 1.8/max-height 300px。
- blockquote accent 左线 4px + soft 底 + `:has(strong:first-child)` warning 变体。
- hr 渐变 32px；mark/kbd/del/abbr/链接↗；img 圆角；dl/脚注全量样式；KaTeX 1.1em/16px。
- 同步 `tests/markdown.test.ts` 锚定值与快照。
- **验收**：demo.md 排版段落两端截图逐块比对一致；`npm test`/`check` 绿。

### 阶段 2 · 代码块行号结构（0.5–1 天）

改动：`markdownCore.ts` / `render.worker.ts` 的代码块 fence 渲染规则。

- worker 内把 ` ```lang ` 渲染为 TizuMark 结构：`<pre><code class="language-x"><div class="code-scroll"><span class="code-line">…`（纯 HTML，无脚本，不违沙箱红线）。
- 行号默认显示（对齐 TizuMark 可选开关的默认开状态——Moxie 以"默认关、CSS 类控制"复刻，避免大文件行号噪音；预览工具条后续可加入口，不在本方案范围）。
- 语法高亮沿用 Moxie 管线（highlightExtension 输出 span class → --syn-* 着色），按行高亮由现有 highlighter 承担；逐行拆分若与现行整块高亮冲突，退化为"整块高亮 + 行号列用 CSS counter 生成"（`counter-increment` 方案，零 DOM 拆分，视觉等效）。
- 短代码块空轨道问题：Moxie 滚动条 track 已透明，视觉无碍，不加 JS。
- **验收**：代码块行号/300px 滚动/换行模式两端一致；性能回归（万行代码块渲染不劣化）。

### 阶段 3 · Callout 五色（1 天）

改动：`markdownCore.ts` 新增 callout 规则 + `renderShell` alert 样式。

- 解析 `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`（大小写不敏感、支持自定义标题 `> [!TIP] 标题`），输出 TizuMark 同构 HTML；内部内容继续走 markdown 渲染（嵌套列表/代码/公式）。
- 五种渐变底 + 左线 + inset 描边 + Lucide 内联 SVG（TizuMark 的五个 path 直接复用，currentColor 继承令牌色）。
- 深浅两套背景（8%→4% / 12%→6%）走 --lac-alert-* 令牌。
- `blockquote:has(strong:first-child)` 变体同步。
- **验收**：五种 callout + 自定义标题 + 嵌套内容渲染正确；深浅截图。

### 阶段 4 · [TOC] / mark / emoji / （可选）mermaid（1–1.5 天）

- **==mark==**：markdown-it 行内规则（~30 行），warning 底样式。
- **[TOC]**：文档含 `[TOC]` 时，worker 渲染期基于 heading token 生成 `.toc` 卡片 HTML（点状列表 + accent 左条 + 渐变底）；沙箱内无脚本，锚点跳转依赖 `<a href="#slug">`——iframe 内锚点导航原生可用（无需脚本，纯浏览器行为）。标题 slug 规则对齐 TizuMark（字母数字小写保留、空格/下划线转连字符、去标点、冲突加序号）。
- **emoji 短代码**：确认 markdown-it-emoji 启用路径（Moxie 已装）。
- **（可选）mermaid**：新依赖 mermaid（~1MB，worker 内渲染为静态 SVG 缓存，深浅主题各一份）；不违沙箱红线（SVG 静态嵌入）。是否引入由龙哥拍板。
- **（可选）缩写** `*[ABBR]: 定义`：小众语法，默认不做。
- **验收**：[TOC] 锚点可跳转；mark 高亮两端一致；mermaid（若做）SVG 与主题联动。

### 阶段 5 · 走查与归档（0.5 天）

- demo.md + 自建覆盖用例（含 callout×5、TOC、mark、任务列表、脚注、公式、多级列表、全边框表格）双端截图逐块对比，归档 `docs/typo-replica/after/`。
- `npm test`、`npm run check` 全绿；快照更新；基线截图归档。

---

## 5. 测试影响

- `tests/markdown.test.ts`：阶段 1 排版断言全量更新（行高 1.7、p 14px、标题 24/12、表格边框等）+ 新增 callout/mark/toc/code-line 结构断言；快照重生成。
- `tests/export.test.ts`：导出复用 renderShell，同步更新。
- 新增 `tests/callout.test.ts`（或并入 markdown）：五种类型/自定义标题/嵌套渲染/未知类型回退 blockquote。
- 不触碰：editorVisibility / recovery / performance / windows。

## 6. 复刻偏差决策点（2026-09-11 已拍板，按推荐项执行）

| # | 决策 | 选项 A（推荐） | 选项 B | **最终决策** |
|---|---|---|---|---|
| D-1 | **行宽** | 全宽（TizuMark 原样）；Moxie 保留 `--measure` 令牌与 CSS，未来可加"限宽"设置开关 | 直接删限宽代码 | **A：预览全宽；`--measure` 保留（源码模式仍用），预览不再引用** |
| D-2 | **行内 code 撑行** | 复刻外观（带边框 0.88em）但 padding 收为 `2px 5px`，盒高 ≤ 行高，消除 1–2px 行距波浪 | 1:1 复刻 2px 6px（继承撑行） | **A：padding 2px 5px** |
| D-3 | **代码高亮色板** | 保持 `--syn-*`（深浅成对、单一色源） | 整套换 github 色板 | **A：保持 --syn-*** |
| D-4 | **mermaid** | 阶段 4 引入 | 不做 | **B：本轮不做**——mermaid 依赖 DOM 无法在 Worker 渲染，需主线程两阶段异步链路改造 + 1MB 体积；列为后续独立特性 |
| D-5 | **复制按钮 / lightbox** | 不做（沙箱无脚本红线） | 放宽红线 | **不做**（README 产品安全承诺不可破） |

## 7. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| 行内 code 撑行（TizuMark 原生缺陷） | 行距波浪 | D-2 决策；推荐项消除 |
| 全宽对中文长文行长过长（>40 字/行） | 阅读舒适度 | D-1 推荐保留开关路径；实机走查确认 |
| callout 正则与 blockquote 规则冲突 | 渲染错乱 | markdown-it core 规则优先级 + 覆盖用例 |
| @counter-style 旧 WebView 不支持 | 三级有序 marker 回退 decimal | 特性检测（WebView2 Chromium 91+ 支持，风险低） |
| [TOC] 锚点在 sandbox iframe 的同文档导航 | 跳转失效 | `allow-same-origin` 已具备（现有 srcDoc 模式）；阶段 4 实测 |
| mermaid 包体 +1MB | exe 体积 | D-4 决策；仅 worker 按需 import |
| 语法高亮整块 → 逐行重构成本 | 阶段 2 超期 | CSS counter 行号方案兜底（视觉等效、零拆分） |

## 8. 不做什么

- ❌ 不复刻 TizuMark 的架构（CM5、全局 script、上帝对象、Rust 渲染命令）——Moxie 架构保持。
- ❌ 不复刻其双栏分屏/大纲侧栏/字体设置等 UI 功能——Moxie 有自己的实现。
- ❌ 不做沙箱内脚本交互（复制按钮、lightbox、TOC 悬浮）。
- ❌ 不引入 hljs 依赖与主题文件（高亮走现有管线）。
- ❌ 不做"字体方案"设置（TizuMark 已移除该功能，Moxie 亦不需要）。

---

---

## 9. 实施记录（阶段 0–4，2026-09-11 完成）

改动文件：
- `src/styles/tokens.css`：新增 `--lac-alert-note/tip/important/warning/caution`（RGB 三元组，深浅成对）与 `--lac-heading-2`（h2 专用色，深浅成对）。
- `src/preview/markdownCore.ts`：新增 `moxie_heading_ids`（标题 id 提前到 core 阶段，[TOC] 同源）、`moxie_callout`（五种 callout 解析，支持自定义标题与软换行同段正文，blockquote 结构手术输出 alert div）、`moxie_toc`（[TOC] 段替换为目录卡片，h1–h4，lvl-N 缩进）、`moxie_mark`（==高亮== inline 规则，emphasis 之后，支持嵌套行内语法）；fence 渲染改为 TizuMark 同构 `code > .code-scroll > .code-line`（行号 span 常驻、CSS 默认隐藏）。
- `src/preview/highlight.ts`：新增 `highlightToLines()`——Lezer 整块解析 + 换行回调处切分行，跨行 token 每行着色一致；无语言/超长回退逐行转义。
- `src/preview/markdown.ts`：`PreviewTokens` 新增 `success`/`warning`/`alertVars`/`heading2`；`renderShell` 全量重写为 TizuMark 参数（1.7 行高、24/12 标题节奏 + h1 2px/h2 1px 底线、p 14px 单侧、列表 24px/4px + 四级 marker + @counter-style 有序变体、GitHub 风全边框斑马纹表格、带边框行内 code（padding 2px 5px，决策 D-2）、pre 1px 边框 + 300px 按需滚动、accent 左条引用 + strong 首子变体、渐变 hr 32px、mark/kbd/abbr/外链 ↗、绿色任务复选框、TOC/Callout/脚注/数学样式）；article 全宽（决策 D-1）。
- `tests/markdown.test.ts`：排版断言更新 + 新增 "TizuMark replica" 组（callout 五类/自定义标题/嵌套 markdown/回退、mark、TOC、code-line 结构、行号默认隐藏、counter-style、外链箭头、alertVars 透传）。
- `tests/perf.test.ts`：tokens 构造补字段；快照更新。

验证：`npm test` 136/136 全绿、`tsc --noEmit` 通过、`cargo test` 48/48 全绿。

遗留（决策不做/后续）：mermaid（D-4，需主线程两阶段渲染链路，列独立特性）、复制按钮/lightbox（D-5，沙箱红线）、行号开关 UI（CSS 类 `article.code-line-numbers` 已预留）、TizuMark demo.md 实机截图对比（自动化会话 WebView2 不稳定，建议人工打开 `TizuMark-Markdown-Editor/demo.md` 与预览比对）。
