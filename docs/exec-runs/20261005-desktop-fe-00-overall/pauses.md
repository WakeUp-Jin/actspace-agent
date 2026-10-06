# 暂停记录

每条写明时间、计划和 T、现象、证据、可选方案（含优缺点）、建议。用户决定后写进对应计划的决策记录。

## P1 · 2026-10-06 · 15 T7：Host 已连接但报告 draining / blocked，readiness 没有对应取值

**状态**：已决定（2026-10-06，用户选方案 A）。已写进 15 的决策记录，并同步 06 §4.5 的表格。实现见 15 T7（`16faebb0`），不需要再改代码。

**现象**：15 的决策记录把 readiness 定为 10 种（`ready`、`connecting`、`offline`、`revoked`、`incompatible`、`removed`、`describing`、`describe-failed`、`workspace-missing`、`model-missing`），要求「`ready` 当且仅当可以发送」。但 Host 连上并 describe 成功之后，还可能自己报告不接受新任务，这种情况落不进这 10 种。

**证据**：
- `packages/shared/src/host-protocol/index.ts:17`：describe 的 `state` 为 `"ready" | "draining" | "blocked"`。
- `packages/agent-host/src/lifecycle.ts`：`draining` 表示 Host 正在停止，`blocked` 表示启动时任务恢复失败，或运行中被 `block()`。
- `packages/agent-host/src/rpc.ts:62`：非 `ready` 时所有写操作返回 `MAINTENANCE` 或 `RECOVERY_BLOCKED`（"Host is not accepting new work"），发了也会失败。
- 改造前的 `useRemoteTarget.canSend` 已经要求 `description.state === "ready"`，只是界面统一显示「Host 未就绪，草稿仍可编辑」。`host-feedback` 的「blocked Host」用例覆盖的正是这种情况。

**可选方案**：

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A（已实现） | 新增第 11 种 `host-unavailable { hostState }`。状态行显示「暂不接受任务」；tooltip 为「{host} 正在停止，暂不接受新任务」（draining）或「{host} 恢复上次的任务时出错，暂不接受新任务」（blocked） | 原因准确，用户知道不是网络问题，也不用去设置里重连；「ready 当且仅当可发送」继续成立 | 比 06 §4.5 的表多一行文案，09 做状态点时要多覆盖一种；改了已定的取值集合 |
| B | 不加新取值，并入 `describe-failed`，error 写成「Host 正在停止」等 | 取值集合不变，09 不用改 | 「读取失败（可点击重试）」会误导：重试 describe 也不会好；语义混在一起 |
| C | 并入 `offline` | 取值集合不变，文案现成 | 「离线，前往设置重新连接」是错的：连接正常，重连没有用 |

**建议**：A。状态点 tone 用黄点（pending），因为 draining 和 blocked 都需要等 Host 一侧处理。选定后，把这一条写进 15 的决策记录，并同步 06 §4.5 的表格。
