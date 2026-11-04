# S4 Fork

## 目标

新增 `agent_fork`：子智能体继承父会话到「当前轮最后一个完整步骤」为止的上下文，与父会话同一份系统提示词、工具列表与模型，首个请求命中父会话的 prompt cache。其余行为与 `local` 子智能体相同。

## 范围

- 包含：设计 [02](../../../design-docs/子智能体和后台任务设计规范/02-子智能体设计规范.md) §2.2、§5.1 的 fork 行、§8。
- 不包含：界面（S6）。

## 必读

- 设计 02 §8、[01 Q7](../../../design-docs/子智能体和后台任务设计规范/01-设计决策.md)
- `packages/side-chat/side-chat/src/{boundary.ts,plugin.ts}`（`resolveSideChatBoundary`、`isQuietPrefix`、`store.fork` 用法）
- S3 完成的 `packages/subagent/subagent/src/{manager.ts,activation.ts,preset.ts}`
- `packages/core/runtime/src/harness/agent-factory-plugin.ts`（主会话与子会话两条组装路径的差异：提示词来源、`extensions(sessionId, scopeId, "main" | "subagent")`、上下文来源）
- DSH：`tmp/deepseek-harness/packages/subagent/subagent-fork-in-process/`

## 步骤

1. **边界**：`packages/subagent/subagent/src/fork-boundary.ts`：输入父会话事件与本次调用的 `callId`，找到包含该调用的步骤，返回它之前最后一个 `step/end` 的 seq；该步骤是本轮第一步时返回其 `step/start` 前一个事件的 seq。断言边界内没有未结束的工具调用（复用 `isQuietPrefix` 的检查，放宽「当前轮未结束」这一条）。
2. **复制**：`manager.spawnFork(...)`：`store.fork({ parentSessionId, boundarySeq, newSessionId, createdAt, createdWith: 父会话的 createdWith, origin: "delegation" })`，头部 `lineage` 带 `parentCallId`、`delegationDepth: 1`、`inheritedThroughSeq: boundarySeq`。若 `store.fork` 不支持 `origin: "delegation"` 或新字段，在 `packages/session/session-storage`（`fork` 实现所在包，grep `fork(`）里放开。
3. **补齐**：子会话追加 `turn/end`（`reason: "forked"`；在 `core-codecs.ts` 的 `turn/end` 校验里加这个取值），然后照 S3 的激活流程开始第一轮，用户消息 = `prompt` + 设计 02 §7 说明。
4. **按主会话组装**：`createLoop` 增加 `role: "fork"`：
   - 提示词来源与扩展按 `"main"` 取（包括只给主会话的提示词扩展，如会话历史提示）；
   - 工具列表与父会话当前可见工具完全相同；
   - 上下文来源与主会话相同，但不加 `context-subagents` 与 `context-background-tasks`；
   - 工具执行前拦下 `general` 预设去掉的那些工具（设计 02 §5.1），返回 `Subagents cannot use <name>.`；拦截写在工具执行路径上（`scopedToolEnvironment` 的 subagent 分支），不是从列表里删。
   - 审批、权限、Bash 不转后台与 S3 相同。
5. **模型**：`model` 未给时用父会话当前的模型、思考开关与档位（不读「子智能体默认模型」设置，否则用不上缓存）；给了就用给的。在 `messages.ts` 的 `agent_fork` 描述里已说明换模型会失去缓存。
6. **登记**：父会话 `subagent/spawned` `kind: "fork"`、`inheritedThroughSeq`；结果 detail 带 `actspace.context.trace`。
7. **工具注册**：`tool-subagent` 注册 `agent_fork`，描述与参数逐字照设计 02 §2.2。

## 验证

- `fork-boundary` 单测：第一步内 fork、第三步内 fork、同一步里并行的其他工具调用、本轮还没有完整步骤。
- 缓存一致测试（关键）：用录制型 fake LLM 捕获请求，父会话跑两步后在第三步调用 `agent_fork`；比对 fork 子会话首个请求与父会话第三步请求：系统提示词相同、工具定义相同、消息数组在边界处之前逐项相同；之后只多出 fork 的 `turn/end` 带来的差异与新用户消息。
- 委派工具在 fork 里调用返回拦截错误；`task_*`、`plugin_manager` 同样。
- fork 子智能体续派、通知、transcript（跳过继承段、头部指回 `[#boundary]`）。
- 真实模型（手工，DeepSeek 或 Anthropic 任一）：fork 首个请求的 usage 里缓存命中 token 接近父会话上一请求的输入 token，记录到执行过程文档。
- 统一验证命令。

## 回滚

revert 本提交即可；`agent_fork` 消失，已创建的 fork 子会话仍按普通子智能体读取（`inheritedThroughSeq` 由 S1 支持）。
