# `@actspace/shared` 契约分层 — 执行摘要（P1）

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-shared-contract-split.md`
- **执行过程**：`docs/exec-runs/20261109-shared-contract-split/execution-process.md`
- **执行模式**：交互
- **执行结果**：P1 完成；P2 / P3 未开始（按计划推迟）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `ipc.ts` 拆成 `src/ipc/` 目录 | `packages/util/shared/src/ipc/{index,bootstrap,models,composer,approvals,sessions,workspace-git,workspace-files,artifacts,usage,local-update,plugins}.ts`；删除 `src/ipc.ts` | 1080 行按 IPC 通道分主题；去掉对 `model-config` 的冗余转出（根入口已直接导出）。导出名 134 → 134 |
| `session.ts` 拆成 `src/session/` 目录 | `packages/util/shared/src/session/{index,primitives,attachments,events,stream-events,tool-preview,context,message-block}.ts`；删除 `src/session.ts` | 1087 行按领域分主题；行内 `import("./x").T` 改顶部 `import type`。导出名 54 → 54 |
| `check:packages` 新规则 | `scripts/check-package-boundaries.mjs`、`scripts/test/package-boundaries.test.mjs` | `packages/<capability>/*`（capability ∉ {client, host}）不得通过 `@actspace/shared` 引用 `src/ipc/` 里声明的名字；命名导入与 `import("@actspace/shared").X` 都查 |
| 文档同步 | `packages/util/README.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-live-assistant-stream.md`、`docs/exec-plans/active/20260928-composer-mentions-annotations/{p0-content-contract,pb-editor-file-mentions}.md`、`docs/exec-plans/completed/design-archive/frontend/front-设置中心重构规范.md`（一处 Markdown 链接） | 现行文档里的 `src/ipc.ts` / `src/session.ts` 路径改到新位置；util README 写清两层归属规则 |

## 人工验证指引

### 必须验证

1. **对外 API 没变**
   - 验证方式：切到本分支，`pnpm --filter @actspace/shared build`，然后 `node -e 'console.log(Object.keys(require("./packages/util/shared/dist/index.js")).length)'`。
   - 预期结果：193（与 `main` 相同）。任何引用 `@actspace/shared` 的包 `pnpm typecheck` 不需要改一行。

2. **边界规则真的会拦**
   - 验证方式：在任意后端包（如 `packages/core/runtime/src/index.ts`）末尾临时加一行 `export type Probe = import("@actspace/shared").SessionListPage;`，运行 `node scripts/check-package-boundaries.mjs`，再还原。
   - 预期结果：报 `@actspace/runtime: desktop IPC contract (SessionListPage) imported in packages/core/runtime/src/index.ts; only apps/*, packages/client/*, packages/host/* may use packages/util/shared/src/ipc/ types`，退出码 1。还原后通过。

### 建议验证

1. **桌面端跑起来**
   - 验证方式：`pnpm dev:log`，打开一个会话发一条消息，看工具卡片、上下文面板、用量统计页。
   - 预期结果：与 `main` 一致——本 PR 不改任何运行时逻辑，只搬类型；如果有差异一定是构建 / 缓存问题。

## Agent 已完成的验证

- 导出名集合：`ipc` 134 = 134、`session` 54 = 54（无缺、无多、无重）；根入口运行时导出 193 = 193 逐名一致；类型级导出用同一 d.ts 遍历脚本比对 `main` 构建产物，无符号增减。
- `pnpm --filter @actspace/shared build && test`：30 文件 224 用例通过。
- `pnpm -r typecheck`（除 `@actspace/site`）：72 个包通过。`apps/site` 的 `astro check` 在本机挂起 20 分钟无 CPU 占用后被终止，site 不依赖 `@actspace/shared`，与本 PR 无关，交给 CI。
- `pnpm lint`：0 error（中途发现一处 `noUnusedImports`，已修）。
- `pnpm check:packages`：73 个 manifest 通过，零违规；`pnpm test:package-boundaries` 4/4。
- `pnpm check:docs`、`pnpm run test:current-docs`（11/11）、`pnpm gen:contract-matrix --check` 通过。
- `pnpm --filter @actspace/desktop test`：301 文件 2898 用例通过（2 文件 8 用例 skipped，与 `main` 相同）；`@actspace/client` 16/85、`@actspace/agent-host` 42/128、`@actspace/web` 29/141 通过。

## 已知风险和遗留事项

- `docs/exec-plans/completed/**` 里约 100 处 `packages/util/shared/src/ipc.ts` / `session.ts` 的文字引用是历史记录，未改；`check:docs` 只校验 Markdown 链接，纯文字路径不受影响。
- 新规则只看 `@actspace/shared` 根入口的命名导入；如果将来有后端包用 `import * as shared from "@actspace/shared"` 再取 `shared.X`，规则看不到。目前仓库没有这种写法。

## 后续建议

- P2：加 `@actspace/shared/ipc`、`@actspace/shared/session` 子入口，让客户端表面显式从子入口引 IPC 契约；等 #66 / #67 / #68 合入后做，减少 import 行的冲突。
- P3：评估是否把 `ipc/` 整体搬到 `packages/client/` 侧的包；取决于 P2 之后根入口还剩多少桌面专属内容。
