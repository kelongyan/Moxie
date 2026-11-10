# Moxie

Windows 上的 Markdown 编辑器。基于 [Textus](https://github.com/CatVinci-Studio/Textus) 的 MIT
源码分叉而来，换了自己的名字、图标和标识，按个人使用习惯继续维护。

所见即所得与源码模式并存，写作、整理笔记、导出文档都在一个窗口里完成。

## 这是什么

这是一个**自用分支**，不是上游的官方发行版。

- 代码基线：Textus 1.3.12（上游仍在活跃开发，本仓库不定期合并）。
- 当前只维护 Windows 构建（NSIS 安装包）。上游的 macOS / Linux / iOS 代码保留在树里，
  没有在这里验证过。
- 保留上游几乎全部能力：富文本与源码双模式编辑、数学公式、图表、代码高亮、表格、
  全文搜索、导出 PDF/HTML、AI 写作助手、插件系统、主题。

## 与上游的区别

| 方面 | 说明 |
| --- | --- |
| 品牌 | 产品名、图标、界面文案统一为 Moxie；窗口标题、安装器、安装目录随之改变 |
| 标识 | 应用 identifier 为 `com.moxie.desktop`；项目内的数据目录从 `.textus/` 改为 `.moxie/` |
| 深链 | `moxie://`（上游为 `textus://`） |
| 自动更新 | **已关闭**：本机没有签名私钥，`createUpdaterArtifacts` 关闭，更新端点指向本仓库的 releases，目前没有发布任何版本 |
| 对外契约 | 插件清单 `textus-plugin.json`、插件协议 `textus-plugin:`、`.textusplugin` 包扩展名、`engines.textus` 字段、插件市场目录**保持原名**——它们由上游目录和插件作者决定，改了会让官方插件全部失效 |
| 文档 | 开发文档沿用上游 `docs/`，仍是英文，与上游保持一致以便合并 |

## 上手

### 环境

- Node.js 22 或更高（`.nvmrc` 写了版本）
- Rust：`src-tauri/rust-toolchain.toml` 固定了 `stable`。**Windows 上必须用 MSVC 工具链**，
  见下面的注意事项
- Visual Studio Build Tools（"使用 C++ 的桌面开发"）与 WebView2（Windows 10/11 自带）

### 命令

```sh
npm install
npm run tauri dev      # 开发模式，前后端一起，热更新
npm run dev            # 只跑前端，后端用 dev 桩，适合调界面
npm run tauri build    # 出 NSIS 安装包：src-tauri/target/release/bundle/nsis/
```

日常校验：

```sh
npm run check:quick    # 改动文件的类型检查 + lint + 测试
npm run check          # 全量：类型、lint、单测、格式、体积、循环依赖等
npm run check:native   # Rust：rustfmt、clippy、测试
```

### Windows 上的两个坑

这台机器上的 `rustup` 默认 host 是 `x86_64-pc-windows-gnu`，会让
`rust-toolchain.toml` 里的 `stable` 解析成 GNU 工具链，链接 Tauri 的 cdylib 时报
`export ordinal too large`。打包时必须显式指定 MSVC：

```sh
RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc npm run tauri build
```

首次打包还要下载 NSIS，直连 GitHub 会超时，挂上本机代理即可：

```sh
HTTPS_PROXY=http://127.0.0.1:7897 RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc npm run tauri build
```

### 测试数据不要混

`npm run tauri dev` 之前把应用数据目录指到临时位置，别让开发构建读到真实数据。
各平台的目录见 `docs/dev/storage.md`。

## 已知限制

- 自动更新关闭，升级靠手动装新包。
- 只有 Windows 打包得到验证；macOS / Linux / iOS 未在本仓库构建。
- 插件与技能市场用的是上游目录（`textus.md`），因此装进来的官方插件与技能保持原名；
  技能文件里的 `textus-` 元数据前缀在读取侧仍兼容。
- 界面语言：上游的十种语言保留在 `src/i18n/locales/`，本仓库只保证中文与英文的观感。

## 致谢

这个项目能存在，几乎全部功劳属于上游作者：

- **[Textus](https://github.com/CatVinci-Studio/Textus)** —— CatVinci Studio 出品的
  Markdown 编辑器，本仓库的代码基线。它的编辑器内核、Markdown 往返保存、插件沙箱、
  AI 写作助手，都是上游团队的成果。
- 上游的贡献者与插件作者，以及 `docs/dev/` 里那些把设计取舍写清楚的文档作者。

上游以 MIT 许可发布，本仓库同样如此：`LICENSE` 保留了 CatVinci Studio 的原始版权声明，
`THIRD-PARTY-NOTICES.md` 列出了第三方组件。改品牌不等于改归属，这两份文件请勿删除。

## 许可

MIT。上游部分 © 2026 CatVinci Studio；本仓库的改动 © 2026 kelongyan。
