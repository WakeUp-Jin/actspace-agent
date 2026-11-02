## [2026-11-02 08:30] | Task: 修复 11-01 统一验收发现的 7 个问题

### 🤖 Execution Context

- **Agent ID**: `Claude Code 主会话`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI，本地工作区 codex/verfiy_two_1`

### 📥 User Query

> 按 `docs/exec-runs/20261101-unified-acceptance/repair-handoff.md` 修复 UA-001～UA-007，直接在当前分支和工作区改。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（main + renderer）、`@actspace/client`、`@actspace/shared`、`@actspace/session-transcript`、`@actspace/harness-evaluation`、文档

**Key Actions:**

- **A / UA-001**：`20261025-compaction-display` 摘要里 6 个指向未入库截图（`.gitignore` 排除 `docs/exec-runs/**/*.png`）的链接改成文字说明，`check:docs` 与 `test:current-docs` 恢复通过。
- **A / UA-002**：evaluation 取消测试不再固定等 20ms，拆成三条：候选进程启动后取消（用信号确认已启动）、准备阶段取消（`modelEnvironment` 里 abort，断言不建沙箱）、预先取消。产品取消语义未改。
- **B / UA-003**：Harness 查询里工具的插件归属统一为加载器插件 ID（`ownerPlugin`：先按工具名查归属表，再按 `toolPluginId` 反查）；插件行、插件版本、`plugin-costly-unused` 规则都按同一个 ID 关联，删掉规则里恒为 false 的残留条件。
- **C / UA-004**：transcript 插件也监听 `session/title-set`：没有进行中的轮且文件已写过时立即重写；轮进行中由该轮 `turn/end` 带上；首轮前等首轮。手动清空标题回到 `Untitled session`。
- **D / UA-005**：新增共享 `inheritedThroughSeq(lineage)`；同步时把分叉 / 侧边对话的继承边界随 source 传给投影。使用统计（索引与回退）跳过继承前缀；Harness 投影对前缀只推进状态、不写行。读模型 schema 15→16，按现有机制整库重建，去掉旧库重复计数。
- **E / UA-006**：`getSubagents` 对父 Journal 里还没有模型的子会话读取其最近一次 `request/header` 的实际模型；`delegation/completed` 的模型优先；已结束子会话的结果在主进程缓存（上限 500）。
- **F / UA-007**：`useHarnessStatsTab` 用 `null` 表示“还没收到版本”，合法的 `dataVersion=0` 之后变成 1 会重查 summary / options / 当前 tab，且只查一次。

### 🧠 Design Intent (Why)

- D：分叉的前缀已在父会话执行和计费，按 seq 去重只能防同一会话重放，防不了跨会话复制。按 lineage 边界切分与 transcript 跳过继承正文的规则一致；fork 边界本身保证没有未结束的轮 / 请求 / 工具，所以切分不会丢关联。保留前缀对状态的作用，分支自己的请求仍拿到正确的 Harness 版本和模式。
- E：右栏只读父 Journal，而父会话直到子 Agent 结束才写模型；子会话的 `request/header` 是实际发出的请求，比用途绑定可靠。
- B、F：两处都是“同一个东西有两种表示”导致的静默漏报——插件 ID 两套、版本 0 与“未知”混用。

### ✅ Verification

- 每个修复都补了回归测试，并把产品文件换回 HEAD 版本确认新测试失败、换回修复后通过（B、C、D、F；E 为新增函数）。
- `@actspace/harness-evaluation` 连跑 3 次通过；desktop 全量 vitest 262 文件 / 2138 项通过，desktop typecheck 通过；client 56 项、shared 181 项、session-transcript 10 项通过。
- 未做：Electron 真实界面复验（H1/H11 空库 0→1、C7 右栏模型、T4 标题、H2/H16 插件规则、U5/U6 分叉统计重建），留给验收按 `repair-handoff.md` 的定向复验范围执行。

### 📁 Files Modified

- `apps/desktop/src/main/runtime-v2/harness-stats-query.ts`
- `apps/desktop/src/main/runtime-v2/harness-stats-projection.ts`
- `apps/desktop/src/main/runtime-v2/read-model-sync.ts`
- `apps/desktop/src/main/runtime-v2/usage-journal-projection.ts`
- `apps/desktop/src/main/runtime-v2/usage-session-fallback.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model-schema.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/components/harness-stats/use-harness-stats.ts`
- `packages/client/client/src/sessions/chat.ts`
- `packages/util/shared/src/session-list-page.ts`
- `packages/session/session-transcript/src/{plugin,render}.ts`
- `packages/harness-evolution/harness-evaluation/src/test/service.test.ts`
- 测试：`apps/desktop/src/main/test/{harness-stats,runtime-v2-fixed-renderer-projection}.test.ts`、`apps/desktop/src/renderer/test/harness-stats-hook.test.tsx`、`packages/session/session-transcript/src/test/lifecycle.test.ts`、`packages/util/shared/src/test/session-lineage.test.ts`
- 文档：`docs/design-docs/自进化的方案设计/11-Harness统计设计.md`、`docs/design-docs/agent-runtime/agent-session-transcript.md`、`docs/design-docs/core-storage-and-observability.md`、`docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`、`docs/exec-runs/20261025-compaction-display/execution-summary.md`
