# P07：Runtime Projection 与固定前端 DTO

状态：已完成

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P00、P04、P06

消费方：P12-P15

Exec-run slug：`actspace-v2-plan-07-runtime-projection`

## 1. 目标

实现 Durable Session Projection、Live Progress 和 Runtime Diagnostics 三个严格分离的投影平面，为 Desktop 与 CLI 提供同语义 DTO。unknown tool 始终由 generic Tool DTO 完整展示；专用 renderer 只是构建时 allowlist hint，不加载插件前端代码。

## 2. 必读与基线

- [Runtime Projection](../../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)
- [Session Format v1](../../../design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md)
- `packages/shared/src/ipc.ts`
- `packages/shared/src/session-transcript.ts`
- `packages/agent-core/src/observability/`
- `apps/desktop/src/renderer/components/messages/`

## 3. 文件与接口

```text
packages/agent-runtime/src/projection/
├── durable-session.ts
├── live-progress.ts
├── diagnostics.ts
├── tool-dto.ts
├── cursor-stream.ts
├── redaction.ts
├── artifact.ts
└── test/

packages/shared/src/runtime-v2/
├── projection.ts
├── diagnostics.ts
└── index.ts
```

Host-visible contract 固定使用 `RuntimeV2SessionSnapshot`、`RuntimeV2LiveEvent`、`RuntimeV2DiagnosticsSnapshot`、`RuntimeV2ToolView` 和 `RuntimeV2ArtifactRef`。所有 identity 显式携带 sessionId、agentId、agentRunId、turnId、stepId、callId；Host 不从当前 active view 猜归属。

## 4. 任务

### 07.1 Durable Session Projection

- 只从 P04 Journal + codec fold 生成会话列表、消息、Turn / Step、Tool、Inbox、Todo、usage 和 lineage 视图。
- projection cache 只是加速；删除 cache、改变读取 chunk 或 cold load 后得到相同 canonical JSON。
- unknown required Session 仍可 browse/export raw facts，但 projection 明确标记 browse-only；不可伪装成可 resume。

### 07.2 Live Progress 与无丢失握手

- live event 只表达尚未 durable 的 delta、排队、等待审批和实时进度；不得成为恢复事实。
- 每个 Runtime 实例生成 `runtimeInstanceId`，每个 stream 使用单调 cursor。
- 订阅流程固定为 snapshot -> subscribe from cursor -> replay gap；gap 超出 buffer 时返回 `resync-required`，Host 重新取 snapshot。
- late event 带旧 runtimeInstanceId 或旧 agentRunId 时丢弃并记录 diagnostics。

### 07.3 Generic Tool DTO

- 五态固定为 running / completed / failed / denied / aborted；outcome-unknown 映射 failed view 并保留专门 failure code。
- DTO 包含 redacted args、modelOutput、summary、detail、duration、artifact refs、failure、pluginId/toolId/callId 和可选 renderer hint。
- args summary 有严格长度与敏感字段裁剪；artifact missing 不破坏消息列表。

### 07.4 Diagnostics

- 暴露 BootManifest digest、plugin rows、Fiber state、missing service、restartRequired、Session access state、active lease、shutdown blockers 和 redacted errors。
- diagnostics 不写入 Journal，除非对应事项本身是 Agent durable fact。
- 序列化时递归移除 credential、Authorization、proxy auth、raw provider body 和 workspace 外绝对路径。

### 07.5 Renderer allowlist 合同

- Shared DTO 中 `renderer` 只含稳定 key 和 JSON-safe props。
- allowlist key 不存在、props 非法或 component throw 时必须回退 generic renderer；不会让 tool result 消失。
- 插件不得声明 `frontend.required` 来要求某个 Tool renderer；前端 required 只属于插件整体 compatibility admission。

### 07.6 三 Host parity fixtures

- 同一 Journal fixture 分别映射为 Desktop IPC、CLI JSON 和 CLI JSONL，比较 normalized semantic DTO。
- 覆盖 renderer reload、cursor overflow、cache deletion、artifact missing、late progress、abort 和 browse-only。

## 5. 允许修改

- `packages/agent-runtime/src/projection/**`
- `packages/shared/src/runtime-v2/{projection,diagnostics,index}.ts`
- P04/P06 中 projection hook 的最小接口对接
- 测试、exec-run、设计勘误和 history

禁止实现 React component、Electron IPC handler、CLI renderer 或旧 Trace 兼容层；它们由 P13/P14 处理。

## 6. 失败与回滚

- 如果 UI 必须读取 sidecar 或 live buffer 才能恢复，停止并修正 Durable Projection，不引入第二事实源。
- 如果专用 renderer 不兼容，回退 generic DTO，不阻断 Session 或工具执行。
- 回滚仅移除新 projection 模块和 namespaced DTO，v1 UI 不受影响。

## 7. 验证

```bash
pnpm --filter @actspace/shared test -- runtime-v2
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-runtime test -- src/projection
pnpm --filter @actspace/agent-runtime typecheck
pnpm check:docs
pnpm check:secrets
git diff --check
```

## 8. 完成标准

- 三个投影平面在类型、存储和测试上均不混用。
- generic Tool DTO 单独即可完整表达所有终态。
- snapshot/cursor handshake 和三 Host parity 有可重复 fixture 证据。
