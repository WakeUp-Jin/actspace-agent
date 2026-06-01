# 01 Follow-up Composer 视觉与模型菜单

## 目标

将 Composer 默认态从“大块多行输入卡片”调整为贴近 `bug/19-2.png`、`bug/19-3.png` 的底部 `follow-up bar`，覆盖 `#5` 和 `#19`。完成后，默认态是低高度输入栏，上方有 `Review +4253 -5` / `...` 预留操作层，下方有 branch / Local / context usage 状态行；`+` 打开 command menu；模型菜单 hover / focus 时能出现清晰 edit 入口。

## 范围

包含：

- 对照 `bug/19-2.png`、`bug/19-3.png` 重构 Composer 默认态：`Review / overflow` 预留层、follow-up 输入栏、会话状态行。
- 保留品牌蓝：发送按钮、focus ring、Context usage / ring 可以继续使用现有蓝色，不为了参考图改成灰黑。
- 左侧 `+` 不再只是附件入口，而是 command menu 入口；第一版展示 demo 菜单结构：`Add agents, context, tools.`、Plan、Debug、Multitask、Ask、Image、Models、Skills、MCP Servers。
- 输入栏 placeholder 调整为 `Send follow-up`，默认单行低高度，内容较长时再扩展或保持可滚动，不做大面积输入卡片。
- 模型选择移动到输入栏右侧，保持文字化，不加边框；窄窗口下长模型名要截断。
- 输入栏下方状态行展示 branch / Local / context usage；context usage 的颜色可以沿用现有品牌蓝或当前 usage 色。
- 输入栏上方放 demo action strip：`Review +4253 -5` 和 `...`，当前只预留视觉、DOM 和布局空间。
- 对照 `bug/5.png` 修复模型菜单 row hover / focus 状态。
- 可编辑模型 hover / focus 时显示 edit icon 或轻量操作入口。
- 当前选中模型继续显示 check，且不和 edit 操作挤压或重叠。
- 保持 `docs/design-docs/front-聊天输入框规范.md` 的边界：不显示语音按钮，发送按钮轻量，模型选择文字化，默认态是 follow-up bar。

不包含：

- 不实现 `Review +4253 -5` 的真实 review / diff 流程，也不实现 `...` 的真实菜单；只做 demo 与空间预留。
- 不实现 command menu 子项的真实业务功能；第一版只保证菜单打开、结构、样式和互斥行为。
- 不接系统文件选择器；附件真实功能由 `02-attachments-ipc-and-turn-contract.md` 完成。
- 不扩展 Context 内容；Context 弹窗由 `03-context-readonly-popover.md` 完成。
- 不改 run turn 后端契约。
- 不改 Settings 或 Sidebar。

## 背景

相关文档：

- `docs/design-docs/front-聊天输入框规范.md`
- `docs/design-docs/front-全局视觉语言规范.md`
- `docs/FRONTEND_VERIFICATION.md`

相关代码路径：

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/tokens.css`（仅在需要新增全局 token 时修改）
- `packages/desktop/src/renderer/test/**`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`

已知现状：

- `Composer` 当前是大块多行输入卡片：内部包含 mode menu、model menu、context button、send/stop button。
- `bug/19-2.png` / `bug/19-3.png` 的目标更接近底部 follow-up command bar：输入栏低高度、模型在右、branch / Local / usage 在栏外、左侧 `+` 打开 command menu。
- 附件当前是 `imageAttached` / `fileAttached` demo 布尔值，后续计划会替换为真实 attachments 数组。
- `model-edit-button` 已存在，但需要把 hover/focus 显隐、row 布局和可编辑模型判定做得更明确。
- 2026-05-29 后 `deepseek-v4-flash.supportsThinkingToggle = true`，因此 `deepseek-v4-flash` 的 edit 入口应展示 Thinking toggle；如果未来存在没有任何 options 的模型，再由独立 editable 判定控制空态。

## 实施任务

### Step 1: 现状定位

- 读 `Composer.tsx` 中 composer / model / dropdown 相关局部 Tailwind class 常量；如确实涉及全局 token，再读 `styles/index.css` 和 `styles/tokens.css`。
- 确认 `MODEL_LIST` 中哪些模型支持 thinking toggle，并新增或局部定义独立的 editable/options 判定，避免把 edit 入口绑定到 `supportsThinkingToggle`。
- 对照 `bug/19-2.png`、`bug/19-3.png` 写清当前差异：大输入卡片 vs follow-up bar、左侧 mode pill vs `+` command menu、模型位置、状态行位置、Review / overflow 预留层、Context usage 展示、发送 / stop 按钮位置、窗口窄化表现。

验收：

- 在执行记录中写清本阶段 owns Composer 默认态、command menu demo、Review / overflow 预留层、model menu；不 owns 附件真实 IPC、Context 内容和 review 真实交互。

### Step 2: Follow-up shell 布局

- 将 Composer 外层拆成稳定三层：上方 action strip、follow-up 输入栏、下方状态行。
- action strip 放 demo `Review +4253 -5` 和 `...`；保持轻量 pill 风格，不绑定真实数据。
- follow-up 输入栏默认低高度，左侧固定 `+`，中间输入内容，右侧模型 selector、Context ring、send / stop。
- 状态行左侧展示 `main` / `Local` demo 或现有 session/workspace 状态，右侧展示 context usage 百分比或现有 snapshot 百分比。
- 给固定格式控件设置稳定尺寸，避免 hover、usage 变化、模型名变化导致布局跳动。
- 保证窄窗口下按钮不重叠：模型名可截断，状态行可收敛或换行，但输入栏主动作不能互相覆盖。

验收：

- 默认空态看起来像桌面工作台的 follow-up command bar，不像网页聊天大卡片。
- `Review +4253 -5`、`...`、`Send follow-up`、模型名、branch / Local、context usage 不溢出。
- 品牌蓝按钮和 Context usage / ring 保持现有品牌方向。

### Step 3: `+` command menu demo

- 将左侧 `+` 作为 command menu trigger，而不是单一附件按钮。
- 菜单位置参考 `bug/19-3.png`，从输入栏左侧向上弹出。
- 菜单顶部显示弱提示 `Add agents, context, tools.`。
- 菜单项第一版展示 Plan、Debug、Multitask、Ask、Image、Models、Skills、MCP Servers；可用 lucide 图标，但不要引入真实路由或业务状态。
- command menu 与 model menu、model options、Context popup 互斥。

验收：

- 点击 `+` 可以打开 command menu。
- 菜单不会遮住输入栏主动作，不会和 model menu / Context popup 同时打开。
- 菜单项是 demo 入口，不触发附件 IPC 或其他业务功能。

### Step 4: 模型菜单 hover edit

- 将模型 row 拆成稳定的文本列和 actions 列。
- 可编辑模型 hover / focus row 时显示 edit 操作；本阶段 `deepseek-v4-flash` 必须视为可编辑，因为 `#5` 的验收点明确要求它显示 edit。
- 不可编辑模型不显示误导入口；如果未来存在没有任何 options 的模型，应由独立 editable 判定控制，而不是 `supportsThinkingToggle`。
- 当前选中 check 和 edit 操作可同时存在，不互相覆盖。
- 给键盘 focus-visible 状态提供同等可见反馈。

验收：

- hover / focus `deepseek-v4-flash` 时出现 edit 入口。
- 选中模型仍显示 check。
- 点击 edit 不误触发模型选择。

### Step 5: 局部测试

- 补或更新 renderer 测试，至少覆盖：
  - `+` command menu 可打开。
  - command menu 与 model menu / Context popup 互斥。
  - 模型菜单可打开。
  - 支持编辑的模型 row 存在 edit 操作。
  - 点击 edit 不选择模型。

## 风险

- 风险：从大输入卡片改为 follow-up bar 会影响后续附件计划的 DOM 位置。
  - 缓解：保留 `.composer-attachments` 作为固定附件容器，放在 action strip 与输入栏之间，不在本阶段移除入口。
- 风险：`Review +4253 -5` demo 被误解为已接入真实 review。
  - 缓解：组件命名和文档明确为 preview / placeholder，不绑定真实数据，不加入业务回调。
- 风险：`+` command menu 与后续附件入口语义冲突。
  - 缓解：文档中明确 `+` 是“添加能力 / 上下文 / 工具”的总入口，附件真实选择在后续计划接到该入口或其子项。
- 风险：模型 edit 入口和 check 在窄菜单中互相挤压。
  - 缓解：row 使用稳定 grid / flex，actions 列有固定最小宽度。

## 验证方式

- `pnpm --filter @actspace/desktop test -- Composer` 或等价局部测试命令。
- `pnpm --filter @actspace/desktop typecheck`。
- 浏览器 mock 打开 Composer，检查默认态 follow-up bar、Review / overflow 预留层、`+` command menu、model menu hover/focus、状态行和窄窗口。
- 本阶段不强制 Electron 真实验证，因为未涉及 preload / IPC。

## 进度记录

- [x] 完成 Composer / model menu 现状定位。
- [x] 完成 follow-up shell 布局。
- [x] 完成 `+` command menu demo。
- [x] 完成模型菜单 hover edit 入口。
- [x] 完成局部测试。
- [x] 记录验证结果。

## 验证记录

- 2026-05-29：运行 `pnpm --filter @actspace/desktop test -- Composer`，13 个测试文件 / 118 个测试通过。
- 2026-05-29：运行 `pnpm --filter @actspace/desktop typecheck`，通过。
- 2026-05-29：浏览器 mock 打开 `http://127.0.0.1:5173/`，确认默认 follow-up bar、`+` command menu、model menu 与 command menu 互斥、`deepseek-v4-flash` 的 `Edit` 入口可见可点；点击 `Edit` 打开模型 options，未误触发模型切换。
- 2026-05-29：按附件区反馈微调后，运行 `pnpm --filter @actspace/desktop test -- Composer`，13 个测试文件 / 119 个测试通过；运行 `pnpm --filter @actspace/desktop typecheck`，通过。
- 2026-05-29：浏览器 mock 确认 DOM 顺序为 Review 操作层、`Attached files` 附件区、`Send follow-up` 输入栏；附件区内同时包含图片缩略图和 `README.md` 文件 chip，文件名未进入 Review 行或 textarea。

## 决策记录

- 2026-05-28：先执行本计划，再做附件和 Context。理由是附件缩略图、Context 按钮和模型菜单都依赖 Composer 底部布局稳定。
- 2026-05-29：`#19` 的目标不是微调当前大 Composer，而是转向 `bug/19-2.png` / `bug/19-3.png` 的 follow-up bar。保留蓝色品牌动作色和 Context usage 色；新增 `Review +4253 -5` / `...` 作为未来 review 操作的视觉与 DOM 预留。
- 2026-05-29：模型菜单的当前选中行也稳定显示 `Edit`，hover / focus 仍然保留。理由是 `deepseek-v4-flash` 默认选中时也是本轮验收重点，且浏览器自动化暴露出纯 hover 显隐在行内文字、按钮和 overlay 之间可能产生“看得见但点不到”的断层。
