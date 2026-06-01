# 2026-05-27 前端交互与样式补齐计划簇

## 目标

补齐工作台中用户已经能看到但尚未接入、样式未完成或交互不完整的前端功能。完成后，模型菜单、附件、Context 按钮、Workspace 添加、设置页、会话状态和 Composer 视觉应形成一套可用的桌面端体验。

## 入口关系

本目录是 `20260527-frontend-interaction-polish` 的总索引。原单文件计划已拆成 6 个可独立推进的小计划：

1. [`01-composer-visual-and-model-menu.md`](01-composer-visual-and-model-menu.md)：Follow-up Composer 视觉、`+` command menu、Review 预留层与模型菜单 hover edit，覆盖 `#5`、`#19`。
2. [`02-attachments-ipc-and-turn-contract.md`](02-attachments-ipc-and-turn-contract.md)：附件选择、展示、删除与 turn 契约，覆盖 `#6`。
3. [`03-context-readonly-popover.md`](03-context-readonly-popover.md)：Composer Context 只读弹窗，覆盖 `#8`。
4. [`04-sidebar-workspaces-and-session-status.md`](04-sidebar-workspaces-and-session-status.md)：Workspaces 添加项目与会话状态按钮，覆盖 `#12`、`#18`。
5. [`05-settings-typography.md`](05-settings-typography.md)：设置页 General / Typography，覆盖 `#17`。
6. [`06-validation-docs-and-history.md`](06-validation-docs-and-history.md)：整体验证、文档同步、history 与归档收尾。

## Required Reading

执行任一子计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/front-全局视觉语言规范.md`
- `.agents/skills/frontend-design/SKILL.md`

按子计划需要补读：

- Composer / Context：`docs/design-docs/front-聊天输入框规范.md`
- Sidebar / Workspaces / Session status：`docs/design-docs/front-左侧会话栏规范.md`
- Settings：`docs/design-docs/front-设置页规范.md`
- 页面级布局：`docs/design-docs/front-工作台布局与面板交互规范.md`

补充素材：

- `2026-05-27的使用bug小记.md`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/5.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19-2.png`
- `/Users/wakeup-jin/Desktop/actspace-learing-design/bug/19-3.png`

## 总范围

包含：

- `#5` `deepseek-v4-flash` 鼠标悬浮没有出现 edit 按钮。
- `#6` 附件添加功能不可用。
- `#8` Context 按钮未接入，先做只读弹窗。
- `#12` Workspaces 的增加项目按钮无作用。
- `#17` 设置页面通用样式设置，尤其字体。
- `#18` 会话旁边的状态按钮可用化。
- `#19` 输入框从大输入卡片调整到补充截图里的 follow-up bar 方向。

不包含：

- 不实现 Context 的增删改操作；只读完整 Context 由本计划簇接 Composer popup，右侧完整视图由 `../20260527-right-panel-views.md` 负责。
- 不实现 Skill 后端能力；Skill 数据来源由 `../20260527-agent-tool-capabilities.md` 提供。
- 不修 Usage 页面和 Markdown 表格。
- 不实现真实浏览器/文件预览右侧面板。
- 不重写右侧面板 Tab 架构，避免和 `../20260527-right-panel-views.md` 冲突。

## 并行边界

- 本计划簇 owns follow-up Composer、model menu、attachment UI、Context popup、settings general typography、workspace add entry and session status UI。
- 附件只接入选择、展示、删除和 user message 元信息持久化；不要在本计划簇中实现 Agent 对附件内容的深度解析。
- Context popup 只能消费已有 `contextState` / `contextSnapshot`，不自行解析 `session.jsonl`。
- Workspaces 添加项目第一版通过“选择目录并创建该 workspace 下的新会话”形成列表，不引入独立 Workspace 数据模型。
- Settings Typography 第一版优先用 renderer 本地状态或 localStorage，不新增跨进程设置系统，除非子计划执行前重新获批。

## 推荐推进顺序

1. 先执行 follow-up Composer 视觉与模型菜单，因为附件和 Context 弹窗都依赖 Composer 布局稳定。
2. 再执行附件功能，补齐 Electron 文件选择和发送契约。
3. 再执行 Context 弹窗，复用 Composer 浮层互斥机制。
4. 再执行 Sidebar / Workspaces / Session Status，集中处理侧栏交互。
5. 再执行 Settings Typography，避免全局字体设置过早影响前面视觉验收。
6. 最后执行整体验证与文档收尾。

## 总体验证方式

- 工程验证：`pnpm typecheck`、`pnpm build`。
- 浏览器 mock：按 `docs/FRONTEND_VERIFICATION.md` 验证 Composer、Context、Sidebar、Settings 的视觉与普通交互。
- Electron 真实验证：附件文件选择、目录选择、preload/IPC、session 持久化必须在真实桌面窗口里验证。

## 总进度记录

- [x] 完成 `01-composer-visual-and-model-menu.md`。
- [ ] 完成 `02-attachments-ipc-and-turn-contract.md`。
- [x] 完成 `03-context-readonly-popover.md`。
- [ ] 完成 `04-sidebar-workspaces-and-session-status.md`。
- [x] 完成 `05-settings-typography.md`。
- [ ] 完成 `06-validation-docs-and-history.md`。

## 当前剩余范围

截至 2026-06-01，本计划簇剩余实现任务只剩：

- `02-attachments-ipc-and-turn-contract.md`：真实附件选择、发送契约、持久化和 Electron 验证。
- `04-sidebar-workspaces-and-session-status.md`：Workspaces 父级添加目录、workspace 内新建会话、会话状态按钮和详情菜单。
- `06-validation-docs-and-history.md`：在 `02` / `04` 完成后做最终工程验证、浏览器 mock、Electron 真实验证、文档同步、history 和归档准备。

`01` / `03` / `05` 后续只参与回归验收，不再作为实现阻塞项。

## 决策记录

- 2026-05-27：本计划负责前端入口和视觉交互；Context 与 Skill 的后端事实来源分别由已有 context/usage 计划和 `20260527-agent-tool-capabilities.md` 提供。
- 2026-05-28：原单文件计划拆为目录计划簇。`README.md` 只保留索引、总范围和边界，具体实施细节进入 6 个子计划，方便后续分阶段执行和验收。
- 2026-06-01：`01` 已有局部测试、typecheck 和浏览器 mock 记录，计为完成。
- 2026-06-01：`03` 按当前产品边界计为完成：Composer popup 保持轻量只读 context usage / bucket 概览，并提供进入右侧完整 Context 视图的入口；逐条 `contextState.entries` 展示由右侧完整 Context 视图承接，不再阻塞本计划簇。
- 2026-06-01：`05` 代码已落地 Settings 整页接管、Appearance / Typography 本地偏好、字体/字号/主题设置与测试覆盖，计为完成；计划文件同步更新。
