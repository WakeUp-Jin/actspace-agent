## [2026-06-04 02:52] | Task: Raise Explore SubAgent Turn Cap

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户指出 SubAgent 最终输出变成 `Explore SubAgent completed without a text summary.` 很可能是 `maxTurns` 过低导致，要求不补提示词，直接把 Explore SubAgent 的 `maxTurns` 硬性调整为 100。

### Changes Overview

**Scope:** `packages/agent-core`, `docs/design-docs`, `docs/histories`

**Key Actions:**

- **[Runtime cap]**: 将 Explore SubAgent runner 里的 `maxTurns` 从 12 调整为 100。
- **[Regression test]**: 新增用例模拟连续 13 轮 read 后才输出最终 summary，防止复杂探索再次被 12 轮硬截断。
- **[Docs]**: 更新 SubAgent runtime 规范，记录 V0 Explore SubAgent 的 hard cap 为 100 turns。

### Design Intent (Why)

前端设计全景类探索会连续读取多份设计文档和组件文件。12 轮上限太容易在模型还处于工具调用阶段时截断，导致 runner 只能从空文本 assistant message 生成 fallback summary。把硬上限调到 100，保留防无限循环保护，同时给复杂只读探索足够空间产出最终报告。

### Verification

- `pnpm --filter @actspace/agent-core exec vitest run src/tools/test/agent-tool.test.ts`
- `pnpm --filter @actspace/agent-core typecheck`

### Files Modified

- `packages/agent-core/src/tools/tools/agent/runner.ts`
- `packages/agent-core/src/tools/test/agent-tool.test.ts`
- `docs/design-docs/agent-subagent-runtime.md`
- `docs/histories/2026-06/20260604-0252-subagent-max-turns.md`
