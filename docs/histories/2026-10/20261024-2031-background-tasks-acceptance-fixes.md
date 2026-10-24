## [2026-10-24 20:31] | Task: 后台任务验收缺陷修复（BGT-001 / 002 / 003）

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

按[验收交接](../../exec-runs/20261024-background-tasks-acceptance/repair-handoff.md)修复 Computer Use 验收发现的三个问题。BGT-003 采用方案 A：紧凑布局阈值由主区与右栏最小宽推出。

### 变更与动机

- **BGT-001 后台 Bash 流式卡片提前显示 Ran**：`packages/client/src/live/stream-blocks.ts` 的 `getStreamingBashStatus` 只看启动工具是否返回。现在带后台标识的 Bash 在工具成功返回后沿用 preview 里的任务状态（未 settle 为 running）；前台 Bash、审批、拒绝、中断语义不变。新增 `packages/client/src/test/background-bash-status.test.ts`（原实现 2 例失败）。
- **BGT-002 跨会话访问错误码变成 BACKGROUND_TASK_FAILED**：Harness 制品内联了自己的 `BackgroundTaskError`，`instanceof` 认不出 Host 抛出的实例。`@actspace/background-tasks` 新增 `isBackgroundTaskError()`，按 name + 已知 code + 字符串 message 识别；`task_*` 工具改用它。`lifecycle.test.ts` 新增「复制的错误类」用例（原实现失败），覆盖 output / stop / wait、普通 Error、未知 code 与非法参数。
- **BGT-003 820–880px 打不开右栏**（既有缺陷）：`use-panel-layout.ts` 的紧凑阈值改为 `< MAIN_MIN_WIDTH + RIGHT_MIN_WIDTH`（880）。这一段宽度左侧栏也随之变为覆盖层。`workbench-modules.test.tsx` 新增 820/821/832/879/880/881 边界用例（原实现 821/832/879 失败），旧的「860 关闭右栏」断言改为「保持覆盖层打开」。布局规范与 Environment 文档里的 `<= 820px` 同步改为 `< 880px`。

### 验证与边界

- `pnpm typecheck` 通过；`@actspace/client` 48、`@actspace/background-tasks` 8、`@actspace/tools-background-tasks` 4、`@actspace/desktop` 2021 项通过；desktop build 与 `test:current-docs` 通过；`packages/runtime/dist/default-harness` 已不含 `instanceof BackgroundTaskError`。
- 已知局限：父回合仍在流式时若后台任务中途结束，live 卡片保持 running，回合结束切到持久投影后显示终态（不会倒退）。
- 未处理：OBS-001 退出期 `Agent service is closed` 日志（证据不足）。
- 未验证：真实 Electron 复验（35 秒命令三个时点、两会话 `failure.code`、约 800 / 832 / 900 窄窗打开子智能体详情）。

### 后续真实复验（2026-10-24）

上述验证与未验证项为修复完成时的记录。后续由 Codex 主智能体执行工程与 Journal 检查，`gpt-6.1-sol` 执行原生 Computer Use；本轮完整结果见[复验摘要](../../exec-runs/20261024-background-tasks-acceptance/retest-summary.md)与[逐项交互记录](../../exec-runs/20261024-background-tasks-acceptance/retest-computer-use-results.md)。

- 当前工作区完整 Desktop 构建、Desktop 类型检查和 125 项定向测试通过；没有将此前的全量测试数量当作本轮重跑结果。
- 两会话真实 output / wait / stop 均返回 TASK_NOT_FOUND，错误码修复通过。
- 浅色 800 / 832、深色 832 浮层与深色 900 并排子详情实际打开，对话 / 轨迹切换、关闭重开通过。
- 后台启动器返回时提前 Ran 已修复；后台任务中途完成而父回合仍流式时，卡片仍 Running，直到父回合结束才更新。此边界实际复现，R1 仅部分通过，根因与修复方案已记录，本次没有继续修代码。
- 前台 Bash、完成通知、wait 去重与停止回归通过。首轮 OBS-001 本轮未复现。
- 专属实例已还原主题与窗口并退出，隔离凭据副本已删除；用户实现与测试内容在验收期间未改变。
