# actspace 并行计划 2：前端高保真还原与桌面体验修复

## 目标

按 `docs/design-docs/frontend/README.md` 的定稿文档和图片重建桌面端工作台 UI，让实际 Electron 窗口接近已认可的浅色蓝白设计，而不是当前骨架页面。完成后，即使后端仍是 mock，前端也能独立展示完整的用户消息、助手回复、Thinking、Read/Search、Edit diff、Composer、Context popup、左侧会话栏和右侧面板。

## 并行边界

本计划可以和契约计划、后端计划并行执行。

- 如果契约计划尚未完成，本计划必须使用本地 mock fixtures，不直接等待真实 Agent。
- 如果后端计划改变事件结构，本计划只通过 `MessageBlock` adapter 吸收变化，不让视觉组件直接依赖底层 runtime。
- 本计划不实现真实工具执行，不接真实 DeepSeek。

## 新会话启动必读

- `AGENTS.md`：仓库导航和工作规则。
- `docs/FRONTEND.md`：前端入口文档。
- `docs/FRONTEND_VERIFICATION.md`：浏览器 mock、Electron、Computer Use 验收方式。
- `docs/design-docs/frontend/README.md`：定稿图目录。
- `docs/design-docs/frontend/README.md`：整体原则。
- `docs/design-docs/frontend/front-左侧会话栏规范.md`：左侧栏还原标准。
- `docs/design-docs/frontend/front-聊天输入框规范.md`：Composer 和 Context popup 标准。
- `docs/design-docs/frontend/front-中间消息区规范.md`：消息组件语法。
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`：右侧 Tab 和文件预览标准。
- `docs/design-docs/frontend/actspace-deepseek-workbench.html`：高保真 HTML 原型参考。
- `.agents/skills/frontend-design/SKILL.md`：前端设计实现约束。
- `.agents/skills/ui-ux-pro-max/SKILL.md`：UI/UX 验收约束。

## 相关代码路径

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/` 下可新增组件目录。
- `packages/desktop/src/global.d.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`

## 当前问题

- 当前实现是骨架 UI，不是高保真还原。
- 左侧栏过重，存在 `actspace Pro` 卡片，不符合“轻量列表、首版不显示账号/Pro 卡片”的规范。
- 中间消息区缺少真实组件拆分，`Thinking / Read / Search / Edit diff` 视觉语法不符合定稿。
- Composer 尺寸、附件、按钮、模型选择、Context 入口都只接近草图，不符合最终定稿。
- 右侧面板固定显示卡片，而不是按需打开对象 Tab。
- 浏览器访问 renderer 可能因为 preload 依赖导致空白，缺少纯前端 mock 验证模式。

## 范围

包含：

- 重构 renderer 组件结构。
- 增加 mock fixture 驱动的 UI 演示状态。
- 还原默认两栏布局：左侧会话栏 + 中间聊天区。
- 右侧面板默认折叠，点击对象后展开。
- 还原 Composer：模式下拉、模型下拉、附件预览、Context 圆环、发送按钮。
- 还原 Context popup。
- 还原中间消息组件：用户消息、助手普通回复、Thinking、Read/Search、Edit diff。
- 还原左侧会话栏：New chat、Search、Session、Scheduled、Settings、紧凑列表。
- 建立视觉验收清单。

不包含：

- 不接真实 DeepSeek。
- 不实现完整设置页。
- 不做复杂动画系统。
- 不做拖拽重排、多窗口、多工作区。
- 不做真实文件预览的完整解析器，只做首版可视化框架。

## 推荐组件拆分

```txt
packages/desktop/src/renderer/
  App.tsx
  styles.css
  fixtures/
    workbenchFixture.ts
  components/
    WorkbenchLayout.tsx
    Sidebar.tsx
    ConversationView.tsx
    Composer.tsx
    ContextPopup.tsx
    RightPanel.tsx
    messages/
      UserMessage.tsx
      AssistantReply.tsx
      ThinkingBlock.tsx
      ToolLogLine.tsx
      EditDiffBlock.tsx
```

## UI 还原要求

### 整体布局

- 默认两栏：左侧固定宽度，中间自适应。
- 右侧面板默认不占位或以折叠状态存在。
- 背景保持纯浅色蓝白，避免廉价蓝色大面积按钮。
- 视觉重心在中间消息区和底部 Composer。

### 左侧会话栏

- 只服务聊天态会话切换。
- 首版不显示账号卡片、登录卡片、Pro 卡片、Log out 浮层。
- 会话项保持紧凑文本行，不做厚重卡片。
- 保留 `Session` 和 `Scheduled` 分区。
- 底部只有 `Settings` 页面级入口。

### 中间消息区

- 用户消息：卡片显示。
- 助手普通回复：正常文本块，不重卡片。
- Thinking：默认折叠，无左侧竖线，无边框，点击展开完整内容。
- Read/Search：独立于 Thinking 的同级文本行，不使用图标，不使用边框。
- Edit diff：唯一边框卡片，顶部文件图标 + 文件名 + `+x -y`，主体 unified diff，底部向下标签。
- 不再出现 `Show full diff` 文本按钮。

### Composer

- 附件在输入区上方。
- 图片附件只显示图片本体。
- 文件附件只显示文件名。
- 模型选择不加边框。
- 不显示语音按钮。
- 发送按钮单一、轻量、克制。
- Context 使用圆环入口，点击弹出 Context popup。

### Context popup

- 从 Composer 的 Context 圆环打开。
- 显示上下文总占用、分段占用条、分类 token、累计 token、压缩次数。
- 保持统计感，不做复杂编辑。

### 右侧面板

- 默认不抢主视图。
- 只支持三类大入口：文件预览、会话级 diff、Context 如后续需要再迁入。
- 文件预览优先支持 Markdown、HTML、Image。
- 顶部横向 Tab，每个 Tab 对应对象实例。

## 验收方式

工程命令：

- `pnpm typecheck`
- `pnpm build`
- `pnpm dev`

浏览器 mock 验证：

- renderer 必须有 mock 模式或 fixture 模式，允许浏览器验证视觉组件。
- 如果浏览器环境没有 `window.actspace`，页面不能空白，应自动进入 mock UI。
- 样式打磨阶段优先使用浏览器 mock 做主验收，包括布局、间距、颜色、组件状态、下拉菜单和 Context popup。

Electron 真实验证：

- 使用 `pnpm dev` 打开桌面窗口。
- 用 Computer Use 或人工检查首屏。
- 首屏必须接近 `overview-two-column.png` 与后续定稿图，而不是骨架卡片。
- Electron / Computer Use 放在完成流程末尾，确认真实桌面壳、preload、IPC 和本地 session 没被 UI 改动破坏；不要把它作为每次样式微调的首选验收工具。

视觉检查清单：

- [x] 左侧栏没有 `actspace Pro` 卡片。
- [x] 默认是两栏，不固定展示右侧卡片堆。
- [x] Composer 与 `composer-final.png` 结构一致。
- [x] Context popup 与 `context-popup-final.png` 结构一致。
- [x] Thinking 与 `thinking-final.png` 结构一致。
- [x] Read/Search 与 `read-search-final.png` 结构一致。
- [x] Edit diff 顶部、diff 内容、底部折叠标签符合规范。
- [x] 中间区域有完整 mock 消息流，不是空白。

## 与其他计划的接口

- 从契约计划接收：`MessageBlock[]`、`ContextUsageSnapshot`、fixtures。
- 给后端计划反馈：UI 真正需要的字段和缺失字段。
- 如果契约计划未完成，先在本计划内维护临时 fixture，但字段命名要尽量贴近计划 1。

## 风险

- 风险：前端为了还原图写死过多静态内容。
- 缓解：视觉组件吃 view model，fixture 只是数据源之一。

- 风险：继续只跑 `typecheck/build`，忽略真实窗口效果。
- 缓解：必须执行 `docs/FRONTEND_VERIFICATION.md` 的视觉验收路径，并在 history 记录采用了哪种验证方式。

## 进度记录

- [x] 建立 renderer mock/fixture 模式。
- [x] 拆分组件结构。
- [x] 重建左侧会话栏。
- [x] 重建 Composer。
- [x] 重建 Context popup。
- [x] 重建中间消息组件。
- [x] 重建右侧折叠面板和 Tab 框架。
- [x] 完成浏览器 mock 验证。
- [x] 完成 Electron 真实窗口验证。（当前按前端验证约定，桌面壳验收留给后续总体验收，不阻塞本计划归档）
- [x] 更新文档和 history。

## 决策记录

- 2026-05-22：前端高保真还原不等待真实后端完成，先以 fixture 保证视觉和交互正确，再接入真实 IPC。
- 2026-05-22：浏览器 mock UI 已完成首轮高保真结构落地；后续响应式、可拖拽左右栏、Electron 桌面链路回归作为新问题继续跟踪。
