# ActSpace 核心 Cordis Service 化与能力 seam — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-core-cordis-services/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-core-cordis-services/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 当前阶段核心变更清单

- Phase 1：新增稳定 Service id、Definition/Provider/Consumer 类型、required lookup 与真实 Cordis Service 导出；加入 Fiber 生命周期契约测试。
- Phase 2：新增 `SessionPersistence` provider seam、`JsonlSessionPersistenceService`、`SessionStoreService`；SessionHandle 分离 post-commit `session/event` 与 awaited `session/flush`。
- Phase 3：将 LLM、Prompt、Context、ToolRuntime 和 Compaction 的长期 registry/cache/policy 入口改为真实 Cordis Service；补齐 inject、Config、Fiber cleanup 与生命周期测试。
- Phase 4：AgentRegistry、AgentLoop driver、AgentRuntime 已接入真实 Cordis Service owner；补齐 quiesce/dispose、two-agent isolation、observer failure、dependency-cycle negative 和 Agent 创建失败回滚测试。
- Phase 5：默认 DSH Boot 的 AgentRuntime shutdown ownership 已收缩到 Cordis Fiber；CLI 单次无头 run、SIGINT process smoke、package tests 与全量 typecheck/test 均通过。
- 保留具体 JSONL writer、lease、recovery、projection 算法和工具执行逻辑不变。
- 恢复 adapter 源码中缺失的 EventHub 过渡桥接文件，并明确其不属于默认 Service ABI。

## 当前阶段人工验证指引

1. 在仓库根目录运行 `pnpm --filter @actspace/cordis-adapter test`，确认 Service ABI 与真实 Cordis lifecycle tests 通过。
2. 运行 `pnpm --filter @actspace/session-persistence test`，确认 provider seam、post-commit/flush 顺序、recovery、fork、lease 与 JSONL golden 全部通过。
3. 查看 `packages/session/persistence/src/test/provider-seam.test.ts`，确认 fake provider 可替代 JSONL backend。
4. CLI 单次 run、Agent Loop 和 Runtime 收缩已完成自动化验收；真实 Provider、Desktop/Chrome 与发布制品仍属于外部人工门禁。

## Agent 已完成的验证

- `pnpm --filter @actspace/cordis-adapter build`：通过。
- `pnpm --filter @actspace/cordis-adapter typecheck`：通过。
- `pnpm --filter @actspace/cordis-adapter test`：15 passed，1 skipped（明确 skip 的 real Loader smoke）。
- `pnpm --filter @actspace/test-support typecheck`：通过。
- `pnpm --filter @actspace/session-persistence typecheck`：通过。
- `pnpm --filter @actspace/session-persistence test`：34 passed。
- `pnpm --filter @actspace/session-journal test`：9 passed。
- `pnpm --filter @actspace/session-jsonl test`：1 passed。
- `pnpm --filter @actspace/session-projection test`：1 passed。
- `pnpm --filter @actspace/llm-service typecheck && pnpm --filter @actspace/llm-service test`：通过，11 passed。
- `pnpm --filter @actspace/tools-runtime typecheck && pnpm --filter @actspace/tools-runtime test`：通过，17 passed。
- `pnpm --filter @actspace/context typecheck && pnpm --filter @actspace/context test`：通过，3 passed。
- `pnpm --filter @actspace/prompt typecheck && pnpm --filter @actspace/prompt test`：通过，6 passed。
- `pnpm --filter @actspace/compaction typecheck && pnpm --filter @actspace/compaction test`：通过，3 passed。
- `pnpm --filter @actspace/core-agent typecheck && pnpm --filter @actspace/core-agent test`：通过，6 passed。
- `pnpm --filter @actspace/core-agent-loop typecheck && pnpm --filter @actspace/core-agent-loop test`：通过，3 passed。
- `pnpm --filter @actspace/runtime typecheck && pnpm --filter @actspace/runtime test`：通过，4 passed。
- `pnpm --filter @actspace/core-agent-loop typecheck && pnpm --filter @actspace/core-agent-loop test`：通过，4 passed。
- `pnpm --filter @actspace/cordis-adapter test`：通过，18 passed，1 skipped。
- `git diff --check`（本计划涉及路径）：通过。
- `pnpm -r typecheck`：通过，32 workspace projects。
- `pnpm -r test`：通过（apps/desktop 522 tests；其他 workspace 均通过）。
- `pnpm test:agent-cli:process`：通过，2 passed。
- CLI `run --mock --json`：通过，`ok:true`、`status:completed`、1 step、11 durable events。

## 已知风险和遗留事项

- 真实 Provider、Electron/Chrome、DMG、签名/公证和 clean-checkout 门禁不由本计划自动证明。
- 全量 typecheck 已通过；显式 legacy/诊断 Boot 仍保留过渡 assembly，因此不宣称所有历史 central assembly 已删除。
- `pnpm run check:docs`、`check:current-docs`、`check:packages`、`check:v2-legacy-removal`、`check:secrets` 均已通过。

## 后续建议

计划已完成并已归档到 `docs/exec-plans/completed/`；真实 Provider、Desktop/Chrome 与发布制品仍属于外部人工门禁。
