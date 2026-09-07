# Agent Journal 观测数据模型

> 状态：当前 v2 Journal 观测边界。2026-09-06 已删除分析观测页面及专用 Analysis / Trace 投影和 IPC；本文保留公共 Journal、Context、Usage 与 Trajectory 的数据和安全边界。

## 目标

Journal 与公共投影需要稳定回答：

- 一次用户请求对应哪个 Agent Run；
- Agent Loop 内发生了多少 Turn 和 Step；
- 每次模型请求使用了什么 snapshot、route 和 model；
- 是否发生 retry、tool call、abort 或 recovery；
- usage、耗时和错误如何归属；
- 当前视图能否只凭 Session Journal 重建。

## 身份层级

```text
sessionId
└── agentRunId
    └── turnId
        └── stepId
            ├── requestId
            └── callId
```

- `sessionId`：持久 Session 身份；
- `agentRunId`：一次用户触发的主 Agent 运行；
- `turnId`：Agent Loop 中的一次 LLM -> Tool -> Result 迭代；
- `stepId`：Turn 内可恢复的执行步骤；
- `requestId`：一次真实 provider request，包括 retry 后的新 request；
- `callId`：一次工具调用。

聊天兼容 DTO 仍可能把 `requestId` 映射为 `llmCallId` 展示。该名称只是 Host projection 兼容层，不能反向改变 Journal 的 request 身份。

## 数据来源

公共投影消费当前 Session 的：

```text
sessions-v2/<sessionId>/journal.jsonl
```

关键事件：

- `turn/started`、`turn/ended`；
- `step/started`、`step/ended`；
- `request/snapshot`；
- `llm/dispatch-started`、`llm/ended`、`llm/error`、`llm/aborted`、`llm/retry`、`llm/usage`；
- `tool/call`、`tool/dispatch-started`、`tool/result`、`tool/denied`、`tool/aborted`、`tool/recovery-outcome`；
- `compaction/started`、`surface/replaced`、`compaction/ended`。

当前实现没有：

- `<session>/traces/<agentRunId>.jsonl`；
- Trace summary sidecar；
- 独立 Trace retention worker；
- 可删除而不影响分析重建的完整 request/response 副本。

因此“Session 是恢复事实、Trace 是可删除证据”的 v1 说法不适用于当前 v2。当前公共投影与 Session 共用同一 Journal 事实。

## Request 观测

`request/snapshot` 在 dispatch 前冻结，至少记录：

- messages；
- rendered system prompt 与 system sections；
- Host / Runtime facts；
- tool definitions；
- contributor provenance；
- route、model、registration 和 adapter version；
- retry policy 与 request options；
- composition 与 host capability digest。

`llm/dispatch-started` 标识副作用边界。其后若进程中断且没有终态，恢复逻辑必须把 request 标记为 `outcome-unknown`，不能假设“未请求”或自动重放。

## Usage 与 retry

- 每个 `requestId` 对应自己的 usage；
- retry 必须保留父请求、失败分类和新请求身份；
- Agent Run / Turn 汇总只能通过事件关联计算，不能覆盖单次 request 事实；
- provider 未返回的 token 或成本保持 unknown，不能补成伪精确值；
- Context token estimate 与 provider usage 分开显示。

## Tool 观测

工具状态至少区分：

```text
prepared
approval-pending
executing
completed
denied
aborted
outcome-unknown
```

公共投影通过 `callId` 关联 definition、args、dispatch、result、artifact 与 failure。模型输出、renderer detail 和 artifact 必须经过 Tool Runtime redaction 与 Projection allowlist，不能直接把 executor 原始对象透传到 UI。

## Projection

`apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts` 提供聊天、Context、Usage 的兼容投影。Trajectory 由 Session projection 提供。专用 Agent Run / Turn 分析汇总与 Trace 读取投影已删除。

投影属于固定 renderer adapter，不属于插件前端。插件只能通过 manifest、service、event 和结构化 renderer hint 提供数据，不能向 renderer 注入任意 HTML / JS / CSS。

## 安全边界

- request snapshot 在写入前拒绝 secret-like 字段；
- Runtime Projection 对文本、错误、artifact 和 tool detail 执行白名单与截断；
- renderer 不接收 Journal 文件路径或任意文件读取权限；
- API Key、Authorization、Cookie、proxy credential、长 Base64 和签名 URL 不得进入 Journal；

## 失败与缺口

- Journal 损坏会同时影响 Session 恢复和 公共投影重建，因此 writer lease、repair 与 forensic copy 是当前可靠性重点；
- 当前不会保存 provider 原始 HTTP wire request / response；
- duration 与部分旧 UI 字段仍可能由 projection 近似或填默认值，必须在 UI 中避免伪装为 provider 精确事实；
- 长会话、真实 Electron 滚动和跨 provider 展示仍需要人工验收。

## 验收

- 给定同一份 Journal，Session、Context、Usage 与 Trajectory 投影结果确定；
- 同一 Agent Run 的 Turn、request、tool 和 retry 能通过 ID 完整关联；
- 进程中断后的已 dispatch request / tool 不会被误判为未执行；
- renderer 无需直接读取本地文件即可展示投影数据；
- 删除任何可再生 UI cache 不影响 Journal 与 公共投影重建；
- Journal 和 projection 中不出现明文凭据或未经限制的外部响应正文。
