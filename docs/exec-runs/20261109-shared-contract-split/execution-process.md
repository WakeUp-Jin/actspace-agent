# `@actspace/shared` 契约分层 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-shared-contract-split.md`
- **执行模式**：交互
- **开始时间**：2026-11-09 13:20
- **结束时间**：2026-11-09 14:40（P1）

## 执行时间线

### 步骤 1：确认没人在做、选题、立项

- **操作**：拉最新 `main`（`c01bbc2b`），列开着的 PR（#63、#65、#66、#67、#68、#70）和 `docs/exec-plans/active/`，统计 C 组四条架构清理项的冲突面。C8（renderer 拆分）与 #66 / #67 重叠，C10（Harness 内聚）与 #68 重叠，C9 被两个 active 计划占着；C7（`@actspace/shared` 拆分）没有人做，且只有 #65 碰到它的 `package.json`。
- **影响文件**：`docs/exec-plans/active/20261109-shared-contract-split.md`（新建）、`docs/exec-plans/README.md`（加一行）。
- **决定**：P1 只在 `packages/util/shared/src` 内部拆文件，不改 461 个引用点、不加子入口；见计划「决策记录」。
- **验证**：`git grep -l "@actspace/shared"` 对照各 PR 的 `files` 列表，确认没有 PR 改到 `packages/util/shared/src/**`。

### 步骤 2：留基线

- **操作**：`pnpm --filter @actspace/shared build` 后记录 `dist/index.js` 的运行时导出名（193 个）；写一个 d.ts 遍历脚本沿 `export * from` 收集根入口的类型级导出名；备份 `ipc.ts`、`session.ts` 原文到 `/tmp`。
- **验证**：两份清单后面用来和拆分后比对。

### 步骤 3：`ipc.ts` → `src/ipc/`

- **操作**：1080 行按通道拆成 11 个文件：`bootstrap`、`models`、`composer`、`approvals`、`sessions`、`workspace-git`、`workspace-files`、`artifacts`、`usage`、`local-update`、`plugins`，`index.ts` 只做 `export *`。原文里 `import("./session").X` 这类行内引用改成顶部 `import type`。去掉原文件开头对 `./model-config` 的那组 `export { … } from` 转出（根入口已经 `export * from "./model-config"`）。
- **影响文件**：`packages/util/shared/src/ipc/*.ts`（新建 12 个），删除 `packages/util/shared/src/ipc.ts`。
- **决定**：`ipc` 目录内不互相引用 `index.ts`，`sessions.ts` 要用的 `UsageReadModelInfo` 直接从 `./usage` 引，避免桶文件自引用。
- **验证**：脚本比对 `^export (type|interface|const|function) Name`，原 134 个名字 = 新 134 个，无缺无多无重；`pnpm exec tsc --noEmit -p packages/util/shared/tsconfig.json` 通过。

### 步骤 4：`session.ts` → `src/session/`

- **操作**：1087 行按主题拆成 7 个文件：`primitives`、`attachments`、`events`、`stream-events`、`tool-preview`、`context`、`message-block`。`MessageBlock`（300 行）用脚本从原文按行搬运，避免手抄出错；其余手工迁移。`events.ts` ⇄ `tool-preview.ts` ⇄ `stream-events.ts` 之间只有 `import type`，循环引用在类型层是安全的。
- **影响文件**：`packages/util/shared/src/session/*.ts`（新建 8 个），删除 `packages/util/shared/src/session.ts`。
- **验证**：导出名 54 = 54；包内 `tsc --noEmit` 通过；`pnpm --filter @actspace/shared test` 30 文件 224 用例通过。

### 步骤 5：公开 API 比对

- **操作**：重新 `build`，比对运行时导出（193 = 193，逐名一致）。类型级比对用同一个 d.ts 遍历脚本分别跑 `main` 的构建产物和本分支：差异只有 `type ModelApi` 等 10 条——那是遍历脚本对被删掉的 `export { type X } from "./model-config"` 块的重复记录，`ModelApi` 等 10 个名字本身在两边都在。
- **决定**：这 10 条差异确认为「同一符号的第二条导出路径消失」，不是 API 变化。

### 步骤 6：边界规则

- **操作**：`scripts/check-package-boundaries.mjs` 新增：读 `packages/util/shared/src/ipc/*.ts` 的导出名集合；对 `packages/<capability>/*` 中 capability ∉ {`client`, `host`} 且不是 `@actspace/shared` 自己的包，扫描 `import/export { … } from "@actspace/shared"` 的命名列表（含 `type X`、`X as Y`）和 `import("@actspace/shared").X`，命中即报错并列出名字和文件。`scripts/test/package-boundaries.test.mjs` 加一个 tmp fixture 用例：`packages/core/example-core` 引用两个 IPC 名字 + 一个非 IPC 名字（`SessionId`），`packages/host/example-host` 引用同样的 IPC 名字；断言只报 core 的两个名字。
- **影响文件**：`scripts/check-package-boundaries.mjs`、`scripts/test/package-boundaries.test.mjs`。
- **验证**：真实仓库 `node scripts/check-package-boundaries.mjs` 通过（73 个 manifest，零违规）；往 `packages/core/runtime/src/index.ts` 临时追加一行 `import("@actspace/shared").SessionListPage` 后能命中并指出文件，随后还原；`pnpm test:package-boundaries` 4/4 通过。

### 步骤 7：文档同步与全仓验证

- **操作**：`packages/util/README.md` 加 `ipc/`、`session/` 目录说明与「新类型放哪层」的规则；`docs/ARCHITECTURE.md` 两处（shared 条目说明分层与规则；去掉「模型注册表由 IPC 契约 re-export」）；四份现行文档里的 `src/ipc.ts` / `src/session.ts` 路径改到新文件（右侧面板规范、live-assistant-stream 规范、composer-mentions 两份 active 计划）。`docs/exec-plans/completed/**` 的历史引用不改。
- **验证**：见 `execution-summary.md`「Agent 已完成的验证」。

## 遇到的问题

- **问题**：凭记忆手写 `tool-preview.ts` 时多出一个原文没有的 `SubagentTranscriptEvents`。
  - **原因**：想当然地把 `MessageBlock` agent 分支里的 `transcriptEvents?: SessionEvent[]` 当成了独立类型。
  - **应对**：导出名集合比对脚本当场报出 `extra`，删掉；后面 `MessageBlock` 改为脚本按行搬运。
- **问题**：想用 `git worktree` 构建 `main` 基线的 d.ts，但 worktree 里没有 `node_modules`，`git archive` 出来的副本又缺根 `tsconfig.base.json`。
  - **应对**：`git archive main packages/util/shared` + `git show main:tsconfig.base.json`，软链本分支的 `node_modules` 后用包内 `tsc` 构到 `/tmp`。

## 跳过或推迟的事项

- P2（`@actspace/shared/ipc`、`@actspace/shared/session` 子入口 + 引用方迁移）、P3（按归属拆包）：等 P1 合入、并行的 #66 / #67 / #68 合入后再评估，避免 461 个引用点的 import 改动与它们冲突。
- `docs/exec-plans/completed/**` 里约 100 处 `src/ipc.ts` / `src/session.ts` 的历史引用：历史记录，不改。
