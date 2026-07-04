# 重构计划与候选

> 目标:在**不改变行为**的前提下,拆分过大的文件、理清职责。功能先写完 →
> 按本清单重构 → 按 `docs/manual-test-checklist.md` 逐功能回归测试。
> 重构阶段用 OMC 的 **ralph loop**(持久化循环 + 每步验证)驱动,每拆一块就跑
> 对应测试,绿灯才继续。

## 进度

| Phase | 目标 | 状态 |
|---|---|---|
| **1** | Editor.jsx → 3 模块(chunked-parse / toolbar / block-controls) | ✅ **完成**(1738→1385,ralph 驱动,architect 验证) |
| **2** | App.jsx → hooks(lib/reviewActions + hooks/useFindReplace·useOutline·useAppLifecycle·useFileOps + lib/menuHandlers + shell/{ActivityBar,Topbar,FindBar,EditorArea}) | ✅ **完成**(1981→**781**,-61%,ralph 驱动 7 个 story,architect 验证 + 1 个 closeTab bug 修复) |

## 一、代码体检(行数,降序)

| 文件 | 行数 | 角色 | 评级 |
|---|---|---|---|
| `App.jsx` | **781** | shell 组合器(phase 2 已从 1981 瘦身) | 🟢 phase 2 ✅ |
| `components/Editor.jsx` | **1385** | Crepe 包装(phase 1 已从 1738 瘦身) | 🟡 phase 1 ✅ |
| `components/editor-review.js` | 1028 | review 装饰器(单一特性,内聚) | 🟡 可选拆 |
| `i18n.jsx` | 578 | zh/en 字符串(数据,非逻辑) | 🟢 暂不动 |
| `components/Sidebar.jsx` | 518 | 文件树 + 右键菜单 + 图床 + workspace | 🟡 中 |
| `components/StatusBar.jsx` | 452 | stats + 布局 + 块切换 + 源码切换 | 🟡 中 |
| `components/editor-toolbar.js` | 225 | phase 1 抽出(工具栏注入) | ✅ |
| `components/editor-block-controls.js` | 130 | phase 1 抽出(块控制) | ✅ |
| `components/editor-chunked-parse.js` | 96 | phase 1 抽出(分块解析) | ✅ |
| `hooks/useFileOps.js` | 478 | phase 2 抽出(文件 I/O + workspace/watcher) | ✅ |
| `components/shell/EditorArea.jsx` | 184 | phase 2 抽出(双格编辑器渲染) | ✅ |
| `lib/menuHandlers.js` | 240 | phase 2 抽出(命令分发 + 全局键 + 命令面板) | ✅ |
| `hooks/useAppLifecycle.js` | 226 | phase 2 抽出(会话 + 更新 + toast + onboarding) | ✅ |
| `hooks/useOutline.js` | 188 | phase 2 抽出(scrollspy + 标题列表) | ✅ |
| `components/shell/Topbar.jsx` | 84 | phase 2 抽出(标签条 + 顶栏按钮) | ✅ |
| `components/shell/FindBar.jsx` | 78 | phase 2 抽出(查找替换栏) | ✅ |
| `hooks/useFindReplace.js` | 177 | phase 2 抽出(查找替换逻辑) | ✅ |
| `lib/reviewActions.js` | 105 | phase 2 抽出(active-tab review 动作) | ✅ |
| `components/shell/ActivityBar.jsx` | 40 | phase 2 抽出(左侧活动条) | ✅ |
| `reviewMarkup.js` | 384 | review 解析(内聚) | 🟢 |
| `platform/capacitor-api.js` | 373 | 移动端平台层(内聚) | 🟢 |
| 其余 | <210 | 多为单一职责小模块 | 🟢 |

> 主进程 `main/index.js` 910 行(窗口 + IPC + 文件监听 + 菜单)也可考虑拆,但优先级低于渲染层。
>
> **文件体量纪律**(用户指令):新功能一律放进小而专的模块/hook,目标 < 500 行/文件(硬上限 800),超了就拆。App.jsx/Editor.jsx 不再 append 新功能。

## 二、头号目标拆解

### `App.jsx`(1975)— god component
当前揉在一起的职责:
- **状态**:tabs / activeId / workspace / sidebar / theme / customTheme / lang / sourceMode / split / find / toast / rename / saveName / settings / outline / mountedIds / richForced …
- **文件操作**:openPaths / openFolder / newTab / closeTab / saveTab / writeTab / commitMobileSave / 监听回显
- **查找替换**:runFind / stepFind / closeFind / applyReplace(富文本 + 源码两条路)
- **大纲**:scrollspy effect + 标题扫描 + 软居中数据
- **review 处理**:applyReviewMarkupToActive / applyReviewDecisionToActive / copyReviewPrompt
- **会话**:load / flush / debounce 持久化
- **其它**:导出 PDF、更新检查、命令面板、菜单/快捷键、主题/语言应用、自定义主题扫描、布局设置应用、脏数据/关闭守卫
- **JSX**:整张 shell(activity bar / sidebar / tabs / 编辑区双格 / findbar / statusbar / 命令面板 / 各 modal / toast)

**建议拆分**(行为保持,逐块抽出):
- `hooks/useTabs.js` — tab 状态 + 开/关/保存
- `hooks/useFindReplace.js` — 查找替换逻辑(refs + runFind/stepFind/applyReplace)
- `hooks/useOutline.js` — scrollspy + 标题扫描
- `hooks/useSession.js` — 会话加载/flush/防抖
- `hooks/useFileOps.js` — openPaths/openFolder/watch 回显
- `lib/reviewActions.js` — review 的 active-tab 处理函数(纯逻辑)
- `components/shell/` — `ActivityBar.jsx`、`EditorArea.jsx`(双格渲染)、`SidebarPanel.jsx` 等拆出
- App.jsx 收窄为:**组合各 hook + 布局 JSX**,目标 < 600 行

### `Editor.jsx`(1738)— god wrapper
当前揉在一起的职责:
- Crepe 创建 + feature 配置
- **分块解析**:splitMarkdown + 后台追加(CHUNK_THRESHOLD)
- **工具栏注入**:highlight 按钮、review 按钮、tooltips
- **node view**:HTML、frontmatter
- **插件装配**:mermaid 预览/拆分、table-break、review 装饰器、substitution 重建、strikeGuard
- **块控制**:setBlock、level 徽标(refreshLevel)
- 粘贴 handler 挂载、math normalize、右键菜单、图片文本/持久化

**建议拆分**:
- `editor-chunked-parse.js` — splitMarkdown + 追加循环
- `editor-toolbar.js` — 工具栏注入通用 helper(appendToolbarItem/editorForToolbar)+ highlight/review 按钮注入
- `editor-block-controls.js` — setBlock + refreshLevel 徽标
- `editor-plugin-config.js` — 各 remark/prose 插件的装配配置
- Editor.jsx 收窄为:**建 Crepe + 装配 + 生命周期**,目标 < 800 行

## 三、重构原则(不可破)

1. **行为保持**:只搬移、不改逻辑。每一抽块后立刻跑 `docs/manual-test-checklist.md` 对应项。
2. **测试清单是安全网**:清单没覆盖到的行为,先补条目再重构。
3. **性能敏感区小心**:`useOutline`(reflow-free scrollspy)、`Editor.jsx` 的分块解析/非受控 textarea、`scheduleLevel` trailing —— 拆分时不能引入新的每帧 reflow 或打破非受控约定。
4. **小步快跑**:一次只抽一个 hook/模块 → 跑测试 → commit。绝不一次大重构。
5. **mobile 共享 renderer**:拆出的渲染层代码 iOS/Android 也走,改名/改签名要在 `platform/capacitor-api.js` 同步。

## 四、执行顺序

```
1. 功能写完(当前进行中:issue 清单 + 用户反馈 backlog)
2. 补齐手动测试清单(docs/manual-test-checklist.md)——重构前先冻结行为基线
3. ralph loop 驱动重构:
     每轮 = 抽一个模块 → 跑相关测试 → 绿灯 commit → 下一轮
     先抽低风险(纯逻辑:reviewActions / fileOps / chunked-parse),
     再抽中风险(hooks:useFindReplace / useOutline),
     最后高风险(useTabs / Editor 拆分),每步都配验证
4. 按 `docs/manual-test-checklist.md` 做全量回归(逐功能)
5. 桌面 + 移动两端各过一遍清单
```

## 五、不重构的(避免过度工程)

- `i18n.jsx`(纯数据)、`reviewMarkup.js`/`editor-review.js`(单一特性内聚)、
  `paths.js`/`find.js`/`settings.js`(已是小而纯的 helper)——这些不动。
- 不为了"好看"引入新抽象层;只拆真实过大的文件。
