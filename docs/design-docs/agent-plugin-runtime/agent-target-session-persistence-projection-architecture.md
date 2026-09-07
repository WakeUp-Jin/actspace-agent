# Session 持久化事实源与投影架构

> 状态：目标设计已确认，待执行计划实施。
>
> 日期：2026-08-30。
>
> 本文不重新定义 13 种 Session 核心事件、持久化扩展事件、9 个 Agent Loop 插入面或 5 个通知事件。它定义这些事实如何被持久化、重放、投影并提供给 Desktop、CLI 和后续 Trajectory 视图。

## 1. 目标

ActSpace 将 Session 设计为一次 Agent 运行的唯一持久化事实源。所有对话、工具、Agent Loop、Context、Approval、Retry、Compaction、Plugin/Hook 和恢复事实先进入 Session Journal；Conversation、Context、Usage、Run、Todo、Trajectory、Diagnostics 等都是从已提交 Journal 前缀派生的只读投影。

目标不是给每个 UI 问题增加条件分支，而是让同一个 `sessionId`、同一个 Journal 水位和同一个 projection snapshot 驱动整个 Host。临时流式状态只能作为可丢失 overlay，不能替代或修改持久化事实。

## 2. 依据与范围

### 2.1 依据

本设计承接以下已确认契约：

1. [DSH 风格 Session 事件模型](./agent-spec-dsh-event-model.md) 定义事件平面、13 种核心事件、持久化扩展、Surface 和 replay。
2. [Session 格式公共契约](./agent-spec-session-format-v1.md) 定义 raw JSONL、Header、Envelope、Surface、repair 和 fork。
3. [Session Core 与 Persistence Provider 分离规范](./agent-spec-session-core-persistence-separation.md) 定义 live Session、backend-neutral Provider 和 JSONL Provider 的所有权。
4. [Runtime Projection 公共契约](./agent-spec-runtime-projection.md) 定义 durable、live、diagnostics 三个投影平面和 Host DTO 边界。
5. DSH 的 Session、Session Projection Registry、客户端 Session snapshot 和 Trajectory projection 源码。

### 2.2 范围

包含：

- Session Journal 到各类投影的统一读取模型；
- projection definition、registry、watermark、snapshot、change feed 和 cache；
- Desktop main、preload、renderer 的 Session-bound 消费边界；
- provider usage 与 request context estimate 的命名和生命周期；
- Composer phase 和 Trajectory projection 的 Session 来源；
- 投影不一致、通知丢失、异步旧响应和缓存失效的处理。

不包含：

- 13 种核心事件或其顺序的重新设计；
- Session 数据迁移、旧 v1 事件兼容、SQLite、远程后端或双写；
- CLI chat、在线 HMR、运行时 reconcile；
- `read`、`list`、`grep`、`edit`、`write`、`bash` 和 Browser Bridge executor 的具体实现重写；
- 不可信插件前端代码或第二套前端插件运行时；
- Goal/Schedule 的业务 producer。

## 3. 核心不变量

### 3.1 Journal 是唯一事实源

```text
User / Agent / LLM / Tool
          │
          ▼
Session Core append
          │
          ▼
validate → assign seq → durable commit
          │
          ▼
Session Journal
```

Journal 的 append 是唯一提交点：

1. codec、关系、Surface operation、大小和 secret policy 校验先完成；
2. Session Journal 分配严格连续的 `seq`；
3. Persistence Provider 写入并完成规定的 durability barrier；
4. append commit 后发布 `session/event`；
5. 通知失败、projection 失败和 cache 失败都不能回滚已提交事实。

`session/event` 只表示某个事实已经提交，不代表它是完整的投影，也不是恢复所需的第二份日志。

### 3.2 Surface 是 Journal 的确定性派生面

`SessionJournal.surface` 是模型历史和 Conversation 的 canonical source。它包含：

- `user`；
- `assistant`；
- `tool-result`。

`user/message` 和带 Surface append 的 `agent/inbox/spliced` 都可以产生 user node。`assistant/chunk` 是流式事实，`assistant/message` 是收束后的 assistant node。Surface replacement 只引用并替换派生位置，不删除原始事件。

因此，任何 Desktop projection 都必须消费同一份 `SessionJournal.surface.entries` 或与它证明等价的 projector，不能重新实现一个只识别部分事件的 Surface。

### 3.3 Projection 不拥有事实

Projection 可以：

- 读取已提交事件；
- 维护可删除的内存状态；
- 写入可重建 cache；
- 发布只读 snapshot 和 change feed。

Projection 不可以：

- append 或修改 Session event；
- 读取 AgentLoop 私有对象作为历史来源；
- 读取 renderer state、ToolRuntime 内存对象或通知缓存补全历史；
- 将 running 状态提升为 durable terminal fact；
- 把 UI 字段写回 Journal。

## 4. 三个数据平面

```text
┌──────────────────────────────────────────────┐
│ Session Journal, durable facts                │
│ seq, event type, payload, surface, provenance │
└───────────────────────┬──────────────────────┘
                        │ replay / fold
                        ▼
┌──────────────────────────────────────────────┐
│ Durable Projection                           │
│ coherent snapshot + throughJournalSeq        │
└───────────────────────┬──────────────────────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
┌──────────────────────┐  ┌──────────────────────┐
│ Live Progress        │  │ Runtime Diagnostics  │
│ runtimeInstanceId    │  │ boot / host / storage │
│ liveSeq, overlay     │  │ projection failures  │
└──────────────────────┘  └──────────────────────┘
```

### 4.1 Durable Projection

Durable Projection 从 Journal 的一个前缀派生，服务：

- Session 列表、历史和 reload；
- Conversation Surface；
- Run、Turn、Step、Tool、Approval、Inbox 和 Todo；
- Context request snapshot 和 provider usage；
- CLI resume、冷启动和 canonical export；
- Trajectory 和 diagnostics 的恢复性读取。

同样的事件 codec、同样的 Journal 前缀和同样的 projection version 必须得到相同的 generic projection。

### 4.2 Live Progress

Live Progress 用于：

- assistant/reasoning streaming delta；
- 工具 validating、approval wait、queued、executing、finalizing 阶段；
- 当前运行状态、百分比和短文本。

每条 Live Progress 带：

```text
runtimeInstanceId
liveSeq
sessionId
throughJournalSeq
```

它可以丢失、合并或重放失败。发现 `runtimeInstanceId` 变化、`liveSeq` 缺口或 buffer overflow 时，Host 必须丢弃 overlay，并从 Durable Projection 重新同步。

### 4.3 Runtime Diagnostics

Diagnostics 描述 boot、Cordis、Host、Storage、Projection 和 Plugin 运行问题，不进入模型 Context，不替代 Session facts，也不混入 CLI 业务 stdout。

## 5. Projection Definition

ActSpace 使用和 DSH 类似的纯 projection unit。现有 `packages/session/projection` 继续作为实现归属，不创建第二套中央状态容器。

```ts
interface ProjectionDefinition<K, S, V> {
  readonly key: K
  readonly stateVersion: number
  readonly init: () => S
  readonly apply: (state: S, event: SessionEventEnvelopeV1) => S
  readonly view: (state: S) => V
  readonly schema: ProjectionSchema<V>
}
```

契约要求：

1. `init`、`apply`、`view` 同步执行；异步 projection 会破坏一致性切面，禁止注册。
2. 不关心当前事件的 `apply` 必须返回相同 state reference，以避免无意义的下游刷新。
3. `view` 返回 JSON-safe、脱敏、不可变的全量值，不返回 live object、函数、路径或 credential。
4. `stateVersion` 变化表示 fold 语义或序列化结构变化，旧 checkpoint 必须失效。
5. Projection 只能依赖事件和自己的 state，不依赖其他 projection 的私有 state。

## 6. Registry、Snapshot 与 Revision

### 6.1 Registry

`SessionProjectionRegistry` 负责：

- 注册和注销 projection definition；
- 为每个 `sessionId` 建立惰性 cell；
- 在一次 `session/event` 订阅中驱动所有已注册 unit；
- 记录每个 unit 的 watermark；
- 生成一致 snapshot；
- 对已变化 unit 发布 change feed；
- 提供 checkpoint、restore floor 和 cold restore。

领域 projection 不自己订阅 Session event。领域只注册纯 definition，框架拥有驱动、生命周期和 change feed。

### 6.2 一致 Snapshot

```ts
interface SessionProjectionSnapshot {
  readonly sessionId: string
  readonly throughJournalSeq: number
  readonly values: Readonly<{
    summary?: SessionSummaryProjection
    surface?: ConversationProjection
    run?: RunProjection
    inbox?: InboxProjection
    context?: ContextEstimateProjection
    usage?: ProviderUsageProjection
    todo?: TodoProjection
    trajectory?: TrajectoryProjection
    diagnostics?: SessionDiagnosticsProjection
  }>
}
```

`throughJournalSeq` 是所有值共同反映的 Journal 水位。不存在一个 snapshot 内部的值已经到 seq 570、另一个值仍停在 seq 568 却伪装成同一切片的情况。

如果一个可选 projection 没有注册，它从 `values` 中缺席并被解释为能力缺失；如果已注册但无法追上水位，必须返回结构化 projection diagnostic，不能静默返回旧值并声称最新。

### 6.3 Change Feed

```ts
interface ProjectionChange {
  readonly sessionId: string
  readonly key: string
  readonly value: unknown
  readonly throughJournalSeq: number
}
```

Change feed 只是低延迟刷新信号。Host 可以丢弃任意 change，并用 `snapshot(sessionId)` 或 `readFrom(sessionId, lastSeq + 1)` 修复缺口。

### 6.4 异步 IPC 身份

所有异步读取或描述请求都必须带：

```text
sessionId
requestId
knownThroughJournalSeq
```

返回值必须带：

```text
sessionId
requestId
throughJournalSeq
```

renderer 只接受同时满足以下条件的结果：

1. `sessionId` 仍然是当前绑定的 Session；
2. `throughJournalSeq` 不早于当前 Store 的水位；
3. `requestId` 仍然属于当前请求代际；
4. projection schemaVersion 和 stateVersion 可以消费。

旧响应直接丢弃，不用旧响应覆盖新 snapshot。

## 7. Projection Catalog

| Projection | Journal 输入 | 消费者 | 是否恢复必需 |
|---|---|---|---|
| `summary` | Header、session metadata 扩展、turn/end | Session list、标题栏 | 是 |
| `surface` | user/message、agent/inbox/spliced、assistant/message、tool/result、surface/replaced | Conversation、模型历史 | 是 |
| `run` | turn、step、tool、approval、retry、error、abort | Composer、运行状态、诊断 | 是 |
| `inbox` | agent/inbox/spliced enqueue/claim/discard | AgentLoop、Composer、恢复 | 是 |
| `context` | request/header、request/context、compaction | Context 面板、Composer 容量提示 | 是 |
| `usage` | assistant/message、step/end、turn/end usage | Usage、费用、统计 | 是 |
| `todo` | todo/write | Todo 面板和恢复 | 否，可降级 |
| `trajectory` | turn、step、request、assistant、tool、approval、retry、compaction、error | Trajectory 视图 | 否，可按能力缺失 |
| `diagnostics` | recovery、unknown event、projection gap、storage health | Diagnostics 面板、日志 | 否 |

这个表是 projection ownership 的基线。新增 projection 必须说明 Journal 输入、稳定 key、watermark、schema、脱敏策略和消费者，不能只在 renderer 中增加一个独立缓存。

## 8. Conversation 与 Surface

Conversation Projection 的唯一来源是 canonical Surface：

```text
Session Journal
     │
     ▼
SessionJournal.surface.entries
     │
     ├─ user
     ├─ assistant
     └─ tool-result
```

临时 streaming overlay 的生命周期是：

```text
durable user/message or inbox claim
        │
        ├─ Live overlay: immediate rendering
        │
        └─ Durable projection: final rendering
```

overlay 结束后必须由同一个 Surface node 接管。任何 Surface 事件未被 renderer projector 识别，都是 projection contract violation，不能通过保留临时 React state 来掩盖。

## 9. Context 与 Usage

ActSpace 固定两个不同投影：

### 9.1 `providerUsage`

来自真实 Provider 返回的 usage：

- input tokens；
- output tokens；
- cache read/write；
- cost；
- provider-specific usage metadata。

它用于费用、模型请求统计和 Provider 观测。

### 9.2 `requestContextEstimate`

来自最近一次 `request/context`，按当前 Context estimator 重建：

- system sections；
- rules 和 skills；
- tool definitions；
- facts；
- summarized conversation；
- conversation messages。

它用于回答“当前请求距离 Context window 还有多少空间”。

两者都属于同一个 Session snapshot，但不得继续共用含糊的 `contextSnapshot` 名称。UI 必须使用明确文案：`Provider usage` 与 `Request context estimate`。如果只显示一个环形占用率，优先显示 `requestContextEstimate`。

## 10. Composer Phase

Composer 的生命周期由 Session Projection 派生，不由 Conversation 组件自行计算 `messages.length`。

```text
blank
  └─ 尚未接受任何输入

engaging
  └─ 已发起或正在等待首个输入结果

active
  └─ 已有可见内容、运行中 Turn、pending Inbox 或已接受输入
```

`composerPhase` 由 Session-owned facts 计算一次，组件只消费结果。底部 Composer 是稳定的 resident slot，phase 只改变提示、按钮和禁用状态，不改变其是否存在。

首次 prompt 失败时保留 `engaging` 或错误可重试状态，不能因为临时消息数组为空而回到一个新的 Session 语义。

## 11. Trajectory Projection

Trajectory 是同一个 Session 的只读投影，不创建第二份事件日志：

```text
Session Journal
      │
      ▼
Trajectory Projection
      │
      ▼
TrajectorySnapshot
      │
      ▼
Trajectory View
```

第一阶段支持以下节点：

- Turn start/end；
- Step start/end；
- request/header/context；
- user/message 和 agent/inbox/spliced；
- assistant/chunk/message；
- tool/call/result；
- approval、retry、compaction、error。

稳定 key 使用 `sessionId + eventSeq`，工具生命周期额外使用 `callId`。Trajectory builder 支持 `replace` 和 keyed `apply`，全量重建与增量更新必须得到相同的排序和节点状态。

Conversation 只展示 Surface，Trajectory 展示完整执行过程。两者可以拥有不同的 UI 结构，但不能拥有不同的事实来源。

## 12. Cache 与 Cold Read

Projection cache 只用于加速，不是事实源。缓存行的逻辑身份为：

```text
sessionId
projectionKey
stateVersion
throughJournalSeq
value
```

冷读取顺序：

```text
cached checkpoint
       │
       ├─ version match
       ├─ restore floor tail read
       ├─ projection apply
       ├─ snapshot at journal end
       └─ write-back checkpoint
```

以下情况必须从更早位置重建：

- `stateVersion` 不匹配；
- cache row 水位晚于 Journal 尾部；
- crash repair 让 Journal 变短；
- required projection 缺少可验证的 checkpoint；
- projection schema validation 失败。

cache 写入失败不阻塞 Session append。cache 读写失败都要写 Diagnostics，但不能创建第二套历史状态。

## 13. Host 与 Renderer 边界

```text
Session Core / Journal
          │
          ▼
Projection Registry
          │
          ▼
Desktop Main Session Adapter
          │ typed IPC
          ▼
Preload Session API
          │
          ▼
Renderer SessionStore[sessionId]
          │ selectors
          ├─ Conversation
          ├─ Composer
          ├─ Context
          ├─ Usage
          └─ Trajectory
```

Main 进程负责：

- 打开 Session 和读取 Journal；
- 运行 projection registry；
- 生成完整 snapshot；
- 发送 post-commit event 和 projection change；
- 处理冷读、gap repair 和 diagnostics。

Preload 只暴露 typed projection API，不暴露文件路径、writer、live Session handle 或任意插件对象。

Renderer 负责：

- 选择当前 `sessionId`；
- 保存当前 snapshot 和可丢失 live overlay；
- 丢弃旧 revision；
- 通过 selector 向组件提供数据。

Renderer 不应再同时合成 `sessionRecord`、`agentRunResult`、`visibleSessions[0]`、`streamingBlocks` 和单独的 Context describe 结果。

## 14. Session 切换与生命周期

Session 切换必须先更新唯一的当前 Session identity，再启动所有读取和订阅：

```text
select(sessionId)
   │
   ├─ invalidate request generation
   ├─ detach old live overlay
   ├─ open durable snapshot(sessionId)
   ├─ attach session/event subscription
   └─ render snapshot for this session only
```

禁止通过 `visibleSessions[0]`、最近一次 `agentRunResult` 或任意异步结果猜测当前 Session。

Session 关闭顺序为：

```text
reject new work
  → stop live publication
  → flush Journal / projection cache
  → publish final projection
  → release provider lease
  → detach Session Store
```

## 15. 失败与恢复

### 通知丢失

Host 根据 `lastKnownThroughJournalSeq` 读取 Durable Projection 或 Journal tail。通知不是恢复依据。

### Live stream 缺口

丢弃 overlay，保留最后一个 durable snapshot，从 `throughJournalSeq + 1` 重新读取。

### 旧 IPC 响应

按 `sessionId + requestId + throughJournalSeq` 校验，旧响应丢弃。

### Projection 失败

保留 Journal，标记 projection diagnostic；核心 projection 失败时 fail closed，非核心 projection 可以报告 capability unavailable。

### 未知事件

遵循 Session codec 的 required/ignorable 策略。未知 required event 不能伪装成可恢复的完整 Session；可以提供 browse-only raw inspection。

## 16. 迁移映射

| 当前形态 | 目标形态 |
|---|---|
| `SessionRecord.events` | Main-only Journal inspection 或 diagnostics/export API |
| `SessionRecord.messageBlocks` | `surface` projection |
| `SessionRecord.contextSnapshot` | `providerUsage` projection，完成命名拆分 |
| `SessionRecord.contextState` | `requestContextEstimate` projection |
| `agentRunResult` | Durable Run projection + Live Progress overlay |
| `streamingBlocks` | Renderer Store 的可丢失 overlay |
| `visibleSessions[0]` fallback | 明确的 `selectedSessionId` |
| `activeSessionIdRef` | Session Store 的单一 identity 和订阅代际 |
| `projectFixedRendererEvents` 手工 Surface 判断 | 复用 `SessionJournal.surface` 的 canonical adapter |
| `ContextRenderView` 独立 describe 请求 | 同一 snapshot cut 的 Context selector，必要时使用 revision-bound revalidation |

迁移期间可以保留兼容字段作为内部适配，但新代码不得以它们作为事实源。完成 Host migration 后，renderer 不再直接接触完整 Journal events。

## 17. 取舍与拒绝方案

### 采用：Journal + Pure Projection + Session Store

原因：

- 与现有 Session Journal、Surface 和 P1-A Provider seam 一致；
- 可从空 Session 或冷 Journal 重建；
- 支持 Desktop、CLI 和未来 Trajectory 共用语义；
- 通知丢失、进程重启和缓存删除不会破坏历史；
- 能在不修改工具 executor 的前提下重写权限、事件和 Host 适配。

### 拒绝：renderer 继续维护多个并行来源

这种方式可以快速修复单个截图，但无法证明用户输入、Context 和 Agent 状态处于同一 Journal 水位，也无法可靠处理 Session 切换和异步旧响应。

### 拒绝：为 Trajectory 建立独立日志

这会产生 Conversation 与 Trajectory 的双真相、重复持久化和恢复分叉。Trajectory 必须是同一 Journal 的 projection。

### 拒绝：Journal 与 Snapshot 双事实源

Snapshot 可以作为 checkpoint 和读取加速，但必须可删除、可校验和可重建。它不能成为与 Journal 并列的可写事实源。

## 18. 验收标准

1. 删除 projection cache 后，从同一 Journal 得到等价 projection。
2. 同一个 `sessionId + throughJournalSeq` 的所有核心 projection 可以从一个一致 snapshot 读取。
3. `agent/inbox/spliced` 的 user Surface 节点在运行结束、reload 和冷启动后仍然可见。
4. `providerUsage` 与 `requestContextEstimate` 类型、估算器和 UI 标签不再混淆。
5. Session 切换后，旧 Session 的 IPC、live event 和 Context 响应不会写入新 Session。
6. Composer 由 Session-owned phase 驱动，最终回复之后保持 resident。
7. Trajectory 由 Journal replay 得到，增量 `apply` 与全量 `replace` 结果一致。
8. 通知丢失、live gap、cache failure、unknown required event 和 projection validation failure 都有明确的恢复或 fail-closed 结果。
9. renderer 不再把完整 Journal、credential、writer、Provider class 或插件对象作为读取 API 暴露。
10. 工具 executor 行为 parity、13 个核心事件、现有 JSONL recovery 和 CLI run 语义不变。

## 19. 实施入口

实施拆为四个独立计划，具体文件所有权、依赖和命令见：

[Session 持久化与投影实施计划](../../exec-plans/active/20260830-actspace-session-persistence-projection/README.md)

本设计的上游依赖是 P1-A Session Core/Persistence 和 P1-B Service Definition/Provider/Consumer 的 public contract。P1-C Profile/Bundle/Patch 只影响生产 Boot 接线，不改变 projection 的 Journal 语义。P2 Contract Matrix 需要在本计划的 projection metadata 稳定后纳入 projection keys、stateVersion 和验证证据。

## 20. 模块放置与依赖方向

### 20.1 Host Session Runtime

Host Session Runtime 不是一个单独 package，而是以下能力的组合：

```text
packages/session/journal
    事件 Envelope、Codec、Surface、Replay

packages/session/core
    live Session、SessionHandle、append、flush、close

packages/session/persistence
    backend-neutral Persistence contract

packages/session/jsonl
    JSONL 文件、writer、lease、recovery

packages/runtime
    Cordis Boot、Profile、Bundle、Service wiring、Host lifecycle
```

`packages/runtime` 负责组装这些服务，但不持有 Session 状态。`Session Core` 对应 DSH 的 `ctx.sessions`，是按 `sessionId` 管理 live Session 和 Journal 的服务。物理 Provider 只属于 Persistence 层。

### 20.2 Host Projection Runtime

`packages/session/projection` 是通用 projection framework 和 Host-side projection unit 的归属：

```text
packages/session/projection/
    ├─ projection-definition.ts
    ├─ projection-registry.ts
    ├─ projection-snapshot.ts
    ├─ surface.ts
    ├─ run.ts
    ├─ inbox.ts
    └─ trajectory.ts
```

它只依赖 `@actspace/session-journal` 和 detached shared types，不依赖 Electron、React、文件系统或具体 Persistence Provider。

Projection Cache 是单独的可选能力：

```text
packages/session/projection-cache/
    ├─ checkpoint.ts
    ├─ cold-restore.ts
    ├─ restore-floor.ts
    └─ plugin.ts
```

它可以依赖 `session-projection` 和 Persistence contract，用于 checkpoint、restore floor、tail replay 和 write-back。Cache 删除后，Projection Runtime 必须仍然能够直接从 Journal 重建相同结果。

### 20.3 Client Session Runtime

当前仓库已有 `packages/client`，因此通用的客户端 Session 不应只存在于 Desktop renderer：

```text
packages/client/src/sessions/
    ├─ session.ts
    ├─ projection-store.ts
    ├─ session-snapshot.ts
    ├─ live-overlay.ts
    └─ selectors.ts
```

它对应 DSH 的 client `Session` 和 `ProjectionValueStore`，负责：

- 按 `sessionId` 保存客户端 projection；
- 按 `throughJournalSeq` 拒绝旧值；
- 合并 durable snapshot 与可丢失 Live Progress overlay；
- 派生 `ConversationSnapshot` 和 `composerPhase`；
- 为 React 或其他客户端提供稳定订阅接口。

Desktop 只保留 Electron 绑定：

```text
apps/desktop/src/renderer/session/
    ├─ electron-session-bridge.ts
    ├─ use-desktop-session.ts
    └─ renderer-adapters.ts
```

这些文件不能重新 fold Journal，也不能成为第二个 Session Store。

### 20.4 领域投影与 UI 投影

第一阶段为了避免 package cycle，核心 projection unit 可以继续放在 `packages/session/projection`，但必须通过 registry 注册。后续依赖稳定后，可以由领域 package 注册贡献：

| 能力 | 首选归属 | 说明 |
|---|---|---|
| Surface、Summary、Run、Inbox | `packages/session/projection` | 直接依赖核心 Session 事件 |
| Provider Usage | `packages/session/projection`，后续可由 `packages/llm` 注册 | 只读取 durable usage 事实 |
| Request Context Estimate | `packages/session/projection`，后续可由 `packages/context` 注册 | 只读取 request/header/context |
| Tool projection | `packages/session/projection`，由 `packages/tools/*` 提供定义或 metadata | 不改变 executor |
| Trajectory | Host builder 在 `session/projection` | 同一 Journal 的只读轨迹 |
| Conversation、Context、Composer、Trajectory UI | `apps/desktop` | 只消费 `packages/client` snapshot |

领域 package 贡献的是 Projection Definition，不直接订阅 `session/event`，也不直接向 renderer 发送事件。

### 20.5 最终依赖图

```text
session-journal
   │
   ├──────────────► session-core ─────────────► runtime
   │                      │                       │
   ├──────────────► session-projection           ├─ Desktop Host adapter
   │                      ▲                       └─ CLI Host adapter
   │                      │
   └─ session-persistence ─┴─ projection-cache
          │
          └──────────────► session-jsonl

runtime / Host API
          │
          ▼
      packages/client
          │
          ▼
      Desktop React UI
```

当前 `session-persistence` 对 `session-projection` 的依赖属于迁移中的旧实现耦合。最终 contract 应使用 detached types，Projection Cache 才是 Persistence 与 Projection 的组合点，避免 projection framework 获得文件和 Provider 语义。

## 21. 参考

- `packages/session/journal/src/surface.ts`
- `packages/session/projection/src/projection.ts`
- `packages/runtime/src/projection/durable-session.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/right-panel/ContextRenderView.tsx`
- `tmp/deepseek-harness/packages/session/session-projection/src/index.ts`
- `tmp/deepseek-harness/packages/client/runtime/src/client/sessions/session.ts`
- `tmp/deepseek-harness/packages/client/runtime/src/client/sessions/conversation.ts`
- `tmp/deepseek-harness/packages/client/ui-trajectory/src/client/trajectory-snapshot-builder.ts`
