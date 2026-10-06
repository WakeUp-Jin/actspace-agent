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

## P2 · 2026-10-06 · 16 T7：ResponseAnnotationPill 要不要从 HoverCard 改成 Popover

**状态**：待用户确认。先按建议 A 执行（不改 Pill），不阻塞后续 T；用户选 B 或 C 时再单独补一个提交。

**现象**：16 的组件表（:69）和决策记录（:131）把 `composer/ResponseAnnotationPill.tsx` 列为改用 `ui/Popover`。但它现在已经是 Radix HoverCard：鼠标悬停 100ms 打开、离开 120ms 关闭，点击也能开关，定位和 Esc 都由 Radix 处理，没有 createPortal，也没有手写定位。改成 Popover 会丢掉「悬停预览」，Radix Popover 只支持点击打开。

**证据**：
- `R/components/composer/ResponseAnnotationPill.tsx:59`：`<HoverCard open={open} openDelay={100} closeDelay={120} onOpenChange={changeOpen}>`。
- 同文件的手写部分只有焦点相关的几处：Esc 后把焦点还给胶囊且不重新打开（`dismissedRef`），Tab 从胶囊进入卡片，卡片失焦时关闭。HoverCard 不管焦点，所以这几处要自己写。
- 悬停预览是批注功能定稿时确认的交互（Composer 批注胶囊，悬停看全部批注、移到原文高亮）。

**可选方案**：

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A（建议，已按此执行） | 不改，继续用 `ui/HoverCard`；在 16 的决策记录里更正这一行 | 悬停预览不变；已经是 Radix 原语，没有手写定位和点外关闭，T7 要清理的东西它本来就没有 | 和计划表不一致，需要改决策记录；焦点的那几处手写代码保留 |
| B | 改成 `ui/Popover`，另写 pointerenter/leave 计时器模拟悬停打开 | 原语统一，焦点进出、Esc 还焦点交给 Popover | 要手写悬停延迟和「从胶囊移到卡片不关闭」的判断，比现在多；HoverCard 已经做好的事要重做一遍，回归风险高 |
| C | 改成 `ui/Popover`，只保留点击打开 | 代码最少，焦点行为最规范 | 去掉了悬停预览，属于交互改动，和批注功能定稿的设计不符 |

**建议**：A。选定后在 16 的决策记录写一行「ResponseAnnotationPill 保留 HoverCard（悬停预览），不改 Popover」，并更正组件表 :69。
