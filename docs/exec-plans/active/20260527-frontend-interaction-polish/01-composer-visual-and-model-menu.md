# 01 Composer 视觉与模型菜单

## 目标

先稳定 Composer 的视觉骨架和模型菜单交互，覆盖 `#5` 和 `#19`。完成后，输入区默认态、有附件态、窄窗口态都不破版，模型菜单 hover `deepseek-v4-flash` 时能出现清晰 edit 入口。

## 范围

包含：

- 对照 `bug/19.png`、`bug/19-2.png`、`bug/19-3.png` 调整 Composer 尺寸、底部工具区、模型/本地状态布局和按钮尺度。
- 对照 `bug/5.png` 修复模型菜单 row hover / focus 状态。
- 可编辑模型 hover / focus 时显示 edit icon 或轻量操作入口。
- 当前选中模型继续显示 check，且不和 edit 操作挤压或重叠。
- 保持 `docs/design-docs/frontend-ui/聊天输入框规范.md` 的边界：不显示语音按钮，发送按钮轻量，模型选择文字化。

不包含：

- 不接系统文件选择器；附件真实功能由 `02-attachments-ipc-and-turn-contract.md` 完成。
- 不扩展 Context 内容；Context 弹窗由 `03-context-readonly-popover.md` 完成。
- 不改 run turn 后端契约。
- 不改 Settings 或 Sidebar。

## 背景

相关文档：

- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/design-docs/frontend-ui/全局视觉语言规范.md`
- `docs/FRONTEND_VERIFICATION.md`

相关代码路径：

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/test/**`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`

已知现状：

- `Composer` 当前有 mode menu、model menu、context button、send/stop button。
- 附件当前是 `imageAttached` / `fileAttached` demo 布尔值，后续计划会替换为真实 attachments 数组。
- `model-edit-button` 已存在，但需要把 hover/focus 显隐、row 布局和可编辑模型判定做得更明确。

## 实施任务

### Step 1: 现状定位

- 读 `Composer.tsx` 和 `styles.css` 中 `.composer-*`、`.model-*`、`.dropdown-menu` 相关样式。
- 确认 `MODEL_LIST` 中哪些模型支持 edit / thinking toggle。
- 对照三张 #19 截图确认当前差异：输入区高度、底部工具区、附件预览、模型文本、发送按钮位置、窗口窄化表现。

验收：

- 在执行记录中写清本阶段只 owns Composer 与 model menu。

### Step 2: Composer 布局基线

- 调整 `.composer-wrap`、`.composer-input`、`.composer-controls`，确保默认态有足够输入空间。
- 明确底部工具区左右布局：左侧 mode / model，右侧 attach / context / send。
- 给固定格式控件设置稳定尺寸，避免 hover、附件、模型名变化导致布局跳动。
- 保证窄窗口下按钮不重叠，长模型名可截断或收敛。

验收：

- 默认空态看起来像桌面工作台输入区，不像普通网页表单。
- 输入 placeholder、模型名、按钮文本不溢出。

### Step 3: 模型菜单 hover edit

- 将模型 row 拆成稳定的文本列和 actions 列。
- 可编辑模型 hover / focus row 时显示 edit 操作；不可编辑模型不显示误导入口。
- 当前选中 check 和 edit 操作可同时存在，不互相覆盖。
- 给键盘 focus-visible 状态提供同等可见反馈。

验收：

- hover / focus `deepseek-v4-flash` 时出现 edit 入口。
- 选中模型仍显示 check。
- 点击 edit 不误触发模型选择。

### Step 4: 局部测试

- 补或更新 renderer 测试，至少覆盖：
  - 模型菜单可打开。
  - 支持编辑的模型 row 存在 edit 操作。
  - 点击 edit 不选择模型。

## 风险

- 风险：先改 Composer 视觉可能影响后续附件计划的 DOM 位置。
  - 缓解：保留 `.composer-attachments` 作为固定附件容器，不在本阶段移除入口。
- 风险：模型 edit 入口和 check 在窄菜单中互相挤压。
  - 缓解：row 使用稳定 grid / flex，actions 列有固定最小宽度。

## 验证方式

- `pnpm --filter @actspace/desktop test -- Composer` 或等价局部测试命令。
- `pnpm --filter @actspace/desktop typecheck`。
- 浏览器 mock 打开 Composer，检查默认态、model menu hover/focus、窄窗口。
- 本阶段不强制 Electron 真实验证，因为未涉及 preload / IPC。

## 进度记录

- [ ] 完成 Composer / model menu 现状定位。
- [ ] 完成 Composer 布局基线调整。
- [ ] 完成模型菜单 hover edit 入口。
- [ ] 完成局部测试。
- [ ] 记录验证结果。

## 决策记录

- 2026-05-28：先执行本计划，再做附件和 Context。理由是附件缩略图、Context 按钮和模型菜单都依赖 Composer 底部布局稳定。
