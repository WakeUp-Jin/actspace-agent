# ActSpace 核心 Cordis Service 化：Phase 1–5

## 用户诉求

在不改动现有工具具体执行逻辑的前提下，按 DeepSeek Harness 的 Service ownership 思路重构 ActSpace 核心运行时，并把 Service ABI、Session live log、persistence provider 以及 LLM/Prompt/Context/ToolRuntime/Compaction 的生命周期边界落地。

## 本次变更

- 在 `@actspace/cordis-adapter` 增加稳定 Service id、Definition/Provider/Consumer 契约、required lookup 和真实 Cordis Service 导出。
- 增加真实 Cordis Fiber 生命周期测试：required injection 缺失、Config 拒绝、启动失败回滚、Effect cleanup 和重复 dispose。
- 将 Session persistence 抽象为 `SessionPersistence` provider；JSONL 实现由 `JsonlSessionPersistenceService` 持有。
- 将 live-log 入口由 `SessionStoreService` 持有，Runtime session controller 注入已有 store，不再在默认 session plugin 中创建 JSONL provider。
- 将 SessionHandle 的 post-commit `session/event` 与 awaited `session/flush` 分开，保留既有 writer、lease、recovery、fork 和 13 事件格式。
- 增加 fake provider seam 与顺序/golden 测试；恢复缺失的 adapter EventHub 过渡源码文件。
- 将 LLM route registry、Prompt source、Context assembler、ToolRuntime registry/scheduler 和 Compaction policy/summarizer 由真实 Cordis Service 持有，补齐 inject、Config、Fiber cleanup 与生命周期测试。
- 将 AgentRegistry、AgentLoop driver、AgentRuntime 由真实 Cordis Service 持有，并把默认 DSH Boot 的 RunController drain 交给 AgentRuntime Fiber effect；补齐 two-agent、observer failure、dependency cycle 和创建失败回滚测试。

## 设计动机

Cordis 的 `Service` 不是普通 class 的别名：它通过 Fiber 注册、依赖注入和 `ctx.effect` 自动获得生命周期。SessionStore 只应知道 live-log 与 header/replay 语义，文件布局、JSONL inspect 和 torn-tail recovery 属于可替换 provider。这样才能在未来替换 SQLite 或远程 backend 时不改变 AgentLoop 和 Session projection。

## 关键验证

- `@actspace/cordis-adapter` build/typecheck/test 通过。
- `@actspace/session-persistence` typecheck 通过，34 个测试通过。
- `@actspace/session-journal`、`session-jsonl`、`session-projection` 测试通过。
- `@actspace/llm-service` 11 tests、`@actspace/tools-runtime` 17 tests、`@actspace/context` 3 tests、`@actspace/prompt` 6 tests、`@actspace/compaction` 3 tests 通过。
- CLI 单次 `run --mock --json`、SIGINT process smoke、`pnpm -r typecheck` 和 `pnpm -r test` 通过。

## 后续

后续只需归档执行计划并处理仓库已有的文档登记门禁；具体工具 executor、事件模型和 Session 格式保持不变。
