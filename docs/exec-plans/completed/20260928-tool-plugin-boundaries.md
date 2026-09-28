# Tool 插件边界拆分与 Todo 领域迁移

## 目标

将当前 `core-tools` 和 `core-agent` 中边界不同的工具、Host capability、权限策略、Todo 语义和 Todo 投影拆成可独立装载的插件包。Tool Runtime 只保留通用注册与执行机制，Profile / Bundle 负责组合插件，Session Projection 负责通用投影驱动，领域插件贡献自己的 projection definition。生产运行时继续采用 restart-only。

本计划是一次有意的 Session 事件格式断点：Todo 不兼容旧的 `todo/write` 事件，不迁移旧事件数据；旧会话遇到旧必需事件时必须产生明确的 `UNKNOWN_REQUIRED_CODEC` 诊断并进入 browse-only。当前 validator 只将已知 Codec 的过高版本标记为 `UNSUPPORTED_REQUIRED_VERSION`。

## 范围

- 包含：
  - `filesystem-read`、`filesystem-search`、`filesystem-write`、`shell-tools`、`web-tools`、`image-generation`、`image-inspection` 工具包。
  - 独立 `todo-tools` 包，拥有 Todo 工具、领域服务、Todo Codec 和 `todos` Projection Contributor。
  - Tool Runtime 的插件注册、生命周期、权限 audience 和调用时 scope 强制检查。
  - Session Projection Contributor 组合契约及生产 Runtime 接线。
  - Profile / Bundle 的插件组合、插件独立 dispose、manifest、exports、测试和文档。
  - 删除 `core-tools` 生产组合、公开导出和构建依赖。
- 不包含：
  - Plan Profile 或 Plan preset 的最终设计；本计划只保留 Runtime scope 强制检查所需的通用接口。
  - 生产运行时在线热加载、在线热卸载或 HMR；插件配置变化仍通过 `restartRequired` 处理。
  - 旧 `todo/write` 事件读取、转换、回放兼容或数据迁移。
  - Browser Bridge 的重新实现；`browser-tools` 保持现有 Host capability 边界。
  - UI、Electron renderer 和外部 Provider 的新能力。

## 背景

- 讨论稿：`/Users/wakeup-jin/Downloads/tool-design/tool-plugin-boundaries.md`
- 仓库规则：`AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md`
- 插件与组合：`docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-profile-bundle-patch-layering.md`
- 工具 ABI：`docs/design-docs/tool-system/agent-tool-output-references.md`、`packages/tools/runtime/`
- Session Projection：`packages/session/projection/`、`packages/runtime/src/projection/`
- 当前 Todo 实现：`packages/core/agent/src/todo.ts`、`packages/core/agent/src/todo-tool.ts`
- 当前聚合工具：`packages/tools/core-tools/`
- 当前组合：`packages/runtime/cordis.yml`、`packages/runtime/src/profiles/base.bundle.ts`、`packages/runtime/src/profiles/composition.ts`
- 当前 Host 接线：`apps/cli/src/runtime-v2/core-tool-ports.ts`、`apps/desktop/src/main/runtime-v2/core-tool-ports.ts`

## 已确认的契约

1. 每个工具插件是独立 workspace package，拥有 Static Manifest、Behavior Entry、exports、生命周期和自身 Host 依赖。
2. Tool Runtime 不拥有具体工具实现，也不聚合或静态依赖所有工具插件。
3. `todo-tools` 的新事件使用插件命名空间 `plugin/actspace.todo/todo-write`，事件 owner 为 `actspace.todo`；旧 `todo/write` 不保留兼容 Codec。
4. Todo 插件依赖公开的 Session Journal 和 Session Projection 契约，不依赖 `core/agent` 实现。
5. Projection definition 必须在 Session restore/replay 前注册；Contributor 不得创建第二套 registry、事件订阅或快照服务。
6. 插件启用、禁用和 dispose 在启动组合、测试和完整 Runtime 生命周期中可验证；生产中不做在线热替换。
7. 权限 audience 随插件边界拆分。旧 `actspace.core-tools` audience 不映射到新插件 audience，权限不会扩大。
8. Plan 模式留给后续设计；本计划只要求 Tool Runtime 在实际调用路径支持 scope deny，而不只依赖 Agent Loop 的可见工具过滤。

## 迁移阶段

### P0：锁定协议和组合契约

目标：先建立所有后续包共用的接口和负向行为，避免各插件自行发明契约。

修改范围：

- `packages/session/projection/src/plugin.ts`
- `packages/session/projection/src/registry.ts`
- `packages/session/projection/src/manifest.ts`
- `packages/session/journal/src/codec-registry.ts`
- `packages/tools/runtime/src/executor.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/tools/runtime/src/runtime.ts`
- `packages/tools/runtime/src/manifest.ts`
- `packages/tools/runtime/src/plugin.ts`
- 对应 package exports、fixture 和测试文件

具体动作：

- 增加 Projection Contributor 类型和由 `session.projection` 统一应用 contributors 的创建入口。
- 明确 contributor 注册必须发生在 `ensureSession`、checkpoint restore 和 replay 之前。
- 为 Tool Runtime 增加调用时 scope 约束的公开输入和统一拒绝结果；拒绝必须写入 `permission/scope-denied`。
- 固定新 Todo Codec 的 owner、事件类型、criticality 和 eventVersion。
- 增加旧 `todo/write` 不被新 Todo Codec 接纳的负向 fixture。

验证：

- Session Projection registry 测试验证 contributor 顺序、重复 key、restore 前注册和 dispose。
- Tool Runtime 测试验证隐藏工具名、直接提交工具名和插件卸载后的调用都不能绕过 scope。
- Journal Codec 测试验证新事件可解码、旧事件不会被新插件解释。

### P1：建立 `todo-tools` 并移出 Core Agent

目标：Todo 成为独立领域插件，Agent Loop 和 Runtime 不再从 `core-agent` 注册 Todo。

新增或迁移范围：

- `packages/tools/todo-tools/package.json`
- `packages/tools/todo-tools/src/manifest.ts`
- `packages/tools/todo-tools/src/plugin.ts`
- `packages/tools/todo-tools/src/todo.ts`
- `packages/tools/todo-tools/src/todo-tool.ts`
- `packages/tools/todo-tools/src/codec.ts`
- `packages/tools/todo-tools/src/projection.ts`
- `packages/core/agent/src/todo.ts`
- `packages/core/agent/src/todo-tool.ts`
- `packages/runtime/src/runtime/agent-runtime-plugin.ts`
- `packages/runtime/src/projection/durable-session.ts`
- `packages/runtime/src/runtime/session-controller.ts`
- `packages/runtime/cordis.yml`
- `packages/runtime/src/profiles/base.bundle.ts`
- `packages/runtime/src/profiles/composition.ts`

具体动作：

- 将 TodoService、工具 schema、工具注册和 Todo fold 迁移到 `todo-tools`。
- Todo 写入改为 `plugin/actspace.todo/todo-write`，owner 使用 `actspace.todo`。
- `SessionReadModel` 和 projection cache 通过 contributor 创建并恢复 Todo projection。
- 从 `core-agent` 删除 Todo 导出、实现和依赖；Runtime 改依赖 `todo-tools`。
- 删除 core `todo/write` Codec；旧会话恢复按 unknown required event 进入 browse-only 并输出诊断。

验证：

- 新 session 的 `todo_write -> Journal -> projection -> todo_read` golden 测试。
- 旧 `todo/write` Journal 的恢复失败/降级诊断测试。
- Todo 插件独立 dispose 后工具不可调用测试。
- `core-agent` 不再导入 Todo 包的边界检查。

### P2：拆分文件、搜索、Shell、Web 和图片插件

目标：让每个能力包独立拥有定义、执行器、Host port、权限策略和 lifecycle。

目标包：

- `packages/tools/filesystem-read/`
- `packages/tools/filesystem-search/`
- `packages/tools/filesystem-write/`
- `packages/tools/shell-tools/`
- `packages/tools/web-tools/`
- `packages/tools/image-generation/`
- `packages/tools/image-inspection/`

具体动作：

- 从 `packages/tools/core-tools/src/plugin.ts`、`node-ports.ts`、`bash/`、`web/`、`image/` 迁移对应定义和实现。
- 每个包只声明自身需要的 Host capability；图片生成和图片分析分别声明各自的模型、网络和 artifact 依赖。
- 文件读、搜索、写入分别拥有独立的 permission audience；Shell 使用 process capability；Web 不复用文件 audience。
- CLI 和 Desktop Host adapter 按新 Host port 接线，不能继续通过 `actspace.host.tools.core` 提供泛化能力。
- 过渡期间允许 `core-tools` 按未迁移工具分区注册，但任何时刻同名工具只能有一个注册者。
- 每完成一个分区，更新 composition、exports、package build graph 和负向重复注册测试。

验证：

- 每个包的 manifest、lifecycle、registration/dispose、Host capability 和权限测试。
- 每个工具的成功、参数错误、能力缺失、权限拒绝和执行器失败测试。
- CLI / Desktop composition 启动测试验证新插件可用、未装载插件不可用。
- 旧 `actspace.core-tools` grant audience 不匹配新 audience 的负向测试。

### P3：完成 Profile / Bundle 收口并删除 `core-tools`

目标：所有生产 composition、公开 export、测试和构建入口都使用新插件包。

具体动作：

- 更新 `packages/runtime/cordis.yml`、`base.bundle.ts`、`composition.ts` 和 Runtime package exports。
- 删除 `@actspace/tools-core-tools` 的生产装载、公开导出、Host port 和残余依赖。
- 更新 `apps/cli/package.json`、`apps/desktop/package.json` 及所有 adapter import。
- 保持 `browser-tools` 为独立已有插件，不把 Browser Bridge 并入新工具包。
- 增加 composition digest、插件清单和 restart-only diagnostic 的回归 fixture。

验证：

- `core-tools` 无生产 composition、测试、公开 export、构建入口和文档引用。
- 每个新插件可以独立装载和 dispose；未装载工具返回 unavailable。
- Runtime 不直接依赖具体工具实现；Agent Loop 只依赖 Tool Runtime。
- 干净 checkout 的 Runtime dependency closure、全 workspace build、typecheck 和测试通过。

### P4：文档、验收和收尾

具体动作：

- 更新 `docs/design-docs/agent-plugin-runtime/` 中的插件边界、Session Projection、Tool Runtime ABI 和事件契约入口。
- 更新 `packages/tools/README.md`、相关 package README、`docs/exec-plans/README.md`。
- 按 `docs/HISTORY_GUIDE.md` 记录实现事实和 breaking Session event boundary。
- 创建对应 `docs/exec-runs/20260928-tool-plugin-boundaries/` 的执行过程和执行摘要。

验收分层：

- 自动化：package manifest/export/cycle 检查、codec、projection、scope、lifecycle、composition、CLI process smoke。
- 运行时：新 session Todo 完整链路、插件未装载不可调用、旧事件明确失败、restart-only diagnostic。
- 外部门禁：真实 Provider、Chrome/Browser、Electron packaged lifecycle、签名和公证不由本计划宣称通过。

## 关键风险与回退

- **事件断点风险**：旧 session 不再可恢复 Todo，且旧必需事件可能使 session 进入 degraded/corrupt 路径。回退方式是回到旧 Runtime 版本和旧 composition；不得在新版本中偷偷加入兼容映射。
- **插件组合风险**：漏掉 manifest、exports 或 build graph 会导致 clean checkout 失败。每个阶段都运行 package boundary 和 Runtime dependency closure 检查。
- **重复注册风险**：迁移期间同名工具同时由两个插件注册会造成启动失败。每个阶段要求 registry duplicate-name 负向测试。
- **权限扩大风险**：旧 audience 映射或泛化 Host port 会扩大授权范围。新 audience 必须按插件身份匹配，Host port 只暴露所需能力。
- **Projection 时序风险**：恢复后再注册 contributor 会产生错误快照。Contributor 必须在 projection cache 创建 registry 后、读取 checkpoint 前完成。

## 验证命令

- `pnpm --filter @actspace/runtime... build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm check:package-cutover`
- `pnpm check:current-docs`
- `pnpm check:repo`
- `pnpm test:agent-cli:process`

每个阶段还必须运行受影响 package 的 `pnpm --filter <package> test`、`typecheck` 和 `build`，并记录实际命令与结果。计划完成前不得把旧 session 兼容、真实 Provider、Chrome、Electron packaged、签名或公证写成已通过。

## 进度记录

- [x] P0：锁定协议、Projection Contributor、scope 强制检查和 breaking event fixture。
- [x] P1：完成 `todo-tools` 迁移并移出 Core Agent。
- [x] P2：完成七个工具插件和 Host adapter 拆分。
- [x] P3：完成 composition 收口并删除 `core-tools`。
- [x] P4：完成文档、history、执行记录和分层验收。

## 决策记录

- 2026-09-28：接受工具按能力边界拆分。
- 2026-09-28：接受 Todo 使用插件命名空间事件，但明确不兼容旧 `todo/write`，不做数据迁移。
- 2026-09-28：接受 Session Projection Contributor 作为通用组合契约。
- 2026-09-28：接受生产 restart-only，不做在线热卸载。
- 2026-09-28：Plan 模式暂不纳入本计划，留给后续设计。

## 完成状态

实现与自动化验证已经完成。`pnpm build`、`pnpm typecheck`、Runtime / CLI / 新工具包测试、CLI 真实进程测试均通过。全仓默认 `pnpm test` 的 Desktop 并发测试出现超时；稳定参数下完整 Desktop 复跑 834/837 通过、3 项 UI 超时，三者在单 worker 下复核通过。受本次改动影响的 Desktop 定向测试通过，详见执行摘要。`pnpm check:docs` 被独立官网计划的 active 状态阻塞。真实 Provider、Browser、Electron packaged 与签名公证门禁保留人工验收。

## 执行模式

**交互模式**：这是架构、协议和权限边界变更，实施时逐阶段推进和验证；开始实施前必须由用户明确批准本计划。

## 执行文档

实施记录：

- `docs/exec-runs/20260928-tool-plugin-boundaries/execution-process.md`
- `docs/exec-runs/20260928-tool-plugin-boundaries/execution-summary.md`
