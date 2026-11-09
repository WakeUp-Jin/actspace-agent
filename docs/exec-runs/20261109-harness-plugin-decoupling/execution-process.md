# 后端插件包解耦 P1 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-harness-plugin-decoupling.md`
- **执行模式**：夜间（云端 Agent 自主执行）
- **开始时间**：2026-11-09
- **结束时间**：2026-11-09

## 执行时间线

### 步骤 1：`ToolDefinition.modes`

- **操作**：`tool-runtime` 的 `ToolDefinition` 新增必填 `modes: readonly ToolMode[]`（`ToolMode = RuntimeV2AgentMode`）；`normalizeToolDefinition` 校验值只能是 `chat` / `plan` / `agent` 且不重复，归一化结果里复制一份。
- **影响文件**：`packages/core/tool-runtime/src/definition.ts`、`src/test/runtime.test.ts`（测试用例的定义补 `modes`）。
- **决定**：放在定义而不是 manifest。定义随注册进 registry，Loop 和工厂直接按定义过滤，不必从 manifest 反查。
- **验证**：`pnpm --filter @actspace/tool-runtime test`，新增字段相关用例通过；3 个失败项在 `main` 上同样失败（process Grant / 相对路径），与本次无关。

### 步骤 2：所有内置工具声明 `modes`

- **操作**：按设计文档 §5 的表给每个工具声明：`web` → `chat`；`generate_image` → `chat`、`agent`；文件探索 / Web 查询 / 图片分析 / Todo / 后台任务 / 内部 Subagent → `plan`、`agent`；文件修改 / `bash` / `present` / Browser / 外部 Subagent 后端 / `plugin_manager` / `harness_inspect` → `agent`。`plugin-manager/build.ts` 对进化工具固定 `EVOLVED_TOOL_MODES = ["agent"]`。
- **影响文件**：`tool-web`、`tool-fs-read`、`tool-fs-search`、`tool-fs-write`、`tool-image-generation`、`tool-image-inspection`、`tool-shell` 的 `plugin.ts`；`tool-background-tasks/src/tools.ts`；`tool-browser/src/definitions.ts`；`tool-todo/src/todo-tool.ts`；`subagent/src/tools.ts`；`plugin-manager/src/{plugin,build}.ts`；`agent-loop/src/testing.ts`。
- **验证**：各包 `test` 通过；`Object.freeze` 让字面量退化成 `string[]` 的地方补了 `as const`。

### 步骤 3：`core/agent` 不再列工具名

- **操作**：`agent-mode-policy.ts` 删除 `AGENT_MODE_TOOLS`，改为 `allowedAgentModeTools(mode, definitions)`：按 `definition.modes` 过滤，`actspace.evolved.*` 只在 `agent`，未知模式抛错。`agent-form.ts` 改为契约：`defineMainAgentForm(members)`（校验唯一 id、版本 ≥ 1、成员至少一个工具、工具不能被两个成员认领）、`agentFormComposition(form, plugins)`、`activateAgentFormTools(form, scope, runtime)`；删除手写的 `MAIN_AGENT_FORM`。
- **影响文件**：`packages/core/agent/src/{agent-mode-policy,agent-form}.ts`、`src/test/agent-form.test.ts`（改为合成成员的契约测试）、`packages/core/agent-loop/src/loop.ts`（新签名）。
- **验证**：`pnpm --filter @actspace/agent test` 18 通过；`agent-loop` 71 通过。

### 步骤 4：形态成员从插件目录推导

- **操作**：`cordis-adapter/manifest.ts` 的 `PluginContributionSummary` 暴露 `tools`；新增 `core/runtime/src/main-agent-form.ts`，从 `PLUGIN_CATALOG` 里 `loaders` 含 `harness` 且声明了工具的条目推导成员（id = pluginId、version = max(1, 主版本)、required 取 manifest）。`session-controller.ts` 改用 `agentFormComposition(MAIN_AGENT_FORM, plugins)`。
- **影响文件**：`packages/composition/cordis-adapter/src/manifest.ts`、`packages/core/runtime/src/main-agent-form.ts`、`src/session/session-controller.ts`。
- **决定**：成员集合变化——`prompt`、`compaction` 退出（不贡献工具），`plugin-manager` 进入。`agentMembers` / `agentCompositionDigest` 只是 Header provenance，没有比较逻辑依赖旧值，形态版本保持 1。

### 步骤 5：Harness 内的 `agent-factory` 取得形态

- **操作**：第一版让 `agent-factory-plugin.ts` 直接 `import "../main-agent-form.js"`，默认 Harness 打包后装配测试报 `Unapproved external import @actspace/session-journal/manifest in agent-factory.js`——条目把整个插件目录拖进了 bundle。改为 `AgentRuntimeHostPort` 新增 `agentForm: AgentForm`，Host 在 `startup/boot.ts` 填 `MAIN_AGENT_FORM`，条目只读 `host.agentForm`，缺失时抛错。
- **影响文件**：`packages/core/runtime/src/harness/{agent-host-port,agent-factory-plugin}.ts`、`src/startup/boot.ts`、`src/harness/{default-harness,evolution}.test.ts`（直接提供端口的测试补字段）。
- **决定**：没有让 Harness 自己从 composition 推导，因为 `mountHarness` 目前只把 entries 和 sharedServices 交给树，manifests 不可见；P2 拆产物时可再评估。

### 步骤 6：Subagent 工具的所有者

- **操作**：装配测试报 `Agent form member actspace.subagent-tools is incomplete or unavailable`。原因是 `subagent/src/tools.ts` 把工具 `pluginId` 写成 Host 侧管理器 `actspace.subagent`，而贡献它们的 Harness 条目是 `actspace.subagent-tools`；形态按 owner 匹配后判为缺失。改 `SUBAGENT_TOOL_PLUGIN_ID = "actspace.subagent-tools"`。
- **影响文件**：`packages/subagent/subagent/src/tools.ts`。
- **验证**：`subagent` 30、`tool-subagent` 2 通过；无其他地方断言旧值。

### 步骤 7：装配测试守住产品策略

- **操作**：`default-harness.test.ts` 在真实装配上断言 Chat 可见集合恰好 `["generate_image", "web"]`、Plan 集合等于设计文档 §5 的 20 个工具、Agent 含 `bash` / `edit_file` / `present` / `generate_image` / `plugin_manager` / `harness_inspect` 且不含 `web`；新增用例断言推导出的成员顺序、版本、required 和工具名，且没有 `actspace.context*` 成员。
- **验证**：`pnpm --filter @actspace/runtime test` 244 通过。

### 步骤 8：全仓检查与文档

- **操作**：`pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:hot-path-reads` 通过；`pnpm check:docs` 在登记计划后通过。更新设计文档 §4.1 / §5 / §5.1、旧 learning 的指向、`packages/core/README.md`，新增 learning 与本执行文档、history。

## P2：默认 Harness 按插件产出产物

### 步骤 9：拆分方案探针

- **操作**：在 `/tmp` 用 esbuild 对 14 个贡献工具的条目各打一份不分割 bundle，与内核闭包对比输入模块与输出代码。
  输入层面叶子 bundle 和内核大量重叠（`tool-runtime`、`agent`、`subagent`），但摇树后的输出里只剩纯函数
  （`isPathWithin`、`canonicalizeFileResource`、`redactToolText`）与常量；重复出现的 `AgentRuntimeError` / `AgentRegistryService`
  类没有被实例化，`TODO_STATE` Symbol 只在 todo 插件内部使用，`image-inspection` 的 plugin 入口不含 `LlmRuntimeError`。
  内核条目之间则确实共享 `instanceof` 类和 context-engine 的 WeakMap。
- **结论**：按「内核 + 每个工具插件」两层拆，而不是逐条目拆；写进计划决策记录。

### 步骤 10：构建脚本与产物发布

- **操作**：`build-default-harness.mjs` 先打内核（splitting），再对每个 `isHarnessToolPlugin` 条目打 `plugins/<entry>/plugin.js`，
  `files.json` 改为 `{ kernel, plugins }`。`prepareDefaultHarnessArtifact` 拆出 `behaviorFor` / `toolPluginManifest`，发布 1 + 14 个产物，
  composition 的 `manifests` 为真实多份 manifest、每个条目带 `artifactId`、`digest` 为全部产物 id 的哈希。
  `agent-runtime-plugin` 的 `upgradePristineBuiltin` 改为所有条目 `provenance` 以 `builtin:` 开头。
- **影响文件**：`packages/core/runtime/scripts/build-default-harness.mjs`、`src/plugin-catalog.ts`、`src/main-agent-form.ts`、
  `src/harness/{default-harness,default-harness-definition,agent-runtime-plugin}.ts`。
- **验证**：重建后 `dist/default-harness/` 为 31 个内核文件 + 14 个插件目录；原有装配、进化测试不改即通过。

### 步骤 11：替换单个内置插件的测试

- **操作**：`default-harness.test.ts` 新增用例：断言产物数量与 manifest 顺序、内核不含工具条目、`actspace.filesystem-read`
  的版本 / 来源 / 工具列表 / `./plugin.js`；再发布一个同 pluginId、版本 `2.0.1` 的替代产物，用 `resolveHarnessPatch` 做
  `replace`，断言只有 `filesystem-read` 条目换了 `artifactId`、其余条目（含内核）不变、原产物不再被引用、
  `checkHarnessCompatibility` 无诊断。
- **验证**：`pnpm --filter @actspace/runtime test` 248 通过。

### 步骤 12：service-contract owner 漂移测试

- **操作**：同一测试文件增加用例，遍历 `harnessToolPluginEntries()`，对每个提供的服务要求 `ACTSPACE_SERVICE_DEFINITIONS[...].owner`
  与 `ACTSPACE_SERVICE_ROLE_METADATA` 的 `providerOwner` 等于 `entry.module` 的包名、`providerId` 等于 `<entryId>:default`。
  首次运行即失败：`tools.browser` 的 owner 写成不存在的 `@actspace/browser-tools`，实际包是 `@actspace/tool-browser`。
  改正后 `pnpm gen:contract-matrix` 重新生成矩阵。
- **影响文件**：`packages/composition/cordis-adapter/src/service-contract.ts`、
  `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`。
- **验证**：`cordis-adapter` 43 通过、`pnpm test:contract-matrix` 通过。

### 步骤 13：全仓检查与文档

- **操作**：`runtime`（248）、`cordis-adapter`（43）、`harness-control`（29）、`harness-evaluation`（12）、`plugin-manager`（6）通过；
  `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:hot-path-reads`、`pnpm test:plugin-catalog` 通过。
  更新设计文档 07（内置产物说明）、装配规范、Run 生命周期文档、`packages/core/README.md`，计划进度与决策记录。

## 遇到的问题

- **问题**：Harness 条目 import Host 侧模块在 `tsc` 与源码测试下都不报错，只在打包后的装配测试暴露。
  - **原因**：默认 Harness bundle 的外部 import 白名单只在 `build-default-harness.mjs` / `prepareDefaultHarnessArtifact` 路径上检查。
  - **应对**：改走 Host port；教训记在 `docs/learnings/2026-11/harness-entry-takes-host-data-through-ports.md`。
- **问题**：`tool-runtime` 有 3 个与本次无关的失败用例。
  - **原因**：在 `main` 上同样失败（process Grant 与相对资源路径），属环境相关的既有问题。
  - **应对**：不在本轮处理，摘要里标注。

- **问题**（P2）：直接把 catalog manifest 当工具插件的产物 manifest 不可行。
  - **原因**：catalog manifest 没有 `contracts`（`checkHarnessCompatibility` 会报 Missing behavior contracts），`host.required`
    （如 `filesystem.read`）会让 `capabilityCeiling` 为空的 Host 在 `mountHarness` 时报缺能力。
  - **应对**：产物 manifest 只沿用 pluginId / 版本 / 来源 / display / contributions，行描述仍由 `DEFAULT_HARNESS_ENTRIES` 合成。

## 跳过或推迟的事项

- P3–P4（`agent-factory` 上下文来源注册式、文件/Shell 实现收回 Harness 树）：按计划留给后续轮次。
- Harness 自己从 composition 推导形态：P2 后 composition 已有真实的多份 manifest，但 `mountHarness` 仍只把 entries 交给树，
  未在本轮改动。
- 彻底删掉 `service-contract.ts` 里叶子插件的 owner、让契约矩阵生成器按 manifest 兜底：本轮只加漂移测试。
- 让 `plugin_manager` 以内置工具为模板改写（需要内置插件携带可编辑源码）：属 P3/P4 之后。

## 夜间模式补充记录

- 云端 Agent 自主完成全部步骤，无人工审批环节；未执行任何破坏性操作。`tmp/deepseek-harness` 参考克隆未入库。
