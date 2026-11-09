## [2026-11-09 16:00] | Task: 后端插件包解耦 P2——默认 Harness 按插件产出产物、内置工具插件可单独替换

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 继续执行吧。

### 🛠 Changes Overview

**Scope:** `core/runtime`（默认 Harness 构建与发布）、`composition/cordis-adapter`（服务契约 owner）、`docs/`。

**Key Actions:**

- **两层产物**：`build-default-harness.mjs` 先把内核条目（Loop、上下文、工具运行时、沙箱、审批）打成一份代码分割闭包，再把每个贡献工具的条目（新谓词 `isHarnessToolPlugin`）单独打成自包含的 `plugins/<entry>/plugin.js`；`files.json` 改为 `{ kernel, plugins }` 清单。
- **按插件发布**：`prepareDefaultHarnessArtifact` 发布内核产物 `actspace.default-harness` 加 14 个工具插件产物，后者沿用 catalog manifest 的 pluginId / 版本 / 来源 / display；composition 的 `manifests` 是真实的多份 manifest，每个条目带 `artifactId`，`digest` 为全部产物 id 的哈希。
- **pristine 判定**：`agent-runtime-plugin` 的 `upgradePristineBuiltin` 从「所有条目 pluginId 等于 `actspace.default-harness`」改为「所有条目 `provenance` 以 `builtin:` 开头」。
- **可替换性测试**：`default-harness.test.ts` 新增用例，在真实产物上用 `resolveHarnessPatch` 做一条 `replace`，换掉 `filesystem-read` 的产物，断言内核与其余插件产物不变、`checkHarnessCompatibility` 无诊断。
- **service-contract owner 漂移测试**：对照 `harnessToolPluginEntries()` 校验 `ACTSPACE_SERVICE_DEFINITIONS` 的 owner 与 `ACTSPACE_SERVICE_ROLE_METADATA` 的 providerOwner / providerId；首次运行即发现 `tools.browser` 的 owner 写成不存在的 `@actspace/browser-tools`，改为 `@actspace/tool-browser` 并重新生成契约矩阵。
- **文档同步**：计划进度与四条决策记录、exec-runs 过程与摘要、设计文档 07 的内置产物说明、装配规范与 Run 生命周期文档、`packages/core/README.md`。

### 🧠 Design Intent (Why)

P1 之后替换一个工具插件仍要动内核产物，因为默认 Harness 是一个多 behavior 的单产物，补丁解析又要求同一 pluginId 只有一个产物。拆产物时没有逐条目拆：内核条目之间共享 `tool-runtime` / `llm-service` / `context-engine` 的类与 WeakMap，逐条目打包会复制这些模块、破坏 `instanceof` 与可信表面判断；工具插件只经服务与内核交互，用 esbuild 探针对比 14 个独立 bundle 的摇树结果，没有任何被实例化的共享类或 Symbol，可以安全独立。拆分依据与形态成员共用同一谓词，两者天然一致。工具插件产物没有直接用 catalog manifest，因为后者缺 `contracts`、带 `host.required`，会让能力上限为空的 Host 无法挂载；行描述仍由 `DEFAULT_HARNESS_ENTRIES` 合成。

### 学习沉淀

- 新增 `docs/learnings/2026-11/split-bundles-along-service-seams-check-module-identity.md`（拆 bundle 要沿服务接缝、看产物判断模块身份风险）。

### 验证

- `pnpm --filter @actspace/runtime test` 248 通过；`cordis-adapter` 43、`harness-control` 29、`harness-evaluation` 12、`plugin-manager` 6 通过。
- `pnpm test:contract-matrix`、`pnpm test:plugin-catalog`、`pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:docs`、`pnpm check:hot-path-reads` 通过。

### 📁 Files Modified

- `packages/core/runtime/scripts/build-default-harness.mjs`
- `packages/core/runtime/src/plugin-catalog.ts`、`src/main-agent-form.ts`
- `packages/core/runtime/src/harness/default-harness.ts`、`default-harness-definition.ts`、`agent-runtime-plugin.ts`、`default-harness.test.ts`
- `packages/composition/cordis-adapter/src/service-contract.ts`、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `docs/exec-plans/active/20261109-harness-plugin-decoupling.md`、`docs/exec-runs/20261109-harness-plugin-decoupling/*`
- `docs/design-docs/自进化的方案设计/07-工作区与版本派生及Actor扩展.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-dsh-plugin-assembly-and-agent-startup.md`、`docs/design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md`、`packages/core/README.md`
