## [2026-11-09 18:30] | Task: 后端插件包解耦 P3 / P4——上下文来源登记式、文件与 Shell 实现迁入 Harness 树

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> P3 P4 一起执行吧。反正现在这个 PR 都没合并 等你们一起弄完再合并。

### 🛠 Changes Overview

**Scope:** `context/*`（新包 `context-assembly`、八个来源包、披露、引擎）、`core/runtime`（`agent-factory`、默认 Harness 共享服务）、`core/tool-runtime`（能力授予）、`fs/*` 与 `shell/tool-shell`（自带实现）、`host/agent-host` 与 Desktop 的 Host 服务、`docs/`。

**Key Actions（P3）：**

- **新内核条目 `context-assembly`**：提供 `context.assembly`。来源插件按种类 + Agent 角色（`main` / `subagent` / `fork`）登记工厂，披露登记工具结果观察者；`sourcesFor(role, options)` 校验必需种类、搭 `ContextSourceRegistry` 并挂到 scope。必需种类来自 manifest `config.required`（默认 `system`、`conversation`）。`publish` 从 `prompt/source-support` 搬来，仍 `provide` `context.source.<kind>`。
- **来源插件自己声明角色**：八个来源包 inject `context.assembly`；`background-tasks` / `subagents` 只给 `main`；`context-tools` / `context-conversation` 从直接 `provide` 改为 `publish`。
- **披露自己接线**：`CompactionDisclosure.hydrate?` + 协调器 `hydrator()`，`context.engine.create` 默认取它；插件启用时向登记表登记 `disclosure` 来源与观察者。
- **`agent-factory` 不再认识种类**：inject `context.assembly`；`createSources` / `observeContextToolResult` / `createContextEngine` 全部委托登记表；删除对 `@actspace/context-disclosure` 的 import。`modeRuntime` 保持。

**Key Actions（P4）：**

- **能力授予**：`tool-runtime/src/host-ports.ts` 定义 `actspace.host.filesystem`（`FilesystemHostGrant`：`workspaceRoot`、`resolveArtifact?`、`ripgrepPath?`）和 `actspace.host.process`（`ProcessHostGrant`：`workspaceRoot`、`tmpRoot`、`onProcesses?`），替换 `DEFAULT_HARNESS_SHARED_SERVICES` 里四个 `actspace.host.tools.*`；新增 `OPTIONAL_HOST_SHARED_SERVICES`，`agent-runtime` 的 inject 过滤它们。
- **插件自带实现**：`tool-fs-read/search/write`、`tool-shell` 删除 `*_HOST_PORT_ID` / `HostPort`，`apply` 可选读授予并用包内 `node-ports` 建实现（Shell 再 `grant.onProcesses?.(ports)` 交出强制结束钩子）；无授予时注册但返回 `CAPABILITY_UNAVAILABLE`。manifest 改 `optionalInjects`，`OPTIONAL_INJECT_FALLBACKS` 补两条。
- **Host 只给授予**：`agent-host` 的 `createNodeToolHostServices` 与 Desktop 的 `createDesktopToolHostServices` 只提供两份授予 + 网页 / 图片端口；CLI `--mock` 的 `createUnavailableToolHostServices` 不再给文件 / Shell 任何东西；`agent-host` 删除对四个工具包的依赖。
- **文档同步**：计划补 P3 / P4 进度与八条决策并移入 `completed/`，exec-runs 过程（步骤 14–20）与摘要（P1–P4、人工验证 5–7），`packages/{context,core,fs,shell}/README.md` 与四个工具包 README，Tool 插件边界设计文档、自进化边界文档，契约矩阵与 `cordis.yml` 重新生成。

### 🧠 Design Intent (Why)

P2 之后内置工具产物已可逐个替换，但 Loop 侧还有两处把具体插件写死：`agent-factory` 持有上下文来源种类表和披露分支，文件 / Shell 的真正实现又在 Host 包里经端口工厂交给插件。登记表独立成条目而不是放进 `agent-factory`，因为来源插件在 Loop 之前登记，登记表必须比两边都长寿；角色过滤放登记侧，因为「子智能体不能派子智能体」是来源插件的业务约束，Loop 不该认识任何种类名。披露的水合走协调器，因为它已经向协调器登记了压缩钩子，水合只是第四个钩子，这样 `context-disclosure` 整包可被替换或移除。P4 把端口从「实现工厂」改为「能力授予」：Host 经端口给的应当是 Harness 自己算不出来的事实（路径、artifact 解析、宿主回调），凡是能随插件打包的代码都不该从端口进来；授予类型放 `tool-runtime` 是为了让 Host 不必为 import 类型而继续依赖具体工具包。授予做成可选注入，CLI `--mock` 行为与原来 `createPorts: () => ({})` 一致。没有像 DSH 那样抽文件系统服务层：只有一个本地 Node 后端，抽象层没有第二个实现来约束形状。composition manifests 也没有暴露给 Harness 树：形态推导只需要 catalog 的一个谓词，经 `agentForm` 端口传入已足够。

### 学习沉淀

- 补进 `docs/learnings/2026-11/harness-entry-takes-host-data-through-ports.md`：端口里放数据不放实现（P4 的镜像问题）。

### 验证

- P3：`context-assembly` 6、`context-disclosure` 27、`context-engine` 34、`prompt` 9 与八个来源包测试通过；`runtime` 248 通过。
- P4：`tool-fs-read` 9、`tool-fs-search` 5、`tool-fs-write` 6、`tool-shell` 119、`agent-host` 128、`agent-cli` 16、`desktop` 2898、`runtime` 248 通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`（51 行 catalog）、`pnpm check:docs`、`pnpm check:hot-path-reads`、`pnpm check:desktop-build-graph`、`pnpm test:contract-matrix`、`pnpm test:plugin-catalog` 通过。
- `tool-runtime` 有 3 个既有失败（进程授予 / 相对资源路径），在 `origin/main` 上同样失败，本轮未动。

### 📁 Files Modified

- `packages/context/context-assembly/*`（新包）、`packages/context/prompt/src/context-source-support.ts`
- `packages/context/context-{system,rules,skills,runtime,conversation,tools,background-tasks,subagents}/src/{source,manifest}.ts` 与 `package.json`、`src/test/lifecycle.test.ts`
- `packages/context/context-disclosure/src/plugin.ts`、`packages/context/context-engine/src/{compaction,engine,plugin}.ts`
- `packages/core/runtime/src/harness/{agent-factory-plugin,default-harness,default-harness-definition,agent-runtime-plugin}.ts`、`src/{plugin-catalog,manifests}.ts`、`cordis.yml`、`package.json`、运行时测试
- `packages/core/tool-runtime/src/{host-ports,index}.ts`
- `packages/fs/tool-fs-{read,search,write}/src/{plugin,manifest}.ts`、`packages/shell/tool-shell/src/{plugin,manifest}.ts` 与各自 lifecycle 测试、README
- `packages/host/agent-host/src/node-ports/tool-host-services.ts`、`package.json`；`apps/desktop/src/main/runtime-v2/tool-host-services.ts`
- `scripts/contract-matrix/source-registry.mjs`、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`、`artifacts/agent-contract-matrix.json`、`pnpm-lock.yaml`、各包 `tsconfig.build.json`
- `docs/exec-plans/completed/20261109-harness-plugin-decoupling.md`（自 `active/` 移入）、`docs/exec-plans/README.md`、`docs/exec-plans/completed/README.md`、`docs/exec-runs/20261109-harness-plugin-decoupling/*`
- `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md`、`docs/design-docs/自进化的方案设计/05-总体架构与DSH借鉴边界.md`、`packages/{README,context/README,core/README,fs/README,shell/README}.md`、`docs/learnings/2026-11/harness-entry-takes-host-data-through-ports.md`
