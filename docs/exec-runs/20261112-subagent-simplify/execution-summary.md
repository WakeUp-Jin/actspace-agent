# 子智能体简化：临时上下文窗口 + 并入后台任务 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261112-subagent-simplify.md`
- **执行过程**：`docs/exec-runs/20261112-subagent-simplify/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 实机检查未做）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 子智能体默认同步，30 分钟转后台 | `packages/subagent/subagent/src/{manager,messages}.ts` | R1：子智能体是临时上下文窗口，调用直接拿结论 |
| 后台子智能体登记进后台任务登记表 | `manager.ts`、`packages/background-tasks/background-tasks/src/{registry,notification,types}.ts` | R2 / R8：通知、`lost`、`task_*` 只有一份实现 |
| 删 `wait_agent`、`task_wait`、`list_agents`、`interrupt_agent` | `subagent/src/tools.ts`、`tool-background-tasks/src/tools.ts`、`tool-subagent` manifest | R3 / R4：同步调用代替等待，`task_list` / `task_stop` 代替列出与中断 |
| 不续派，`send_message` 只有两个方向 | `manager.ts`、`messages.ts` | R4 / R5 / R6：结束即关闭；主→运行中的子、子→父 |
| 删 `context-subagents`，并进后台任务清单 | `packages/context/context-background-tasks/src/source.ts`、runtime 装配 | R10 |
| 界面：去掉「空闲」，通知行认新旧格式，`task_stop` 停子智能体的行 | `packages/util/shared`、`packages/client/client`、`apps/desktop/src/renderer` | R11 / R12 |
| 文档 | `docs/design-docs/子智能体和后台任务设计规范/`、`collaboration/`、`frontend/`、包 README、契约矩阵 | 按现状重写 |

## 人工验证指引

### 必须验证

1. **同步子智能体**
   - 验证方式：Electron 里让 Agent「派一个探索子智能体读一下 packages/subagent 的结构」。
   - 预期结果：工具卡片一直运行到子智能体结束，Agent 在同一轮里拿到结论；右侧「子 Agent」面板显示「已结束」，没有「空闲」。

2. **后台子智能体与通知**
   - 验证方式：让 Agent「后台派两个子智能体分别调研 A 和 B，你先做别的」。
   - 预期结果：调用立即返回；会话空闲后，子智能体做完会唤醒会话，开头是「子智能体 ‹描述› 已完成」分隔行，点开是结论原文（`<`、`&` 不被转义）。

3. **停止**
   - 验证方式：后台子智能体运行中，在「子 Agent」面板点停止；再让 Agent 自己用 `task_stop` 停另一个。
   - 预期结果：面板停止后，Agent 下一步看到「用户停止了」的通知，不被唤醒；`task_stop` 行读作「停止 ‹描述›」，点描述打开该子智能体；两种都不再收到完成通知。同步子智能体在面板停止时，工具卡片立即结束，结果写着「was stopped by the user」。

4. **结束后发消息**
   - 验证方式：子智能体结束后，让 Agent 再给它发消息。
   - 预期结果：`send_message` 返回「has finished and cannot receive messages」，Agent 应改为新开一个。

5. **老会话**
   - 验证方式：打开一个改动前有子智能体续派、`wait_agent`、`list_agents` 的会话。
   - 预期结果：卡片、通知行、工具行照常显示；之前「空闲」的子智能体显示「已结束」。

### 建议验证

1. **退出与重启**
   - 验证方式：后台子智能体运行中退出应用再打开。
   - 预期结果：会话收到「was interrupted because the app exited」通知，子 Agent 面板显示中断；退出过程不卡。

2. **编辑重发**
   - 验证方式：后台子智能体运行中，编辑更早一轮的提问重发。
   - 预期结果：子智能体被停掉，没有完成通知，重发正常。

3. **浏览器 mock**
   - 验证方式：`?mock=subagent-trajectory`、`?mock=background-tasks`。
   - 预期结果：通知行、来信卡片、「停止 ‹描述›」行、右侧面板状态都和上面一致。

## Agent 已完成的验证

- `pnpm typecheck`、`pnpm lint`：通过。
- `pnpm test`：`test:scripts`（含进程级 Host 测试）通过；各包测试只有 `@actspace/python-runtime` 的 `locate` 一个用例失败，main（eec93876）上同样失败，与本分支无关。
- 单包：`@actspace/subagent` 30、`@actspace/background-tasks` 13、`@actspace/tool-background-tasks` 3、`@actspace/context-background-tasks` 5、`@actspace/runtime` 126、`@actspace/agent-service` 77、`@actspace/session-journal` 117、`@actspace/shared` 251、`@actspace/client` 93、web 141 个用例通过；desktop 全量通过。
- `pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:packages`、`pnpm check:hot-path-reads`、`pnpm check:scale-tests`：通过。
- 契约矩阵已重新生成（`pnpm gen:contract-matrix`）。

## 已知风险和遗留事项

- `@actspace/python-runtime` 的 `locate` 用例在 main 上就失败（期待的 shim 路径为 undefined），需要单独查。
- Electron 实机没跑：上面「必须验证」五项都只有单元测试和 mock 覆盖。
- 同步子智能体运行时不在任务清单里，模型不能用 `task_stop` 停它（父会话本来就在等它）；只有用户能在界面停。
- 30 分钟转后台时如果登记失败，子智能体按编辑重发的方式停掉、不发通知；没有单独的界面提示。

## 后续建议

- 生图、workflow 等以后的后台工作按 `BackgroundTaskSource` 接入登记表，不再各自做通知。
