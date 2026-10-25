# 本轮验收缺陷

基线：`40320e0b38f3f18b36e1a0905b979b7733a4cba4`。只记录，不修复。

## BGT-001 · P2 · 后台 Bash 尚未结束，流式卡片提前显示 Ran

- 影响验收点：A1。
- 方法：真实 Electron 原生 Computer Use、真实 DeepSeek、真实 Bash；主智能体只读核对 Journal 与源码。
- 触发：主会话调用 `bash`，`blockMs: 0`，命令为 `printf BG_SUCCESS_START; sleep 35; echo BG_SUCCESS_DONE`，或者 `printf BG_FAILURE_START; sleep 35; exit 7`。工具立即返回后台任务 ID，而后台进程继续运行。
- 实际：流式回合中两条卡片已经显示 `Ran <command>` 和「后台」。
- 预期：任务尚未 settle 时显示 `Running`；任务实际完成后再显示 `Ran` 或 `Failed`。
- 用户影响：用户无法可靠地从正在展示的卡片区分仍在运行的任务与已完成任务，尤其是最终将失败的后台命令。该问题目前指向流式展示，不代表任务已经提前停止或自动唤醒失败。

### 证据

- 父会话：`86e526a9-9f9e-473f-8fa8-edd4694f29ff`。
- 本地截图（不随仓库分发）：`tmp/codex-acceptance/20261024-background-tasks/g2-bash-running.png`，文件时间 `2026-10-24T10:17:22+08:00`。截图中两条命令标题均为 `Ran`。
- 同一 Journal 的成功任务 seq149 于 10:17:11.845 登记，seq288 于 10:17:46.894 才 settle，退出码 0；失败任务 seq155 于 10:17:21.500 登记，seq399 于 10:17:56.533 才 settle，退出码 7。因此截图时两任务都仍在运行。
- 脱敏事件摘录：本地 `tmp/codex-acceptance/20261024-background-tasks/g2-first-bash-journal-evidence.json`。
- 定向复现再次捕获 `g4-bash-live-start.png`：长命令刚返回后台任务 ID 时显示 `Ran`；同一父回合结束后，`g4-bash-durable-running.png` 中同一卡片变回 `Running`，当时任务确实仍运行。故问题已收敛到实时流式投影与持久投影不一致。

### 源码链路

- `packages/client/src/live/stream-adapter.ts:148` 将立即返回的后台工具结果投影为 preview，并发出 `tool_finished`；preview 的 Bash 状态本应仍为 `running`，见 `packages/client/src/sessions/tool-card.ts:58`。
- `packages/client/src/live/stream-blocks.ts:95` 再经 `getStreamingBashStatus()` 创建实时 Bash 块。
- `packages/client/src/live/stream-blocks.ts:17` 仅保留 `denied` / `expired` / `cancelled`，到第 21 行把 `tool.finished && !tool.isError` 映射为 `success`，覆盖 preview 中后台任务仍运行的状态。
- `apps/desktop/src/renderer/components/messages/BashRunBlock.tsx` 按最终 `message.status` 选择 `Running` 或 `Ran`，因此组件会显示已完成文案。

真实 Computer Use 已验证主回合结束后会恢复为正确的 `Running`。初始成功/失败命令最终完成后的通知与任务状态也已分别核实，不能因此抵消运行期间的错误展示。

## BGT-002 · P3 · 生产 Harness 将 TASK_NOT_FOUND 错转为 BACKGROUND_TASK_FAILED

- 影响验收点：A4 的错误码约定。会话归属隔离有效，没有跨会话数据泄露。
- 触发：新建第二个真实会话，调用 `task_list(activeOnly=false)` 和 `task_output(taskId="bash_1f11cf67-65f6-4978-a844-92487a673b16")`，该 ID 属于第一个会话。
- 实际：list 返回 0，output 正确拒绝并显示 Unknown background task；但持久化工具结果的 `failure.code` 为 `BACKGROUND_TASK_FAILED`。
- 预期：按设计文档 `docs/design-docs/collaboration/agent-background-tasks.md:66`，跨会话查询返回 `TASK_NOT_FOUND`。现有工具测试也断言这一代码。
- 用户影响：模型或其他调用方无法按约定区分任务不存在/不属于本会话与一般后台任务故障；这是错误契约问题，不是隔离失效。

### 证据与根因

- 真实界面：本地 `g2-session-ownership.png`。第二会话 `45aa499f-1779-4c9e-9328-d56f519f0b84` Journal seq114 为 `0 background tasks`，seq183 的 `task_output` 为 failed，message 为 Unknown background task，code 为 `BACKGROUND_TASK_FAILED`。模型回答里自行解释的 TASK_NOT_FOUND 不作为原始结果证据。
- `packages/background-tasks/src/registry.ts` 的 `#require()` 抛出 Host 的 `BackgroundTaskError("TASK_NOT_FOUND", ...)`。
- `packages/tools/background-tasks/src/tools.ts:78` 依赖 `error instanceof BackgroundTaskError` 才保留 code，否则退回 `BACKGROUND_TASK_FAILED`。
- 真实 `profile/harness-artifacts/sha256-ad9282ead5506e6257e2e6e5e1c89117ade1b99d6656b643fca94a12e33ac791/chunk-Q76N3ZKD.js:2` 内联另一份 `BackgroundTaskError`；`background-tasks.js:102` 使用这个副本判断 Host 的异常，类身份不相同。
- 主侧直接加载本轮实际 Host dist 与实际 Harness artifact 做确定性探针：两个错误构造器不相等，Host error 对 bundle class 的 instanceof 为 false。同一 Host registry、相同未知 ID，经未打包工具返回 `TASK_NOT_FOUND`，经真实打包工具返回 `BACKGROUND_TASK_FAILED`，与原生 Journal 一致。
- 现有 `packages/tools/background-tasks/src/test/lifecycle.test.ts` 在同一模块实例中运行，所以该断言通过；没有覆盖实际 Host→已打包 Harness 的异常边界。

建议修复与回归范围见 [修复交接](repair-handoff.md)。本轮没有修改实现或测试。

## BGT-003 · P2 · 约 832 像素窄窗无法打开子智能体右侧面板

- 影响验收点：A11；该尺寸不能查看真实子智能体对话/轨迹。卡片、通知和后台执行本身仍可用。
- 触发：真实 Electron 窗口缩为约 832×760 逻辑像素（截图 1664×1520 physical），侧栏和右栏自动收起；点击已有子 Agent 卡片，或右上「打开面板」。
- 实际：右侧面板未显示，打开按钮的 AX Value 仍为 0；重复通过两个入口均无法停留在打开状态。
- 预期：空间不足以并排展示时，应像更窄屏一样提供覆盖层，或采用另一个可访问的详情入口；不能保留有效的打开按钮却立即关掉面板。
- 证据：本地 `g4-native-light-narrow-panel-attempt.png`；`g4-native-light-narrow-agent-dialogue.png` 实际只含主会话，不能按文件名当成面板通过证据。
- 实际尺寸对照：约 1101 逻辑像素下，浅色真实子对话与轨迹、深色轨迹均显示约 390 宽的右栏，并可切换；800 逻辑像素下，深色覆盖层的对话/轨迹可读，可关闭后重新打开。证据 `g4-native-light-1101-agent-dialogue.png`、`g4-native-light-1101-agent-trajectory.png`、`g4-native-dark-1101-agent-trajectory.png`、`g4-native-dark-800-agent-overlay.png`、`g4-native-dark-800-agent-trajectory.png`。这些对照支持布局空档判断，不代表所有中间尺寸已实测。

### 根因与归属

- `apps/desktop/src/renderer/components/workbench/use-panel-layout.ts:16` 主区最小宽 560，右栏最小宽 320（第 18 行），但紧凑覆盖层阈值第 20 行为 820。
- 容器宽 832 时，第 93 行 `isCompactLayout=false`，不会走覆盖层。点击后 openRightPanel 生效，但第 136 行发现 `832 - 320 < 560`，第 142 行立即 closeRightPanel；左栏隐藏后也没有可行布局。
- 因而从源码可推导 `820 < containerWidth < 880` 的空档；真实 Computer Use 已在约 832 点复现。未实际逐个尺寸操作，不能把整个数值区间称为逐点验证。
- `WorkbenchLayout.tsx:465` 只有 isCompactLayout 时渲染右侧覆盖层。
- Git 显示该文件最近来自 `72dd0a45`（desktop-fe-16 组件拆分），该提交是 `ce19e4d6^` 的祖先；本次后台功能提交未修改该文件。列为本轮发现的既有共享布局缺陷，不归因于本次功能引入。

建议修复与边界回归见 [修复交接](repair-handoff.md)，未实施。
