# P03：Context、Composer 与 Trajectory 投影消费

## 目标

让 Context、Usage、Composer 和 Trajectory 都消费 P02 提供的 Session-bound projection snapshot，不再各自读取或推导 Session 状态。完成后，Context 数字有明确含义，Composer phase 由 Session facts 一次派生，Trajectory 从同一 Journal replay 得到并支持全量/增量等价。

模块边界固定为：Host 侧的 projection definition、Trajectory builder 和 snapshot schema 放在 `packages/session/projection`；通用 Client Session store、selectors 和 read-only trajectory value 放在 `packages/client`；Desktop renderer 只负责 React/UI adapter，不重新持有一套事件状态。

## 依赖

- [P02 Client Session Store、Desktop IPC Revision 与 Session Identity](./p02-desktop-session-store-and-ipc.md)；
- P00/P01 的 projection keys、watermark 和 canonical Surface；
- `packages/session/projection` 的 Host projection registry 与 `packages/client/src/sessions/**` 的 framework-neutral Session API；
- [Agent Token Usage 与 Context State](../../../design-docs/model-context/agent-token-usage-and-context-state.md)；
- DSH `ConversationSnapshot`、`composerPhase` 和 Trajectory builder 的机制参考。

## 范围

允许修改：

- `apps/desktop/src/renderer/components/ConversationView.tsx`；
- `apps/desktop/src/renderer/components/right-panel/ContextRenderView.tsx`；
- `apps/desktop/src/renderer/components/ContextPopup.tsx`；
- `apps/desktop/src/renderer/components/SessionHoverPreview.tsx`；
- `apps/desktop/src/renderer/App.tsx` 中 Context、Composer 和 Trajectory props 的适配部分；
- `packages/session/projection/src/trajectory.ts`、`trajectory-builder.ts` 或等价 Host projection files；
- `packages/client/src/sessions/**` 中 Context/Composer/Trajectory 的只读 value、selector 和 subscription adapter；
- `apps/desktop/src/renderer/components/trajectory/**`；
- `apps/desktop/src/renderer/test/context-popup.test.tsx`、`context-render-view.test.tsx`、Composer/Conversation tests 和新 Trajectory tests；
- 相关 i18n、design-doc index 和 projection metadata。

禁止修改：

- Session event schema、JSONL writer、Tool executor、LLM provider wire；
- Context estimator 的模型语义，除非先更新 Context 设计规范并固定 estimator version；
- UI 视觉布局、主题 token 和桌面顶部组件；
- 独立 Trajectory 日志、Context sidecar 或 renderer 自己的事件折叠器；
- 在 `packages/client` 中引入 Electron、React 或 Host filesystem 依赖；

## 实施步骤

1. 将 `ContextUsageSnapshot` 重命名或适配为 `ProviderUsageProjection`，将 `ContextState` 重命名或适配为 `RequestContextEstimateProjection`；Host projection 类型和 Client read-only value 都带明确 estimator、schemaVersion 和 `throughJournalSeq`。
2. 统一 Context 消费路径。Context popup、Session hover 和右侧 Context view 都从同一个 SessionStore snapshot selector 读取；若需要 revalidation，异步请求必须携带当前 `sessionId + throughJournalSeq + requestId`，旧结果丢弃。
3. 为 Composer 定义 Session-owned `composerPhase: blank | engaging | active`。由 durable surface、accepted input、running turn、pending inbox 和 prompt error 派生一次，组件只切换提示和控制状态，不用 `messages.length` 决定是否卸载。
4. 将 ConversationView 改为 resident Composer slot。streaming overlay 清理后，durable Surface projection 自动接管，不再让输入框和消息列表在两个不一致的 state source 之间来回切换。
5. 在 `packages/session/projection` 增加 Trajectory projection definition 和 keyed builder。稳定 key 使用 `sessionId + eventSeq`，工具节点额外关联 `callId`；支持全量 `replace` 和增量 `apply`。
6. 在 `packages/client/src/sessions/**` 暴露 Trajectory、Context 和 Composer 的只读 value/selector。Desktop renderer 仅通过 adapter 消费这些值；不新增日志文件，不在 renderer 重新 fold 原始事件。
7. 覆盖以下测试：Provider usage 与 context estimate 分离、同 Session 新 request 覆盖旧 describe、Session 切换丢弃旧结果、Composer 完成态保持 resident、Trajectory 全量/增量等价、tool/retry/approval/compaction/error 节点稳定排序。
8. 更新前端和 Agent Runtime 设计索引，明确 Context 两类指标、Composer phase 和 Trajectory 的只读边界。

## 验收标准

- UI 中所有 Context 数字都能说明是 provider usage 还是 request context estimate。
- 同一个 Session 的新一轮 request/context 不会被旧异步 describe 结果覆盖。
- Composer phase 由 Session snapshot 提供，最终回复后 Composer 仍然存在。
- Conversation 只展示 Surface，Trajectory 展示完整 AgentLoop 过程，两者使用同一 Journal。
- Trajectory 的 replay、`replace` 和 keyed `apply` 产生相同节点、排序和状态。
- Trajectory、Context 和 Composer 不读取 AgentLoop 私有状态或独立 renderer event cache。
- `@actspace/client` 不依赖 Electron、React 或文件系统；Host builder 与 Client consumer 之间只通过 snapshot/value contract 连接。
- 具体工具执行逻辑和现有 Context estimator 的 versioned 结果保持不变。

## 定向验证

```bash
pnpm --filter @actspace/session-projection typecheck
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/client typecheck
pnpm exec vitest run packages/client/src/sessions
pnpm exec vitest run apps/desktop/src/renderer/test/context-popup.test.tsx
pnpm exec vitest run apps/desktop/src/renderer/test/context-render-view.test.tsx
pnpm exec vitest run apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx
pnpm --filter @actspace/desktop typecheck
pnpm run check:current-docs
```

真实 Electron 启动、reload、Session 切换和截图验收由人工完成，并在执行摘要中记录，不以 renderer unit test 代替。

## 回退

Context、Composer 或 Trajectory consumer 回归时，可以回退 `packages/client` 的 read-only adapters、Desktop 组件适配和 Trajectory view，但保留 P00/P01/P02 的 Journal projection、SessionStore 和 revision contract。Trajectory 可暂时关闭为 capability absent，不能恢复独立日志或第二个 Context 数据源。

## 交接给 G1/P2

必须提供：

- `providerUsage` 与 `requestContextEstimate` 的最终 DTO 和 estimator version；
- `composerPhase` 的派生输入和 selector；
- Trajectory node schema、stable key、全量/增量算法和 projection key；
- Host projection builder 与 `packages/client` read-only value/selector 的边界；
- stale response、Session switch、Composer completion 和 trajectory parity 测试结果；
- 需要人工验证的 Electron/UI 场景清单。

## 进度记录

- [x] 拆分 Provider usage 与 request context estimate 的 Host projection DTO。
- [x] 在 Client SessionStore 中提供 revision-bound projection value 与 Context/Composer/Trajectory selectors。
- [x] 定义 Session-owned composerPhase 派生规则，保留 resident Composer 迁移所需的只读契约。
- [x] 完成 Trajectory projection、稳定 key、全量 replay/incremental apply contract 与 parity tests。
- [x] 接入 `SessionProjectionProvider`，让 Workbench 的 Composer phase、Context snapshot、durable Surface message count 和 Trajectory value 由 Client selectors 驱动。
- [x] 启用只读 Trajectory UI，并覆盖 empty/ordered node renderer tests。
- [x] 让 Conversation、Composer、Context popup/Context view、Session hover 和 Trajectory 在当前 Session provider 存在时直接读取 selectors，并保留无 Provider 的测试/兼容 fallback。
- [ ] 完成 Conversation 富消息 adapter 的最终 durable Surface 映射、renderer 全量回归和人工验收交接。

## 执行模式

交互模式。P03 会改变 Client/Desktop 的数据消费方式，并新增可选 Trajectory 视图；先完成 Context/Composer contract，再启用 Trajectory UI，避免把诊断视图回归误判为 Session 事实问题。
