# 后端插件包解耦：让 Harness 自进化不必改 core

## 目标

把「新增、改写或替换一个工具插件」从 `packages/core/*` 的硬编码里解放出来：工具插件自己声明模式可见性，
形态成员从插件 manifest 推导，`core/agent` 不再逐个列出内置工具名。后续阶段再把默认 Harness 拆成可单独替换的
产物、把文件/Shell 等工具的实现从 Host port 收回 Harness 树。最终状态是 Harness 自进化 V2 能替换一个内置插件而
不触碰 `core/agent`、`core/runtime` 的策略表。

对标对象是 `deepseek-ai/deepseek-harness`（本地克隆在 `tmp/deepseek-harness`，commit `fcc0ad46`，不入库）：
能力接缝 = 服务定义 + 服务提供者 + 消费者三件套都在插件树里；Agent 预设是声明式组合，核心不硬编码工具名。

## 范围

- 包含（P1，本轮执行）：
  - `ToolDefinition` 增加 `modes`，每个工具声明自己在 `chat` / `plan` / `agent` 哪些模式可见。
  - `core/agent` 的模式策略改为按定义过滤：删除 `AGENT_MODE_TOOLS` 工具名表；进化工具仍只在 `agent` 模式。
  - `core/agent` 的形态改为通用 `AgentForm` 契约；`actspace.main` 的成员由 `core/runtime` 从 `PLUGIN_CATALOG`
    里「声明了工具的 Harness 条目」推导，不再手写。
  - `agent-factory-plugin` 不再特判 `actspace.plugin-manager`。
  - 产品策略（Chat 恰好两个工具、Plan 禁 Shell/写文件）改在默认 Harness 装配测试里守住。
- 包含（P2–P4，后续轮次，见里程碑；全部已完成）：默认 Harness 按条目产出产物；`service-contract.ts` 不再写死叶子包 owner；
  `agent-factory-plugin` 的上下文来源列表改为注册式（新条目 `context-assembly`）；文件/Shell 工具实现从 Host port 收回
  Harness 树，Host 只留能力授予 `actspace.host.filesystem` / `actspace.host.process`。
- 不包含：Harness 自进化 V2 的自动触发、评估沙箱、actor profile；前端改动；`plugin_manager` 工具契约变化。

## 背景

- 相关文档：`docs/design-docs/agent-runtime/agent-forms-and-modes.md`（§4.1、§5 的「新增工具默认不进入模式」）、
  `docs/learnings/2026-09/20260928-agent-form-scope-and-mode-gate.md`、
  `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md`、`packages/README.md`。
- 相关代码路径：`packages/core/agent/src/agent-form.ts`、`packages/core/agent/src/agent-mode-policy.ts`、
  `packages/core/tool-runtime/src/definition.ts`、`packages/core/runtime/src/plugin-catalog.ts`、
  `packages/core/runtime/src/harness/agent-factory-plugin.ts`、`packages/core/runtime/src/session/session-controller.ts`、
  `packages/core/agent-loop/src/loop.ts`、`packages/harness-evolution/plugin-manager/src/build.ts`、
  `packages/composition/cordis-adapter/src/manifest.ts`，以及各 `tool-*` 包的 `plugin.ts` / `tools.ts` / `definitions.ts`。
- 已知约束：
  - 「新增工具默认不进入模式」是既定设计。P1 保留 fail-closed：`modes` 是必填字段，没声明的模式看不到；
    `actspace.evolved.*` 无论声明什么都只在 `agent` 模式（由 `build.ts` 写死且策略层再拦一次）。
  - Session Header 的 `agentFormVersion` 只接受 `1`（`session-journal/src/header.ts`），形态成员 `version` 必须 ≥ 1。
    P1 不改 Header 契约：形态版本仍是 1，成员差异靠 `agentCompositionDigest` 体现；`0.x` 的插件成员版本记为 1。
  - `definitionDigest` 会因新增字段整体变化；它只写进 `request/tools` 记录，没有任何比较逻辑依赖旧值。
  - 依赖方向：`core/runtime` → `core/agent` → `tool-runtime`；catalog 只能在 `core/runtime` 读，所以形态成员的推导
    放在 `core/runtime`，`core/agent` 只提供契约与激活逻辑。
  - 默认 Harness 的 bundle 只允许白名单内的外部 import（`scripts/build-default-harness.mjs`）：Harness 条目
    （如 `agent-factory-plugin.ts`）不能 import `plugin-catalog.ts`，形态要由 Host 经 `actspace.host.agent.agentForm` 传入。

## 风险

- 风险：某个工具漏声明 `modes` 导致在所有模式消失。缓解：类型必填 + `normalizeToolDefinition` 校验 +
  默认 Harness 装配测试按名字断言 Chat / Plan / Agent 三个集合。
- 风险：形态成员改为推导后 `agentMembers` 组成变化（`prompt`、`compaction` 不再是成员，`plugin-manager` 成为成员）。
  缓解：该字段只是 provenance，没有比较逻辑；在决策记录与设计文档里写明。
- 风险：`plugin-manager` 变为 required 成员后，装配里没有它的 Host 会在激活主 Agent 时失败。
  缓解：它在 catalog 里本来就是 required 的 Harness 条目，所有 Profile 都加载；测试覆盖 fail-closed 路径。

## 里程碑

1. P1：工具声明模式、形态由 manifest 推导（本轮）。
2. P2：默认 Harness 按条目产出产物，`harness-control` 可替换单个内置条目；`service-contract.ts` owner 改为由 manifest 提供。
3. P3：`agent-factory-plugin` 的上下文来源与 Loop 扩展点改为注册式，拆成 `agent-factory` + `context-assembly` 两个条目。（已完成）
4. P4：文件读/搜/写与 Shell 的实现迁入 Harness 树（`fs-local` / `shell-local` 风格的提供者插件），Host 只保留能力授予与审批。（已完成）

## 验证方式

- 命令：
  - `pnpm --filter @actspace/tool-runtime test`、`pnpm --filter @actspace/agent test`、
    `pnpm --filter @actspace/runtime test`、`pnpm --filter @actspace/agent-loop test`、
    `pnpm --filter @actspace/plugin-manager test`，以及所有改了定义的 `tool-*` 包测试。
  - `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:docs`。
- 手工检查：`default-harness.test.ts` 新增断言——Chat 可见集合恰好 `web`、`generate_image`；Plan 集合等于设计文档 §5；
  Agent 集合不含 `web`。
- 观测检查：无运行时新日志；`request/tools` 记录里的 `definitionDigest` 会在升级后第一轮变化一次，属预期。

## 进度记录

- [x] P1-T1 `ToolDefinition.modes`：类型、校验、`tool-runtime` 测试。
- [x] P1-T2 所有内置工具定义声明 `modes`；`build.ts` 对进化工具写死 `["agent"]`。
- [x] P1-T3 `core/agent`：`allowedAgentModeTools(mode, definitions)`，删除 `AGENT_MODE_TOOLS`；`AgentForm` 契约化。
- [x] P1-T4 `core/runtime`：`main-agent-form.ts` 从 catalog 推导成员；Host 在 `boot.ts` 经 `agentForm` 端口字段交给
  `agent-factory-plugin`；`session-controller` 直接用 `MAIN_AGENT_FORM`。
- [x] P1-T5 `agent-loop/loop.ts` 改用新策略签名。
- [x] P1-T6 `default-harness.test.ts` 守住三个模式集合并断言推导出的成员；`agent-form.test.ts` 改为契约测试。
- [x] P1-T6b Subagent 工具的 `pluginId` 改为贡献它们的 Harness 条目 `actspace.subagent-tools`（原来写的是 Host 侧管理器
  `actspace.subagent`，形态按 owner 匹配时会把必需成员判为缺失）。
- [x] P1-T7 文档：设计文档 §4.1/§5、learning、history、exec-runs。
- [x] P2-T1 `plugin-catalog.ts` 增加 `isHarnessToolPlugin` / `harnessToolPluginEntries`：贡献工具的 Harness 条目既是形态成员，也是
  独立产物；`main-agent-form.ts` 改用同一谓词。
- [x] P2-T2 `build-default-harness.mjs` 两层产出：内核条目一份代码分割闭包，每个工具插件一份自包含
  `plugins/<entry>/plugin.js`；`files.json` 改为 `{ kernel, plugins }` 清单。
- [x] P2-T3 `prepareDefaultHarnessArtifact` 发布内核产物 `actspace.default-harness` 加每个工具插件自己的产物（pluginId、版本、
  来源、display 沿用 catalog manifest，条目 id 仍是 catalog id）；composition 的 `manifests` 是真实的多份 manifest，
  每个条目带 `artifactId`；`upgradePristineBuiltin` 改按 `provenance` 判定。
- [x] P2-T4 装配测试：真实产物上断言 15 个产物、内核不含工具条目、`filesystem-read` 的 manifest 身份，并用
  `resolveHarnessPatch` + `checkHarnessCompatibility` 验证一条 `replace` 只换掉该插件的产物。
- [x] P2-T5 `service-contract.ts` owner：增加对照 catalog 的漂移测试（owner / providerOwner / providerId 必须等于贡献该服务的
  插件包与条目）；测试立即发现 `tools.browser` 写的是不存在的 `@actspace/browser-tools`，已改为 `@actspace/tool-browser`
  并重新生成契约矩阵。
- [x] P3-T1 新包 `packages/context/context-assembly`（Harness 内核条目 `context-assembly`，提供 `context.assembly`）：按种类 + Agent
  角色（`main` / `subagent` / `fork`）登记来源工厂、登记工具结果观察者，`sourcesFor(role, options)` 搭出 `ContextSourceRegistry`
  并挂到 scope；必需种类来自 manifest `config.required`（默认 `system`、`conversation`）。`publish` 从 `prompt/source-support`
  搬到这里，仍提供 `context.source.<kind>` 作为可见契约。
- [x] P3-T2 八个来源插件 inject `context.assembly` 并用 `publish` 登记；`background-tasks` / `subagents` 自己声明只给 `main`；
  `context-tools` / `context-conversation` 从直接 `provide` 改为 `publish`。
- [x] P3-T3 `context-disclosure` 自己接线：`CompactionDisclosure.hydrate?` + 协调器 `hydrator()`，`context.engine.create` 默认取它；
  向 `context.assembly` 登记 `disclosure` 来源与工具结果观察者。`agent-factory` 不再 import 披露包。
- [x] P3-T4 `agent-factory-plugin` 删除种类列表与披露分支：inject `context.assembly` 代替 `context.source.system/conversation`，
  `createSources` → `assembly.sourcesFor`，`observeContextToolResult` → `assembly.observeToolResult`，`createContextEngine` 直接
  `engine.create(options)`。`tool-composition.test.ts` 在真实树上断言按角色登记的种类。
- [x] P4-T1 `tool-runtime/src/host-ports.ts` 定义两份能力授予：`actspace.host.filesystem`（`FilesystemHostGrant`）和
  `actspace.host.process`（`ProcessHostGrant`），加入 `DEFAULT_HARNESS_SHARED_SERVICES`；新增 `OPTIONAL_HOST_SHARED_SERVICES`，
  `agent-runtime` 的 inject 过滤它们。
- [x] P4-T2 `tool-fs-read/search/write` 与 `tool-shell` 删除 `*_HOST_PORT_ID` / `HostPort`：`apply` 可选读授予，用包内 `node-ports`
  自己建实现（随 Harness 产物打包）；没有授予时注册但返回 `CAPABILITY_UNAVAILABLE`。manifest 改 `optionalInjects`，
  `OPTIONAL_INJECT_FALLBACKS` 补两条 fallback。
- [x] P4-T3 Host 侧：`agent-host` 的 `createNodeToolHostServices` / Desktop 的 `createDesktopToolHostServices` 只提供两份授予 +
  网页 / 图片端口；`createUnavailableToolHostServices`（CLI `--mock`）不再给文件 / Shell 任何东西；`agent-host` 不再依赖
  `tool-fs-*` / `tool-shell`。
- [x] P4-T4 测试与文档：fs / shell lifecycle 测试覆盖「无授予 → 不可用」和「有授予 → 真读写 / 交出进程控制」；运行时测试
  fixture、catalog 行断言、`packages/{fs,shell,context,core}/README.md`、Tool 插件边界设计文档、自进化边界文档、契约矩阵。

## 决策记录

- 2026-11-09：模式可见性放在 `ToolDefinition` 而不是 manifest。理由：定义随注册进入 registry，Loop 与工厂都直接拿
  定义过滤，不用再从 manifest 反查；manifest 的 `contributions.tools` 只管「这个插件有哪些工具」。
- 2026-11-09：形态成员 = 「Harness 加载、manifest 声明了工具」的 catalog 条目。`prompt`、`compaction` 退出成员列表，
  `plugin-manager` 进入。`agentMembers` 是 provenance，不做比较；形态版本保持 1。
- 2026-11-09：fail-closed 的产品策略从 `core/agent` 的单元测试搬到 `core/runtime` 的默认 Harness 装配测试。
  理由：策略本来就是「装配出来的集合」，在真实装配上断言比在常量表上断言更可信。
- 2026-11-09：进化工具的模式由 `build.ts` 固定为 `["agent"]`，策略层对 `actspace.evolved.*` 再做一次 `agent` 限定；
  Agent 不能靠改源码元数据把自己的工具放进 Chat / Plan。
- 2026-11-09：形态经 Host port 传入 Harness，而不是让 Harness 自己从 composition manifests 推导。理由：bundle 白名单
  禁止 Harness 条目 import 插件目录；而 Harness 内部目前拿不到 composition manifests（`mountHarness` 只把 entries
  和 sharedServices 交给树）。P2 拆产物时如果给树暴露 composition，可以再把推导挪进 Harness。
- 2026-11-09（P2）：默认 Harness 产物按「内核 + 每个工具插件」两层拆，而不是每个条目一份。理由：内核条目之间共享
  `tool-runtime`、`llm-service`、`context-engine` 的类与 WeakMap（`instanceof ToolRuntimeError` / `LlmRuntimeError`、
  上下文可信表面），逐条目打包会复制这些模块、破坏身份判断；工具插件只经服务与内核交互，单独打包后 esbuild 的摇树结果
  里没有任何被实例化的共享类或 Symbol（探针对比过 14 个 bundle），可以安全独立。拆分依据与形态成员共用
  `isHarnessToolPlugin`，两者天然一致。
- 2026-11-09（P2）：工具插件产物保留 catalog 的 pluginId / 版本 / 来源，但行描述仍由 `DEFAULT_HARNESS_ENTRIES` 合成
  （`host.required` 为空、`contracts` 补齐、条目 id 用 catalog id），不直接把 catalog manifest 当产物 manifest。理由：
  catalog manifest 没有 `contracts`，`host.required` 会让 `capabilityCeiling` 为空的 Host（测试、CLI）无法挂载；
  Host 能力门禁已经由 `harnessEntriesMissingHostCapabilities` 与 Host port 完成。
- 2026-11-09（P2）：`service-contract.ts` 的 owner 不改成运行时推导，而是加漂移测试对照 catalog。理由：该表只是契约矩阵
  的审计元数据，生成器用正则读源码，运行时推导会让生成器失去来源；测试已经把它变成「必须与 manifest 一致」的镜像，
  首次运行就抓到一个错误的包名。彻底删掉叶子 owner、让生成器按 manifest 兜底（它已支持 `declared` 行）留作后续。
- 2026-11-09（P2）：`plugin_manager` 的 `replace` 仍只接受带可编辑源码的 `actspace.evolved.*` 条目。内置工具产物是打包后的
  JS，没有模板源码；让模型改写内置工具属于 P3/P4 之后的事。P2 交付的是产物与补丁层面的可替换性。
- 2026-11-09（P3）：上下文来源登记表是一个独立内核条目 `context-assembly`，不是 `agent-factory` 的内部表。理由：来源插件
  要在 Loop 之前登记，登记表本身必须比两边都长寿；它只依赖 `context-engine` / `prompt` 的类型，Harness 替换任一来源插件
  或 `agent-factory` 都不用动它。必需种类放 manifest `config.required` 而不是写死，Host 以 `entryConfig` 可覆盖；缺失在
  第一次建 Agent 时报错，而不是装配时——装配时还不知道哪些来源会按角色登记。
- 2026-11-09（P3）：角色过滤放在登记侧（`publish(..., ["main"])`），不是消费侧。理由：「子智能体不能派子智能体、不能发后台
  任务」是来源插件自己的业务约束，`agent-factory` 不该认识任何种类名。
- 2026-11-09（P3）：披露的 Context 水合走协调器（`CompactionDisclosure.hydrate?` + `hydrator()`），不再由 `agent-factory` 把
  `context.disclosure` 塞进 `engine.create`。理由：披露已经向协调器登记压缩钩子，水合只是它的第四个钩子；这样 Loop 侧
  对披露零引用，`context-disclosure` 整包可被替换或移除。`modeRuntime`（`compaction.runtime`）保持现状：它是压缩策略的
  模式切换，不是上下文来源，和本轮目标无关。
- 2026-11-09（P3）：不把 composition manifests 暴露给 Harness 树、也不把形态推导挪进 Harness。理由：P2 后 manifests 真实可用，
  但形态推导只需要 catalog 的一个谓词，Host 经 `agentForm` 端口传入已足够；给树暴露 manifests 会把 Host 的组合结果变成
  Harness 的运行时输入，扩大自进化可触碰的面，收益只是省一个端口字段。
- 2026-11-09（P4）：Host 给的是「能力授予」（根目录、artifact 解析、强制结束钩子），不是「工具实现工厂」。理由：
  `createPorts()` 形式下文件 / Shell 的真正实现在 Host 包里，Harness 换掉 `tool-fs-read` 只能换注册壳；授予形式下实现随
  插件产物一起打包（`build-default-harness.mjs` 对工具插件自包含打包），Host 只剩门禁与审批。授予是可选注入：CLI `--mock`
  不给授予，工具注册但返回 `CAPABILITY_UNAVAILABLE`，与原来 `createPorts: () => ({})` 的行为一致。
- 2026-11-09（P4）：两份授予的类型放 `tool-runtime`（Harness 内核）而不是各工具包。理由：Host（`agent-host`、Desktop）要 import
  类型来构造授予，若放工具包，Host 就得继续依赖 `tool-fs-*` / `tool-shell`，等于保留旧耦合；`tool-runtime` 本就是 Host 与
  工具插件共同依赖的契约层。
- 2026-11-09（P4）：没有像 DSH 那样抽一层 `FsService` 抽象再做 `fs-local` 提供者。理由：目前只有一个本地 Node 后端，抽象层
  没有第二个实现来约束形状；三个 fs 包各自持有 `node-ports`，Harness 替换粒度已经是「整个包」。等出现远程 / 虚拟文件系统
  需求再抽。

## 执行模式

- **夜间模式**：边界明确的实施任务；P1–P4 均由云端 Agent 自主执行，过程见执行文档。

## 状态

P1–P4 全部完成，剩余为人工验收（见执行摘要的「人工验证指引」）。后续候选（未立项）：让内置工具插件携带可编辑源码、
删除 `service-contract.ts` 里叶子插件的 owner、文件系统抽象层。

## 执行文档

- `docs/exec-runs/20261109-harness-plugin-decoupling/execution-process.md`
- `docs/exec-runs/20261109-harness-plugin-decoupling/execution-summary.md`
