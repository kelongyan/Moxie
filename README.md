# Moxie

一款安静、快速、真正属于 Windows 的文本与代码编辑器。

Moxie 为日常文本、Markdown、JSON 和代码编辑而生：打开即写，标签切换顺手，预览只在需要时出现，
复杂功能藏在菜单和快捷键里。它不要求登录，不连接云端，也不会收集你的文档内容。

> 当前版本：`1.0.0` · Windows 10 1803+（x64，需 WebView2 运行时）

## 为什么是 Moxie？

- **打开就能写**：没有账号、工作区向导和多余的项目配置，启动后一键新建或打开文件即可书写。
- **专注但不简陋**：多标签、查找替换、语法高亮、Markdown 预览和 JSON 工具都在手边，界面仍保持克制。
- **大文件也能继续工作**：针对长代码和日志文件采用分级保护策略（标准 / 大文件 / 超大文件），按体量自动收敛高消耗功能，优先保证输入与滚动流畅。
- **你的内容留在你的电脑上**：本地文件、本地预览、本地恢复；不登录、不联网、不上传文档。

## 核心体验

### 编辑文本与代码

支持 TXT、Markdown、JSON、HTML、JavaScript、TypeScript、CSS、Python、Shell、YAML、C/C++、SQL
等常见格式。提供行号、当前行高亮、自动缩进、列表续行、撤销重做、基础折叠和括号配对高亮。

### Markdown 双栏预览

编辑与预览左右并排，实时渲染标题、段落、列表、引用、分割线、链接、行内代码、代码块、表格和
GFM 任务列表。预览在沙箱 iframe 中渲染，不执行任何脚本。

### JSON 工具不打乱内容

格式化和压缩只调整结构空白，保留对象字段顺序、重复键、数值字面量和字符串转义写法；无效 JSON 会
报告行号与列号。所有修改都可以用一次撤销恢复。

### 编码支持

除 UTF-8 外，支持 UTF-16 LE/BE、GB18030、ISO-8859-1、Windows-1252 的读写与转换，并提供
独立的编码转换窗口。

### 文件与窗口管理

支持多窗口、多标签、标签右键移动到新窗口或既有窗口、最近文件、侧边栏目录浏览。同一个磁盘文件
在多个窗口中只会打开一个可编辑实例，外部文件发生变化时默认不会静默覆盖。

### 退出后继续工作

崩溃恢复会话标记与退出时工作区快照分开保存：异常退出后重启可恢复未保存内容，正常退出默认保留
完整工作区，下次启动恢复窗口、标签与正文；磁盘文件不会被自动改写。

## 下载使用

便携版：下载 ZIP 解压后直接运行 `Moxie.exe`。
安装版：运行 NSIS 安装包，按向导完成安装。

未签名的应用在首次启动时可能触发 Windows SmartScreen 提示，选择“仍要运行”即可；
安装版如遇提示，点击“更多信息 > 仍要运行”。

## 从源码构建

环境要求：

- Windows 10/11（x64）
- Node.js 20+
- Rust stable 工具链（含 MSVC 目标）
- Visual Studio Build Tools（C++ 桌面开发工作负载）
- WebView2 运行时（Windows 10/11 一般已内置）

```bash
git clone <仓库地址>
cd Moxie
npm install
npm test          # 前端 Vitest 测试
npm run check     # TypeScript 类型检查
cargo test        # Rust 后端测试（在 src-tauri 目录）
npm run tauri build   # 发布打包（产物在 src-tauri/target/release/bundle）
```

开发模式运行：`npm run tauri dev`。

## 技术方向

Moxie 使用 Tauri 2.x 构建：Rust 后端负责文件读写、编码转换、JSON 格式化、恢复存储与窗口管理，
React + TypeScript 前端使用 CodeMirror 6 负责编辑，markdown-it 负责本地 Markdown 预览。
后台任务通过文档 revision 校验，过期结果不会覆盖较新的编辑内容。

## 参与贡献

提交功能修改前，请先说明用户场景，并运行 `npm test`、`npm run check` 与 `cargo test`。
