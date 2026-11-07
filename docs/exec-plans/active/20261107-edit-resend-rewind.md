# 编辑提问重发（从某一轮重来）与空闲发送不进队列

## 目标

按设计规范 [agent-edit-resend-rewind.md](../../design-docs/agent-runtime/agent-edit-resend-rewind.md) 实施：

- 消息流里点提问卡片，原地变成输入框；改完发送后，会话从这一轮重来，这一轮之后的轮次从日志和上下文里移除。
- 吸顶提问条去掉展开面板，点它滚回这一轮并进入编辑。
- 空闲会话发送时，消息直接出现在消息流里，不在排队托盘里闪一下。

## 范围

- 包含：规范 §3–§5 的全部条目、§7 列出的测试。
- 不包含：规范 §6 列出的内容（文件回滚、找回被移除轮次的界面、Web 编辑入口、清理 artifacts）。

## 背景

- 规范：上面的设计规范；Task / Run 生命周期见 [agent-task-run-lifecycle.md](../../design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md)。
- 界面依据：用户确认的 demo（A1 方案，编辑器以下整体变淡、不加文字）。结论已写进规范 §5，demo 文件随本计划删除。
- 前端规范同步更新：轮尾与导航（提问条）、中间消息区（提问卡片）、聊天输入框（发送队列）、会话状态与数据流（回退后的重载）。

## 风险

- 风险：重写日志时会话还有别的持有者（子 Agent 管理器、渲染进程订阅、侧边对话）。缓解：回退占住调度，先停后台工作，再走受控的关闭和重写；外部持有的子会话直接返回 `SESSION_BUSY`。
- 风险：seq 变小后，各处「只接受更大 seq」的缓存继续用旧内容。缓解：规范 §3.5 逐项列出并清理；渲染进程用 `reset` 整体替换；集成测试检查新请求的上下文。
- 风险：乐观显示和真实 run 对不上时会闪。缓解：提交时带 `agentRunId`，Host 用这个 id 开始 run。

## 任务

### 后端（顺序依赖，主智能体自己写）

- **B1 事件与存储**：`session/rewound` 编解码；`SessionStorage.rewritePrefix` / `retireInto`（JSONL + 内存测试存储）及测试。
- **B2 切点**：`resolveRewindCut`（agent-service），含收尾事件及测试。
- **B3 调度**：`AgentService.hold`；`ManagedRuns` 的 `#requestedRunIds` 支持 `submitTask` 登记；`SubagentManager.stopAll`；`BackgroundTaskRegistry.forget`。
- **B4 会话控制器**：`RuntimeSessionController.rewrite`（关闭、重写、子会话归档、索引清理、重新打开）。
- **B5 应用层**：`AgentApplication.rewindAndSubmit` 串起整个流程，清上下文实例；transcript 和英语学习监听 `session/rewound`。运行时集成测试。
- **B6 协议与桌面主进程**：`SubmitTaskInput.rewind` / `agentRunId`；`tasks.submit` 处理器；附件 `artifactId` 分支；`registry.rewindAndSubmit`；错误映射；远端 Host `tasks.submit`。

### 前端（依赖 B6 的协议形状，可与 B1–B5 并行）

- **F1 store**：`ClientSessionStore.reset`；bridge 识别 `session/rewound` 后重载；App 清任务快照和本地状态；Web observer 同样处理。
- **F2 空闲发送**：乐观 live run + `agentRunId`；`projectTaskQueue` 跳过正在开始的任务（桌面 + Web）。
- **F3 编辑器**：`TurnPromptEditor`；`TurnPrompt` 可编辑态；下方变淡；发送、失败恢复；编辑内容从任务快照取。
- **F4 吸顶提问条**：去掉展开面板，点击滚动并进入编辑。
- **F5 文档**：前端规范四处更新，`design-docs/index.md` 加入口，删除 demo。

## 验证方式

- 命令：
  - 相关包的 `vitest`（session-persistence-jsonl、session-storage、agent-service、runtime、background-tasks、subagent、client、desktop、web、agent-host）。
  - `pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`。
  - `pnpm check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:ipc-channels`、`check:hot-path-reads`、`check:current-docs`。
- 手工检查：浏览器 mock 下截图编辑态、变淡、吸顶条。
- Electron 实机：规范 §7 最后一条，由用户或 Codex 验收。

## 进度记录

- [x] 2026-11-07 调研与方案收敛，用户确认 demo 与后端方案一。
- [x] 2026-11-07 设计规范。
- [x] 2026-11-07 B1–B6：后端与协议完成，运行时集成测试（五轮回退）、Host RPC 测试通过。
- [x] 2026-11-07 F1–F5：桌面和 Web 前端、App 级用例、四份前端规范更新，demo 已删除。
- [x] 2026-11-07 根目录 typecheck、test 和各检查脚本全部通过；提交、推送、开 PR。
- [ ] Electron 实机验收。

## 决策记录

- 2026-11-07：语义是「重来」而非分叉。用户原话：「12345 五条消息，我从第二条编辑发送的时候，那后面三条就消失了。上下文也是如此 只注入一二条的上下文。」
- 2026-11-07：后端用方案一（归档整份旧日志、重写前缀、释放后重开），不做逻辑隐藏。所有投影仍从日志推出，不需要每个读取方理解「被隐藏」。
- 2026-11-07：运行中的后台任务、子 Agent 回退时停掉；被移除部分里创建的子 Agent 会话移进父会话 `recovery/`。
- 2026-11-07：不新增 IPC 通道，`tasks.submit` 带 `rewind`。理由：回退和接纳新提问必须是一次操作，否则中间状态（已回退、未提交）会被别的写入抢占。

## 执行模式

- **交互模式**。

## 执行文档

- `docs/exec-runs/20261107-edit-resend-rewind/execution-process.md`
- `docs/exec-runs/20261107-edit-resend-rewind/execution-summary.md`
