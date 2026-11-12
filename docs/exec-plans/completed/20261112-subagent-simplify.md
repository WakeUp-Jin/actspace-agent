# 子智能体简化：临时上下文窗口 + 并入后台任务

## 目标

按 [01-设计决策 · 2026-11-12 简化](../../design-docs/子智能体和后台任务设计规范/01-设计决策.md) 的 R1–R12：子智能体默认同步、不续派、结束即关闭；后台子智能体作为 `kind: "agent"` 登记进后台任务登记表，由 `task_list` / `task_output` / `task_stop` 管理；删除 `wait_agent`、`task_wait`、`list_agents`、`interrupt_agent` 和 `context-subagents`；`send_message` 只有主→运行中的子、子→父两个方向。

## 范围

- 包含：`packages/subagent/*`、`packages/background-tasks/*`、`packages/context/context-background-tasks`、删除 `packages/context/context-subagents`、`core/runtime` 装配、`core/agent-service` 的停止与忙碌判断、`util/shared` 的状态与标签、桌面 / Web 的通知行与子 Agent 状态、测试、设计文档与 README、history。
- 不包含：fork 边界与缓存、外部 CLI 后端本身、transcript 渲染、子 Agent 面板的布局、老会话事件的迁移（只读兼容）。

## 背景

- 相关文档：`docs/design-docs/子智能体和后台任务设计规范/01–05`、`docs/design-docs/collaboration/agent-subagent-runtime.md`、`agent-background-tasks.md`、`docs/design-docs/frontend/front-子Agent与后台任务规范.md`。
- 相关代码：`packages/subagent/subagent/src/{manager,messages,tools,preset,types}.ts`、`packages/background-tasks/background-tasks/src/{registry,types,notification}.ts`、`packages/background-tasks/tool-background-tasks/src/tools.ts`、`packages/core/runtime/src/harness/agent-runtime-plugin.ts`、`packages/core/runtime/src/startup/boot.ts`、`packages/core/agent-service/src/application.ts`。
- 已知约束：登记表的 `background/task` 编解码器已接受 `kind: "agent"`；老会话里有 `subagent_notification`、`trigger: "message"`、`delivery: "wait"` 等事件，必须照常读。

## 关键设计

1. **登记**：`SubagentManager` 新增选项 `backgroundTasks`（登记表）。`background: true` 的调用在写完 `subagent/*` 事件后登记；同步调用等满 30 分钟时再登记。Source：`taskId = agentId`、`kind: "agent"`、`agent: { transcriptPath, label }`、`done` = 激活结束映射成 `completed / failed / stopped`、`output` = transcript 尾部、`stop` = 中断激活。
2. **通知**：登记表负责通知与唤醒；管理器不再自己投递。`kind: "agent"` 的通知带 `<description>`、`<transcript>`、`<closing_message>`。
3. **停止**：`task_stop` → 登记表压掉通知 → `source.stop`。界面停止按钮仍调 `interruptSubagent`：已登记的走登记表 `stopByUser`，同步的直接中断（父会话那次工具调用返回中断结果）。
4. **重启**：登记表 `reconcile` 认 `kind: "agent"` 且带 `outputPath`（新格式）的开始事件，标 `lost` 并通知；`recoverLost` 只补写子智能体树的 `lost`，不再发通知。
5. **退出**：先关登记表（停掉后台任务，不写结果），再关管理器；管理器对 `host-shutdown` 原因的结束不写日志。
6. **编辑重发**：`stopAll` 对已登记的子智能体走登记表 `stop(…, "rewind")`，不发通知。
7. **send_message**：主会话只能发给运行中的子智能体；子智能体只能发给父会话；已结束返回错误。

## 风险

- 风险：登记表与管理器两边的结束顺序出错，导致重复通知或退出时写日志。缓解：每条路径（完成、task_stop、用户停止、编辑重发、退出、重启）各有测试。
- 风险：删除 `context-subagents` 包牵动 lockfile 和装配清单。缓解：跑 `pnpm install`（带代理）、`check:packages`、`check:docs`、plugin-catalog 测试。

## 里程碑与验证

| 步骤 | 内容 | 验证 |
|---|---|---|
| M1 | 登记表：`kind: "agent"`、删 `wait`、通知格式、`reconcile`；`tool-background-tasks` 三个工具与描述 | `pnpm --filter @actspace/background-tasks test`、`--filter @actspace/tool-background-tasks test` |
| M2 | 管理器：默认同步、登记、不续派、`send_message` 规则、删三个工具与 `running()`；文字 | `pnpm --filter @actspace/subagent test`、`--filter @actspace/tool-subagent test` |
| M3 | 上下文清单合并，删 `context-subagents`；runtime 装配与 boot 端口；application | `pnpm --filter @actspace/context-background-tasks test`、`--filter @actspace/runtime test`、`--filter @actspace/agent-service test` |
| M4 | shared 状态与标签、client 列表、桌面 / Web 通知行 | `pnpm --filter @actspace/shared test`、`--filter @actspace/client test`、desktop 相关测试 |
| M5 | 文档、README、契约矩阵、history | `pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:packages` |
| M6 | 全量 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm check:hot-path-reads`、`pnpm check:scale-tests` |

## 进度记录

- [x] M1 登记表与任务工具
- [x] M2 子智能体管理器与工具
- [x] M3 上下文、装配、application
- [x] M4 shared / client / 界面
- [x] M5 文档
- [ ] M6 全量验证

## 决策记录

- 2026-11-12：用户确认 R1–R12，授权直接实现，不需要审阅计划。
- 2026-11-12：`task_output` 读子智能体只在描述里约束，不在代码里拦（用户决定）。

## 执行模式

- **交互模式**：用户在线但已授权直接完成。

## 执行文档

`docs/exec-runs/20261112-subagent-simplify/` 下的 `execution-process.md` 与 `execution-summary.md`。
