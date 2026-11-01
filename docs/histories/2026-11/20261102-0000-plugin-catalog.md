## [2026-11-02 00:00] | Task: 插件清单与展示信息（插件结构 S2）

### 🤖 Execution Context

- **Agent ID**: `subagent (架构优化 S2)`
- **Base Model**: `Claude Sonnet 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 执行插件结构 S2：每个插件 manifest 加中文 `display`；建唯一的插件清单 `PLUGIN_CATALOG`；`cordis.yml`、Host 加载表、默认 Harness 条目、构建入口、codec 查找、基础 bundle 都从清单计算；运行时 id 不变；不提交。

### 🛠 Changes Overview

**Scope:** `packages/core/runtime`、`packages/composition/cordis-adapter`、各插件包 manifest、`packages/todo/tool-todo`、`scripts/`、`docs/`

**Key Actions:**

- **display**: `PluginManifest` 增加可选 `display`（标题 ≤12、描述 ≤40、scope、defaultEnabled、canDisable），`validatePluginManifest` 校验；49 个包的 manifest 写入中文展示信息。
- **清单**: 新增 `packages/core/runtime/src/plugin-catalog.ts`（`PLUGIN_CATALOG`、`pluginCatalogEntry`、`PLUGIN_PACKAGES_OUTSIDE_DEFAULT`）和 `manifests.ts`；`TRUSTED_LOADER_ENTRIES`、`DEFAULT_HARNESS_ENTRIES`、构建入口、codec 查找、基础 bundle、浏览器 bundle 全部从它计算，删除五处手写表。
- **cordis.yml**: 改为 `scripts/generate-plugin-loader.mjs` 生成，`--check` 进 `check:packages`；新增 `scripts/check-plugin-catalog.mjs` 校验展示信息、`module`/`codec` 可解析、有 `plugin.ts` 的包必须登记。
- **tool-todo**: 拆出 `projection-plugin.ts`（`@actspace/tool-todo/projection`），去掉 runtime 的 `./todo-projection` 导出。
- **通用能力规则**: manifest 标 `required: false` 且 `host.required` 缺能力的 Harness 条目不加载（目前只有 browser-tools），取代 boot 里写死的浏览器判断。
- **对照测试**: 先对旧常量写对照测试，按当前行为修正 manifest，再删旧表。
- **文档**: 7 篇当前文档与契约矩阵同步。

### 🧠 Design Intent (Why)

S3 的插件开关和设置页需要一个唯一的插件登记点和可展示的名称、说明；先把分散的五份表合成一份，新增插件只需改一处。Entry id、plugin id、service id、事件类型都不变，默认 Harness 条目数 45 → 45。

### 📁 Files Modified

- `packages/core/runtime/src/{plugin-catalog,manifests}.ts`、`profiles/composition.ts`、`harness/*`、`startup/boot.ts`、`cordis.yml`、`scripts/build-default-harness.mjs`
- `packages/composition/cordis-adapter/src/manifest.ts`、`packages/*/*/src/manifest.ts`（49 个）
- `packages/todo/tool-todo/**`、`apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- `scripts/{generate-plugin-loader,check-plugin-catalog}.mjs`、`scripts/test/plugin-catalog.test.mjs`、根 `package.json`
- `docs/ARCHITECTURE.md`、`packages/README.md`、`docs/design-docs/agent-plugin-runtime/*`、`agent-contract-matrix.generated.md`
- `docs/exec-runs/20261101-feature-subtraction/execution-process.md`
