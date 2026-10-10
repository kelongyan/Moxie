# Moxie Markdown 渲染样本

> 申论高频话题：背景与影响句库（Typora 风格排版演示）

这是一段用于演示 **Moxie WYSIWYG 渲染** 的样本，覆盖 H1~H6、段落、引用、列表、任务、表格、行内 code、代码块、链接、hr，以及 typographer（直引号 → 弯引号、`--` → `—`、`...` → `…）的效果。

打开即是所见即所得的书写面：标题、引用、列表、表格等块级结构始终保持渲染；粗体、斜体、行内代码等行内标记在光标进入时显示原文。标题级别用 Ctrl+0-6 调整。超大文件会自动降级为源码形态以保证流畅。

---

## 一、文本与排版基础

### 1.1 段落与行高

中文段落行高 1.7，段距 14px，是长时间阅读的甜点。排版引擎已启用 `text-spacing-trim`（全角标点挤压）与 `tabular-nums`（等宽数字），实际效果取决于字体是否提供相应 OpenType 特性。

"双引号会自动变成弯引号，"他说，"包括 '单引号'。" 三个句点 ... 也会变成单个省略号 …。破折号——比如这样——会变成 em-dash。

### 1.2 强调

普通文本、**加粗文本**、*斜体文本*、***加粗斜体***、`行内 code`（柔和底色 + tabular-nums 数字）、[外链到示例](https://example.com "悬停看 tooltip")。

---

## 二、列表

### 2.1 有序列表（编号对齐）

1. 第一项：使用 `font-variant-numeric: tabular-nums`，"10." 和 "1." 视觉宽度一致。
2. 第二项：包含 **加粗**、`code` 和 [链接](#)。
3. 第三项：嵌套子项不缩进列表符号。

  1. 嵌套 a
  2. 嵌套 b

10. 第十项：编号依然对齐，不会跳动。

### 2.2 无序列表

- 一级项（•）
  - 二级项（◦）
    - 三级项（▪）
- 列表标记使用次级文字色，层级即符号

### 2.3 任务列表

- [x] 完成：所见即所得书写面 + typographer
- [x] 完成：表格常渲染 + 单元格原位编辑（Tab/Enter 导航、末行 Enter 增行）
- [ ] 待办：表格增删列、单元格内行内格式
- [ ] 待办：渲染性能压测

---

## 三、引用与水平线

> 单层引用：左条用 accent 色 60% 透明，更"出版物感"，背景几乎透明。
>
> 多行引用：每行都保持这种低调的视觉重量。引用内分隔空行压缩为 8px，不会出现空洞。

>> 嵌套引用也支持。

---

## 四、代码块与语法高亮

### 4.1 行内 code

`const greeting = "你好, ${name}";` 这里的 `greeting` 是变量。

### 4.2 TypeScript

```ts
interface Document {
  id: string;
  name: string;
  isDirty: boolean;
  livePreview: boolean; // 书写面即时渲染（大文件自动降级关闭）
}

function toggleLivePreview(doc: Document): Document {
  return { ...doc, livePreview: !doc.livePreview };
}
```

### 4.3 Rust

```rust
fn render_shell(tokens: PreviewTokens, title: &str) -> String {
    let hairline = format!("color-mix(in srgb, {} 9%, {})", tokens.fg, tokens.bg);
    format!(r#"<!DOCTYPE html>
<html><head><title>{title}</title></head>
<body style="border-bottom: 1px solid {hairline};"></body>
</html>"#)
}
```

### 4.4 Python

```python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

---

## 五、表格

| 元素 | 改前 | 改后 | 提升点 |
|---|---:|---:|---|
| H1 字号 | 1.6em | 2em | 接近 Typora 的视觉冲击 |
| 段距 | 0.55em | 14px | 阅读更舒展，随字号缩放 |
| 行高 | 1.75 | 1.7 | 长时间不累 |
| hr | 1px 实线 | 渐变线段 | 不抢戏 |
| 引用左条 | 3px 灰 | 2.5px accent | 有色而非纯灰 |
| 智能引号 | 关 | 开 | typographer 灵魂细节 |

---

## 六、链接与图片

外链：[Moxie 项目主页](https://example.com) 会调用 `open_external` 走系统浏览器。

锚点链接：跳到[任务列表](#二三任务列表) 不会刷新页面，会平滑滚动。

图片演示（如果同目录有 `sample.png`）：

![占位图](sample.png)

---

## 七、数学与脚注

行内公式 $E = mc^2$ 走 KaTeX 渲染；下方是块级：

$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

带脚注的段落[^1]，点击脚注标记会跳转。

[^1]: 这是脚注内容，9pt 字号，二级文字色，更像学术文末注释。

---

## 八、分隔线

正文到这里差不多，下面再用一道 hr 把"附录"分开。

---

## 附录 A：书写面行为

- 标题/引用/列表/表格/任务清单/hr 始终保持渲染，编辑时不还原源码
- 标题级别：Ctrl+0 正文、Ctrl+1-6 一到六级；引用行 Enter 自动续写 "> "
- 表格点击单元格原位编辑，Tab/Enter 导航，末行 Enter 增行
- 粗体/斜体/行内代码/链接等行内标记在光标进入时显示原文
- 大文档会被自动降级为源码形态（性能分级保护），状态栏与大文件菜单有提示

## 附录 B：还能改的方向

1. 表格增删列与右键表格菜单
2. 表格单元格内的行内格式（加粗 / 行内 code）
3. 中文字体补齐 halt/vhal 特性，让标点挤压真正生效
