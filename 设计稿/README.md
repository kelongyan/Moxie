# Moxie 侧栏文件列表 · 设计稿

交互式静态设计稿（HTML/CSS/JS 分离，零依赖），用于在源码重构前选定方案。

## 打开方式

双击 `index.html`（file:// 协议即可全部功能），或本地起服务：

```bash
cd 设计稿
npx serve .
```

## 方案速览

| 方案 | 文件行 | 副标题策略 | 分组行 | 识别点 | 适合 |
|---|---|---|---|---|---|
| **A 单行索引**（推荐） | 32px 单行 | 无（tooltip） | 28px + chevron | 行尾状态浮现（时间/X/重定位）、激活三重信号 | 均衡，默认选它 |
| **B 双行卡片** | 40px 双行 | 常驻（目录/时间） | 30px | 悬停卡片浮起、激活整行染色 | 条目少、信息优先 |
| **C 沉浸树形** | 30px 单行 | 无（tooltip） | 30px + inset 底色块 | 分组通栏底色、密度最高 | 重度整理型用户 |
| **D 时间记忆流** | 32px 单行 | 无（行尾时间常显） | 28px | 最近文件按今天/昨天/本周分节、分组置底 | 找回文件为主场景 |

## 目录结构

```
设计稿/
├── index.html            # 总览导航（iframe 内嵌四方案 + 主题同步）
├── shared/
│   ├── tokens.css        # 设计令牌（与 src/styles/tokens.css 同值精简版）
│   ├── base.css          # 页面骨架（工具栏/舞台/标注栏/模拟窗口）
│   ├── mock-data.js      # 唯一数据源（四方案共用）+ 图标/相对时间工具
│   └── preview.js        # 公共交互（主题切换/移除淡出/拖拽高亮）
├── scheme-a/             # 方案 A 三件套（index.html / css / js）
├── scheme-b/
├── scheme-c/
└── scheme-d/
```

## 设计稿 ↔ 源码映射

| 设计稿 | 源码落点 |
|---|---|
| tokens.css | `src/styles/tokens.css`（已是同值） |
| scheme-x.css 侧栏段 | `src/styles/app.css` 侧栏段（1078–1300） |
| scheme-x.js fileRow() | `src/components/SidebarView.tsx` FileRow |
| 行尾时间 / 相对时间 | `src-tauri/src/recent.rs` 结构升级（docs/侧栏文件列表重构方案.md 阶段 2） |

## 注意

- 设计稿字体直接引用 `../src/assets/fonts/FrexSansGB.ttf`，与真实软件一致；若移动设计稿目录需同步调整 `shared/tokens.css` 里的 `@font-face` 路径。
- 所有交互（拖拽、移除、主题）仅前端模拟，不涉及真实数据；选定方案后在源码中按映射落地。
