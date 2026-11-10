## [2026-11-09 14:00] | Task: 后端插件包解耦 P1——工具自声明模式、形态成员从插件目录推导

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 看看现在项目的后端拆分下来的插件包合理吗？是否解耦，足够支持 Harness 自进化的修改？可以拉一下 DeepSeekHarness 的源码参考一下……开始执行吧。

### 🛠 Changes Overview

**Scope:** `core/tool-runtime`、`core/agent`、`core/agent-loop`、`core/runtime`、`composition/cordis-adapter`、`subagent/subagent`、`harness-evolution/plugin-manager`、各 `tool-*` 工具包；`docs/`。

**Key Actions:**

- **评估与立项**：对照 `deepseek-ai/deepseek-harness` 的插件组织方式评估了 `packages/` 的拆分，结论是包边界合理但 `core/agent` 把工具名、形态成员写死，Harness 自进化替换一个工具插件要改 core。立了执行计划 `docs/exec-plans/active/20261109-harness-plugin-decoupling.md`（P1–P4），本轮执行 P1。
- **工具自声明模式**：`ToolDefinition` 新增必填 `modes`，`normalizeToolDefinition` 校验；所有内置工具按设计文档 §5 声明；进化工具由 `plugin-manager/build.ts` 固定为 `["agent"]`。
- **`core/agent` 去硬编码**：删除 `AGENT_MODE_TOOLS` 与手写的 `MAIN_AGENT_FORM`，改为 `allowedAgentModeTools(mode, definitions)` 和 `defineMainAgentForm` / `agentFormComposition` / `activateAgentFormTools` 契约。
- **形态从插件目录推导**：`core/runtime/src/main-agent-form.ts` 从 `PLUGIN_CATALOG` 里 Harness 加载且 manifest 声明了 `contributions.tools` 的条目推导成员；Host 在 `boot.ts` 经 `actspace.host.agent.agentForm` 交给 Harness 内的 `agent-factory`。
- **修正 Subagent 工具 owner**：`SUBAGENT_TOOL_PLUGIN_ID` 改为贡献它们的 Harness 条目 `actspace.subagent-tools`。
- **装配测试守策略**：`default-harness.test.ts` 在真实装配上断言 Chat / Plan / Agent 三个可见集合与推导出的形态成员。
- **文档同步**：设计文档 `agent-forms-and-modes.md` §4.1 / §5 / §5.1、`packages/core/README.md`、旧 learning 指向、`docs/exec-plans/README.md` 登记，新增 exec-runs 两份文档。

### 🧠 Design Intent (Why)

Harness 自进化的目标是替换或新增一个工具插件而不动 core。此前模式白名单和形态成员都是 `core/agent` 的常量表，新工具要同时改三处才可见。把「可见模式」放到工具定义、把「成员」放到 manifest 后，插件自己就是真来源，core 只做校验与过滤；fail-closed 由必填字段和归一化校验保住，产品策略改在装配测试上断言。形态经 Host port 传入而不是让 Harness 条目 import 插件目录，是因为默认 Harness bundle 的外部 import 白名单会拒绝。

### 学习沉淀

- 新增 `docs/learnings/2026-11/harness-entry-takes-host-data-through-ports.md`。
- 扩写 `docs/learnings/2026-09/20260928-agent-form-scope-and-mode-gate.md`（指向新机制）。

### 验证

- `pnpm --filter @actspace/runtime test` 244 通过；`agent`、`agent-loop`、`subagent`、`tool-subagent`、`plugin-manager`、`cordis-adapter`、`agent-service`、`session-journal` 及各 `tool-*` 包测试通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:docs`、`pnpm check:hot-path-reads` 通过。
- `tool-runtime` 的 3 个失败用例在 `main` 上同样失败（process Grant、相对资源路径），与本次无关。

### 📁 Files Modified

- `packages/core/tool-runtime/src/definition.ts`
- `packages/core/agent/src/agent-mode-policy.ts`、`packages/core/agent/src/agent-form.ts`、`packages/core/agent/src/test/agent-form.test.ts`
- `packages/core/agent-loop/src/loop.ts`、`packages/core/agent-loop/src/testing.ts`
- `packages/core/runtime/src/main-agent-form.ts`（新增）、`src/harness/agent-host-port.ts`、`src/harness/agent-factory-plugin.ts`、`src/startup/boot.ts`、`src/session/session-controller.ts`、`src/harness/default-harness.test.ts`、`src/harness/evolution.test.ts`
- `packages/composition/cordis-adapter/src/manifest.ts`
- `packages/subagent/subagent/src/tools.ts`
- `packages/harness-evolution/plugin-manager/src/plugin.ts`、`src/build.ts`
- `packages/{web,fs,image,shell,browser,todo,background-tasks}/tool-*/src/*`
- `docs/exec-plans/active/20261109-harness-plugin-decoupling.md`、`docs/exec-plans/README.md`、`docs/exec-runs/20261109-harness-plugin-decoupling/*`
- `docs/design-docs/agent-runtime/agent-forms-and-modes.md`、`docs/learnings/2026-11/harness-entry-takes-host-data-through-ports.md`、`docs/learnings/README.md`、`docs/learnings/2026-09/20260928-agent-form-scope-and-mode-gate.md`、`packages/core/README.md`
