# Bash 执行模型开发计划（总览）

从 `docs/design-docs/agent-bash工具设计文档.md` 派生的实施计划组。目标：把 bash 工具从「同步执行 + 超时杀进程」升级为「输出有界 + 超时转后台 + 事件通知」的执行模型。

## 计划拆分与依赖

| 计划 | 消费设计 Phase | 依赖 | 状态 |
| --- | --- | --- | --- |
| `01-output-pipeline.md` | E1 输出管道收口 | 无 | 已完成（2026-07-03） |
| `02-background-tasks.md` | E2 后台运行 MVP + E3 blockMs 语义切换 | 01 | 代码完成，待手工验收（2026-07-03） |
| `03-output-subscription-watchdog.md` | E4 输出订阅与卡死看门狗 | 02 | 代码完成，待手工验收（2026-07-03） |
| （未立项）沙盒执行层 | E5 | 与 `agent-bash-policy-allowlist-design.md` Phase 3 合并立项，另行开计划 | — |

E2 与 E3 合并为一份计划：两者触碰同一批文件（executor / run-process / definition / 前端 bash 块），拆开会导致同一文件被两轮重构。E3 的行为兼容影响（`timeoutMs` → `blockMs`）在计划内单独标注。

## 必读文档（新会话 / 子 Agent 先读）

1. `AGENTS.md`
2. `docs/design-docs/agent-bash工具设计文档.md`（设计事实来源，所有语义问题以它为准）
3. 本 README + 对应子计划

## 共享契约的唯一权威

- 前端预览 / IPC 事件 / 任务状态字段：`packages/shared/src/session.ts`（`ToolUiPreview` 的 bash 分支、`RuntimeStreamEvent`）。禁止在 desktop / agent-core 各自发明任务状态类型。
- 任务注册表类型：`packages/agent-core/src/tools/tools/bash/task-registry.ts`（Plan 02 创建）。
- 通知文本格式（`<task_notification>` XML）：`task-registry.ts` 内的格式化函数，bridge 只透传。

## 关键架构事实（写计划时已核实）

- Agent 与其依赖是**每 turn 新建**的（`packages/desktop/src/main/agent-turn.ts` → `createAgentForSession`）。后台任务注册表必须放在能跨 turn 存活的位置：agent-core 模块级单例（对照 `agent-turn.ts` 的 `activeTurnAborts` 先例）。
- `engine/loop.ts` 的 `getSteeringMessages` 在每次 LLM 调用前（含首次）被拉取，是通知注入的现成入口；但 `engine/bridge.ts` 尚未把它接到 `Agent` 构造参数，需要接线。
- 推流通道：turn 进行中走 `onStreamEvent`；turn 结束后 main 进程仍可随时 `win.webContents.send("agent:stream", …)`（对照 `context-compact.ts` 先例）。
- 输出落盘路径复用 `packages/agent-core/src/tools/tool-output-paths.ts`，清理复用 `cleanup-tool-outputs.ts`。

## 全局验证

- `pnpm typecheck`
- `pnpm test`
- 手工验收：`pnpm dev:log` 启动后按各子计划的手工检查项走一遍，日志在 `logs/latest-dev.log`。
