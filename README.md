<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Moxie" width="112" height="112" />
</p>

<h1 align="center">Moxie</h1>

<p align="center">
  <strong>Windows 上的 Markdown 编辑器</strong><br>
  所见即所得，也留得住你手写的那点格式。
</p>

<p align="center">
  <a href="https://github.com/kelongyan/Moxie/releases"><strong>下载</strong></a> ·
  <a href="#从源码构建"><strong>构建</strong></a> ·
  <a href="#致谢"><strong>致谢</strong></a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3c6e71.svg"></a>
  <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows-0078d4.svg">
  <img alt="Based on Textus" src="https://img.shields.io/badge/based%20on-Textus%201.3.12-6b7280.svg">
</p>

![Moxie](docs/images/readme/en/hero.png)

## 特性

- **两种写法，一个文档**：富文本与源码模式随时切换，光标位置跟着走。
- **Markdown 原样保存**：只重写你真正改过的段落，没碰过的内容逐字节留在原处。
- **公式、图表、代码、表格**：LaTeX 排版、Mermaid / Pele 图表、代码高亮、GFM 表格，都在正文里直接出效果。
- **AI 写作助手**：改写、审阅、续写、语法检查；改动以建议形式出现，逐句接受。
- **插件系统**：命令、快捷键、侧栏、独立视图、主题都能由插件扩展，运行在沙箱里。
- **导出**：PDF 与 HTML 直接出，其他格式交给 pandoc。
- **十种界面语言**：中文、繁体、英、日、韩、西、法、德、俄、葡。

## 截图

| Markdown | 代码块 |
| --- | --- |
| ![Markdown](docs/images/readme/en/markdown.webp) | ![代码](docs/images/readme/en/code.webp) |

| 公式 | 表格 |
| --- | --- |
| ![公式](docs/images/readme/en/formula.webp) | ![表格](docs/images/readme/en/table.webp) |

| 图表 | AI 改写 |
| --- | --- |
| ![图表](docs/images/readme/en/diagram.webp) | ![AI 改写](docs/images/readme/en/ai-revise.webp) |

| 插件：Vim 键位 | 插件：版本历史 |
| --- | --- |
| ![Vim](docs/images/readme/en/plugin-vim.webp) | ![版本历史](docs/images/readme/en/plugin-history.webp) |

## 安装

Windows 10 / 11，从 [Releases](https://github.com/kelongyan/Moxie/releases) 下载
`Moxie_x.y.z_x64-setup.exe` 运行安装即可，按用户安装，不需要管理员权限。

## 从源码构建

需要 Node.js 22 或更高、Rust stable、Visual Studio Build Tools（使用 C++ 的桌面开发）
与 WebView2（Windows 10 / 11 自带）。

```sh
npm install
npm run tauri build
```

Windows 上指定 MSVC 工具链构建：

```sh
RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc npm run tauri build
```

产物在 `src-tauri/target/release/bundle/nsis/`。

开发时：

```sh
npm run tauri dev      # 前后端一起跑，热更新
npm run dev            # 只跑前端，后端用开发桩
```

提交前的检查：

```sh
npm run check          # 类型、lint、单测、格式与各项结构检查
npm run check:native   # Rust：rustfmt、clippy、测试
```

## 与上游

Moxie 是 [Textus](https://github.com/CatVinci-Studio/Textus) 的分叉：品牌、图标、
应用标识与项目数据目录（`.moxie/`）改成了自己的，其余能力与上游保持一致，以便持续合并上游改进。

插件清单 `textus-plugin.json`、插件协议 `textus-plugin:`、`.textusplugin` 包扩展名、
清单里的 `engines.textus` 字段，以及插件与主题市场目录沿用上游命名——它们属于对外契约，
改名会让官方插件失效。

## 致谢

代码基线是 [Textus](https://github.com/CatVinci-Studio/Textus)，由 CatVinci Studio 出品。
编辑器内核、Markdown 往返保存、插件沙箱、AI 写作助手、界面设计，都是上游团队的成果。
感谢上游的贡献者、插件与主题作者，以及 `docs/` 里那些把设计取舍写清楚的文档作者。

本仓库以 MIT 许可发布，`LICENSE` 保留 CatVinci Studio 的原始版权声明，
`THIRD-PARTY-NOTICES.md` 列出第三方组件。

## 许可

MIT。上游部分 © 2026 CatVinci Studio；本仓库的改动 © 2026 kelongyan。
