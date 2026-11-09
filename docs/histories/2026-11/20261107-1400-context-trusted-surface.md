## [2026-11-07 14:00] | Task: 上下文引擎不再每次请求复制对话

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 我觉得这两个都可以按照你的建议来做 开始吧。

### 🛠 Changes Overview

**Scope:** `packages/session/session-journal`、`packages/util/shared`、`packages/context/context-engine`、`packages/context/context-conversation`、`apps/desktop`（测试）、`docs/`

**Key Actions:**

- **日志：** `SessionJournal.surface` 交出的视图按状态缓存，并登记为已信任（`surface-trust.ts`）。导出 `isTrustedSurfaceView`、`surfaceViewVersion`（`${replaceGeneration}:${条数}:${最后一个 seq}`）和带标记的类型 `TrustedSurfaceView`。`surfaceNode` 推出的节点外壳冻结。
- **引擎：**
  - `contextValue` 遇到已信任视图（或包着它的一层普通对象）直接引用；
  - `stateDigest` 的对话部分改用版本号；
  - `projectContext` 不复制对话；
  - `toLlmInput` 对已检查过的对话只浅冻结消息，不再整份序列化。
- **会话源：** `cacheKey` 改用 `surfaceViewVersion`，由 context-engine 转导出。
- **测试：**
  - `session-journal/src/test/surface-trust.test.ts`；
  - `context-engine/src/test/trusted-surface.test.ts`；
  - desktop `context-trusted-equivalence.test.ts`：改前引擎生成的 golden，6 步 revision 序列与各项摘要；
  - fixture 读取抽成 `surface-fixture.ts`。

### 🧠 Design Intent (Why)

run7 主进程里，上下文引擎每次请求约 960 MB 的分配，几乎都花在把已经由日志校验、冻结过的对话再序列化、解析、冻结和转字符串上。转换消息本身只有 5–8 MB。

根因是引擎认不出日志给的对话可以信任：日志每次读 `surface` 都返回新包装，引擎只认自己冻结过的对象。做法参考 DSH 的「入口冻结一次 + WeakSet 记住 + 版本计数器」。

只信任日志交出的视图：`SessionSurface.fromView` 能接受调用方的任意输入，runtime 的投影就用它，所以不登记。

### 📁 Files Modified

- `packages/session/session-journal/src/surface.ts`、`surface-trust.ts`（新增）、`journal.ts`、`index.ts`、`src/test/surface-trust.test.ts`（新增）
- `packages/util/shared/src/runtime-v2/session-events.ts`
- `packages/context/context-engine/src/context-snapshot.ts`、`engine.ts`、`instances.ts`、`projection.ts`、`index.ts`、`src/test/trusted-surface.test.ts`（新增）
- `packages/context/context-conversation/src/source.ts`
- `apps/desktop/package.json`、`src/main/test/context-trusted-equivalence.test.ts`（新增）、`surface-fixture.ts`（新增）、`surface-derived-equivalence.test.ts`、`fixtures/context-trusted/expected.json`（新增）
- `docs/design-docs/agent-plugin-runtime/agent-spec-context-trusted-surface.md`（新增）、`agent-plugin-runtime/README.md`、`design-docs/index.md`、`上下文管理引擎设计/README.md`、`agent-contract-matrix.generated.md`
- `docs/exec-plans/completed/20261107-context-trusted-surface.md`（新增）、`docs/exec-plans/README.md`
