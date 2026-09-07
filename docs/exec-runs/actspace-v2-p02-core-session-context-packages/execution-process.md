# P02 执行过程

日期：2026-08-25

## 实施内容

- 将 Scope、Agent Registry、Main Agent Inbox、Prompt/Skills、Context Assembly 和 Compaction 从旧 Runtime 内部目录迁移到独立 workspace package。
- 将 Session 事实源拆为 `@actspace/session-journal`、`@actspace/session-jsonl`、`@actspace/session-persistence`、`@actspace/session-projection`；Persistence 通过 package exports 使用 JSONL 和 Projection，不读取另一个包的 `src/`。
- 将 Agent Loop 作为真实 `@actspace/core-agent-loop` package entry，依赖 P03 的 LLM/Tools package contract。
- 保留 `packages/agent-runtime` 作为本轮尚未切换的兼容消费者；没有删除旧数据、没有导入 v1 数据、没有做产品切换。

## 验证命令

```text
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-jsonl test
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/core-scope test
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/context test
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/compaction test
pnpm check:packages
pnpm typecheck
```

## 迁移参考与安全边界

- `session/persistence/src/test/golden/acceptance.test.ts` 携带 17 个 Session Format v1 验收案例，包含 required/ignorable codec、raw browse、writer lease、torn tail、fork、compaction、旧目录不加载和 secret canary。
- `src/test/fixtures/lease-holder.cjs` 只用于跨进程 writer lease 测试；它不是运行时入口，也不扫描用户旧数据。
- `@actspace/session-journal` 的 codec registry 仍在 Journal 写入/resume 前执行；required codec 缺失进入 browse-only，ignorable codec 缺失只进入 degraded。
