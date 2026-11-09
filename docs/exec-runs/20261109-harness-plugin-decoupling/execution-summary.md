# 后端插件包解耦 P1 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-harness-plugin-decoupling.md`
- **执行过程**：`docs/exec-runs/20261109-harness-plugin-decoupling/execution-process.md`
- **执行模式**：夜间（云端 Agent 自主执行）
- **执行结果**：P1 完成；P2–P4 留在计划里待后续轮次

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `ToolDefinition` 新增必填 `modes` | `packages/core/tool-runtime/src/definition.ts` | 工具自己声明在哪些模式可见；漏声明或未知值在归一化时拒绝，保持 fail-closed |
| 所有内置工具声明 `modes` | 各 `tool-*` 包、`subagent/src/tools.ts`、`plugin-manager/src/{plugin,build}.ts` | 按设计文档 §5 的表声明；进化工具由 `build.ts` 固定为 `["agent"]` |
| `core/agent` 不再列工具名 | `packages/core/agent/src/{agent-mode-policy,agent-form}.ts` | `allowedAgentModeTools(mode, definitions)` 按定义过滤；`defineMainAgentForm` / `agentFormComposition` / `activateAgentFormTools` 只做契约与激活 |
| 形态成员从插件目录推导 | `packages/core/runtime/src/main-agent-form.ts`、`cordis-adapter/src/manifest.ts` | Harness 加载且 manifest 声明了 `contributions.tools` 的条目就是成员；`prompt` / `compaction` 退出，`plugin-manager` 进入 |
| Host 经端口把形态交给 Harness | `agent-host-port.ts`、`startup/boot.ts`、`agent-factory-plugin.ts` | `actspace.host.agent.agentForm`；Harness bundle 不 import 插件目录 |
| Subagent 工具 owner 改为贡献它们的条目 | `packages/subagent/subagent/src/tools.ts` | `pluginId` 从 `actspace.subagent` 改为 `actspace.subagent-tools` |
| 装配测试守住产品策略 | `packages/core/runtime/src/harness/default-harness.test.ts` | Chat / Plan / Agent 三个集合与推导出的成员在真实装配上断言 |

## 人工验证指引

### 必须验证

1. **三种模式的工具可见集合没有变**
   - 验证方式：启动桌面端或 CLI，分别在 Chat、Plan、Agent 模式下让模型列出可用工具（或查看 `request/tools` 记录）。
   - 预期结果：Chat 恰好 `web`、`generate_image`；Plan 没有 `bash`、文件写入、Browser、`agent_codex` / `agent_claude_code`；Agent 没有 `web`，有 `plugin_manager`、`harness_inspect`。

2. **自进化产出的工具只在 Agent 模式**
   - 验证方式：用 `plugin_manager` 开发一个候选工具并激活，切到 Plan / Chat。
   - 预期结果：进化工具在 Plan / Chat 不可见，在 Agent 可见。

### 建议验证

1. **新会话 Header 的 `agentMembers`**
   - 验证方式：新建会话后查看 Session Header。
   - 预期结果：成员列表里没有 `actspace.prompt` / `actspace.compaction`，多了 `actspace.plugin-manager`；旧会话不受影响。

## Agent 已完成的验证

- `pnpm --filter @actspace/runtime test`：244 通过（含默认 Harness 装配、进化、Browser、统计启动）。
- `pnpm --filter @actspace/agent test`（18）、`agent-loop`（71）、`subagent`（30）、`tool-subagent`（2）、`plugin-manager`（6）、`cordis-adapter`（43）、`agent-service`（154）、`session-journal`（117）以及 `tool-web` / `tool-fs-*` / `tool-shell` / `tool-image-*` / `tool-browser` / `tool-todo` / `tool-background-tasks` 全部通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:docs`、`pnpm check:hot-path-reads` 通过。

## 已知风险和遗留事项

- `tool-runtime` 有 3 个既有失败用例（process Grant、相对资源路径），在 `main` 上同样失败，与本次无关，未处理。
- `request/tools` 记录里的 `definitionDigest` 因 `modes` 字段加入会在升级后第一轮变化一次，属预期，没有比较逻辑依赖旧值。
- 形态仍由 Host 推导后传入；Harness 自进化替换工具插件时，新插件的 manifest 必须出现在 `PLUGIN_CATALOG`（或 P2 以后的等价来源）里才会进入形态。

## 后续建议

- P2：默认 Harness 按条目产出产物，`service-contract.ts` 的 owner 改由 manifest 提供；届时评估把形态推导挪进 Harness。
- P3 / P4 见计划里程碑。
