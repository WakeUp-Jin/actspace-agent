## [2026-11-08 11:10] | Task: 模型目录价格锁定与删除运行时刷新

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 审外部 PR #34（OpenCode Go）时发现：贡献者重跑 `pnpm models:generate`，脚本整份重写目录，diff 混进上百处无关改价和删除。用户决定先由我们修生成规则：价格按服务商分开保留，已有价格锁定，不删除模型，加改价清单，生成时打印报告；同时删掉运行时目录刷新，生成文件改成一行一个模型，按新规则跑一次（只新增）。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/desktop`、`scripts/`、docs

**Key Actions:**

- **合并规则**：新增 `mergeModelCatalog`，已有条目整条锁定、上游新条目新增、下架条目保留、改价清单每次覆盖。
- **改价清单**：新增 `model-catalog-overrides.ts`，每行带来源链接和核对日期。
- **生成脚本**：打印新增 / 保留 / 锁定改价 / 下架 / 覆盖报告；`--offline`；一行一个模型；内容不变不写。
- **删除运行时刷新**：`ModelCatalogService`、worker、本地缓存、两个 IPC channel、`ModelCatalogStatus`。
- **重新生成**：只新增 123 个模型。

### 🧠 Design Intent (Why)

整份重写让每个加服务商的 PR 都被迫带上无关改价和删除，审阅者无法分辨。按 key 合并之后，新增服务商的 diff 只有新增行。运行时刷新已没有界面入口，但启动时仍会优先读取更新的本地缓存，绕过仓库里定下的价格，所以一并删除。

### 📁 Files Modified

- `scripts/generate-model-catalog.mjs`
- `packages/util/shared/src/model-catalog-merge.ts`
- `packages/util/shared/src/model-catalog-overrides.ts`
- `packages/util/shared/src/model-catalog.ts`
- `packages/util/shared/src/generated/model-catalog.generated.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `docs/design-docs/model-context/agent-model-catalog-and-usage-cost.md`
