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
- 包含（P2–P4，后续轮次，见里程碑）：默认 Harness 按条目产出产物；`service-contract.ts` 不再写死叶子包 owner；
  `agent-factory-plugin` 的上下文来源列表改为注册式；文件/Shell 工具实现从 Host port 收回 Harness 树。
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
3. P3：`agent-factory-plugin` 的上下文来源与 Loop 扩展点改为注册式，拆成 `agent-factory` + `context-assembly` 两个条目。
4. P4：文件读/搜/写与 Shell 的实现迁入 Harness 树（`fs-local` / `shell-local` 风格的提供者插件），Host 只保留能力授予与审批。

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
- [ ] P2–P4 待立项细化（见里程碑）。

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

## 执行模式

- **夜间模式**：边界明确的实施任务；本轮由云端 Agent 自主执行，过程见执行文档。

## 执行文档

- `docs/exec-runs/20261109-harness-plugin-decoupling/execution-process.md`
- `docs/exec-runs/20261109-harness-plugin-decoupling/execution-summary.md`
