# P00：Request Model Facts

> 状态：实现完成；2026-09-09 全仓类型与测试回归通过，随总计划归档。原 2026-09-02 执行结果保留为历史记录，人工验收见总计划 G2。

## 目标

在每次真实 LLM 请求进入 dispatch 前，解析并持久化当次模型的 `contextWindow`，使 Session Projection 可以重启后准确恢复上下文容量。

## 依赖与范围

依赖：Context / model facts 设计规范；当前 `ModelDefinition.contextWindow`、Desktop model resolver 和 `request/header` / `request/context` 事件。

包含：

- 为 request model facts 定义稳定的 JSON-safe 类型；
- 在模型准备阶段取得模型专属 contextWindow；
- 同时写入 `request/header` 和 `request/context.snapshot.prepared`；
- Projection 使用持久事实，旧 Session 缺失时按零容量显示；
- 补 Agent Loop、Session projection、Desktop projection 的正向和兼容测试。

不包含：

- ContextPopup 样式或 Composer wiring；
- settings.json schema 重做；
- provider usage 语义变化；
- 新增模型分类或修改 API Key 边界。

## 主要文件范围

- `packages/llm/service/src/adapter.ts`
- `packages/llm/service/src/service.ts`
- `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts`
- `packages/prompt/src/request-snapshot.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/session/journal/src/core-codecs.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `packages/session/projection/src/product-projections.ts`
- 对应 package tests 与 Desktop projection tests

## 具体步骤

1. 定义 `contextWindow: number | null` 的 request model facts contract，并确保 `freezeRequest` 继续拒绝 secret-like 字段。
2. 在 Desktop model resolver 能得到真实 ModelDefinition 的位置生成 facts；不能从 renderer 当前选择或可变 settings 文件临时猜测。
3. Agent Loop 写 `request/header.contextWindow`，并把相同值写入 `prepared.contextWindow`；retry request 重新写各自的 header/context。
4. 修改 `projectContextSnapshot`、`projectContextState`、`projectRequestContextEstimate` 的容量读取优先级：header → prepared snapshot → `0`。
5. 删除生产路径中的 `200_000` 容量兜底；缺失容量统一投影为 `0`，不把测试值当运行时默认。

## 验证

- request snapshot secret / JSON-safe 测试；
- Agent Loop 首次请求与 retry 请求都保存 contextWindow；
- 不同模型 contextWindow 投影不同；
- 缺失 contextWindow 的旧事件投影为 `0`，UI 不显示 Unknown；
- `pnpm --filter @actspace/session-projection test`；
- `pnpm --filter @actspace/desktop test -- fixed-renderer-projection`；
- `pnpm -r typecheck`；
- `git diff --check`。

## 风险与回退

如果某个 Provider 无法在 dispatch 前提供可靠 contextWindow，request facts 可以记录缺失值，但 Projection 与 UI 统一按 0 处理；不得用 route 的全局猜测覆盖模型事实。P00 回退只撤销新增字段的消费，保留向前兼容的 Journal 数据。

## 完成条件

- P00 测试证明 request/header 与 prepared snapshot 的值一致；
- 生产 Projection 不再从固定 200K 计算容量；
- 旧 Session 可读取且不会崩溃；
- 变更记录写入对应 execution run 和最终 history。

## 执行结果（2026-09-02）

- 已完成 prepare → request/header → request/context.prepared 链路。
- 已完成容量读取与旧 Session 缺失容量按 0 的兼容投影。
- LLM Service、Session projection、Desktop projection 聚焦测试通过。
- 全量桌面 typecheck 仍受既有 `ProviderSettings.tsx` `onChanged` 错误阻断。

2026-09-09 文档校准：当前 Desktop Context 容量优先读取 prepared snapshot，再回退关联 header，最后为 `0`；初稿第 4 步的顺序保留为当时计划，当前读取契约以 Usage/Context 主规范为准。正常 request 的两处 model facts 应一致。
