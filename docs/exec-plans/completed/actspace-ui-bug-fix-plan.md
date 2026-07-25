# actspace UI Bug 修复计划

## 目标

对当前浏览器 mock UI 做完整验收后，集中修复交互 bug 和设计稿还原偏差。此计划只处理前端工作台 UI，不改 Agent 后端、不改 IPC 契约、不接真实 DeepSeek。

当前验收目标来自：

- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/*.png`

## 当前验收方式

本轮按浏览器 mock 验收，不使用 Computer Use。

验收目标：

```text
http://localhost:5173/
```

当前页面已确认可以在 in-app browser 访问，标题为 `actspace`。

临时验收截图已生成在：

```text
/private/tmp/actspace-ui-qa/
```

截图包括：

- `01-overview.png`：当前首屏。
- `02-context.png`：Context popup 打开态。
- `03-dropdown-overlap.png`：模式和模型下拉重叠态。
- `04-thinking-expanded.png`：Thinking 展开态。
- `05-diff-click.png`：点击 diff 展开后的状态。
- `06-panel-click.png`：点击右侧面板入口后的状态。

## 已通过项

- 浏览器 mock 页面可访问，不依赖 Electron preload 也能渲染。
- 默认首屏是两栏布局：左侧会话栏 + 中间消息区。
- 中间消息流已包含用户消息、助手回复、Thinking、Read、Search、Edit diff、Final reply。
- Context popup 可由 Composer 的圆环入口打开。
- Thinking 可点击展开。
- Read/Search 是同级文本行，没有做成边框卡片。
- Edit diff 是边框卡片，并包含文件名、增删统计和 diff 预览。

## 交互 Bug

### P0：右侧面板入口点击后没有打开面板

现象：

- 点击顶部 `Open panel` 后，按钮进入 active 状态。
- DOM 中没有 `.right-panel`。
- 页面仍保持两栏，不出现右侧 Tab 面板。

已确认代码原因：

- `WorkbenchLayout` 支持 `rightPanelOpen` 参数。
- `RightPanel` 只有 `open=true` 才会渲染。
- `ConversationView` 内的 `Open panel` 按钮目前只是静态按钮，没有把状态传回 `WorkbenchLayout`。

修复方向：

- 在 `WorkbenchLayout` 或 `App` 管理 `rightPanelOpen` 状态。
- 将 `onToggleRightPanel` 传给 `ConversationView`。
- 点击 `Open panel` 后切换 `rightPanelOpen`。
- 面板打开后展示基础 Tab 框架，先用 mock 的 Markdown / Session diff 内容。

验收标准：

- 点击 `Open panel` 后 `.workbench-shell` 增加 `has-right-panel`。
- DOM 中出现 `.right-panel`。
- 页面变为三栏。
- 右侧顶部显示横向 Tab。

### P0：模式下拉和模型下拉会同时打开

现象：

- 点击 `Agent` 打开模式下拉。
- 再点击 `actspace-4.1` 打开模型下拉。
- 两个菜单同时存在，视觉重叠。
- 验收脚本记录：`modeStillOpenAfterModel = 2`，`modelMenuOpen = 1`。

修复方向：

- 打开模式菜单时关闭模型菜单。
- 打开模型菜单时关闭模式菜单。
- 打开 Context popup 时关闭两个菜单。
- 点击菜单外部或按 `Escape` 时关闭当前菜单。

验收标准：

- 任意时刻只允许一个 Composer 浮层打开。
- 点击页面空白处可关闭菜单。
- `Escape` 可关闭菜单。
- 菜单关闭后不会遮挡消息流或 Composer。

### P1：Diff 展开按钮没有实际展开

现象：

- Edit diff 底部存在向下标签按钮。
- 点击后没有更多 diff 内容出现。
- 验收脚本记录：`diffExpandedSignal = 0`。

修复方向：

- `EditDiffBlock` 增加展开状态。
- 默认只显示 4 到 5 行 diff。
- 点击向下标签后展示完整 diff。
- 展开后按钮方向可变为向上标签。

验收标准：

- 默认只显示预览行。
- 点击后展示完整 diff 文本。
- 展开内容仍在同一个边框卡片里，不出现第二个卡片。
- 不出现 `Show full diff` 文本按钮。

### P1：菜单外部点击与 Escape 关闭不稳定

现象：

- 打开模式/模型菜单后，点击部分页面空白区域没有关闭菜单。
- `Escape` 没有稳定关闭菜单。
- 后续点击右侧入口会被菜单状态干扰。

修复方向：

- 为 Composer 浮层加统一的 dismiss 逻辑。
- 可用 `pointerdown` document listener 或组件内 overlay 捕获。
- 保持清理事件监听，避免重复绑定。

验收标准：

- 打开任意下拉后点击消息区、顶部栏、Composer 外部均关闭。
- `Escape` 关闭当前浮层。
- Context popup 的关闭按钮仍可正常关闭。

## 样式问题

### P1：首屏整体还原度尚未达到 `overview-two-column.png`

现状：

- 结构已经接近，但视觉密度、宽度和层级仍偏“网页化”。
- 当前 `message-stack` 宽度为 920px，Composer 宽度为 920px。
- 当前内容视觉重心偏低，Composer 高度偏大。

修复方向：

- 对照 `overview-two-column.png` 调整消息区宽度、顶部留白、消息间距和 Composer 尺寸。
- 保持中间区为主要视觉重心，不让底部输入区过度抢占。

验收标准：

- 首屏截图接近 `docs/design-docs/frontend/overview-two-column.png`。
- 消息流和 Composer 视觉比例自然。
- 1024px 以上桌面宽度不出现内容挤压。

### P1：Composer 仍偏厚，附件占位像示例内容而不是真实附件状态

现状：

- Composer 高度约 164px。
- mock 页面默认固定显示图片附件和 `README.md`。
- 图片附件是纹理占位，不是真实图片本体。
- 发送按钮和 context 圆环基本方向正确，但整体间距仍偏松。

修复方向：

- 明确 Composer 的默认空态与有附件态。
- 默认空态不显示附件。
- 有附件态中，图片只显示图片本体，文件只显示文件名。
- 保持模型选择无边框，发送按钮克制，Context 圆环轻量。

验收标准：

- 默认首屏 Composer 接近 `composer-final.png` 的空态结构。
- 附件态可通过 fixture 或单独 story/mock 展示。
- 模型选择无边框。
- 不显示语音按钮。

### P1：左侧会话栏仍偏宽、偏卡片化

现状：

- 左侧宽度 272px。
- 会话项虽然已经比旧版轻，但选中态仍像浅色卡片。
- `New chat` 和 Search 操作区视觉权重偏高。

修复方向：

- 对照 `sidebar-chat-final.png` 压缩会话项高度与分区间距。
- 弱化按钮阴影和边框。
- 保持 `Session` / `Scheduled` 两个一级分区。
- 底部只保留 `Settings`。

验收标准：

- 左侧更像轻量文本导航，而不是卡片列表。
- 没有 `actspace Pro`、账号卡片或登录卡片。
- 选中态清晰但不厚重。

### P2：助手消息头像与文本节奏还不够接近定稿

现状：

- 助手回复带头像和品牌名，文本流已经可读。
- 与 Cursor 风格参考相比，头像和标题行略抢注意力。

修复方向：

- 缩小头像存在感。
- 让普通回复更像自然文本块。
- 保留必要的模型信息，但弱化视觉权重。

验收标准：

- 助手普通回复不呈现卡片感。
- Thinking、Read/Search 与普通回复保持同一文本流节奏。

### P2：Context popup 可用，但尺寸和锚点需要继续贴近定稿

现状：

- Context popup 内容完整。
- 视觉上已经接近深色参考图。
- 当前位置覆盖消息区较多。

修复方向：

- 对照 `context-popup-final.png` 微调宽度、底部锚点、间距和统计行。
- 保持从 Composer 的 Context 圆环打开。

验收标准：

- Context popup 与 `context-popup-final.png` 结构一致。
- 显示上下文总占用、分段占用条、分类 token、累计 token、压缩次数。

## 修复顺序

1. 先修交互状态管理：右侧面板打开、菜单互斥、外部点击和 Escape 关闭。
2. 再修消息组件行为：Diff 展开。
3. 再做视觉密度：Composer、左侧栏、中间消息区。
4. 最后微调 Context popup 与右侧面板内容样式。

## 验证计划

工程验证：

```sh
pnpm typecheck
pnpm build
```

浏览器 mock 验证：

```text
http://localhost:5173/
```

需要验证的状态：

- 首屏两栏。
- Context popup。
- Mode dropdown。
- Model dropdown。
- Dropdown dismiss。
- Thinking 展开/收起。
- Read/Search 文本流。
- Edit diff 折叠/展开。
- 右侧面板打开/关闭。

Electron 真实验证：

- 本计划修复完成后再使用 `pnpm dev` 做桌面端最终验收。
- Electron 验收只确认桌面壳、preload、IPC、本地 session 没有被前端改动破坏。

## 当前不处理

- 不接真实 DeepSeek。
- 不新增完整设置页。
- 不实现真实 Markdown/HTML/Image/PDF/CSV 渲染器。
- 不实现多文件右侧 Tab 的复杂管理。
- 不做拖拽重排。

## 进度

- [x] 完成浏览器 mock 首屏验收。
- [x] 完成 Context popup 验收。
- [x] 完成模式/模型下拉验收。
- [x] 完成 Thinking 展开验收。
- [x] 完成 Diff 展开点击验收。
- [x] 完成右侧面板入口验收。
- [x] 修复交互 bug。
- [x] 修复样式偏差。
- [x] 完成浏览器 mock 回归验收。
- [ ] 完成 Electron 真实验收。（用户确认本轮暂不执行）
- [x] 更新 history。

## 2026-05-22 修复记录

本轮完成第一批修复：

- 右侧面板入口已经能切换三栏，并渲染基础 Tab。
- Composer 模式下拉、模型下拉和 Context popup 已互斥打开。
- Composer 下拉支持点击外部和 `Escape` 关闭。
- Edit diff 支持折叠预览和展开完整 diff。
- Composer 默认空态更轻，左侧栏宽度和列表密度做了第一轮收敛。

浏览器 mock 回归结果：

- `rightPanelState.hasRightPanel = true`
- `afterMode.dropdownCount = 1`
- `afterModel.dropdownCount = 1`
- `afterOutside.dropdownCount = 0`
- `diffBefore = 10`
- `diffAfter = 16`
- `collapseButtons = 1`
- `context = 1`

已运行：

```sh
pnpm --filter @actspace/desktop typecheck
```

本轮未做 Electron 真实验收，保留给完成流程末尾统一检查。
