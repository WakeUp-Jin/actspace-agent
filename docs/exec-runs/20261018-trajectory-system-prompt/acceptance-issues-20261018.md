# 轨迹显示定向验收问题

2026-10-18；真实 Electron 生产构建；原生 Computer Use 由 `gpt-6.1-sol` 执行。只记录、不修复。

## TRJ-01：上下文详情概述缺少开始时间（P2）

- 验收点：C3。
- 复现：加载复制的旧会话，重载窗口，进入执行轨迹，逐一打开指定 6 条“上下文”行的“概述”。
- 实际：来源、状态、时长 0 毫秒和预览正常；概述中没有开始时间。来源页可查看 kind/id/lifetime。
- 预期：按验收说明，概述应显示事件开始时间。
- 证据：本地 `tmp/codex-acceptance/20261018-trajectory-system/8e-C3-{1..6}-overview.png` 及同名 `.txt`，6 条逐项检查，主代理目视第一条截图。
- 辅助定位：当前 `trajectory/builder.ts` 已提供事件时间；`components/trajectory/details/RecordOverview.tsx` 的 user/context 分支只渲染时长，未接入开始时间。运行时核对 6 条均有 `startedAt`、`durationMs=0`，数据补齐不等于前端可见。
- 范围：不影响独立的系统提示词全文、工具目录、Schema 或轮次验收。

## TRJ-02：父轨迹没有展示已执行的子工具（P2）

- 验收点：F2 的子工具嵌套与 Schema 子项。
- 复现：新隔离会话中委派只读任务，由 agent/explore 子智能体读取 README 前两行；完成后打开父会话轨迹。
- 实际：父 agent/explore 工具结果成功，父轨迹没有“子工具”行或可展开的子调用入口，无法检查子工具 Schema。
- 预期：按验收说明，子工具应嵌在父工具下，标记“子工具”，并能查看 Schema。
- 主机证据：父会话 seq1402 的 agent 和 seq1660 的 explore 均完成，分别关联两个子 Session；各自子会话 Journal 均包含一次真实 `read_file` 调用。子调用存在，但父轨迹没有接入这些跨 Session 事件。
- 本地证据：`tmp/codex-acceptance/20261018-trajectory-system/new-F2-parent-detail.png`、同名 AX，以及 `F2-runtime-evidence.json`。
- 边界：此次是同步委派，不据此认定“后台任务完成通知缺失”；后台通知子项保留未覆盖。

## OBS-01：前两次 Explore 调用失败，原因待定位

真实新会话 seq743、915 的 Explore 结果为失败，界面只显示 `Execution failed`；Journal 的结构化 failure 为 `TOOL_EXECUTION_FAILED / DURABILITY_BLOCKED / phase=body`。之后 agent 与 explore 均成功。现有证据不证明是配置、存储重构或轨迹显示导致，不作根因结论；本次不修复。

## 后续修复（2026-10-18）

TRJ-01 与 TRJ-02 的展示问题已在后续实现修复，并经真实 Electron 定向复验。OBS-01 的父委派持久化失败仍可复现，未被显示修复掩盖；详见[后续执行摘要](../20261018-trajectory-context/execution-summary.md)。

## 后续闭环：OBS-01 已修复

上述失败是当时验收结果。后续已定位为任务查询重复打开 Ledger，误恢复运行中的子任务；现已修复所有权登记。Explore/Agent 真实调用与重载复验通过，详见[子委派修复记录](../20261018-subagent-durability/execution-summary.md)。
