export const MENU_PLACEHOLDER = 'placeholder'
export const MENU_READY = 'ready'
export const MENU_PARTIAL = 'partial'

export const MENU_BAR = [
  {
    id: 'file',
    label: '文件(F)',
    items: [
      { id: 'new-file', label: '新建文件', shortcut: 'Ctrl+N', command: 'new', status: MENU_READY },
      { id: 'new-window', label: '新建窗口', shortcut: 'Ctrl+Shift+N', status: MENU_PLACEHOLDER },
      { id: 'open-file', label: '打开文件...', shortcut: 'Ctrl+O', command: 'open', status: MENU_READY },
      { id: 'open-folder', label: '打开文件夹...', shortcut: 'Ctrl+Shift+O', command: 'openFolder', status: MENU_READY },
      { id: 'open-quickly', label: '快速打开...', shortcut: 'Ctrl+P', command: 'palette', status: MENU_READY },
      {
        id: 'open-recent',
        label: '打开最近',
        status: MENU_PLACEHOLDER,
        children: [
          { id: 'recent-placeholder', label: '最近文件列表即将支持', status: MENU_PLACEHOLDER }
        ]
      },
      { id: 'reopen-closed', label: '重新打开关闭的文件', shortcut: 'Ctrl+Shift+T', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'save', label: '保存', shortcut: 'Ctrl+S', command: 'save', status: MENU_READY },
      { id: 'save-as', label: '另存为...', shortcut: 'Ctrl+Shift+S', command: 'saveAs', status: MENU_READY },
      { type: 'separator' },
      {
        id: 'export',
        label: '导出',
        children: [
          { id: 'export-pdf', label: 'PDF...', shortcut: 'Ctrl+Shift+E', command: 'exportPdf', status: MENU_READY },
          { id: 'export-html', label: 'HTML...', status: MENU_PLACEHOLDER },
          { id: 'export-html-plain', label: 'HTML,无样式', status: MENU_PLACEHOLDER },
          { id: 'export-image', label: '图片...', status: MENU_PLACEHOLDER },
          { id: 'export-docx', label: 'Word (.docx)', status: MENU_PLACEHOLDER },
          { id: 'export-rtf', label: 'RTF', status: MENU_PLACEHOLDER },
          { id: 'export-latex', label: 'LaTeX', status: MENU_PLACEHOLDER },
          { id: 'export-more', label: '其他格式...', status: MENU_PLACEHOLDER }
        ]
      },
      { id: 'print', label: '打印...', shortcut: 'Ctrl+P', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'settings', label: '设置', shortcut: 'Ctrl+,', command: 'settings', status: MENU_READY },
      { id: 'close-tab', label: '关闭标签页', shortcut: 'Ctrl+W', command: 'closeTab', status: MENU_READY },
      { id: 'quit', label: '退出', command: 'quit', status: MENU_READY }
    ]
  },
  {
    id: 'edit',
    label: '编辑(E)',
    items: [
      { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', command: 'nativeUndo', status: MENU_PARTIAL },
      { id: 'redo', label: '重做', shortcut: 'Ctrl+Y', command: 'nativeRedo', status: MENU_PARTIAL },
      { type: 'separator' },
      { id: 'cut', label: '剪切', shortcut: 'Ctrl+X', command: 'nativeCut', status: MENU_PARTIAL },
      { id: 'copy', label: '复制', shortcut: 'Ctrl+C', command: 'nativeCopy', status: MENU_PARTIAL },
      { id: 'paste', label: '粘贴', shortcut: 'Ctrl+V', command: 'nativePaste', status: MENU_PARTIAL },
      { id: 'copy-markdown', label: '复制为 Markdown', shortcut: 'Ctrl+Shift+C', status: MENU_PLACEHOLDER },
      { id: 'paste-plain', label: '粘贴为纯文本', shortcut: 'Ctrl+Shift+V', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'select-all', label: '全选', shortcut: 'Ctrl+A', command: 'nativeSelectAll', status: MENU_PARTIAL },
      { id: 'select-line', label: '选择当前行 / 句子', status: MENU_PLACEHOLDER },
      { id: 'select-word', label: '选择当前单词', shortcut: 'Ctrl+D', status: MENU_PLACEHOLDER },
      { id: 'delete-word', label: '删除当前单词', shortcut: 'Ctrl+Shift+D', status: MENU_PLACEHOLDER },
      { id: 'select-table-cell', label: '选择表格单元格', shortcut: 'Ctrl+E', status: MENU_PLACEHOLDER },
      { id: 'select-table-row', label: '选择表格行', shortcut: 'Ctrl+L', status: MENU_PLACEHOLDER },
      { id: 'delete-table-row', label: '删除表格行', shortcut: 'Ctrl+Shift+Backspace', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'jump-top', label: '跳到顶部', shortcut: 'Ctrl+Home', status: MENU_PLACEHOLDER },
      { id: 'jump-selection', label: '跳到选区', shortcut: 'Ctrl+J', status: MENU_PLACEHOLDER },
      { id: 'jump-bottom', label: '跳到底部', shortcut: 'Ctrl+End', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'find', label: '查找', shortcut: 'Ctrl+F', command: 'find', status: MENU_READY },
      { id: 'find-next', label: '查找下一个', shortcut: 'F3', command: 'findNext', status: MENU_PARTIAL },
      { id: 'find-prev', label: '查找上一个', shortcut: 'Shift+F3', command: 'findPrev', status: MENU_PARTIAL },
      { id: 'replace', label: '替换', shortcut: 'Ctrl+H', command: 'replace', status: MENU_READY }
    ]
  },
  {
    id: 'paragraph',
    label: '段落(P)',
    items: [
      { id: 'paragraph-text', label: '正文', shortcut: 'Ctrl+0', command: 'setBlock', args: 'paragraph', status: MENU_READY },
      { id: 'paragraph-h1', label: '标题 1', shortcut: 'Ctrl+1', command: 'setBlock', args: 'h1', status: MENU_READY },
      { id: 'paragraph-h2', label: '标题 2', shortcut: 'Ctrl+2', command: 'setBlock', args: 'h2', status: MENU_READY },
      { id: 'paragraph-h3', label: '标题 3', shortcut: 'Ctrl+3', command: 'setBlock', args: 'h3', status: MENU_READY },
      { id: 'paragraph-h4', label: '标题 4', shortcut: 'Ctrl+4', command: 'setBlock', args: 'h4', status: MENU_READY },
      { id: 'paragraph-h5', label: '标题 5', shortcut: 'Ctrl+5', command: 'setBlock', args: 'h5', status: MENU_READY },
      { id: 'paragraph-h6', label: '标题 6', shortcut: 'Ctrl+6', command: 'setBlock', args: 'h6', status: MENU_READY },
      { type: 'separator' },
      { id: 'heading-up', label: '提升标题级别', shortcut: 'Ctrl+=', status: MENU_PLACEHOLDER },
      { id: 'heading-down', label: '降低标题级别', shortcut: 'Ctrl+-', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'insert-table', label: '表格', shortcut: 'Ctrl+T', status: MENU_PLACEHOLDER },
      { id: 'insert-code-block', label: '代码块', shortcut: 'Ctrl+Shift+K', status: MENU_PLACEHOLDER },
      { id: 'insert-math-block', label: '数学公式块', shortcut: 'Ctrl+Shift+M', status: MENU_PLACEHOLDER },
      { id: 'insert-quote', label: '引用', shortcut: 'Ctrl+Shift+Q', status: MENU_PLACEHOLDER },
      { id: 'ordered-list', label: '有序列表', shortcut: 'Ctrl+Shift+[', status: MENU_PLACEHOLDER },
      { id: 'bullet-list', label: '无序列表', shortcut: 'Ctrl+Shift+]', status: MENU_PLACEHOLDER },
      { id: 'task-list', label: '任务列表', status: MENU_PLACEHOLDER },
      { id: 'horizontal-rule', label: '分割线', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'indent', label: '缩进', shortcut: 'Ctrl+[ / Tab', status: MENU_PLACEHOLDER },
      { id: 'outdent', label: '取消缩进', shortcut: 'Ctrl+] / Shift+Tab', status: MENU_PLACEHOLDER }
    ]
  },
  {
    id: 'format',
    label: '格式(O)',
    items: [
      { id: 'bold', label: '加粗', shortcut: 'Ctrl+B', command: 'nativeBold', status: MENU_PARTIAL },
      { id: 'italic', label: '斜体', shortcut: 'Ctrl+I', command: 'nativeItalic', status: MENU_PARTIAL },
      { id: 'underline', label: '下划线', shortcut: 'Ctrl+U', command: 'nativeUnderline', status: MENU_PARTIAL },
      { id: 'strike', label: '删除线', shortcut: 'Alt+Shift+5', status: MENU_PLACEHOLDER },
      { id: 'inline-code', label: '行内代码', shortcut: 'Ctrl+Shift+`', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'link', label: '链接', shortcut: 'Ctrl+K', status: MENU_PLACEHOLDER },
      { id: 'image', label: '图片', shortcut: 'Ctrl+Shift+I', status: MENU_PLACEHOLDER },
      {
        id: 'format-image-more',
        label: '图片',
        children: [
          { id: 'image-move-all', label: '移动所有图片到...', status: MENU_PLACEHOLDER },
          { id: 'image-copy-all', label: '复制所有图片到...', status: MENU_PLACEHOLDER },
          { id: 'image-download-remote', label: '下载远程图片', status: MENU_PLACEHOLDER }
        ]
      },
      { type: 'separator' },
      { id: 'clear-format', label: '清除格式', shortcut: 'Ctrl+\\', status: MENU_PLACEHOLDER }
    ]
  },
  {
    id: 'view',
    label: '视图(V)',
    items: [
      { id: 'command-palette', label: '命令面板', shortcut: 'Ctrl+P', command: 'palette', status: MENU_READY },
      { id: 'toggle-sidebar', label: '切换侧边栏', command: 'toggleSidebar', status: MENU_READY },
      { id: 'show-files', label: '文件浏览器', command: 'toggleFiles', status: MENU_READY },
      { id: 'show-outline', label: '大纲', command: 'toggleOutline', status: MENU_READY },
      { type: 'separator' },
      { id: 'source-mode', label: '源码模式', shortcut: 'Ctrl+/', command: 'toggleSource', status: MENU_READY },
      { id: 'focus-mode', label: '专注模式', shortcut: 'F8', status: MENU_PLACEHOLDER },
      { id: 'typewriter-mode', label: '打字机模式', shortcut: 'F9', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'split-editor', label: '分屏编辑', command: 'toggleSplit', status: MENU_READY },
      { id: 'always-on-top', label: '置顶窗口', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'zoom-reset', label: '实际大小', shortcut: 'Ctrl+Shift+0', command: 'zoomReset', status: MENU_PARTIAL },
      { id: 'zoom-in', label: '放大', shortcut: 'Ctrl+Shift+=', command: 'zoomIn', status: MENU_PARTIAL },
      { id: 'zoom-out', label: '缩小', shortcut: 'Ctrl+Shift+-', command: 'zoomOut', status: MENU_PARTIAL },
      { id: 'fullscreen', label: '全屏', shortcut: 'F11', command: 'toggleFullscreen', status: MENU_PARTIAL },
      { id: 'devtools', label: '开发者工具', shortcut: 'Shift+F12', command: 'toggleDevTools', status: MENU_PARTIAL }
    ]
  },
  {
    id: 'theme',
    label: '主题(T)',
    items: [
      { id: 'appearance-modes', dynamic: 'appearance-modes' },
      { type: 'separator' },
      { id: 'theme-palettes', dynamic: 'theme-palettes' },
      { type: 'separator' },
      { id: 'custom-themes', dynamic: 'custom-themes' },
      { type: 'separator' },
      { id: 'open-themes-folder', label: '打开主题目录', command: 'openThemesFolder', status: MENU_READY },
      { id: 'get-more-themes', label: '获取更多主题', command: 'getMoreThemes', status: MENU_READY },
      { id: 'refresh-themes', label: '刷新主题', command: 'refreshThemes', status: MENU_READY }
    ]
  },
  {
    id: 'help',
    label: '帮助(H)',
    items: [
      { id: 'quick-start', label: '快速开始', status: MENU_PLACEHOLDER },
      { id: 'markdown-reference', label: 'Markdown 参考', status: MENU_PLACEHOLDER },
      { id: 'shortcut-reference', label: '快捷键参考', status: MENU_PLACEHOLDER },
      { type: 'separator' },
      { id: 'github', label: 'GitHub', command: 'openGithub', status: MENU_READY },
      { id: 'report-issue', label: '报告问题', command: 'reportIssue', status: MENU_READY },
      { id: 'check-update', label: '检查更新', command: 'checkUpdate', status: MENU_READY },
      { type: 'separator' },
      { id: 'about', label: '关于 Moxie', command: 'about', status: MENU_READY }
    ]
  }
]

export function flattenMenuItems(items) {
  const result = []
  for (const item of items) {
    if (!item || item.type === 'separator') continue
    result.push(item)
    if (item.items) result.push(...flattenMenuItems(item.items))
    if (item.children) result.push(...flattenMenuItems(item.children))
  }
  return result
}
