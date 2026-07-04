# Moxie 顶部菜单栏方案书

> 目标：为 Moxie 增加一套接近 Typora 的顶部菜单栏，同时保留 Moxie 当前的多标签、左侧活动栏、自绘 Windows 窗口按钮、命令面板和主题系统。本文是后续开发的设计依据，先把 UI、交互、菜单结构、现有能力和待实现能力边界说清楚。

## 1. 背景

用户希望 Moxie 顶部增加类似 Typora 的菜单栏：

```text
文件(F)  编辑(E)  段落(P)  格式(O)  视图(V)  主题(T)  帮助(H)
```

Typora 的这条区域本质是桌面软件的菜单栏，而不是底部状态栏。它承载的是全局命令入口，和 Moxie 现有的顶部标签栏职责不同。

Moxie 当前已经有多标签系统，如果直接把菜单塞到现有顶部标签栏同一行，会出现三个问题：

- 菜单项、标签页、右侧工具按钮、Windows 窗口按钮会抢水平空间。
- `-webkit-app-region: drag` 的窗口拖拽区域会被菜单按钮和标签按钮切碎。
- 当前标签页 UI 已经承担文档切换职责，不应该和全局菜单混成一个层级。

因此已确定采用方案 A：双层顶部栏。

```text
第 1 行：菜单栏  文件 / 编辑 / 段落 / 格式 / 视图 / 主题 / 帮助        窗口按钮
第 2 行：标签栏  标签页 + 新建 / 分屏 / 图床 / 命令面板
```

## 2. 参考资料

本方案参考 Typora 官方文档，但不会机械复制 Typora 的所有实现。Moxie 第一版目标是先建立完整 UI 和可扩展命令结构，功能逐步补齐。

- Typora Shortcut Keys: https://support.typora.io/Shortcut-Keys/
- Typora Export: https://support.typora.io/Export/
- Typora Images: https://support.typora.io/Images/
- Typora About Themes: https://support.typora.io/About-Themes/
- Typora on Windows: https://support.typora.io/Typora-on-Windows/

官方快捷键文档说明 Typora 菜单栏命令可按 File / Edit / Paragraph / Format / View 分组；导出文档说明 `File > Export` 支持 PDF、HTML、HTML without styles、Image，以及通过 Pandoc 扩展 Word、RTF 等格式；图片文档说明 Typora 有 `Format > Image` 相关图片处理；主题文档说明主题可放在主题目录，并可通过主题菜单切换。

## 3. 当前代码实际情况

### 3.1 顶部结构

当前顶部结构集中在：

- `src/renderer/src/components/shell/Topbar.jsx`
- `src/renderer/src/components/Tabs.jsx`
- `src/renderer/src/components/WindowControls.jsx`
- `src/renderer/src/styles/app.css`

`Topbar.jsx` 现在是一行，包含：

- 移动端菜单按钮
- `Tabs`
- 顶栏空白拖拽区
- 新建按钮
- 分屏按钮
- 图床按钮
- 命令面板按钮
- Windows 自绘窗口按钮

`app.css` 当前核心变量：

```css
:root {
  --topbar-h: 40px;
}

.app {
  grid-template-columns: var(--activity-bar-w) 1fr;
  grid-template-rows: var(--topbar-h) 1fr var(--status-h);
}
```

当前顶栏通过 `-webkit-app-region: drag` 提供窗口拖拽，具体控件再用 `no-drag` 排除。

### 3.2 原生菜单和命令系统

主进程已有一个 Electron 原生菜单：

- `src/main/index.js`
- `buildMenu()`
- `menuCmd(cmd)` 通过 IPC 给 renderer 发 `menu` 命令

当前原生菜单覆盖的命令较少：

- File：新建、打开文件、打开文件夹、保存、另存为、导出 PDF、关闭标签、退出
- Edit：撤销、重做、剪切、复制、粘贴、全选、查找
- View：命令面板、侧边栏、大纲、源码模式、切换主题、缩放、全屏、开发者工具

渲染层命令入口在：

- `src/renderer/src/lib/menuHandlers.js`
- `createMenuHandlers()`
- `useCommands()`

当前可直接复用的命令：

- `new`
- `open`
- `openFolder`
- `save`
- `saveAs`
- `exportPdf`
- `closeTab`
- `palette`
- `toggleSidebar`
- `toggleFiles`
- `toggleOutline`
- `toggleSource`
- `toggleTheme`
- `find`
- `replace`
- review 相关命令

### 3.3 编辑器已有能力

块类型定义在：

- `src/renderer/src/blocks.js`

已有块类型：

- 正文
- 标题 1 到标题 6

编辑器内部基于 Milkdown Crepe / ProseMirror，部分功能已有快捷键或编辑器原生行为，但目前没有全部暴露为 Moxie 顶部菜单命令。例如：

- 加粗、斜体、链接、代码等可能由编辑器原生快捷键处理，但还没有统一 command handler。
- 有序列表、无序列表、引用、代码块、数学块、表格等需要后续通过 Milkdown / ProseMirror 命令接入。

### 3.4 主题与设置已有能力

主题切换分布在：

- `src/renderer/src/themes.js`
- `src/renderer/src/customThemes.js`
- `src/renderer/src/components/StatusBar.jsx`
- `src/renderer/src/components/SettingsView.jsx`

已有能力：

- 内置主题切换
- 自定义主题列表
- 打开主题目录
- 获取更多主题
- 设置页

### 3.5 移动端注意事项

移动端能力在 `docs/mobile.md` 中已有说明，`nativeMenus` 为 false。新的桌面菜单栏主要面向 Windows/macOS/Linux 桌面端，移动端不应直接显示完整菜单栏，避免挤占小屏幕。

## 4. 目标与非目标

### 4.1 目标

- 增加 Typora 风格的顶部菜单栏。
- 菜单栏与现有标签栏分层，不发生空间和职责冲突。
- 第一版完整展示菜单结构。
- 已有命令尽量接入真实功能。
- 未实现命令做灰色禁用或轻提示，占位给后续开发。
- 建立数据驱动的菜单配置，后续功能只需增加 command handler。
- 保持 Windows 自绘窗口按钮可用。
- 保持窗口拖拽体验。
- 深浅主题下都要协调。

### 4.2 非目标

- 第一版不要求实现 Typora 所有编辑命令。
- 第一版不要求实现 Pandoc 导出。
- 第一版不要求实现真正的多窗口。
- 第一版不要求重写编辑器引擎。
- 不把菜单做成营销式、大图标式、Ribbon 式工具栏。

## 5. UI 设计方案

### 5.1 总体布局

推荐尺寸：

```css
:root {
  --menubar-h: 28px;
  --tabbar-h: 38px;
  --topbar-h: calc(var(--menubar-h) + var(--tabbar-h));
}
```

布局：

```text
┌──────────────────────────────────────────────────────────────┐
│ 文件(F) 编辑(E) 段落(P) 格式(O) 视图(V) 主题(T) 帮助(H)   ─ □ × │  28px
├──────────────────────────────────────────────────────────────┤
│ 标签1 标签2 标签3                         + 分屏 图床 命令面板 │  38px
└──────────────────────────────────────────────────────────────┘
```

### 5.2 菜单栏视觉

菜单栏风格关键词：

- 薄
- 平
- 克制
- 桌面软件感
- 接近 Typora，但适配 Moxie 主题系统

建议样式：

- 高度：`28px`
- 字号：`12.5px`
- 字重：`500`
- 菜单项水平 padding：`8px - 10px`
- 菜单项高度：`22px - 24px`
- 菜单项圆角：`4px`，不要大胶囊
- hover：淡背景，不做强按钮感
- active：背景略亮，文字为 `var(--text-strong)`
- 菜单栏背景：比标签栏更沉一点
- 下边线：极淡 `1px`

深色主题建议：

- 菜单栏背景接近 `var(--bg-activity)` 或当前顶栏深色
- 文字为浅灰
- hover 为半透明浅灰

浅色主题建议：

- 菜单栏背景使用 `var(--bg-elevated)`
- 文字为深灰
- hover 使用暖灰浅底

### 5.3 标签栏调整

第二行保留当前标签栏，但需要轻微协调：

- 标签栏高度从当前 40px 改到约 38px。
- 当前胶囊标签可以保留。
- 菜单栏出现后，标签页阴影不宜过重，否则两层顶部会显得杂。
- 标签栏与菜单栏之间只保留一条极淡边线。

### 5.4 窗口拖拽区域

菜单栏必须拆分 drag/no-drag：

```text
[菜单项 no-drag][中间空白 drag][Windows 控制按钮 no-drag]
```

标签栏也保持当前策略：

```text
[标签按钮 no-drag][标签栏空白 drag][右侧工具按钮 no-drag]
```

注意：

- 菜单下拉层本身必须 `no-drag`。
- 打开的菜单 backdrop 如果用于关闭菜单，也必须避免干扰窗口拖拽。

### 5.5 下拉菜单视觉

下拉菜单比右键菜单更像桌面软件菜单：

- 宽度：`220px - 280px`
- 行高：`30px`
- 内边距：`5px - 6px`
- 背景：`var(--bg-elevated)`
- 边框：`1px solid var(--border-soft)`
- 圆角：`6px - 8px`
- 阴影：轻浮层阴影
- 左侧：命令名称
- 右侧：快捷键
- 子菜单右侧：`>`
- 禁用项：透明度降低，鼠标不触发命令
- 分隔线：细线，左右留白

示例：

```text
文件(F)
  新建文件                 Ctrl+N
  新建窗口                 Ctrl+Shift+N
  打开文件...              Ctrl+O
  打开文件夹...            Ctrl+Shift+O
  快速打开...              Ctrl+P
  ─────────────────────────
  保存                     Ctrl+S
  另存为...                Ctrl+Shift+S
  ─────────────────────────
  导出                     >
  打印...
  ─────────────────────────
  设置                     Ctrl+,
  关闭标签页               Ctrl+W
  退出
```

## 6. 交互设计

### 6.1 鼠标交互

- 点击菜单项打开下拉。
- 打开某个菜单后，鼠标移到相邻顶级菜单，自动切换下拉内容。
- 点击菜单外关闭。
- 按 `Esc` 关闭当前菜单。
- 点击可用命令后关闭菜单并执行。
- 点击禁用命令不关闭或关闭均可，建议第一版不关闭，并显示轻提示 `即将支持`。

### 6.2 键盘交互

第一版建议支持基础键盘交互：

- `Esc` 关闭菜单。
- `Alt` 聚焦菜单栏。
- `Alt + F/E/P/O/V/T/H` 打开对应菜单。
- 上下键移动菜单项。
- 左右键切换顶级菜单。
- Enter 执行当前项。

如果第一版时间紧，可以先只做鼠标交互和 `Esc`，后续再补完整键盘导航。

### 6.3 可访问性

建议使用语义：

- 菜单栏容器：`role="menubar"`
- 顶级菜单按钮：`role="menuitem"`
- 下拉菜单：`role="menu"`
- 菜单项：`role="menuitem"`
- 禁用项：`aria-disabled="true"`
- 展开状态：`aria-expanded`

## 7. 菜单数据模型

建议新增数据驱动配置：

```js
const MENU_BAR = [
  {
    id: 'file',
    label: '文件(F)',
    items: [
      { id: 'new', label: '新建文件', shortcut: 'Ctrl+N', command: 'new', status: 'ready' },
      { id: 'new-window', label: '新建窗口', shortcut: 'Ctrl+Shift+N', status: 'placeholder' },
      { type: 'separator' }
    ]
  }
]
```

字段建议：

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定标识 |
| `labelKey` | i18n key，后续中英文切换 |
| `label` | 第一版可先写中文，后续抽 i18n |
| `shortcut` | 展示快捷键 |
| `command` | 对应 `handlers.current[command]` |
| `status` | `ready` / `partial` / `placeholder` |
| `children` | 子菜单 |
| `disabledReason` | 禁用原因或待实现说明 |
| `platforms` | 可选，限制平台 |

不要把菜单项散落写在 JSX 里。菜单树必须集中定义，后续开发才能维护。

## 8. 菜单结构设计

标记说明：

- `[可接]`：已有命令或容易接入。
- `[部分]`：已有底层能力，但需要补 command handler 或 UI 细节。
- `[占位]`：先展示 UI，后续实现。

### 8.1 文件(F)

```text
文件(F)
  新建文件                         Ctrl+N        [可接]
  新建窗口                         Ctrl+Shift+N  [占位]
  打开文件...                      Ctrl+O        [可接]
  打开文件夹...                    Ctrl+Shift+O  [可接]
  快速打开...                      Ctrl+P        [可接，复用命令面板]
  打开最近                         >             [部分，已有 recents 数据]
  重新打开关闭的文件                Ctrl+Shift+T  [占位]
  ─────────────────
  保存                             Ctrl+S        [可接]
  另存为...                        Ctrl+Shift+S  [可接]
  ─────────────────
  导出                             >
    PDF...                         Ctrl+Shift+E  [可接]
    HTML...                                      [占位]
    HTML，无样式                                  [占位]
    图片...                                      [占位]
    Word (.docx)                                 [占位，Pandoc]
    RTF                                          [占位，Pandoc]
    LaTeX                                        [占位，Pandoc]
    其他格式...                                  [占位]
  打印...                                        [占位]
  ─────────────────
  设置                             Ctrl+,        [可接，需要 command]
  关闭标签页                       Ctrl+W        [可接]
  退出                                           [可接，需要 renderer/main 协作]
```

Moxie 当前已有 `new/open/openFolder/save/saveAs/exportPdf/closeTab/palette`。设置页已有 UI，但需要给菜单加 `settings` command。退出可以走 `window.api.windowClose()` 或主进程 quit 事件。

### 8.2 编辑(E)

```text
编辑(E)
  撤销                             Ctrl+Z        [部分，浏览器/编辑器原生]
  重做                             Ctrl+Y        [部分]
  ─────────────────
  剪切                             Ctrl+X        [部分，原生]
  复制                             Ctrl+C        [部分，原生]
  粘贴                             Ctrl+V        [部分，原生]
  复制为 Markdown                   Ctrl+Shift+C  [占位]
  粘贴为纯文本                      Ctrl+Shift+V  [占位]
  ─────────────────
  全选                             Ctrl+A        [部分，原生]
  选择当前行 / 句子                                [占位]
  选择当前单词                     Ctrl+D        [占位]
  删除当前单词                     Ctrl+Shift+D  [占位]
  选择表格单元格                   Ctrl+E        [占位]
  选择表格行                       Ctrl+L        [占位]
  删除表格行                       Ctrl+Shift+Backspace [占位]
  ─────────────────
  跳到顶部                         Ctrl+Home     [占位]
  跳到选区                         Ctrl+J        [占位]
  跳到底部                         Ctrl+End      [占位]
  ─────────────────
  查找                             Ctrl+F        [可接]
  查找下一个                       F3            [部分]
  查找上一个                       Shift+F3      [部分]
  替换                             Ctrl+H        [可接，当前是 find bar replace]
```

编辑菜单里很多命令可以先用 `document.execCommand()` 或编辑器快捷键自然处理，但更推荐后续统一进入 command registry，避免行为分散。

### 8.3 段落(P)

```text
段落(P)
  正文                             Ctrl+0        [可接，已有块类型]
  标题 1                           Ctrl+1        [可接]
  标题 2                           Ctrl+2        [可接]
  标题 3                           Ctrl+3        [可接]
  标题 4                           Ctrl+4        [可接]
  标题 5                           Ctrl+5        [可接]
  标题 6                           Ctrl+6        [可接]
  ─────────────────
  提升标题级别                     Ctrl+=        [占位]
  降低标题级别                     Ctrl+-        [占位]
  ─────────────────
  表格                             Ctrl+T        [占位]
  代码块                           Ctrl+Shift+K  [占位]
  数学公式块                       Ctrl+Shift+M  [占位]
  引用                             Ctrl+Shift+Q  [占位]
  有序列表                         Ctrl+Shift+[  [占位]
  无序列表                         Ctrl+Shift+]  [占位]
  任务列表                                       [占位]
  分割线                                         [占位]
  ─────────────────
  缩进                             Ctrl+[ / Tab  [占位]
  取消缩进                         Ctrl+] / Shift+Tab [占位]
```

这里是 Moxie 后续最值得补齐的区域。当前 `blocks.js` 已有标题/正文定义，`Editor.jsx` 内也有块转换能力，但需要暴露稳定命令，例如 `setBlock('h1')`、`setBlock('paragraph')`。

### 8.4 格式(O)

```text
格式(O)
  加粗                             Ctrl+B        [部分，编辑器原生]
  斜体                             Ctrl+I        [部分]
  下划线                           Ctrl+U        [部分]
  删除线                           Alt+Shift+5   [部分/占位]
  行内代码                         Ctrl+Shift+`  [部分/占位]
  ─────────────────
  链接                             Ctrl+K        [部分/占位]
  图片                             Ctrl+Shift+I  [部分，已有图床/上传链路但未统一菜单命令]
  图片                             >
    移动所有图片到...                             [占位]
    复制所有图片到...                             [占位]
    下载远程图片                                  [占位]
  ─────────────────
  清除格式                         Ctrl+\        [占位]
```

格式菜单主要是行内格式，不要和段落菜单混淆。后续需要封装 editor inline command API。

### 8.5 视图(V)

```text
视图(V)
  命令面板                         Ctrl+P        [可接]
  切换侧边栏                                      [可接]
  文件浏览器                                      [可接]
  大纲                                            [可接]
  ─────────────────
  源码模式                         Ctrl+/        [可接]
  专注模式                         F8            [占位]
  打字机模式                       F9            [占位]
  ─────────────────
  分屏编辑                                       [可接]
  置顶窗口                                       [占位]
  ─────────────────
  实际大小                         Ctrl+Shift+0  [部分，主进程 role]
  放大                             Ctrl+Shift+=  [部分，主进程 role]
  缩小                             Ctrl+Shift+-  [部分，主进程 role]
  全屏                             F11           [部分，主进程 role]
  开发者工具                       Shift+F12     [部分，主进程 role]
```

当前 Electron 原生菜单已经有缩放、全屏、开发者工具 role。自定义菜单栏如果要接这些，需要新增 IPC 或直接保留主进程 role 快捷键。

### 8.6 主题(T)

```text
主题(T)
  暖光                                           [可接]
  暖夜                                           [可接]
  莫兰迪·灰绿                                    [可接]
  莫兰迪·豆沙                                    [可接]
  莫兰迪·雾蓝                                    [可接]
  莫兰迪·暮                                      [可接]
  ─────────────────
  自定义主题列表                                  [可接]
  ─────────────────
  打开主题目录                                    [可接]
  获取更多主题                                    [可接]
  刷新主题                                      [部分]
```

主题菜单应该从 `THEMES` 和 `customThemes` 动态生成，不要写死。当前选中的主题需要有勾选状态。

### 8.7 帮助(H)

```text
帮助(H)
  快速开始                                      [占位]
  Markdown 参考                                 [占位]
  快捷键参考                                    [占位]
  ─────────────────
  GitHub                                       [可接]
  报告问题                                      [可接]
  检查更新                                      [部分，已有 update check 逻辑但需命令入口]
  ─────────────────
  关于 Moxie                                    [可接，打开设置页 about 或轻量 About 弹层]
```

帮助菜单建议先保守，不做大弹窗。`关于 Moxie` 可以打开设置页并滚到 about，也可以后续做一个紧凑 About dialog。

## 9. 已有能力映射表

| 菜单能力 | 当前状态 | 涉及文件 | 建议 |
| --- | --- | --- | --- |
| 新建/打开/保存/另存为 | 已有 | `menuHandlers.js`, `useFileOps.js` | 直接接入 |
| 打开文件夹 | 已有 | `useFileOps.js`, `Sidebar.jsx` | 直接接入 |
| 导出 PDF | 已有 | `menuHandlers.js`, `main/index.js` | 直接接入 |
| 命令面板 | 已有 | `CommandPalette.jsx`, `menuHandlers.js` | 直接接入 |
| 文件浏览器/大纲 | 已有 | `ActivityBar.jsx`, `menuHandlers.js` | 直接接入 |
| 源码模式 | 已有 | `App.jsx`, `menuHandlers.js` | 直接接入 |
| 分屏 | 已有 UI 和逻辑 | `App.jsx`, `Topbar.jsx` | 新增 command handler |
| 设置页 | 已有 UI | `SettingsView.jsx`, `useFileOps.js` | 新增 command handler |
| 标题/正文切换 | 有底层能力 | `blocks.js`, `Editor.jsx` | 暴露 command handler |
| 加粗/斜体等行内格式 | 编辑器有原生能力 | `Editor.jsx` | 后续封装 |
| 表格/列表/引用/代码块 | 编辑器支持但未统一暴露 | `Editor.jsx` | 后续封装 |
| HTML/Image/Word 导出 | 未实现 | - | 占位 |
| 图片批处理 | 未实现 | - | 占位 |
| 专注/打字机模式 | 未实现 | - | 占位 |
| 检查更新 | 有主进程接口 | `main/index.js`, `UpdateToast.jsx` | 新增命令入口 |

## 10. 建议组件拆分

### 10.1 新增组件

```text
src/renderer/src/components/shell/MenuBar.jsx
src/renderer/src/components/shell/MenuDropdown.jsx
src/renderer/src/components/shell/menuConfig.js
```

也可以先只建 `MenuBar.jsx` + `menuConfig.js`，等复杂度上来再拆 `MenuDropdown.jsx`。

### 10.2 调整组件

`Topbar.jsx` 当前职责过多，建议拆成：

```text
Chrome.jsx 或 AppChrome.jsx
  ├─ MenuBar.jsx
  └─ Topbar.jsx / Tabbar.jsx
```

短期也可以保持 `Topbar.jsx` 名称不变，把它变成两层容器：

```jsx
<div className="top-chrome">
  <MenuBar ... />
  <div className="topbar">...</div>
</div>
```

长期建议重命名第二行为 `Tabbar`，避免 `Topbar` 同时表示两层顶部区域。

## 11. 命令系统改造建议

当前命令集中在 `createMenuHandlers()`，这是好基础。后续建议扩展成更明确的命令注册：

```js
handlers.current = {
  new: ...,
  open: ...,
  setBlock: (id) => ...,
  toggleBold: () => ...,
  openSettings: () => ...,
  openGithub: () => ...,
}
```

菜单 UI 只做一件事：

```js
if (item.command && handlers.current[item.command]) {
  handlers.current[item.command](item.args)
} else {
  toast('即将支持')
}
```

不要让菜单组件直接知道文件保存、编辑器 API、主题应用等业务细节。

## 12. 开发阶段规划

### 阶段 1：菜单栏 UI 骨架

目标：

- 加入双层顶部结构。
- 完成 `文件/编辑/段落/格式/视图/主题/帮助` 顶级菜单。
- 完成下拉菜单 UI。
- 未实现项先禁用或轻提示。
- 保证窗口拖拽、窗口按钮、标签页仍可用。

验证：

- Windows 1280x820 截图。
- 标签页多时仍可横向滚动。
- 菜单打开后不影响窗口按钮。
- 点击空白关闭菜单。
- `Esc` 关闭菜单。

### 阶段 2：接入已有命令

目标：

- 文件菜单接入新建、打开、打开文件夹、保存、另存为、导出 PDF、关闭标签。
- 编辑菜单接入查找、替换。
- 视图菜单接入命令面板、侧边栏、文件浏览器、大纲、源码模式、分屏。
- 主题菜单接入内置主题、自定义主题、打开主题目录、获取更多主题。
- 帮助菜单接入 GitHub、报告问题、关于。

验证：

- 每个可点击菜单项实际触发对应行为。
- 禁用项不会误触发。
- 快捷键展示与现有快捷键不冲突。

### 阶段 3：编辑器命令补齐

目标：

- 段落菜单接入正文、标题 1-6。
- 格式菜单接入加粗、斜体、下划线、删除线、行内代码、链接。
- 后续再接表格、代码块、数学块、引用、列表、任务列表。

验证：

- 光标在富文本编辑器中时菜单命令作用于当前选区/当前块。
- 光标在源码模式时行为合理，或者禁用富文本专属项。
- 设置页/欢迎页时编辑菜单项状态合理。

### 阶段 4：高级功能

目标：

- HTML/Image/Word 等导出。
- 专注模式、打字机模式。
- 打开最近、重新打开关闭文件。
- 图片批处理。
- 完整键盘菜单导航。

## 13. 风险与处理

### 13.1 顶部高度增加

风险：正文区域高度减少约 26px。

处理：菜单栏只做 28px，标签栏控制在 38px，不做厚工具栏。

### 13.2 窗口拖拽冲突

风险：菜单栏 `no-drag` 区域过大，用户不好拖窗口。

处理：菜单右侧大面积空白必须保持 `drag`，标签栏右侧 spacer 也保留 `drag`。

### 13.3 菜单命令误导用户

风险：菜单看起来完整，但很多功能没实现。

处理：第一版明确用禁用态或 `即将支持` 提示。不要让占位项静默失败。

### 13.4 编辑器命令分散

风险：菜单、快捷键、右键菜单、状态栏各自实现一套编辑命令。

处理：把命令收敛到 `menuHandlers.js` 或新的 command registry，所有入口复用。

### 13.5 跨平台差异

风险：Windows 自绘窗口按钮、macOS 原生红绿灯、移动端安全区各有差异。

处理：

- Windows：菜单栏右侧放 `WindowControls`。
- macOS：保留原生 traffic lights，菜单栏左侧需要避让或使用平台特化样式。
- 移动端：不显示完整菜单栏。

## 14. 验证标准

按本项目现有固定流程：

1. `npm run build`
2. 真实 Electron 验证和截图
3. 检查菜单栏打开/关闭、标签页、多标签滚动、窗口按钮、窗口拖拽
4. 打包前按需求决定是否执行 `electron-builder`

真实 Electron 验证建议检查：

- `.menubar` 存在。
- `.topbar` 第二行存在。
- `--topbar-h` 等于双层高度。
- Windows 控制按钮仍可见。
- 菜单项点击后下拉出现。
- 下拉菜单不产生横向溢出。
- 多标签情况下仍有拖拽区域。

## 15. 推荐最终方案

最终建议采用：

```text
28px Typora 风格菜单栏 + 38px Moxie 标签栏
```

第一版实现策略：

- UI 先完整。
- 命令先接已有。
- 未实现项明确占位。
- 菜单树数据化。
- 不重写编辑器。
- 不牺牲多标签体验。

这条路线能同时满足两件事：

- 外观看起来像完整桌面 Markdown 编辑器。
- 内部仍然保持 Moxie 当前架构，不为了模仿 Typora 把已有系统打乱。
