# 2026-05-27 前端交互与样式补齐计划

## 目标

补齐工作台中用户已经能看到但尚未接入、样式未完成或交互不完整的前端功能。完成后，模型菜单、附件、Context 按钮、Workspace 添加、设置页、会话状态和 Composer 视觉应形成一套可用的桌面端体验。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/全局视觉语言规范.md`
- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/design-docs/frontend-ui/左侧会话栏规范.md`
- `docs/design-docs/frontend-ui/设置页规范.md`
- `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
- `.agents/skills/frontend-design/SKILL.md`

补充素材：

- `2026-05-27的使用bug小记.md`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/5.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19-2.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19-3.png`

## 范围

包含：

- `#5` `deepseek-v4-flash` 鼠标悬浮没有出现 edit 按钮。
- `#6` 附件添加功能不可用。
- `#8` Context 按钮未接入，先做只读弹窗。
- `#12` Workspaces 的增加项目按钮无作用。
- `#17` 设置页面通用样式设置，尤其字体。
- `#18` 会话旁边的状态按钮可用化。
- `#19` 输入框样式调整到补充截图方向。

不包含：

- 不实现 Context 的增删改操作；只读完整 Context 由本计划接 Composer popup，右侧完整视图由 `20260527-right-panel-views.md` 负责。
- 不实现 Skill 后端能力；Skill 数据来源由 `20260527-agent-tool-capabilities.md` 提供。
- 不修 Usage 页面和 Markdown 表格。
- 不实现真实浏览器/文件预览右侧面板。

## 相关代码路径

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/**`
- `packages/desktop/src/renderer/fixtures/**`
- `packages/desktop/src/renderer/styles/**`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/design-docs/frontend-ui/设置页规范.md`
- `docs/design-docs/frontend-ui/左侧会话栏规范.md`

## 并行边界

- 本计划 owns Composer、model menu、attachment UI、Context popup、settings general typography、workspace add entry and session status UI。
- 如果附件需要后端读取文件，只定义前端 IPC 需求并与工具能力计划对齐；不要在本计划里重写 Agent 工具。
- Context popup 只能消费已有 context snapshot / context state，不自行解析 session.jsonl。
- 不修改右侧面板 Tab 架构，避免和 `20260527-right-panel-views.md` 冲突。

## 实施任务

### Task 1: 模型菜单 hover edit 入口

修改目标：

- 对照 `5.png` 修复模型菜单项 hover 状态。
- 可编辑模型显示 edit icon 或操作入口，不可编辑模型不显示误导操作。
- 保持当前选中勾选态和 hover 态不冲突。

验收：

- hover `deepseek-v4-flash` 时出现可点击 edit 入口。
- 选中模型仍显示勾选。
- 键盘 focus 有同等可见状态。

### Task 2: 附件添加功能

修改目标：

- 点击附件按钮打开文件选择。
- 添加图片时显示图片本体缩略图；添加普通文件时显示文件名。
- 支持删除附件，删除按钮默认隐藏，hover/focus 时显示。
- 发送消息时附件随 prompt 进入当前 turn 的输入契约。

验收：

- 可以添加一张图片和一个普通文件。
- 删除附件后不会随消息发送。
- Electron 真实环境可使用系统文件选择能力；浏览器 mock 有 fallback fixture。

### Task 3: Composer Context 只读弹窗

修改目标：

- 点击 Context 圆形入口打开弹窗。
- 展示总占用、分段占用、System prompt、Tools、Rules、Skills、MCP、Subagents、Conversation。
- 只读展示，不提供增删改。

验收：

- Context popup 可打开和关闭。
- 数据优先来自 context state，没有时 fallback 到 latest context snapshot 或 mock 空态。
- 弹窗不遮挡模型菜单状态，任意时刻只有一个 Composer 浮层打开。

### Task 4: Workspaces 添加项目按钮

修改目标：

- 让 Workspaces 增加项目按钮有明确行为。
- 第一版可打开目录选择器并把 workspace 加入列表；如持久化尚未准备好，至少展示不可用原因和后续状态。

验收：

- 点击按钮不再无响应。
- 成功选择目录后左侧 Workspaces 出现项目名。
- 取消选择时 UI 无副作用。

### Task 5: 设置页通用样式与字体

修改目标：

- 接入设置页中的 General / Typography 区域。
- 支持字体选择、字号或界面密度等基础项。
- 如果设置尚未持久化，明确第一版只做本地状态或 mock，并记录后续持久化入口。

验收：

- 设置页视觉符合 `settings-page-final.png`。
- 字体设置改变后至少影响 renderer 可见文本或预览区域。
- 不破坏聊天态返回。

### Task 6: 会话状态按钮

修改目标：

- 在会话列表项旁展示状态按钮或状态点。
- 定义并展示 `idle`、`running`、`waiting_approval`、`failed`、`scheduled` 等状态。
- 点击状态按钮展示简短状态菜单或详情。

验收：

- 当前运行会话、等待审核会话、失败会话可区分。
- 状态按钮不会挤压会话标题和时间。
- 键盘可访问。

### Task 7: Composer 视觉调整

修改目标：

- 对照 `19.png`、`19-2.png`、`19-3.png` 调整 Composer 的尺寸、附件缩略图、底部工具入口、模型/本地状态布局。
- 保持 `docs/design-docs/frontend-ui/聊天输入框规范.md` 的产品边界：不显示语音按钮，发送按钮轻量，模型选择文字化。

验收：

- 默认空态和有附件态都专业、稳定。
- 文本不会溢出按钮或菜单。
- 桌面宽度和较窄窗口下布局不重叠。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- 按 `docs/FRONTEND_VERIFICATION.md` 做浏览器 mock 截图。
- 附件、目录选择、preload/IPC 相关能力必须补 Electron 真实验证。

## 进度记录

- [ ] 确认当前 Composer、设置页和 sidebar 代码结构。
- [ ] 完成模型菜单 hover edit。
- [ ] 完成附件添加与删除。
- [ ] 完成 Context 只读弹窗。
- [ ] 完成 Workspaces 添加项目按钮。
- [ ] 完成设置页字体和通用样式。
- [ ] 完成会话状态按钮。
- [ ] 完成 Composer 视觉调整。
- [ ] 跑完验证，更新必要文档和 history。

## 决策记录

- 2026-05-27：本计划负责前端入口和视觉交互；Context 与 Skill 的后端事实来源分别由已有 context/usage 计划和 `20260527-agent-tool-capabilities.md` 提供。
