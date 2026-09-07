# Agent Run 五层职责规范

> 状态：当前 v2 Host、Runtime、Agent Loop、Session Journal 与固定 renderer 的职责边界。

一次用户输入不是“前端调用一个 Agent 函数”。它会依次经过 Host、Profile Bundle Service、Agent Loop、LLM / Tool 服务和 Journal / Projection。任何新能力都必须先判断自己属于哪一层，避免再次把文件系统、Session、模型调用和 UI 状态集中进一个 Runtime 大包。

## 总链路

```text
1. Host input
   Desktop IPC / CLI argv + stdin
        ↓
2. Profile bootstrap + App Bundle Service
   managed ESM loader + BootedProfile + profile-specific service
        ↓
3. Agent semantics
   Session + Scope + Prompt/Context + AgentLoop
        ↓
4. Capability execution
   LLM Service / Tool Runtime / Host ports
        ↓
5. Journal and projection
   journal.jsonl + durable/live/diagnostic projection
        ↓
   Desktop renderer / CLI output
```

## 第一层：Host input

Host 负责把产品输入转换为稳定的 Runtime 请求，不实现 Agent 内核。

### Desktop

当前入口：

- `apps/desktop/src/main/index.ts`：应用启动、数据目录和 Runtime registry；
- `apps/desktop/src/main/runtime-v2/runtime-loader.ts`：managed ESM loader；
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`：一个 Host 一个 Profile root；
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`：typed IPC 与固定 renderer adapter；
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`：credentials、filesystem、tools、browser 等 Host capability。

Desktop renderer 只提交结构化请求和显示 Projection，不直接访问 Node、Journal、Cordis 或插件代码。

### CLI

当前入口：

- `apps/cli/src/cli.ts`：命令和退出码；
- `apps/cli/src/runtime-v2/loader.ts`：managed Runtime loader；
- `apps/cli/src/runtime-v2/host-adapter.ts`：CLI provider 与 Host capability；
- `apps/cli/src/runtime-v2/run.ts`、`chat.ts`：one-shot / TTY 产品语义。

CLI `run` 默认 ephemeral；`--persist` 和 `--resume` 才使用持久 Session Journal。CLI 不维护第二套 Agent Loop。

## 第二层：Profile Bootstrap 与 App Bundle Service

`packages/runtime` 负责：

- 解析 Profile / Bundle / Patch；
- 发现 Static Manifest 与 Codec；
- 激活 Cordis Behavior Entry；
- 装配 Host capability、LLM、Tool、Prompt、Context、Agent 和 Session service；
- 暴露当前进程内的 `BootedProfile`；
- 管理 restart-only 状态和 graceful shutdown。

应用 Bundle Service 是 Host 的产品操作入口，提供：

- create / resume / fork / inspect / export Session；
- run / abort Turn；
- Inbox、Todo、Compaction；
- diagnostics、boot manifest 与 runtime state；
- stop accepting work 与 dispose。

Profile Bootstrap 不拥有 renderer 状态，也不允许 Host deep import 领域 package 的内部 `src/`；Session/Agent 操作由当前 Profile 的 App Bundle Service 提供。

## 第三层：Agent semantics

这一层由独立领域 package 共同完成：

- `packages/core/agent`：Agent descriptor、registry、Inbox、Todo 和终止语义；
- `packages/core/scope`：Agent scope 与 disposer；
- `packages/core/agent-loop`：一次 Agent Run 的循环；
- `packages/session/*`：Journal、persistence、codec、Surface 与 projection；
- `packages/context`：Context contributor assembly；
- `packages/prompt`：Prompt section、Skill 和 request snapshot；
- `packages/compaction`：Surface compaction；
- `packages/subagent`：一次性 Agent / Explore child Session。

`AgentLoop.runTurn()` 的核心顺序：

1. 创建 `agentRunId`、`turnId`；
2. 写 `turn/started`；
3. 从 Session Surface、Prompt contributor、Context contributor 和 Host facts 组装请求；
4. 冻结并写 `request/snapshot`；
5. dispatch LLM；
6. 收集 Assistant content 或 tool calls；
7. 工具调用进入 Tool Runtime；
8. 结果追加到 Journal / Surface；
9. 没有后续工具时写 `turn/ended` 并返回 snapshot。

Agent Loop 不直接读写 renderer，不直接从环境变量取 Key，也不绕过 Tool Runtime 调用具体 executor。

## 第四层：Capability execution

### LLM

`packages/llm/service` 管理 route registry、credential port、prepared request、retry 和 usage；`packages/llm/pi-ai` 隔离具体 wire engine。

每次真实 provider 请求使用独立 `requestId`：

```text
request/snapshot
llm/dispatch-started
llm/ended | llm/error | llm/aborted
llm/usage
```

retry 创建新的 request 身份和 snapshot，不能覆盖失败尝试。

### Tool

`packages/tools/runtime` 管理：

```text
definition
→ argument validation
→ policy
→ approval
→ prepared execution
→ dispatch checkpoint
→ body result
→ ordered commit
```

具体能力位于 `packages/tools/core-tools` 和 `packages/tools/browser-tools`。filesystem、shell、network、artifact、browser 等副作用由 Host port 提供。

### Subagent

Agent / Explore 是一次性 Subagent tool：

- 创建独立 child Session；
- 使用静态 Preset 与受限工具集；
- 与父 Session 通过 lineage 和 delegation event 关联；
- 返回结构化 terminal result；
- 主 Agent 取消时级联取消 child run。

当前 v2 不提供 Team / Room 的长期多 Agent Runtime，也不提供 Kairos。

## 第五层：Journal 与 Projection

持久事实只写：

```text
sessions-v2/<sessionId>/journal.jsonl
```

三类输出必须分开：

| 类型 | 用途 | 是否可恢复 |
| --- | --- | --- |
| Durable projection | Session、消息、工具、usage、Todo、lineage | 可以由 Journal 重建 |
| Live progress | streaming delta、当前工具进度 | 进程退出后可丢失 |
| Diagnostics | boot、plugin、Host capability、restart 状态 | 不进入模型上下文 |

工具流式内容由 Core 区分正文、思考与工具参数；Main `FixedRendererStreamAdapter` 把 prepared/started/finished 事实转换为既有工具事件，实时和历史共用 preview builder。工具参数不进入正文，结果按 Journal 提交顺序逐个发布。详见 [工具流式渲染](../frontend/front-agent-tool-stream-rendering.md)。

Desktop fixed renderer adapter 把 v2 snapshot 和 Journal event 投影为现有 `SessionRecord`、Context 和 Usage DTO。这个 adapter 是 Host 兼容层，不是第二套 Session 模型。

## 身份规则

```text
sessionId
└── agentRunId
    └── turnId
        └── stepId
            ├── requestId
            └── callId
```

- Agent Run 是一次用户触发的完整运行；
- Turn 是 Agent Loop 的一次迭代；
- Step 是可恢复执行边界；
- Request 是一次 provider 调用；
- Tool Call 是一次具体工具调用。

旧 renderer DTO 中的 `llmCallId` 当前映射到 v2 `requestId`。新增后端代码应使用 request 语义，不再制造另一套 ID。

## 取消与关闭

- 用户取消：Host 调用当前 Profile 的 App Bundle Service `abortRun(sessionId)`；
- Agent Loop 把 AbortSignal 传给 LLM、Tool 和 Subagent；
- 已 dispatch 但未确认终态的副作用在恢复时标为 `outcome-unknown`；
- 应用退出：先 stop accepting work，再等待 active run、Session flush、artifact finalizer 和 Cordis effect dispose；
- `dispose()` 必须幂等地返回同一关闭结果。

## 禁止事项

- Host deep import `packages/*/src/**`；
- renderer 直接读取 Journal 或本地凭据；
- Agent Loop 直接执行 shell、filesystem、browser 或 provider SDK；
- 用独立可变 conversation / Context 文件覆盖 Journal；
- 把动态 `import()` 当作完整插件生命周期；
- 在运行中热替换 Plugin Entry；
- 让未来 Team / Room 文档反向定义当前 v2 API。

## 验收

- Desktop 与 CLI 各自通过 `desktop.app` / `headless.runner` 完成 run，并共享同一 Agent 领域语义；
- 同一 Journal 可以重建 Session、Context、Usage 与 Trajectory；
- 每个 request / tool 都能归属到 Agent Run、Turn 和 Step；
- abort 与 shutdown 会等待必要的 flush / dispose；
- Host 与领域 package 只通过公开 exports 和 Service ABI 连接；
- 当前生产路径不出现旧 monolith、`src/plugins/` 或 v1 Session 文件。
