# 打磨桌面工作台宽屏与工具菜单

## 用户诉求

统一修复桌面工作台中影响扫描和宽屏使用的问题：右侧对象面板扩展不足、Terminal 底部出现无意义横线、Review 和 Environment 图标语义不准确，以及 Slash Function 菜单信息重复且描述位置拥挤。

## 主要改动

- 右侧对象面板移除 `640px / 50vw` 硬上限，按左侧栏和中间聊天区的受保护宽度动态计算最大值。
- Terminal 运行态移除常驻状态栏并隐藏 xterm 水平滚动层；退出或错误时继续提供状态和重启入口。
- Review options 与 Files 入口使用指定 Lucide 语义图标，Workspace Environment 入口改用 `Bookmark`。
- Slash Function 菜单改为单行的“小图标 + `/command` + 右侧描述”，保留 Skills 原有信息结构。
- 增加宽屏边界、图标映射、Slash 布局和 Terminal 终态状态栏回归测试。

## 设计动机

右侧 Terminal、Review 和文件预览在宽屏上可能成为主要工作区，因此最大宽度应由真实剩余空间决定。菜单则应减少同义信息，让稳定命令名和操作描述形成清晰的左右扫描关系；状态 chrome 只在用户需要处理异常时出现。

## 关键文件

- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/right-panel/TerminalRenderView.tsx`
- `packages/desktop/src/renderer/components/review/ReviewToolbar.tsx`
- `packages/desktop/src/renderer/components/workspace/WorkspaceChromeControls.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/design-docs/frontend/front-composer-slash-command.md`
