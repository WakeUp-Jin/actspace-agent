# 对话内容只存一份：surface 只做标记

## 目标

按设计规范 [agent-spec-surface-derived.md](../../design-docs/agent-plugin-runtime/agent-spec-surface-derived.md) 实施：

- envelope 的 `surface` 只保留 `{ kind: "append" }` 或 `{ kind: "replace", start, end, sourceEventSeqs }`，不再带 `node`；
- 对话节点由 `@actspace/shared/runtime-v2` 的 `surfaceNode(event)` 从 `data` 推出；
- 所有写入方、读取方、测试和样例数据改成新格式；
- 旧格式不兼容：envelope 校验直接拒绝带 `node` 的 surface。

同一类任务重跑一次，日志总大小比改前下降约 30%（规范 §7）。对话、上下文、转写、估算、轨迹、搜索等功能不变。

## 范围

- 包含：规范 §4–§6 的全部条目，以及下面列出的全部测试和样例数据。
- 不包含：
  - 旧会话迁移和兼容读取。旧会话在实现完成后由主智能体列出，用户确认后删除。
  - `data.modelOutput` 改名。
  - 系统提示词进对话。
  - 无关的界面改动。

## 背景

- 必读：
  - 上面的设计规范；
  - [事件模型](../../design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md) §4、§7；
  - [Session Format v1](../../design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md)。
- 证据：`tmp/heap/run5/journals/`、`tmp/heap/run7/journals/`。
- DSH 参考：`tmp/deepseek-harness/packages/core/session/src/surface.ts` 的 `deriveEventMessage()`。

## 推导规则（规范 §4.2，实现以此为准）

| 事件 | `kind` | `messageId` | `content` | 其他 |
|---|---|---|---|---|
| `user/message` | `user` | `data.messageId` | `data.content` | |
| `assistant/message` | `assistant` | `data.messageId` | `data.content` | |
| `tool/result` | `tool-result` | `` `tool-${data.callId}` `` | `data.modelOutput` | `callId = data.callId`；`isError = data.status !== "completed"` |
| `tool/recovery-outcome` | `tool-result` | `` `recovery-${data.repairId}-${data.callId}` `` | `data.content` | `callId`；`isError: true` |
| `agent/inbox/spliced`（claim） | `user` | `data.messageId` | `data.content` | |
| `surface/replaced` | `data.node.kind` | `data.node.messageId` | `data.node.content` | `data.node` 原样返回 |

- `surface === null` 时返回 `null`。
- 其他事件类型带了 surface：返回 `null`。折叠器（T3）会把它当作非法事件拒绝，保持现在 `validateEligible` 的行为。
- 推出的节点直接引用 `data` 里的值，不复制。
- 对同一个事件对象缓存结果（`WeakMap<event, node>`），反复读取不重复构造。

## 任务（按顺序；前后有依赖，由主智能体自己写）

### T1 类型与推导函数（`packages/util/shared/src/runtime-v2/session-events.ts`）

- `SessionSurfaceOperationV1` 改成规范 §4.1 的两种形状。
- `SessionSurfaceNodeV1` 删掉 `attachmentRefs`。
- 新增 `surfaceNode(event)`，按上表推导，带 `WeakMap` 缓存；从 `@actspace/shared/runtime-v2` 导出。
  - 签名只依赖 `{ type, data, surface }`，渲染进程和 client 里的事件类型也能直接用。
- 测试 `packages/util/shared/src/test/surface-node.test.ts`（新增）：
  - 六种事件各一例；
  - `surface: null` 返回 `null`；
  - `tool/result` 的 `isError` 按 status 推出；
  - 同一事件两次调用返回同一对象。

### T2 envelope 与 codec 校验（`packages/session/session-journal/src/`）

- `event-envelope.ts` 的 `validateSurfaceOperation`：
  - `append` 只允许 `kind`；
  - `replace` 允许 `kind/start/end/sourceEventSeqs`；
  - 出现 `node` 或其他字段一律拒绝（错误信息写明「旧格式」）。
  - 删掉 `validateSurfaceNode`。
- `core-codecs.ts`：
  - `user/message`：带 surface 时必须有 `data.content`。codec 的 `validate` 只拿得到 data，所以这条放在 T3 的关系校验里；codec 只校验「有就必须是 JSON 值」，不另加规则。
  - `surface/replaced`：`validateSurfaceReplaced` 增加 `data.node`，要求是对象，`kind ∈ user/assistant/tool-result`，`messageId` 非空；`tool-result` 还要有 `callId` 和布尔的 `isError`。也就是把原 `validateSurfaceNode` 的规则移到这里。
  - `tool/recovery-outcome`：`data.content` 必须是字符串。
- `invariant-validator.ts`：
  - 「带 surface 时节点能推出」统一在这里检查：`surface !== null` 且 `surfaceNode(event) === null` → 拒绝；
  - `user/message`、claim 带 surface 时 `data.content` 不能缺；
  - claim 的规则（原 315 行）改为 `surface?.kind === "append" && surfaceNode(event)?.kind === "user"`，并且引用了 enqueue。
- 测试：session-journal 现有测试改成新格式；新增：
  - 带 `node` 的 surface 被拒；
  - 缺 `content` 的 `user/message` 和 claim 被拒；
  - 缺 `data.node` 的 `surface/replaced` 被拒；
  - `tool/recovery-outcome` 缺 `content` 被拒。

### T3 折叠与压缩（`packages/session/session-journal/src/`）

- `surface.ts`：`apply()` 用 `surfaceNode(event)` 取节点；`validateEligible` 的类型和 kind 对应关系不变。
- `compaction.ts`：
  - `createCompactionReplacement` 把 `summary` 放进 `data.node`；
  - surface 改为 `{ kind: "replace", start, end, sourceEventSeqs }`。
- 测试：
  - `SessionSurface` 折叠的 append/replace；
  - 压缩事务生成新格式，回放后的 entries 与原来一致。

### T4 写入方

- `packages/core/agent-loop/src/loop.ts`：
  - 129 行 `user/message`：data 加 `content: persistedContent`，surface 改 `{ kind: "append" }`；
  - 224、273 行 `assistant/message`：surface 改 `{ kind: "append" }`。data 已经有 `content`，失败时去掉 tool-call 的 `partialContent` 本来就写在 data 里；
  - 472、497 行 `tool/result`：surface 改 `{ kind: "append" }`。scope-rejected 那条 `status: "denied"`，推出 `isError: true`，与原来一致。
- `packages/core/agent-service/src/task-ledger.ts:161`：
  - `user/message` 的 data 加 `content`。值与原 surface 相同：composer-task 取 `prepared`，否则取 `task.content`。
- `packages/core/agent/src/inbox.ts:49`：claim 的 data 加 `content: item.content`，surface 改 `{ kind: "append" }`。
- `packages/session/session-persistence/src/recovery.ts:99`：data 加 `content`（原来的两句固定文案），surface 改 `{ kind: "append" }`。
- 测试：
  - agent-loop、agent-service、agent、session-persistence 现有测试改成新格式；
  - 已有断言 surface 内容的用例，改为断言 `surfaceNode(event)` 的结果。

### T5 读取方（不含测试）

每处把 `event.surface.node` / `event.surface?.node` 改成 `surfaceNode(event)`。只读 `surface.kind`、`sourceEventSeqs` 的地方不动。

- `packages/core/runtime/src/session/session-controller.ts`：
  - 157 行 `messageIds`：改用 `surfaceNode(event)?.messageId`；
  - 513 行 `boundToolEvent`：
    - 现在会清空 `surface.node.content`。改后节点从 data 推出，而 `bounded` 的 data 里没有 `modelOutput`，推出的 content 是 `undefined`；
    - 需要确认窗口里被裁剪的工具事件，在 client 端不会被用来拼对话节点（client 的消息来自 `snapshot.messages`）；
    - 结论写进执行记录。surface 原样保留 `{ kind: "append" }`。
- `packages/util/shared/src/context-estimate.ts`：`surfaceOf` 改为 `surfaceNode(event)` 加 `surface.kind`。
- `packages/util/shared/src/composer-reference-validation.ts:32`。
- `packages/client/client/src/sessions/chat.ts`：270–282 行的压缩摘要内容改读 `data.node.content`；729 行 `appendNode`。
- `packages/client/client/src/sessions/session.ts:174`。
- `packages/approval/auto-review/src/context.ts:8`。
- `packages/session/session-transcript/src/render.ts`：56、92、100、244 行。
- `apps/desktop/src/main/runtime-v2/usage-catalog-projection.ts:16`。
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts:700`。
- `apps/desktop/src/renderer/trajectory/builder.ts:494`：`surfaceNode` 从事件取。如果 builder 的输入不是完整事件，就按事件类型读 data 里对应的字段。
- `packages/core/runtime/src/projection/durable-session.ts`：它走 `SessionSurface`，T3 改好后不用动，执行时核对一遍。
- 逐个核对、预计不用改的：
  - context-engine（`engine.ts`、`compaction.ts`、`content-manifest.ts`、`supplements.ts`、`assembly.ts`、`codec.ts`）；
  - context-compaction；
  - context-disclosure；
  - prompt（`context-bridge.ts` 自己构造节点，不读 envelope）；
  - `loop.ts` 154/244/354/586 行（读折叠后的 entries）；
  - subagent、background-tasks、todo、session-title、`context-panel-service.ts`、`usage-journal-projection.ts`、`usage-session-fallback.ts`、`client/sessions/trajectory.ts`（只透传 surface）。
- 全仓 `grep -rnE "surface\??\.node"` 结果为空（`dist/` 除外）。

### T6 测试、mock 与样例数据

把手写旧格式 envelope 的 36 个文件全部改成新格式。

- 按包：
  - desktop 9 个；
  - runtime 7 个；
  - session-persistence 4 个；
  - agent-loop 3 个；
  - session-journal、client、context-compaction 各 2 个；
  - auto-review、context-disclosure、context-engine、agent-host、session-persistence-jsonl、session-projection、session-storage 各 1 个。
- 清单用 `grep -rlE 'surface: ?\{ ?kind: ?"(append|replace)"|"surface": ?\{ ?"kind"|surface\??\.node'` 生成，逐个改。
- `trajectory-complete.json`、`renderer/mock/`、`renderer/test/projection-fixture.ts` 这类大段样例数据，用一次性脚本转换：
  - 把 node 的 content 搬进 data 对应字段；
  - 删掉 surface 里的 node。
  - 脚本放 `tmp/`，不入库。

### T7 等价性测试

新增 `packages/core/runtime/src/session/surface-derived-equivalence.test.ts`：

- 用 `tmp/heap/run7/journals/` 里的父会话和一个子会话，各截取一段作为 fixture，放进 `packages/core/runtime/src/session/test-fixtures/`，大小控制在 200 KB 以内。fixture 里有：
  - 工具调用；
  - 压缩替换（如果 run7 没有，就手工补一段）；
  - Inbox claim；
  - 恢复结果（手工补）。
- 测试里内置一个「旧格式 → 新格式」的转换函数，与 T6 的脚本同一套规则，对比两种格式下：
  - `SessionSurface` 折叠出的 entries；
  - 上下文引擎 `toLlmInput` 的 messages；
  - 转写 `render.ts` 的输出；
  - 上下文估算；
  - client `projectChatSession` 的消息。
- 两边结果深度相等。

### T8 文档

- `agent-spec-dsh-event-model.md` §4 envelope 形状、§7 表面投影，改为「surface 只做标记，节点由 `surfaceNode` 推出」。
- `agent-spec-session-format-v1.md` 的 surface 字段说明。
- 规范 `agent-spec-surface-derived.md`：状态改为「已实现」，§6 读取方按实际改动核对。
- `docs/tools/session-viewer/`：如果查看器展示 surface 节点，改为从 data 推出；只展示原始 JSON 的话不动。
- `pnpm check:harness-events`、`test:contract-matrix` 如有生成文件（`agent-contract-matrix.generated.md`），重新生成。
- 历史记录 `docs/histories/2026-11/`（新文件）。

### T9 验证与旧会话清理

- `pnpm typecheck`；各包测试；`pnpm test:contract-matrix`；`pnpm check:harness-events`；`pnpm check:docs`。
- 全仓确认没有残留的旧格式写法：用 T6 的 grep 检查，`dist/` 除外。
- 旧会话清理：
  - 列出 `~/Library/Application Support/ActSpace/sessions-v2/` 下的会话：id、大小、修改时间、是否父会话；
  - 交给用户确认，确认后删除；
  - 删除前把列表存到 `tmp/old-sessions-20261107.txt`。
- 实机验证（用户执行）：
  - 删旧会话后，用 `tmp/heap/monitor.mjs` 按 run7 的问法重跑一次；
  - 对比日志大小和主进程分配；
  - 检查对话、工具卡片、压缩、子 Agent、轨迹、搜索、上下文面板功能正常。

## 风险与回退

| 风险 | 应对 |
|---|---|
| 某个读取方漏改，读到 `undefined` 的节点 | T5 的 grep 必须为空；T7 等价性测试覆盖主要读取方；typecheck 会把类型上的 `node` 访问报出来 |
| `boundToolEvent` 裁剪后推不出节点 | T5 单独核对；client 消息只来自 snapshot，窗口事件不拼节点 |
| 压缩摘要从 surface 移进 data 后，估算或转写读错位置 | T3、T7 覆盖压缩回放与估算 |
| 旧会话打不开 | 规范已确认不兼容；T9 清理旧会话 |

回退：所有改动在同一分支，未合并前 `git revert` 即可；用户数据只删用户确认过的旧会话。

## 验收

- 规范 §9 全部条目。
- 上面 T1–T9 的测试和检查通过。

## 执行记录（2026-11-07）

- T1–T8 已实现，T9 自动化检查通过（未提交）。用户确认后删除了 `sessions-v2` 下全部 79 个旧会话（383 MB，列表存在 `tmp/old-sessions-20261107.txt`）。下一步由用户用 monitor 实机重跑。
- **`boundToolEvent` 的结论：** 窗口里被裁剪的工具事件只保留 `{ kind: "append" }` 标记，推出的 content 是 `undefined`。client 的对话消息只来自 `snapshot.messages`（由服务端完整折叠得到），窗口事件只用来显示工具卡片和轨迹，不会被拿去拼对话节点，所以不需要额外处理。代码里留了注释。
- **等价性测试的位置与计划不同：** 放在 `apps/desktop/src/main/test/surface-derived-equivalence.test.ts`，因为五种读取方（上下文引擎、转写、估算、client 投影）只有 desktop 同时依赖。desktop 为此加了 `@actspace/context-engine` 开发依赖。
  - fixture 在 `apps/desktop/src/main/test/fixtures/surface-derived/`。`old-format.jsonl` 172 KB，195 个事件：run7 父会话去掉请求记录、长字符串截到 120 字；末尾用改前代码（0e0070a3）的写入方补了一段崩溃恢复和一次压缩替换。
  - `expected.json` 是改前代码读旧格式得到的五种结果。生成脚本 `make-fixture.mjs` 也放在同一目录。
  - 变异检查：把转换后的 `isError` 强制写成 `false`，测试失败；恢复后通过。
- **顺带修的旧失败：** `apps/cli/src/test/runtime-v2.test.ts` 还在断言 `assistant/chunk` 写入日志。c6538dd7 已经改成正文流不写日志，所以把断言改成「不含 chunk、含 assistant/message」。
- **fixture 体积：** 同一份日志从旧格式转成新格式，裁剪前 199013 → 175868 字节（−12%）。这份 fixture 的工具输出被截短了；真实日志里工具结果占大头，预计接近规范 §7 的 −31%，以实机重跑为准。
