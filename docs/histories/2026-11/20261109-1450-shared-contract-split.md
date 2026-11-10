## [2026-11-09 14:50] | Task: `@actspace/shared` 契约分层 P1：拆 `ipc.ts` / `session.ts`，加「后端包不得引用桌面 IPC 契约」规则

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 你看看现在 C 架构清理有东西在做吗？检查一下有没有人在做，没有的话，你来做吧。

### 🛠 Changes Overview

**Scope:** `packages/util/shared/src/ipc/`、`packages/util/shared/src/session/`、`scripts/check-package-boundaries.mjs`、`scripts/test/package-boundaries.test.mjs`、`packages/util/README.md`、`docs/ARCHITECTURE.md`、四份现行设计 / 计划文档的路径、exec plan 与 exec-runs

**Key Actions:**

- **选题**：对照开着的 PR（#63 / #65 / #66 / #67 / #68 / #70）和 active 计划，C 组四条里 C8 与 #66 / #67 重叠、C10 与 #68 重叠、C9 被两个 active 计划占着；只有 C7（`@actspace/shared` 拆分）没人做，且没有 PR 碰 `packages/util/shared/src/**`。立 `docs/exec-plans/active/20261109-shared-contract-split.md`，P1 只做包内拆分 + 规则 + 文档，不改 461 个引用点。
- **`ipc.ts`（1080 行）→ `src/ipc/`**：按通道分 `bootstrap`、`models`、`composer`、`approvals`、`sessions`、`workspace-git`、`workspace-files`、`artifacts`、`usage`、`local-update`、`plugins` 11 个文件，`index.ts` 只 `export *`。行内 `import("./session").X` 改顶部 `import type`。去掉开头对 `./model-config` 的那组转出——根入口已 `export * from "./model-config"`，转出不增加对外符号，只会让人误以为模型目录属于 IPC 契约。
- **`session.ts`（1087 行）→ `src/session/`**：`primitives`（id 别名、`SessionError`、`LlmUsageCost`）、`attachments`、`events`（持久化事件、payload、`SessionMeta`、`AgentRunResult`）、`stream-events`（`RuntimeStreamEvent`）、`tool-preview`（`ToolUiPreview` 全家、Bash / Todo / 子 Agent 卡片、`ToolExecutionResult`）、`context`、`message-block`（`MessageBlock`、`SessionDiffSummary`）。
- **`check:packages` 新规则**：读 `src/ipc/*.ts` 的导出名集合；`packages/<capability>/*` 中 capability ∉ {`client`, `host`} 且不是 `@actspace/shared` 自己的包，若 `import/export { … } from "@actspace/shared"` 或 `import("@actspace/shared").X` 命中集合，报错并列出名字与文件。当前仓库零违规（后端包本来就没引用过 IPC 类型），规则是把事实固定下来。加一个 tmp fixture 用例：core 包引两个 IPC 名 + 一个非 IPC 名，host 包引同样的 IPC 名，只报 core 的两个。
- **文档**：`packages/util/README.md` 加两个目录的说明和「新类型进 `shared` 后放哪层」的规则；`docs/ARCHITECTURE.md` 的 shared 条目写明分层与规则，删掉「模型注册表由 IPC 契约 re-export」；右侧面板规范、live-assistant-stream 规范、composer-mentions 两份 active 计划、设计归档里一处 Markdown 链接的 `src/ipc.ts` / `src/session.ts` 改到新路径。`completed/**` 里约 100 处纯文字历史引用不动。

### 🧠 Design Intent (Why)

- 两个文件各一千多行、把「桌面 IPC 输入输出」和「前后端共用的会话领域模型」混在同一个根桶里，是 `@actspace/shared` 边界模糊的根源。先按主题拆目录、再用机械规则把「谁能引 IPC 契约」说死，对外 API 一个符号不变，是在六个 PR 并行的窗口里唯一不会和别人冲突的切法。
- 规则做在 `check-package-boundaries.mjs` 而不是 Biome：Biome 的 `noRestrictedImports` 只能按模块路径限制，这里要限制的是「从同一模块引用的某一组符号」，需要读 `src/ipc/` 的导出清单。
- 不加 `@actspace/shared/ipc` 子入口：加了就会想迁引用方，迁了就和 #66 / #67 / #68 冲突；留到 P2。

### ✅ Verification

- 导出名集合：`ipc` 134 = 134、`session` 54 = 54；根入口运行时导出 193 = 193 逐名一致；类型级导出用同一 d.ts 遍历脚本比对 `main` 构建产物（`git archive main packages/util/shared` + 软链 `node_modules` 构到 `/tmp`），无符号增减。
- `pnpm --filter @actspace/shared build && test`（224 用例）、`pnpm -r typecheck` 除 site 外 72 包、`pnpm lint`、`pnpm check:packages`、`pnpm test:package-boundaries`（4/4）、`pnpm check:docs`、`pnpm run test:current-docs`（11/11）、`pnpm gen:contract-matrix --check`、desktop（2898 用例）/ client / agent-host / web 测试全部通过。
- 真实仓库探测：往 `packages/core/runtime/src/index.ts` 临时追加 `import("@actspace/shared").SessionListPage`，规则命中并指出文件，随后还原。
- `apps/site` 的 `astro check` 本机挂起 20 分钟（0% CPU）后终止；site 不依赖 `@actspace/shared`，交给 CI。

### 📁 Files Modified

- `packages/util/shared/src/ipc/*.ts`（新建 12 个）、删除 `packages/util/shared/src/ipc.ts`
- `packages/util/shared/src/session/*.ts`（新建 8 个）、删除 `packages/util/shared/src/session.ts`
- `scripts/check-package-boundaries.mjs`、`scripts/test/package-boundaries.test.mjs`
- `packages/util/README.md`、`docs/ARCHITECTURE.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-live-assistant-stream.md`
- `docs/exec-plans/active/20260928-composer-mentions-annotations/p0-content-contract.md`、`.../pb-editor-file-mentions.md`
- `docs/exec-plans/completed/design-archive/frontend/front-设置中心重构规范.md`
- `docs/exec-plans/README.md`、`docs/exec-plans/active/20261109-shared-contract-split.md`
- `docs/exec-runs/20261109-shared-contract-split/execution-process.md`、`execution-summary.md`
- `docs/histories/2026-11/20261109-1450-shared-contract-split.md`
