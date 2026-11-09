# 对话内容只存一份：surface 只做标记，节点从 data 推出

> 管日志里进入模型对话的那几种事件（用户消息、回复、工具结果、Inbox 插入、恢复结果、压缩替换）把内容存在哪里，以及所有读取方怎样拿到对话节点。事件词汇见[事件模型](agent-spec-dsh-event-model.md) §7，请求记录见[请求记录](agent-spec-request-record.md)，投影架构见[Runtime Projection](agent-spec-runtime-projection.md)。

状态：已实现，执行计划 [20261107-surface-derived](../../exec-plans/completed/20261107-surface-derived.md)。实机对比（§9 最后一条）尚未单独测量，登记在[性能待办](../../exec-plans/perf-backlog.md)「已完成」一表。

## 1. 为什么改

`tmp/heap/run5/journals/` 是 run5 的 4 份日志（1 个父会话 + 3 个子 Agent），合计 5.08 MB。凡是进入对话的事件，内容都存了两份：一份在 `data`，一份在外层 `surface.node`。

| 事件 | 条数 | 整行合计 | 其中 `surface` | `surface.node.content` 与 data 中哪个字段相同 |
|---|---|---|---|---|
| `tool/result` | 279 | 2846 KB | 1355 KB | `data.modelOutput`（279 条全部相同） |
| `assistant/message` | 181 | 656 KB | 216 KB | `data.content`（181 条全部相同） |
| `agent/inbox/spliced`（claim） | 4 | 25 KB | 23 KB | 同一 messageId 的 enqueue 事件里的 `data.content` |
| `user/message` | 4 | 7 KB | 5 KB | 无：内容只在 surface 里 |

合计约 1.6 MB，占日志的 31%。另外还有三笔开销：

- **内存。** 日志读进来后，每条事件是一个解析出来的对象，`data` 和 `surface.node` 是两个互不相干的副本。项目缓存（`journal-cache.ts`）、会话控制器、渲染进程里的会话数据，持有的工具结果都是两份。
- **读写。** 每次整份读取、解析、校验（`readJsonlSession`、`validateJsonValue`），以及 IPC 推给界面的事件，都要处理两份内容。run5 主进程里 `readJsonlSession` 分配了 1.48 GB，`validateJsonValue` 分配了 355 MB。
- **单条上限。** 单条记录不能超过 1 MiB（`event-envelope.ts`）。工具结果存两份，可写入的工具输出实际只有一半。

## 2. 当初为什么放两份

2026-08-30 的事件模型（`agent-spec-dsh-event-model.md` §7，提交 5bd08b37）规定：envelope 外层 `surface` 是一个 append/replace 操作，带完整节点；任何投影「只依赖 `surface` 和已提交事件」。这样，上下文引擎、转写、估算、审批都只需要认识 `surface.node` 这一种结构，不必知道每种事件的 `data` 长什么样。

当时还设想 `tool-result` 节点存的是「脱敏后的工具结果和 artifact 摘要」，与 `data` 里的原始结果不同，两份各有用途。实际写出来时没做脱敏，也没做摘要，`node.content` 就是 `data.modelOutput`。`assistant/message` 一开始就是原样复制。

## 3. DSH 的做法

DSH 只存一份（`tmp/deepseek-harness/packages/core/session/src/`）：

- `tool/result` 的 data 是 `{ turn, step, message, error? }`，模型看到的内容只在 `data.message` 里。
- 外层只有一个标记 `surfaceOp: 'append' | { op: 'replace', startSeq, endSeq }`，不带内容。
- `surface.ts` 的 `deriveEventMessage()` 按事件类型从 `data` 推出消息：`case 'tool/result': return event.data.message`；`system/message`、`developer/message`、`assistant/message`、`user/message` 也一样。
- 「投影只看已提交事件」照样成立：所有投影都调用这一个推导函数，不需要把内容再存一份。

## 4. 新格式

### 4.1 envelope 的 `surface` 只做标记

```ts
type SessionSurfaceOperationV1 =
  | { readonly kind: "append" }
  | { readonly kind: "replace"; readonly start: number; readonly end: number; readonly sourceEventSeqs: readonly number[] };
```

- 去掉 `node`。是否进入对话、怎样进入，仍由 `surface` 决定：`null` 表示不进入，`append` 表示追加，`replace` 表示替换一段。
- 「这条事件有没有 surface」的现有规则不变。例如：失败且没有内容的 assistant 不追加；Inbox 的 discard 不进入；辅助请求不能改 surface。

### 4.2 节点由一个函数从 `data` 推出

在 `@actspace/shared/runtime-v2` 新增 `surfaceNode(event): SessionSurfaceNodeV1 | null`。`surface` 为 `null` 时返回 `null`，否则按事件类型推出：

| 事件 | `kind` | `messageId` | `content` | 其他 |
|---|---|---|---|---|
| `user/message` | `user` | `data.messageId` | `data.content`（**新增字段**，原来只在 surface 里） | |
| `assistant/message` | `assistant` | `data.messageId` | `data.content` | |
| `tool/result` | `tool-result` | `` `tool-${data.callId}` `` | `data.modelOutput` | `callId`；`isError = data.status !== "completed"` |
| `tool/recovery-outcome` | `tool-result` | `` `recovery-${data.repairId}-${data.callId}` `` | `data.content`（**新增字段**，原来是写在 surface 里的固定文案） | `callId`；`isError: true` |
| `agent/inbox/spliced`（claim） | `user` | `data.messageId` | `data.content`（**新增字段**，见 §8 第 2 条） | |
| `surface/replaced` | `data.node.kind` | `data.node.messageId` | `data.node.content` | `data.node` 是压缩摘要节点（**新增字段**，从 surface 移进来） |

- 推出的节点直接引用 `data` 里的对象，不复制。内存里只有一份内容。
- 这个映射规则与现在 `loop.ts`、`recovery.ts`、`inbox.ts`、`task-ledger.ts`、`compaction.ts` 写 surface 时用的规则完全一致，只是从「写的时候拼好存下来」改成「读的时候拼」。
- 删除 `SessionSurfaceNodeV1` 的 `attachmentRefs` 字段：生产代码没有任何地方写或读它。

### 4.3 校验

- **envelope**（`event-envelope.ts`）：`surface` 只允许 §4.1 的两种形状；出现 `node` 字段直接拒绝。
- **codec**（`core-codecs.ts`）：上面标了「新增字段」的事件，在带 `surface` 时必须有对应字段。`user/message` 和 claim 必须有 `content`；`tool/recovery-outcome` 必须有 `content`；`surface/replaced` 必须有 `data.node`，且 `node.kind`、`messageId` 合法。
- **`SessionSurface` 折叠**（`session-journal/src/surface.ts`）：`apply()` 改为调用 `surfaceNode(event)`。`validateEligible` 的类型和 kind 对应关系不变。
- **关系校验**（`invariant-validator.ts:315`，claim 必须追加 user 节点）：改为检查 `surface.kind === "append"`，并且 `surfaceNode(event).kind === "user"`。

## 5. 写入方

| 位置 | 改动 |
|---|---|
| `agent-loop/src/loop.ts`：`user/message`（129）、`assistant/message`（224、273）、`tool/result`（472、497） | surface 改为 `{ kind: "append" }`；`user/message` 的 data 加 `content` |
| `agent-service/src/task-ledger.ts:161` | `user/message` 的 data 加 `content`（composer-task 取 `prepared`，与现在 surface 里的规则相同） |
| `core/agent/src/inbox.ts:49`（claim） | data 加 `content` |
| `session-persistence/src/recovery.ts:101` | `tool/recovery-outcome` 的 data 加 `content` |
| `session-journal/src/compaction.ts`（`createCompactionReplacement`） | `summary` 节点放进 `data.node`；surface 只留范围 |

## 6. 读取方

全部改为调用 `surfaceNode(event)`，或者读 `SessionSurface` 折叠后的 `entries[].node`（折叠本身已经改为推导）。按现在的代码逐个列出（不含测试）：

- **上下文：**
  - `context-engine`：`engine.ts`、`compaction.ts`、`content-manifest.ts`、`supplements.ts`、`assembly.ts`、`codec.ts`；
  - `context-compaction`：`summarizer.ts`、`region.ts`、`plugin.ts`、`manifest.ts`；
  - `context-disclosure/plugin.ts`；
  - `prompt`：`context-bridge.ts`、`assembler.ts`、`contributor.ts`、`context-source-support.ts`。
  - 其中大部分读折叠后的 entries，只要折叠改了就不用动，执行时逐个核对。
- **估算：** `shared/src/context-estimate.ts`（`surfaceOf`）、`shared/src/composer-reference-validation.ts:32`。
- **Runtime：** `runtime/src/projection/durable-session.ts:76`、`runtime/src/session/session-controller.ts:148`、`auxiliary-request-recorder.ts`、`harness/agent-factory-plugin.ts`、`harness/evolution-approval.ts`。
- **Agent：** `agent-loop/src/loop.ts:154/244/354/586`，`agent-service`：`session-commands.ts`、`task-ledger.ts`、`task-events.ts`、`application.ts`。
- **其他包：** `session-transcript/src/render.ts`（56、92、100、244）、`approval/auto-review/src/context.ts`、`subagent/src/manager.ts`、`background-tasks/src/registry.ts`、`todo/tool-todo/src/todo.ts`、`host/desktop-app/src/session-title.ts`、`session-persistence/src/recovery.ts`。
- **client：** `sessions/session.ts:174`、`sessions/chat.ts`（270–282、729）、`sessions/trajectory.ts`。
- **桌面主进程：** `runtime-registry.ts:699`（按 artifact 找引用）、`context-panel-service.ts:101`、`usage-catalog-projection.ts:16`、`usage-journal-projection.ts`、`usage-session-fallback.ts`。
- **桌面渲染进程：** `trajectory/builder.ts:494`；`Composer.tsx`、`ComposerInput.tsx`、`SlashMenu.tsx`、`mermaid-renderer.ts` 里的 `surface` 是同名的其他东西，执行时核对确认。
- **工具与文档：** `docs/tools/session-viewer/`（查看器显示 surface 节点）。

上面每一处只读 `surface.kind`（append / replace）、`sourceEventSeqs`、`start` / `end` 的代码不用改。

实现后核对（2026-11-07）：实际改动的读取方是 `context-estimate.ts`、`composer-reference-validation.ts`、`session-controller.ts`、`client/sessions/chat.ts` 与 `session.ts`、`auto-review/context.ts`、`session-transcript/render.ts`、`usage-catalog-projection.ts`、`runtime-registry.ts`、`trajectory/builder.ts`、渲染进程 `mock/mock-db.ts`，以及 `agent-loop/loop.ts` 里压缩摘要的 messageId。其余列出的位置读的是折叠后的 entries 或只读 `surface.kind`，没有改。`docs/tools/session-viewer/` 只显示原始 JSON，不用改。

测试和 mock 里手写的 envelope（`renderer/mock/`、`renderer/test/projection-fixture.ts`、`trajectory-complete.json`、各包 `test/` 里的 fixture）要一起改成新格式。执行计划里会按包列出。

## 7. 效果预估（按 run5 日志计算）

| | 现在 | 改后 |
|---|---|---|
| 4 份日志合计 | 5.08 MB | 约 3.5 MB（−31%） |
| `tool/result` 整行合计 | 2846 KB | 约 1490 KB |
| 单条工具结果可用上限 | 约 0.5 MiB | 约 1 MiB |

内存、整份读取、校验、IPC 推送的分配会按同样的比例下降。实机数字在实现后用 monitor 重跑时对比。

## 8. 需要确认的决定

1. **旧会话（已确认）：** envelope 校验拒绝带 `node` 的旧格式，不写兼容代码，`SESSION_FORMAT_VERSION` 保持 1。实现完成后，由主智能体先列出用户数据目录里的旧会话，确认后直接删除。
2. **Inbox claim 的内容（已确认）：** claim 的 data 带 `content`，enqueue 的 data 也保留 `content`。enqueue 要靠它显示待处理队列，claim 要靠它独立推出节点（只加载后半段日志时，可能看不到 enqueue）。两个事件各存一份，run5 一共才 23 KB。
   - 不采用：claim 不带内容，折叠时按 `provenance.sourceEventSeqs` 回查 enqueue。这样 `surfaceNode` 就不能只看单条事件，历史窗口也要额外把 enqueue 带上。
3. **`tool-result` 的 `messageId` 和 `isError`（已确认）：** 由 `surfaceNode()` 计算（`tool-${callId}`、`status !== "completed"`），data 里不明写。

## 9. 验收

- 新格式下，`SessionSurface` 折叠、上下文引擎拼出的模型请求、转写、估算、client 投影的结果，都与改前同一段对话一致。用同一组事件分别按新旧格式写一份，比较输出。
- envelope 校验拒绝带 `node` 的 surface；codec 拒绝缺 `content` 的 `user/message`、claim 和 `tool/recovery-outcome`，以及缺 `data.node` 的 `surface/replaced`。
- 压缩、崩溃恢复、Inbox 插入（steer 和子 Agent 通知）、子 Agent 会话都能正常写入和回放。
- `pnpm typecheck`、各包测试、`test:contract-matrix`、`check:harness-events`、`check:docs` 通过。
- 实机：用 `tmp/heap/monitor.mjs` 问同一个问题，与 run5 对比日志大小和主进程分配。

## 10. 排除的方案

- **只删 `tool/result` 的重复，其他事件不动：** 写入方和读取方就要同时支持「节点在 surface 里」和「节点从 data 推出」两种来源，两套规则长期并存。
- **反过来只在 surface 存、删掉 data 里的内容：** `data.modelOutput` 和 `data.content` 还被工具卡片、轨迹、用量统计、子 Agent 结果等按事件类型直接读。改它们比改 surface 读取方多，而且和 DSH 的方向相反。
- **把 `data.modelOutput` 改名成 DSH 的 `data.message`：** 只是改名，体积没有变化，还会多碰工具卡片和轨迹。不做。
