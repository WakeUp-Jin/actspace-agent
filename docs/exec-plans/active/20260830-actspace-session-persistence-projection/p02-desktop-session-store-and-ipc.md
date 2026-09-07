# P02：Client Session Store、Desktop IPC Revision 与 Session Identity

## 目标

让通用 Client Session runtime、Electron main、preload 和 Desktop renderer 只围绕一个显式 `sessionId` 消费 `SessionProjectionSnapshot`。完成后，Session 打开、切换、Live Progress、Context describe 和 Conversation 渲染都使用同一 Session identity 和 Journal watermark，不再从 `sessionRecord`、`agentRunResult`、`visibleSessions[0]` 等并行来源猜测当前状态。

模块边界固定为：`packages/client` 持有与框架无关的 Client Session 和 Projection Value Store，Desktop 只提供 Electron IPC bridge、React adapter 和界面消费。`packages/runtime` 仅负责 Host boot 与 Service wiring，不成为 renderer Session state 的所有者。

## 依赖

- [P00 Projection Contract](./p00-projection-contract.md)；
- [P01 Projection Registry、Watermark 与 Cache](./p01-projection-registry-and-cache.md)；
- P1-C 最终 `BootManifest` 和 Desktop Host capability metadata；
- 当前 `packages/client/src/index.ts` 的公共 client boundary，必要时扩展为 `packages/client/src/sessions/**`；
- [Runtime Projection 公共契约](../../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)。

P02 不重新实现 projection fold。Main 只调用 P01 的 registry 或 durable projection service。

## 范围

允许修改：

- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`；
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`；
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`，仅在 Session projection service 接线需要时；
- `apps/desktop/src/preload/index.ts`；
- `packages/shared/src/runtime-v2/fixed-renderer.ts`、`projection.ts`，仅在 IPC contract 需要 re-export 时；
- 新增或扩展 `packages/client/src/sessions/**`，定义 framework-neutral 的 Session store、snapshot cache、subscription 和 selectors；
- 新增 `apps/desktop/src/renderer/session/**`，只放 Electron bridge、React adapter 和 Desktop-specific lifecycle glue；
- `apps/desktop/src/renderer/App.tsx`；
- `packages/client/src/sessions/**/*.test.ts`、`apps/desktop/src/renderer/test/session-store.test.ts`、`app-streaming-user-message.test.tsx` 和相关 IPC tests。

禁止修改：

- Session Journal event schema、JSONL writer、AgentLoop 和工具 executor；
- Context、Composer 和 Trajectory 的视觉样式；
- 在 `packages/client` 中引入 Electron、React 或 Desktop-only API；
- 在 `apps/desktop` 中再实现一份通用 SessionStore 或 Projection fold；
- `visibleSessions[0]` 作为新的 fallback；
- 在 renderer 中重新拼接 `SessionRecord.events`、`AgentRunResult` 和独立 Context response。

## 实施步骤

1. 在 `packages/client/src/sessions/**` 定义 framework-neutral 的 `SessionStore[sessionId]` 状态：durable snapshot、live overlay、current revision、runtime identity、loading/error 和 request generation。Store 的唯一 key 是显式 `sessionId`；订阅使用 callback/snapshot contract，不把 React hook 放进 client core。
2. 在 main IPC 增加 Session projection snapshot 读取和增量刷新 contract。请求带 `sessionId + requestId + knownThroughJournalSeq`，返回带 `sessionId + requestId + throughJournalSeq`。
3. 让 fixed renderer projection 复用 P00 canonical Surface adapter，删除或隔离只识别 `user/message` 的重复 Surface 判断。完整 Journal 只保留在 main/diagnostics 边界。
4. 在 preload 中暴露 typed `openSessionSnapshot`、`refreshSessionSnapshot` 或等价 API，禁止暴露 writer、Provider class、文件路径和 credential。
5. 在 Desktop renderer 的 bridge/React adapter 中把 IPC snapshot、live notification 和 client store 连接起来。将 App 的当前 Session identity、Session load、stream subscription 和 projection refresh 统一绑定到该 store。删除 `visibleSessions[0]` 的事实性 fallback；列表只负责提供可选择的 Session 元数据。
6. 实现 durable snapshot 与 live overlay 的合并规则：overlay 只能覆盖尚未由 durable projection 提供的临时内容，Journal 更新后必须丢弃对应 overlay。
7. 为 Session 切换、快速切换、通知丢失、runtimeInstanceId 变化、liveSeq gap、旧 IPC response、Session reload 和最终回复后的 canonical Surface 接管增加测试。
8. 保留现有 UI 组件的 props 适配层，让 P03 可以独立迁移 Context、Composer 和 Trajectory；本计划不在组件内部重新推导 Session 生命周期。

## 验收标准

- 一个 `sessionId` 贯穿 main load、preload API、renderer Store、live subscription 和 selectors。
- `throughJournalSeq` 不回退；旧 response、旧 runtimeInstanceId 和旧 Session event 不会覆盖当前 Store。
- `agent/inbox/spliced` 的 user Surface node 在 stream 结束后由 durable snapshot 接管。
- 通知丢失或 live gap 会触发 durable resync，而不是继续显示推测状态。
- renderer 不直接读取完整 Journal，不持有 Provider、writer、credential 或 plugin object。
- `@actspace/client` 不依赖 Electron 或 React；Desktop-specific adapter 不被其他 Host Session runtime 反向依赖。
- 现有 Session list、fork、archive、rename 和 workspace 选择行为不改变。
- `pnpm --filter @actspace/client typecheck`、`pnpm --filter @actspace/desktop typecheck`、相关 renderer/main tests 通过。

## 定向验证

```bash
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/client typecheck
pnpm --filter @actspace/desktop typecheck
pnpm exec vitest run apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts
pnpm exec vitest run packages/client/src/sessions
pnpm exec vitest run apps/desktop/src/renderer/test/session-store.test.ts
pnpm exec vitest run apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx
pnpm run check:packages
```

## 回退

如果 Client Session Store 或 Desktop IPC revision 接线出现回归，回退 `packages/client/src/sessions/**`、main/preload 和 renderer adapter，保留 P00/P01 的 projection contract、registry 与独立 cache。回退不得恢复 `visibleSessions[0]` 作为事实来源，也不得用临时 `streamingBlocks` 永久替代 durable Surface。

## 交接给 P03

必须提供：

- SessionStore state 和 selector API；
- `packages/client` 的 framework-neutral Session API、subscription 和 snapshot cache contract；
- snapshot/live overlay merge 规则；
- IPC request/response envelope；
- Session switch 和 resync 生命周期；
- projection revision stale-response 规则；
- 现有组件的适配边界和定向测试结果。

## 进度记录

- [x] 定义并测试 framework-neutral SessionStore state。
- [x] 完成 main/preload projection IPC contract 和 typed Desktop bridge。
- [x] 将 App 的当前 Session identity 改为显式 selectedSessionId，移除 visibleSessions[0] 的事实性 fallback。
- [x] 完成 durable/live merge、gap、runtime identity 和 stale response 的基础测试。
- [ ] 完成 App 全量组件消费迁移、真实 Electron reload/quit/flush 和人工 UI 验收。

当前进展：`SessionProjectionProvider` 已接入 Desktop 根树，Workbench 的 Composer phase、Context snapshot、durable Surface message count 和 Trajectory value 已由 Client selectors 驱动；富消息 `MessageBlock[]` 仍保留为 renderer 适配层，真实生命周期与 durable projection 不再依赖它单独做事实判断。

## 执行模式

交互模式。P02 是 Client Session 数据源和 Desktop bridge 的切换，预计触及超过 8 个文件；先落 framework-neutral store 和 IPC contract，再迁移 App，最后运行真实 Electron 手工验收。
