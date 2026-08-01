# Actspace Cache Loss Audit 执行计划

## 目标

为 actspace 增加一条低成本缓存失效排查链路：当 `llm_usage` 真实 cache hit ratio 低于阈值时，在 `session.jsonl` 中留下轻量 `cacheStatus/cacheAuditId` 索引，并把上一轮与当前轮真实送入 provider 的 Context 保存到旁路 audit 目录，后续可用脚本分析 prefix 变化、append-only 破坏和消息断点。

## 范围

包含：

- 设计规范：`docs/design-docs/model-context/agent-cache-loss-audit.md`。
- 共享契约：扩展 `packages/shared/src/session.ts#LlmUsagePayload` 的可选审计字段。
- agent-core 运行时：在 provider 调用前后接入 `CacheAuditTracker`。
- session 持久化：低缓存时在 `llm_usage` 事件写入 `cacheStatus/cacheAuditId`。
- 旁路文件：写入 `last.context.json`、`summary.json`、`previous.context.json`、`current.context.json`、`diff.txt`。
- 分析脚本：`scripts/analyze-cache-audit.mjs`。

不包含：

- 不做自动缓存修复。
- 不把完整上下文写入 `session.jsonl`。
- 不修改 Usage Statistics 页面视觉。
- 不把 audit 文件上传或接入远端 telemetry。
- 不回填历史 session 的 `cacheStatus`。

## 背景

相关文档：

- `docs/design-docs/model-context/agent-cache-loss-audit.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/model-context/agent-context-compression.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/exec-plans/completed/20260530-context-cache-and-usage/README.md`

相关代码路径：

- `packages/shared/src/session.ts`
- `packages/agent-core/src/messages.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/observability/cache-audit.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `scripts/analyze-cache-audit.mjs`

已知约束：

- actspace 的 `session.jsonl` 是 `SessionEvent` 事件流，不是 ChatMessage 日志。
- `llm_usage` 已经是 token/cache/cost 事实来源，审计索引应优先挂在 `LlmUsagePayload`。
- Context 快照可能非常大，不能每轮长期保存；使用滚动 `last.context.json` + 低缓存时固化 previous/current。
- 审计字段不得进入下一轮 LLM 输入。

## 风险

- 风险：完整 Context 快照可能包含敏感正文。
  - 缓解方式：默认只写本地 `userData/cache-audit`；文档明确不上传；脚本默认只打印摘要。
- 风险：1M 级上下文写盘影响主流程。
  - 缓解方式：写入失败不阻断 turn；后续实现可用 best-effort 异步写入；只在低缓存时固化完整快照。
- 风险：hash 序列化不稳定导致误报 append-only 破坏。
  - 缓解方式：实现稳定 key 排序的 canonical stringify，并用 fixture 锁定。
- 风险：不同 provider 的 cache 字段语义不一致。
  - 缓解方式：首版以 `cacheHit/cacheRead + cacheMiss` 为 denominator；没有 denominator 时不标低缓存。

## 里程碑

1. 设计与离线分析地基。
   - 新增设计规范。
   - 新增 active plan。
   - 新增可直接执行的分析脚本，支持 audit 目录与 previous/current 直接对比。
2. 共享契约与持久化索引。
   - `LlmUsagePayload` 增加 `cacheStatus?: boolean`、`cacheAuditId?: string`、可选 `cacheHitRatio?: number`。
   - `createLlmUsageEvent` 从 `AssistantMessage` 或 usage call 附带审计信息生成 payload。
   - 补 shared/bridge 测试。
3. 运行时 `CacheAuditTracker`。
   - provider 调用前生成 Context 快照与 hash 链。
   - 与上一轮滚动快照比较，产出 preflight。
   - provider 返回 usage 后判断低缓存并写旁路文件。
   - 每次模型调用后覆盖 `last.context.json`。
4. 端到端验证。
   - fixture 模拟 append-only 正常、prefixChanged、appendOnlyBroken。
   - 用脚本扫 audit 目录，确认能定位 firstChangedMessageIndex。
   - 真实 DeepSeek turn 手工检查 `session.jsonl` 与 audit 目录。

## 验证方式

命令：

- `node scripts/analyze-cache-audit.mjs --previous <previous.context.json> --current <current.context.json>`
- `node scripts/analyze-cache-audit.mjs <cache-audit-session-dir>`
- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/agent-core build`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm typecheck`

手工检查：

- 低缓存时 `session.jsonl` 的 `llm_usage.payload.cacheStatus === true`。
- `cacheAuditId` 能定位到对应 `summary.json`。
- `previous.context.json/current.context.json` 是真实 provider 输入，而不是压缩后的 session 当前状态。

观测检查：

- `summary.json` 中 `cacheHitRatio`、`prefixChanged`、`appendOnlyBroken`、`firstChangedMessageIndex` 与脚本输出一致。
- `diff.txt` 能给出第一处消息断点和 prefix/request hash。

## 进度记录

- [x] 完成设计规范 `docs/design-docs/model-context/agent-cache-loss-audit.md`。
- [x] 完成离线分析脚本 `scripts/analyze-cache-audit.mjs`。
- [x] 扩展 `LlmUsagePayload` 共享契约。
- [x] 接入 agent-core `CacheAuditTracker`。
- [x] 写入 `cacheStatus/cacheAuditId/cacheHitRatio` 与 audit 旁路文件。
- [x] 补运行时单测：`observability/test/cache-audit.test.ts` 与 `engine/test/bridge.test.ts`。
- [x] 完成 mock 级验证：低缓存 usage 能写 `llm_usage` 索引，并落 `summary/previous/current/diff`。
- [ ] 真实 DeepSeek turn 手工验证 `session.jsonl` 与 `<userData>/cache-audit`。

## 决策记录

- 2026-05-31：缓存低的最终事实以模型返回 usage 为准，默认 `cacheHitRatio < 0.9` 标记 `cacheStatus: true`；发送前 hash 链只用于解释原因。
- 2026-05-31：actspace 的轻量索引写入 `llm_usage.payload`，不写入 assistant message，因为 actspace 的 session 是事件流。
- 2026-05-31：完整上下文不进 `session.jsonl`，只在低缓存时固化到旁路 audit 目录；上一轮 Context 用 `last.context.json` 滚动保存。
- 2026-06-01：运行时实现挂在 `AgentLoopConfig.cacheAudit` 上，由 desktop main 为主 Agent turn 创建 tracker；Kairos 暂不接入这条审计链路。
