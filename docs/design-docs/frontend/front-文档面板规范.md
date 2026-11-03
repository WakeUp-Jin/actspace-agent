# 文档面板规范

更新：2026-11-02。状态：已实施（2026-11-01 功能减法 P4；同日补充：源码可编辑）。2026-11-02 起，正文的预览与源码编辑器改为 CodeMirror 6 实时预览，规则见[Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md)（设计已确认，待实施）；本文下面标「2026-11-02」的条目都以那份规范为准。来源：[01 功能减法设计](../架构优化/01-功能减法设计.md)第 3 节；demo 见 [md-file-tree-demo.html](md-file-tree-demo.html)，用户选定方案 A。

## 定位

「文档」面板取代原来的工作区文件树，是右侧面板里**唯一的文件阅读入口**。它只处理 Markdown：Markdown 是人和 Agent 共用的语言，Agent 能直接读写，人也能直接阅读。其他文件交给系统默认应用（规则见 01 第 2 节）。

它不是文件管理器：不新建、不重命名、不删除文件。它能做三件事：预览、看源码、在源码里编辑并保存。

## 布局

```
┌ 聊天区 ┐┌──────────── 右侧面板 ────────────┐
│        ││ 标签：上下文 轨迹 后台任务 [文档] 改动 │
│        ││┌──────── 正文 ────────┐┌─ 文件树 ─┐│
│        │││ 路径    [大纲][Finder][打开][复制][⇤]││ 工作区   ││
│        │││                      ││ 搜索     ││
│        │││  Markdown 正文        ││ 全部/本会话││
│        │││                      ││ 目录树   ││
│        ││└──────────────────────┘└──────────┘│
└────────┘└───────────────────────────────────┘
```

- 从左到右是**聊天 → 正文 → 文件树**。正文紧挨聊天区，视线从消息移到文档不用跨过文件树；文件树作为导航放在最外侧。这条沿用原 Workspace 文件浏览器“文件树放右栏”的取舍。
- 文件树默认宽 260px，可以收起；收起按钮放在正文顶部操作栏的最右端，离文件树最近。
- 右侧面板可以展开到盖住聊天区，用于专心阅读；再点一次还原。
- 展开时顶栏中间的会话标题和中间栏操作隐藏（聊天区已被盖住），避免和面板的标签行叠在一起；顶栏空白处仍可拖动窗口。
- 方案 A：大纲收在操作栏的「大纲」按钮里，点开是浮层，正文保持最大宽度。不做右侧常驻大纲栏（方案 B 未选）。

## 文件树

### 显示什么

- **保持原有目录结构，只列 Markdown 文件**（`.md`、`.markdown`）。
- **不含 Markdown 的文件夹整个隐藏**，包括所有子孙层都没有 Markdown 的文件夹。
- **按 `.gitignore` 排除**，不列出依赖目录里的 README。
- 文件夹右侧显示其中 Markdown 的篇数。
- 同级排序：文件夹在前，文件在后，各自按名称排序。

### 数据从哪来

一次性取得整棵 Markdown 文件清单，再在前端组装成树：

- 工作区是 git 仓库时，用 `git ls-files --cached --others --exclude-standard -- '*.md' '*.markdown'`。它天然遵守 `.gitignore`，能列出未提交的新文件，而且只有一次进程调用。
- 不是 git 仓库时，退回有上限的递归遍历：跳过 `.git`、`node_modules`、`dist`、`build`、`out` 和以 `.` 开头的目录，超过上限就停止并在树底提示“文件过多，仅显示前 N 篇”。上限数值在实施计划中定。
- 清单只含相对路径，不读文件内容。文件夹篇数由清单直接算出。
- 不挂文件监听。只在三个时机重新获取清单：打开文档面板时、每轮 Agent 结束时、用户点树顶的刷新按钮时。

### 搜索与筛选

- 搜索框按文件名过滤，匹配部分高亮，匹配项所在的文件夹自动展开。只搜文件名，不搜正文。
- 筛选只有两项：「全部」和「本会话改过」。

### 本会话改过

- 当前会话里 Agent 写过或改过的 Markdown，在文件名右侧显示一个绿点。
- 数据来自当前会话里已有的 `edit_diff` / `write_diff` 消息块的 `filePath`，不新增后端能力。
- 「本会话改过」筛选只显示这些文件及其所在文件夹。
- 树底常驻一行图例：「绿点 = 本会话 Agent 写过或改过」。

### 展开状态

- 展开层级记在 `RightPanelContext`，不放在文件树组件里。树会随收起、切换标签反复挂载，状态放在组件里会被清空（沿用原文件树的规则）。
- 换工作区时清空展开层级。
- 首次打开时，若有当前选中的文件，自动展开到它所在的文件夹。

## 正文

### 操作栏

左侧是路径（工作区名弱化，文件名主色）。右侧依次是：

1. 「预览 / 源码」切换。
2. 「大纲」：浮层列出本页 h2、h3，点击平滑滚动到对应标题；没有标题时显示“没有标题”。2026-11-02：标题改从语法树取，预览、源码两种状态都可用。
3. 「在 Finder 中显示」。
4. 「用默认应用打开」。
5. 「复制路径」：复制相对路径。
6. 「收起 / 展开文件树」。

### 预览、源码与编辑

- 打开文件默认是**预览**。2026-11-02：预览和源码**都能直接编辑**，共用同一个编辑器（CodeMirror 6），切换时保留光标、撤销历史和滚动位置；预览是实时预览，语法标记在光标进入时露出。源码状态显示行号、做语法着色。两种状态都支持 ⌘F 查找。细节见[Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md)。
- **保存**：⌘S / Ctrl+S。有未保存内容时，路径里的文件名旁显示圆点。切回预览显示的是未保存的当前内容。
- **未保存时离开**：切换到另一篇文档或关闭文档面板时，提示「保存 / 不保存 / 取消」。
- **与 Agent 改同一个文件**：以人为准。保存时直接写入，不做冲突检测。编辑期间若 Agent 改了文件，照常出现“已变化”提示条，但不打断编辑；保存后提示条消失。
- 只写已存在的工作区内 `.md` / `.markdown` 文件，不新建文件。
- 超过读取上限、内容被截断的文件只读（2026-11-02 起预览、源码两种状态都只读），并提示“文件过大，请用默认应用编辑”，避免保存时丢掉截断部分。

### 渲染要求

2026-11-02 起由[Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md)规定，原来列在“后续渲染做精”里的几项都纳入了这次范围：

- frontmatter 属性卡片；
- GitHub 提示框 `> [!NOTE]` 等；
- 代码块语言名与复制；
- 相对链接与行内代码路径在应用内打开；
- 工作区本地图片；
- 数学公式；
- 源码高亮、行号与查找。

“悬停标题出现 `#` 锚点”不做：实时预览里光标进入标题就会露出 `#`。

安全边界不变：原始 HTML 不执行；外链只放行 `http`、`https`、`mailto`；远程图片不加载。

### 性能

- 只读取并渲染当前打开的那一篇，切换文件时释放上一篇。
- 大文件沿用现有读取上限和“已截断”提示。
- 长文档只渲染可见区域，语法树增量解析（2026-11-02 起，见[Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md)§11）。

### 新鲜度

沿用原规范“文件新鲜度与重新加载”的规则：Agent 编辑事件加上三个时机的 mtime 重校验；检测到变化只显示提示条，由用户点「重新加载」，不自动替换正在读的内容；文件被删除或越界时显示失效说明。

## 打开入口

- 右侧面板标签「文档」。
- 聊天里的交付卡、文件链接，目标是 Markdown 时打开文档面板并在树中选中、展开到该文件。
- 原工作区文件树的入口全部改指向文档面板。

## 空状态

- 没有选择工作区：提示先在顶部选择工作区。
- 工作区里没有 Markdown：正文区显示“这个工作区还没有 Markdown 文档”，文件树为空。
- 未选择文件：正文区提示“从右侧选择一篇文档”。

## 主题与样式

- 只用主题 token 和语义色，浅色、深色都要验过（见[主题与配色规范](front-主题与配色规范.md)）。
- 绿点用 operational 语义色，提示框用 info / success / 正文色 / warning / danger，代码高亮配色随主题翻转。
- 正文的强调色（引用竖条、文件路径、本地链接）默认是信息蓝，与链接色同一条规则；只作用于文档正文，不改应用全局强调色。

## 不做

- 新建、重命名、删除 Markdown。
- 保存时的冲突检测与差异对比。
- 把“用户改了某文件”告诉 Agent（以后与上下文引擎一起设计）。
- 正文全文搜索。
- 文件监听。
- 右侧常驻大纲栏（方案 B）。
- 非 Markdown 文件的任何应用内渲染（图片预览不属于文档面板，保持原有方式）。

## 实施位置（2026-11-01）

| 内容 | 位置（`apps/desktop/src/renderer/` 下，除非另写） |
| --- | --- |
| 面板外壳、正文区、目录树 | `components/right-panel/docs/DocsPanel.tsx`、`DocsReader.tsx`、`DocsTree.tsx` |
| 树模型（组树、搜索高亮、筛选、绿点路径换算） | `components/right-panel/docs/docs-tree-model.ts` |
| 清单获取、草稿 / 保存 / 新鲜度 | `components/right-panel/docs/use-docs-listing.ts`、`use-docs-draft.ts` |
| 编辑器（预览 / 源码，CodeMirror 6；2026-11-02 起，待实施） | `components/markdown-editor/`，见[Markdown 编辑与渲染规范](front-Markdown编辑与渲染规范.md)§15；取代 `docs/MarkdownSourceEditor.tsx` |
| 大纲浮层 | `components/right-panel/docs/DocsOutline.tsx` |
| 离开确认（保存 / 不保存 / 取消） | `components/right-panel/docs/DocsLeaveDialog.tsx`，挂在 `components/RightPanel.tsx` |
| 状态（选中、草稿、展开、筛选、清单） | `components/right-panel/RightPanelContext.tsx` |
| Markdown 预览正文、Mermaid、分块渲染 | `components/right-panel/MarkdownRenderView.tsx`（导出 `MarkdownPreviewBody`）；2026-11-02 起由上一行取代，实施时删除 |
| 交付卡 / 聊天链接 → 文档面板 | `components/files/open-workspace-path.ts` |
| 展开面板盖住聊天区 | `components/SplitView.tsx`（`rightExpanded`）、`components/WorkbenchLayout.tsx`（含文档标签自己的默认宽度 720px）、`components/WindowChromeBar.tsx` + `styles/electron.css`（`data-right-expanded`，展开时隐藏中间标题） |
| 主进程 IPC | `workspaces.listMarkdownFiles`、`workspaces.writeMarkdownFile`：`apps/desktop/src/main/workspace-fs-service.ts`、`main/runtime-v2/desktop-shell-ipc.ts`、`main/ipc/guards.ts`；契约在 `packages/util/shared/src/desktop-bridge/contract.ts`、`ipc.ts`、`runtime-v2/fixed-renderer.ts` |
| 浏览器 mock 数据 | `mock/docs-fixture.ts`、`mock/handlers.ts` |
| 测试 | `test/docs-panel.test.tsx`、`docs-tree-model.test.ts`、`markdown-source-editor.test.tsx`、`markdown-render-view.test.tsx`、`split-view-expanded.test.tsx`；主进程 `main/test/workspace-fs-service.test.ts` 等。2026-11-02 起两个 markdown 测试由 `test/markdown-editor-*.test.ts(x)` 取代 |

实施时的几处取舍（与上文不冲突，补充说明）：

- 面板较窄时，操作栏先收起「在 Finder 中显示 / 用默认应用打开 / 复制路径」三个次要操作（容器宽度小于 460px），保证文件名、未保存圆点、展开面板和收起文件树始终可见。
- 「本会话改过」的绿点来自会话消息里的 `edit_diff` / `write_diff` 路径，换算成相对路径后只保留 Markdown。
- 新鲜度由文档面板自己的 `use-docs-draft.ts` 实现（等价于文件 Tab 的 `useFileFreshness`，但要同时处理未保存草稿）：Agent 把当前文档新加进「改过」集合、挂载、窗口聚焦、turn 结束这几个时机触发 `statFile`，不轮询。
- 保存后重新读取 `mtime`，不弹成功提示；保存失败留在原处并显示错误条。
