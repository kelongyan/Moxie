# Moxie

<p align="center">
  <img src="./assets/moxie-logo.png" alt="Moxie logo" width="112">
</p>

<p align="center">
  <strong>A clean, modern Markdown editor for focused writing and multi-file work.</strong>
</p>

<p align="center">
  <a href="https://github.com/kelongyan/Moxie/actions/workflows/ci.yml"><img src="https://github.com/kelongyan/Moxie/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/kelongyan/Moxie/releases"><img src="https://img.shields.io/github/v/release/kelongyan/Moxie?include_prereleases" alt="Release"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

## 简介

Moxie 是一款基于 Electron、React 和 Milkdown 的 Markdown 编辑器。它面向经常同时处理多个 Markdown 文件的写作者、开发者和笔记用户：左侧管理文件夹，顶部用标签页切换文档，中间提供所见即所得的编辑体验。

本项目是基于原开源项目 [BND-1/horseMD.git](https://github.com/BND-1/horseMD.git) 的二次开发版本，已更换品牌、图标、应用名称和发布仓库，并持续面向 Moxie 的使用体验做调整。

## 功能亮点

- 所见即所得 Markdown 编辑，输入时实时渲染。
- 文件夹工作区：在一个窗口内浏览、打开和管理多个 `.md` 文件。
- 标签页工作流：多个文档同窗切换，减少重复窗口。
- 分屏编辑：并排查看或编辑两个文档。
- 命令面板、文档内查找、大纲跳转和实时统计。
- 支持表格、代码块、LaTeX 数学公式、Mermaid 图表、图片、任务列表和引用块。
- 支持源码模式，在渲染视图和原始 Markdown 之间切换。
- 支持自定义主题、页面宽度、字体大小、行高和段落间距。
- 支持导出 PDF，以及面向公众号、邮件、Notion 等场景的富文本复制。
- 支持中英文界面切换。

## 下载

前往 [GitHub Releases](https://github.com/kelongyan/Moxie/releases/latest) 下载最新版本。

Windows 安装包文件名示例：

```text
Moxie Setup 1.0.0.exe
```

当前安装包未进行商业代码签名。Windows 可能会出现 SmartScreen 提示，选择“更多信息”后继续运行即可。你也可以从源码自行构建。

## 开发

```powershell
npm install
npm run dev
npm run build
npm run dist
```

常用命令：

- `npm run dev`：启动开发模式。
- `npm run build`：构建主进程、预加载脚本和渲染端产物。
- `npm run dist`：生成当前平台安装包。
- `npm start`：运行已构建产物。

如果 Electron 下载较慢，可以在安装依赖前配置镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install
```

## 技术栈

- Electron
- Vite
- React
- Milkdown Crepe
- ProseMirror
- Capacitor

## 项目来源与致谢

Moxie fork 自 [BND-1/horseMD.git](https://github.com/BND-1/horseMD.git)，并在获得原作者二次开发许可后继续开发和发布。感谢原作者的开源工作、产品设计和早期工程基础，让 Moxie 能够在此之上继续演进。

## 许可证

本项目继续遵循 [MIT License](./LICENSE)。
