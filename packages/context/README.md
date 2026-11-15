---
description: "每一轮发给模型的上下文怎么组装：引擎、提示词、各个来源、披露和压缩。"
kind: "package-group"
---

# context

`context/` 只管“东西怎么进入模型的上下文”。引擎持有长期的 `Context` 实例，每个来源只更新自己声明的那一片，请求时由引擎转成不可变的 `LlmInput`。后台任务、Skill 这些东西本身住在自己的能力目录里，这里只放把它们告诉模型的那一层。

行为规则（来源与顺序、补充、每个 Step 的更新、披露、压缩）只写在[上下文管理引擎设计](../../docs/design-docs/上下文管理引擎设计/README.md)；压缩提示词只在 `context-compaction/src/prompts.ts`。这里只写包怎么分、怎么连。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `context-engine` | 接口 | 会话 | 开 | 长期 Context 实例、来源注册表、reconcile、`LlmInput` 转换、状态事件、只读投影和唯一的压缩协调器；提供 `context.engine`，带 Codec |
| `prompt` | 接口 | 会话 | 开 | 提示词模板与渲染、Prompt contributor、来源支持（`./source-support`）、Host 来源加载；提供 `prompt.runtime` |
| `context-assembly` | 接口 | 会话 | 开 | 上下文装配登记表：来源按种类和 Agent 角色登记、工具结果观察者登记，按角色搭出 `ContextSourceRegistry`；提供 `context.assembly` |
| `context-system` | 实现 | 会话 | 开 | 来源：ActSpace 的基本系统说明；提供 `context.source.system` |
| `context-rules` | 实现 | 会话 | 开 | 来源：用户和工作区的 `AGENTS.md` 规则；提供 `context.source.rules` |
| `context-skills` | 实现 | 会话 | 开 | 来源：可用 Skill 的目录和选中的 Skill 正文；提供 `context.source.skills` |
| `context-runtime` | 实现 | 会话 | 开 | 来源：模型事实（工作区、Host 能力等）和一条运行状态补充（模式、日期、时区）；提供 `context.source.runtime` |
| `context-conversation` | 实现 | 会话 | 开 | 来源：之前的对话；提供 `context.source.conversation` |
| `context-tools` | 实现 | 会话 | 开 | 来源：工具清单；提供 `context.source.tools` |
| `context-background-tasks` | 实现 | 会话 | 开 | 来源：正在运行的后台任务（后台 Bash 和后台子智能体，子智能体带 transcript 路径；只给主 Agent）；提供 `context.source.background-tasks` |
| `context-disclosure` | 实现 | 会话 | 开 | 渐进式披露：登记读过和产生的文件路径，活跃的列给模型，其余收进睡眠索引，压缩时重排；提供 `context.disclosure` |
| `context-compaction` | 实现 | 会话 | 开 | 压缩策略：阈值、选段、摘要器和摘要提示词；向引擎的协调器登记；提供 `compaction.runtime`、`compaction.surface` |

## 包之间怎么连

- **来源。** 每个 `context-*` 来源插件 inject `context.assembly`，用 `@actspace/context-assembly` 的 `publish(ctx, 种类, 工厂, 角色?)` 向登记表登记，同时仍提供 `context.source.<种类>` 作为可见契约。会话插件 `agent-factory`（在 [`core/runtime`](../core/README.md)）不再认识任何种类名：它只 inject `context.assembly`，按 Agent 角色（`main` / `subagent` / `fork`）调 `sourcesFor` 拿到搭好的 `ContextSourceRegistry`。哪些种类必须有由 `context-assembly` manifest 的 `config.required` 决定（默认 `system`、`conversation`），缺了在第一次建 Agent 时报错；`background-tasks` 自己声明只给 `main`。
- **披露。** `context-disclosure` inject `context.engine`、`context.assembly` 和 `actspace.host.agent`；启用时自己向协调器登记压缩钩子与 Context 水合（`CompactionDisclosure.hydrate`），向 `context.assembly` 登记 `disclosure` 来源和工具结果观察者。`agent-factory` 不引用披露包。
- **压缩。** `context-compaction` inject `llm.service`、`context.engine`、`llm.auxiliary-requests`；策略的选择和提交协调仍在引擎的 `compaction.ts`，压缩包只提供策略和摘要器。
- **提示词。** `prompt` inject `actspace.host.prompt`，来源（`context-rules` 等）借 `@actspace/prompt/source-support` 向引擎贡献内容。Prompt 只贡献内容，引擎负责组织和转换，`llm-service` 负责真实请求。
- 引擎 inject `session.journal`。`context-background-tasks` inject `actspace.host.background-tasks`。

## 入口与测试

- 引擎：`context-engine/src/engine.ts`、`registry.ts`、`instances.ts`、`conversion.ts`、`supplements.ts`、`compaction.ts`、`codec.ts`、`projection.ts`；装配：`context-assembly/src/plugin.ts`；提示词：`prompt/src/core-contributors.ts`、`context-source-support.ts`、`host-context.ts`、`extensions.ts`；披露：`context-disclosure/src/plugin.ts`、`policy.ts`；压缩：`context-compaction/src/plugin.ts`、`policy.ts`、`region.ts`、`summarizer.ts`、`prompts.ts`。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/context-engine test`，其他包同理。
- 引擎、提示词、压缩各有包 README（文件 → 内容）：[context-engine](context-engine/README.md)、[prompt](prompt/README.md)、[context-compaction](context-compaction/README.md)。

## 怎么扩展

新增一个上下文来源（例如“把某某状态告诉模型”）：新建 `context/context-<名>`，依赖 `@actspace/context-assembly`，manifest inject `context.assembly`，在 `apply` 里调 `publish(ctx, "<名>", 工厂, 角色?)`（同时就提供了 `context.source.<名>`），再在 `core/runtime/src/plugin-catalog.ts` 加一行（loaders 为 `harness`，排在 `context-assembly` 之后）。`agent-factory` 不用改。通用步骤见[总地图](../README.md)。
