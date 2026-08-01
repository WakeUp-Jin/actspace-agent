# 2026-05-29 基础 Bug 开发者手动验收计划

> 生命周期：2026-08-01 丢弃。本验收清单针对 2026-05 的 UI 与运行时，相关区域已经经过多轮重构和后续专项验收；继续按原步骤执行会产生误导。原始内容保留用于追溯当时的验收边界。

## 目标

为 `20260527-bugfix-foundation_代码编完需手动验证.md` 已完成编码的基础 Bug 与可用性修复安排一次开发者手动验收。验收完成后，应能明确判断每个 Bug 是否真实修复、是否存在回归，以及该基础 Bug plan 是否可以从 `active/` 归档到 `completed/`。

## 范围

包含：

- `#1` Bash 审核后状态切换。
- `#7` Markdown GFM 表格渲染。
- `#9` Usage 使用趋势显示。
- `#10` Usage 日、周、月筛选。
- `#11` Usage 运行时假数据清理。
- `#13` 失败工具展示统一。
- `#16` 默认文件创建路径策略。
- 2026-05-28 追加的 Kairos 默认 workspace 边界验证，作为 `#16` 的后台 Agent 补充验收。

不包含：

- 不在本计划中修新 Bug；发现问题后只记录复现、截图、日志和建议归属。
- 不重做 Usage Statistics、工具系统或 Kairos 的功能设计。
- 不验收 `20260527-agent-tool-capabilities.md`、`20260527-frontend-interaction-polish/README.md`、`20260527-right-panel-views.md` 中的独立任务。

## 背景

相关文档：

- `docs/exec-plans/active/20260527-bugfix-foundation_代码编完需手动验证.md`
- `docs/histories/2026-05/20260528-0032-foundation-bug-usability.md`
- `docs/histories/2026-05/20260528-0108-kairos-default-workspace.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `docs/FRONTEND_VERIFICATION.md`

相关代码路径：

- `packages/desktop/src/renderer/components/messages/`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/agent-core/src/tools/tools/write-file/`
- `packages/agent-core/src/tools/tools/edit-file-diff/`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/agent-core/src/kairos/prompt.ts`

已知约束：

- 手动验收以开发者本机 Electron 真实运行结果为准。
- 本地开发启动优先使用 `pnpm dev:log`，排障优先看 `logs/latest-dev.log`。
- 如果验收依赖真实 LLM/API Key，本计划只记录结果，不把密钥、完整外部响应或敏感本地路径写入文档。

## 前置准备

1. 确认依赖和类型检查通过：
   - `pnpm --filter @actspace/agent-core typecheck`
   - `pnpm --filter @actspace/desktop typecheck`
2. 启动桌面端：
   - `pnpm dev:log`
3. 打开 Electron 窗口后确认基础状态：
   - 可以创建/打开会话。
   - 可以发送消息并看到流式回复。
   - `logs/latest-dev.log` 没有启动期致命错误。

## 手动验收清单

### 1. Bash 审核态状态切换

步骤：

1. 让 Agent 执行一个需要审核的 Bash 命令，例如运行测试或构建命令。
2. 等待审核卡片出现。
3. 点击 Allow。
4. 观察同一个工具调用的 UI 状态。

通过标准：

- 点击 Allow 后，审核按钮区不继续停留在可重复点击状态。
- 工具调用进入 running / success / failed / denied / expired / cancelled 中的明确状态。
- 如果命令失败，失败原因能在展开态读清楚。

记录：

- 结果：`pending`
- 截图/日志：
- 备注：

### 2. Markdown GFM 表格渲染

步骤：

1. 让 Agent 输出一段包含 Markdown 表格的回复。
2. 观察中间消息区渲染。
3. 如右侧 Markdown 预览仍参与当前工作流，也同步查看右侧预览。

通过标准：

- pipe table 渲染为真实表格，不显示为原始 pipe 文本。
- 表头、边框和单元格内容可读。
- 中文、inline code 和长文本不会撑破消息区。

记录：

- 结果：`pending`
- 截图/日志：
- 备注：

### 3. Usage 趋势、筛选和假数据清理

步骤：

1. 打开 Usage Statistics 页面。
2. 分别切换 `day`、`week`、`month`。
3. 观察趋势图、热力图、tooltip 和汇总数字。
4. 在没有真实 usage snapshot 的会话上检查空态。

通过标准：

- `day`、`week`、`month` 切换会改变统计范围和图表数据。
- 无真实数据时显示明确空态，不展示运行时 mock 业务数据。
- 有真实数据时，趋势、热力图、tooltip 和汇总数字来自同一份 snapshot。

记录：

- 结果：`pending`
- 截图/日志：
- 备注：

### 4. 失败工具展示统一

步骤：

1. 触发一个可控失败的工具调用，例如错误命令或不存在的文件路径。
2. 观察失败摘要和展开态。
3. 对比 Bash、文件工具、搜索工具的失败展示。

通过标准：

- 失败摘要不会被长命令或长路径撑乱。
- 展开态能看清 command、cwd、exit code、stdout、stderr 或对应工具错误。
- 不出现多层卡片嵌套和混乱滚动条。

记录：

- 结果：`pending`
- 截图/日志：
- 备注：

### 5. 默认文件创建路径策略

步骤：

1. 在普通聊天 Agent 中要求创建一个裸文件名文件，例如 `create hello.md with a short note`。
2. 查看工具结果展示。
3. 在当前 workspace 中确认文件位置。

通过标准：

- 裸文件名默认落在当前聊天 workspace root。
- 工具结果优先展示 workspace 相对路径。
- 用户能从 UI 结果判断文件属于哪个 workspace。

记录：

- 结果：`pending`
- 截图/日志：
- 备注：

### 6. Kairos 默认 workspace 边界补充验收

步骤：

1. 打开 Kairos 页面，确认 Kairos 初始化完成。
2. 检查本机 `<userData>/kairos/config/paths.json`。
3. 确认默认 paths 指向 `<userData>/kairos/workspace/`。
4. 检查 `<userData>/kairos/workspace/notes/` 是否已创建。
5. 如启用 Kairos，观察它的 prompt/工具行为是否默认围绕 Kairos workspace，而不是 app 仓库或普通聊天 workspace。

通过标准：

- 默认 `paths.json` 只授权 Kairos workspace。
- Kairos ToolManager 使用 Kairos workspace 作为执行根。
- Kairos system prompt 中包含 workspace boundary 规则。
- 未显式加入 `paths.json` 的外部项目目录不会成为 Kairos 默认读写目标。

记录：

- 结果：`pending`
- 截图/日志：
- 备注：

## 验收结果汇总

| 项目 | 状态 | 证据 | 后续动作 |
| --- | --- | --- | --- |
| Bash 审核态状态切换 | pending |  |  |
| Markdown GFM 表格渲染 | pending |  |  |
| Usage 趋势、筛选和假数据清理 | pending |  |  |
| 失败工具展示统一 | pending |  |  |
| 默认文件创建路径策略 | pending |  |  |
| Kairos 默认 workspace 边界 | pending |  |  |

状态枚举：

- `pass`：开发者手动验收通过。
- `fail`：复现失败或存在明显回归，需要新 bugfix plan。
- `blocked`：因环境、密钥、外部服务或本地数据缺失无法判断。
- `pending`：尚未验收。

## 收尾动作

- 如果全部为 `pass`：
  - 将 `docs/exec-plans/active/20260527-bugfix-foundation_代码编完需手动验证.md` 移到 `docs/exec-plans/completed/`。
  - 将本验收计划移到 `docs/exec-plans/completed/`，并保留验收结果表。
  - 更新 `docs/exec-plans/README.md` active/completed 列表。
- 如果有 `fail`：
  - 在本计划对应记录项里写明复现步骤、截图位置和日志线索。
  - 新建或更新后续 bugfix plan，不直接扩大本计划范围。
- 如果有 `blocked`：
  - 写清阻塞条件和下次验收需要准备的环境。

## 进度记录

- [x] 创建开发者手动验收计划。
- [ ] 完成 Electron 真实运行验收。
- [ ] 记录每项验收结果和证据。
- [ ] 根据结果归档或创建后续修复计划。

## 决策记录

- 2026-05-28：本计划只负责开发者手动验收，不继续修改功能代码。原因是基础 Bug 计划已全部勾选完成，需要真实 Electron 运行确认用户体验与实现一致。
