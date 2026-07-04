# HorseMD 路线图 / Roadmap

> 这里记录 HorseMD 的方向与优先级。顺序大致代表优先级,但会随实际情况调整;
> 欢迎在 [Issues](https://github.com/BND-1/horseMD/issues) 里提想法。
>
> *This is the project roadmap (Chinese-first). Items are roughly ordered by
> priority and may change. Ideas welcome via Issues.*

---

## ✅ 已完成 / 已发布

桌面端(Windows + macOS,Electron):

- 标签式多文件编辑(所有 `.md` 开在同一个窗口,而不是开新进程)
- 文件树工作区、命令面板、大纲面板、会话恢复、单实例文件关联
- Typora 风格所见即所得(Milkdown Crepe)、源码模式
- 暖色主题 + 莫兰迪四色、明暗、i18n(中/英)
- 分屏(两个文档并排,各自可编辑,可拖动比例)
- 导出 PDF
- 外部修改自动重载、关闭未保存提醒
- 大文件极速纯文本模式

### 0.2.0(本次发布)

- **可配置图床**:类 Typora 的自定义上传命令(粘贴/拖入/上传图片自动走命令并插入返回链接)
- **自定义页面宽度**:状态栏分段预设 + 微调滑块
- **自定义主题**:把 `.css`(或整个下载来的主题文件夹)放进主题文件夹即可(可直接迁移 Typora 主题),或从 [theme.typora.io](https://theme.typora.io) 下载
- **Mermaid 图表**实时渲染、**LaTeX 公式**(KaTeX)
- **表格单元格内换行**(`<br>` 干净往返)、更紧凑的表格排版
- **Intel(x64)macOS 构建**
- **更新提示展示更新内容**(自动读取 GitHub release notes)
- 修复:表格文字超列宽重叠、长公式右侧重叠、图片选中线框、切主题丢全宽设置等

---

## 🚧 近期计划(桌面端)

- **macOS 签名 + 公证** —— 解决 Gatekeeper "打不开/已损坏",免去手动右键打开
  ([#1](https://github.com/BND-1/horseMD/issues/1))
- **Front matter 支持** —— 识别顶部 YAML、渲染为独立信息块、原样往返保存
  ([#8](https://github.com/BND-1/horseMD/issues/8))
- **Linux 版本** —— 加构建目标 + CI,并补齐 Linux 的窗口/标题栏等适配(暂缓)
- 持续打磨:更多键盘快捷键、查找替换、导出选项等

---

## 📱 进行中:移动端适配(Android + iOS,Capacitor)

把 HorseMD 的写作体验带到手机和平板上。技术选型已定为 **Capacitor**:用原生壳包裹
现有 React + Milkdown 渲染层,**复用整个编辑器内核**,桌面 Electron 代码零改动。
详细方案见 [docs/mobile.md](./docs/mobile.md)。

**已完成:**

- Capacitor 工程接入(`vite.mobile.config.mjs` → `dist-mobile/`,`cap add ios/android`)
- `window.api` 适配层(`src/renderer/src/platform/`):用 Capacitor 插件实现与桌面
  preload 相同的契约(App 私有库文件读写、文件选择器、浏览器),桌面专属能力安全降级
- 移动端响应式 UI(全部 scoped 在 `.is-mobile`,桌面零影响):全宽编辑区、安全区
  适配、抽屉式侧边栏、触摸尺寸、隐藏不适用的控件
- 两端图标 + 启动屏(暖色配色)
- **已在 iOS 模拟器与 Android 模拟器上跑通**:启动、渲染、主题、i18n 正常

**接下来(MVP:看 + 改 + 本地文件):**

- 真机验证编辑/打字手感、文件读写(`Documents/HorseMD/`)与文件选择器导入
- 软键盘滚动、Milkdown 触摸交互(选区工具条、拖拽手柄)打磨
- 文件关联("用 HorseMD 打开 .md")、移动端更新检查
- 上架准备:iOS 签名/公证(Apple 开发者账号)、Android keystore

---

## 🔭 远期 / 探索中

- **桌面 ↔ 移动文档同步**:与移动端协同的同步/云存储方案(待评估)

---

## 参与

有想法或需求?欢迎到 [Issues](https://github.com/BND-1/horseMD/issues) 提;
变更记录见 [CHANGELOG.md](./CHANGELOG.md)。
