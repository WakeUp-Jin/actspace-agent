## [2026-11-09 13:11] | Task: 清理死代码、零消费者包、幽灵依赖与无入口脚本

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 检查一下当前是否还有死代码，冗余代码，导致架构不清晰的，没有使用到的，仔细检查一下看看吧 …… 嗯嗯开始执行吧

### 🛠 Changes Overview

**Scope:** 根 `package.json` / lockfile、`apps/cli`、`apps/desktop`、`apps/site`、`packages/util`、`packages/test-support`（删）、`packages/llm/llm-service`、`packages/core/runtime`、`packages/english-learning`、十个领域包的 `package.json` 与 `tsconfig.build.json`、`scripts/contract-matrix`、`docs/`

**Key Actions:**

- **删零消费者包**：`@actspace/util`（只有一个 `assertNever`）和 `@actspace/test-support` 整包删除，契约矩阵登记、`packages/README.md`、`packages/util/README.md` 同步；「测试辅助不单独成包」写进 packages 地图。
- **幽灵 type import**：desktop 四个 workspace 测试和 `llm-pi-ai` 一个测试 `import type` 的模块根本不导出那个类型（vitest 擦类型所以不报错），改指向真正导出的模块。没有把测试目录纳入 typecheck，代价和收益另议。
- **幽灵依赖**：根 `package.json` 只剩 `@actspace/desktop-app`；`apps/cli`、`apps/desktop` 和十个领域包删掉 `package.json` 里没有任何 import 的 `@actspace/*` 依赖，`generate-desktop-build-graph.mjs` 重生成对应 `tsconfig.build.json`，lockfile 少 102 行。
- **CLI 审批 fail-closed**：`apps/cli/src/cli.ts` 把整个 stdin 当提示词读完即关闭，交互式 readline 审批路径不可达。删掉 `terminal-input.ts`、`terminal-test-input.ts`、`writeApproval`/`input`/`setCliV2CordisForTest` 钩子，`CliV2ApprovalBroker` 现在直接拒绝并记录请求，由 run 结果报 `APPROVAL_REQUIRED`；执行安全 README 同步。
- **删无消费者导出**：约 30 个仅 export 不 import 的函数 / 常量 / 类型（`clearHarnessSession`、`clearUsageJournal`、`isLinkCodeExtension`、`CALLOUT_TYPES`、`agentStatusLabel`、`useExactGrantSuggestion`、`SETTINGS_SECTIONS`、`ContextMenuGroup`、`PopoverClose`、`formatMillis`、`markArtifactUnavailable`、`injectEnglishLearning`、`PreviewSourceButton`、`resetRuntimeV2ModuleForTest` 等），连带删掉随之失效的 import。
- **删 LegacyTransportAdapter**：`@actspace/llm-service` 里没有调用方的 `LegacyTransportAdapter` 类、它的导出和测试一并删除；`agent-llm-core-pi.md` 的调用链改成 `PiAiAdapter -> pi-ai / LegacyProxyWireEngine`。
- **收窄 re-export 壳**：删 `runtime-v2/file-generation-counter.ts`、`session-list-page.ts` 两个单行壳和渲染层 `stream-blocks.ts`、`stream-state.ts`、`session-run-state.ts` 三个纯 re-export；`App.tsx`、`task-queue.ts`、`session-local-store.ts`、`use-session-transcript.ts` 及测试直接 import `@actspace/client/live`。`ARCHITECTURE.md` 与会话状态规范同步。
- **移除影子对照**：`test-fixtures/legacy-transcript.ts` 与 `helpers/transcript-shadow.ts`（迁移期用旧 `mergeTranscript` 实现做对照）删除，三个 App 测试去掉对应 `vi.mock`，`transcript.test.ts` 直接调用 `mergeTranscript`。
- **无入口测试接入**：`scripts/test/host-upload-disk-full.test.mjs`、`agent-provider-compaction.test.mjs` 挂到 `test:agent-host:process`；新增 `test:release-scripts` 跑 `browser-components.test.mjs`、`electron-runtime-integrity.test.mjs`，并进入 `pnpm test` 链。`agent-testing.md` 写明 `scripts/test/` 下每个文件都必须挂在某个 `test:*` 入口上。
- **孤儿脚本**：删 `apps/desktop/scripts/benchmark-usage-json-baseline.mjs`（import 的 `projectIndexedUsageActivity` 早已不存在，一跑就 TypeError），`verify-usage-read-model.mjs` 去掉对它的调用。其余 `apps/desktop/scripts/*` 被 active 执行计划或已完成计划的验收命令引用，保留。

### 🧠 Design Intent (Why)

- 零消费者的包、依赖和导出不是「以后可能用」，而是让 `check:packages`、构建图和契约矩阵维护一堆不存在的边；删掉之后依赖边界才和真实 import 一致。
- CLI 审批保留一条永远走不到的 readline 分支，会让人误以为 CLI 支持交互审批。fail-closed 并显式报 `APPROVAL_REQUIRED` 才是诚实的行为。
- 迁移期的影子对照和 re-export 壳都是过渡产物，迁移完成后继续保留只会让读代码的人多绕一层。
- 没有挂在任何 `test:*` 入口上的测试等于没有测试；接入的同时在测试策略里立规矩，避免再长出来。
- 有意保留了两个编译期类型断言导出（`fixed-renderer-stream-adapter.ts` 的 `AgentLiveEventContract`、`live-run-store.ts` 的 `QueuedSteeredContract`），它们没有运行时消费者，但承担类型契约校验，不是死代码。

### ⚠️ 注意事项

- `cordis.yml` 里的 `@actspace/english-learning`、`side-chat`、`session-transcript` 之前靠根 `package.json` 直接依赖才能被 Cordis Loader 解析。删掉根依赖后，这三个包要靠 pnpm 把 workspace 包 hoist 到 `node_modules/.pnpm/node_modules/@actspace/`。本地只做删减的增量 `pnpm install` 可能不会立刻 hoist（`test:agent-host:process` 会报 `failed to apply loader entry include`），再跑一次 `pnpm install` 即可；CI 的 `--frozen-lockfile` 全新安装不受影响。已补进 `docs/learnings/2026-08/20260829-dsh-runtime-plugin-ownership.md` 的常见陷阱。
- `apps/desktop/scripts/test-usage-read-model.mjs`（node:test，依赖 `dist-electron`）当前 76 个用例里 36 个失败，其中一部分同样是 import 已删除的 `projectIndexedUsageActivity`。它被多份已完成计划引用，本轮未删也未接入入口，留待单独处理。
- 本轮没有做审计报告第 6 步（Settings v3/v4 双轨收口、legacy/v2 命名整改、迁移门禁脚本处置、browser-bridge `legacyRequest` 表），那部分涉及行为变更，需要单独立项。

### 📁 Files Modified

- `package.json`、`pnpm-lock.yaml`、`apps/cli/package.json`、`apps/desktop/package.json`、十个 `packages/*/*/package.json` 与 `tsconfig.build.json`
- `packages/util/util/`（删）、`packages/test-support/`（删）、`packages/README.md`、`packages/util/README.md`、`scripts/contract-matrix/source-registry.mjs`、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `apps/cli/src/runtime-v2/approval.ts`、`host-adapter.ts`、`types.ts`、`apps/cli/src/terminal-input.ts`（删）、`apps/cli/src/test/terminal-test-input.ts`（删）、`runtime-v2-approval.test.ts`
- `apps/desktop/src/main/runtime-v2/{harness-stats-projection,usage-journal-projection,runtime-loader}.ts`、`file-generation-counter.ts`（删）、`session-list-page.ts`（删）、`apps/desktop/src/main/settings/types.ts`、`apps/desktop/src/main/test/workspace-*-service.test.ts`
- `apps/desktop/src/renderer/App.tsx`、`session/{task-queue,session-local-store,use-session-transcript,projection-display}.ts`、`session/live-runs/{stream-blocks,stream-state}.ts`（删）、`session/session-run-state.ts`（删）、`components/**` 中约 20 个文件、`mock/docs-fixture.ts`、`trajectory/{format,strings}.ts`、`usage-format.ts`
- `apps/desktop/test-fixtures/legacy-transcript.ts`（删）、`apps/desktop/src/renderer/test/helpers/transcript-shadow.ts`（删）、`apps/desktop/src/renderer/test/{app-approval-recovery,app-message-queue,app-streaming-user-message}.test.tsx`、`transcript.test.ts`
- `apps/desktop/scripts/benchmark-usage-json-baseline.mjs`（删）、`apps/desktop/scripts/verify-usage-read-model.mjs`
- `apps/site/src/lib/docs-navigation.ts`、`packages/core/runtime/src/projection/artifact.ts`、`packages/english-learning/english-learning/src/prompt.ts`
- `packages/llm/llm-service/src/legacy-transport-adapter.ts`（删）、`src/index.ts`、`src/test/service.test.ts`、`packages/llm/llm-pi-ai/src/test/legacy-proxy-wire-engine.test.ts`
- `docs/ARCHITECTURE.md`、`docs/design-docs/execution-safety/README.md`、`docs/design-docs/agent-plugin-runtime/{agent-llm-core-pi,agent-testing}.md`、`docs/design-docs/frontend/front-会话状态与数据流规范.md`、`docs/learnings/2026-08/20260829-dsh-runtime-plugin-ownership.md`
