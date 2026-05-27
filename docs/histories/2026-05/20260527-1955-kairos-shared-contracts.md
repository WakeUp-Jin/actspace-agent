## [2026-05-27 19:55] | Task: 落地 Kairos shared 契约基座

### 🤖 Execution Context

- **Agent ID**: cursor-agent / actspace-agent workspace
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE / pnpm 10.33

### 📥 User Query

> 嗯嗯，开始执行这些计划吧，一个一个执行（执行 `docs/exec-plans/active/kairos_shared_contracts.md`）

### 🛠 Changes Overview

**Scope:** `packages/shared`（含下游 `packages/agent-core` 的 SessionEventType 兼容确认）

**Key Actions:**

- **扩展 SessionEventType**：在末尾追加 4 个 Kairos 专属 type（`kairos_tick_injected` / `kairos_sleep_start` / `kairos_sleep_end` / `kairos_sleep_interrupted`），并新增 4 个对应 payload type 导出。原有 type 顺序保持不变。
- **新增 `kairos-contracts.ts`**：定义 `KairosRunState` / `KairosRuntimeState` / `KairosControl` / `KairosRowKind` / `KairosRowStatus` / `KairosEventRow` 与 IPC 请求/响应 payload；`KairosPinNoteRequest` 显式 `never` 留给 v2。
- **新增 `kairos-aggregator.ts`**：实现纯函数 `aggregateKairosEvents`，单趟扫描把 SessionEvent[] 折叠为 KairosEventRow[]（tick / tool / reply / sleep / interrupt / error 六类行）；显式处理 tool_call/tool_result 配对、sleep 中断、tick 父行 status 推导。
- **session-selectors 跳过新事件**：`createMessageBlocks` 的 switch 新增 4 个 Kairos type 的"跳过"分支，避免穷尽性错误，同时锁定"Kairos 事件不进主 Agent 消息流"语义。
- **shared 包补 vitest 测试基础设施**：新增 `vitest.config.ts`、`package.json` 加 `vitest ^3.2.4` 与 test 脚本、tsconfig 加 `exclude: ["src/**/test"]`。
- **新增 fixtures + 单测**：`src/test/fixtures/kairos-events.ts` 提供 8 个事件工厂 + 3 个场景；`src/test/kairos-aggregator.test.ts` 覆盖 11 条用例（空输入、tool 配对、sleep 中断、tick 父行、error 推 failed、多 tick 隔离、乱序自排序等）。
- **更新设计文档状态**：`docs/design-docs/agent-core/kairos-autonomous-mode.md` 顶部状态从 Draft 改为"实施中"，增加 plan 完成清单。

### 🧠 Design Intent (Why)

shared 契约是 Kairos 6 份后续 plan 的"硬地基"。先把 SessionEvent / KairosEventRow / aggregator 锁在 shared，所有人后续在 main / renderer 都只 import 同一份类型，避免任何子 agent 在 plan 2-7 中各自发明类型导致的对齐成本。

aggregator 放在 shared 而不是 renderer 是因为 main 端未来也会拿它做"行级搜索 / 过滤"，纯函数也便于 fixture 测试。

`KairosPinNoteRequest = never` 是为了让任何"v1 不该有的 pin 调用"在编译期失败，明确语义。

`createMessageBlocks` 中 4 个 Kairos type 都走"跳过"分支，是为了 v1 任何老 session 偶然包含这些 type（不会，但写防御），主 Agent 消息渲染不会因为 type 不识别炸掉。

### 📁 Files Modified

- `packages/shared/src/session.ts`（扩展 type + 新 payload）
- `packages/shared/src/session-selectors.ts`（switch 新增跳过分支）
- `packages/shared/src/kairos-contracts.ts`（新增）
- `packages/shared/src/kairos-aggregator.ts`（新增）
- `packages/shared/src/index.ts`（导出新模块）
- `packages/shared/src/test/fixtures/kairos-events.ts`（新增 fixtures）
- `packages/shared/src/test/kairos-aggregator.test.ts`（新增 11 单测）
- `packages/shared/package.json`（加 vitest + test 脚本）
- `packages/shared/tsconfig.json`（加 exclude test）
- `packages/shared/vitest.config.ts`（新增）
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`（状态徽章 + plan 完成清单）

### ✅ 验证结果

- `pnpm --filter @actspace/shared typecheck` ✅
- `pnpm --filter @actspace/shared test` ✅ 11/11 passed
- `pnpm --filter @actspace/agent-core test` ✅ 263/263 passed（回归无破坏）
- `pnpm typecheck` ✅ 整仓 3 个 package 全过
