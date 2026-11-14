# @actspace/prompt

提示段与模型事实的正文、规则与 Skill 的加载、来源包用的转换支持；提供 `prompt.runtime`。Prompt 只贡献内容，引擎负责组织和转换。行为规则见[上下文引擎规范](../../../docs/design-docs/上下文管理引擎设计/agent-context-engine.md)「来源」，脚本提示段见[脚本执行](../../../docs/design-docs/tool-system/agent-script-execution.md)，这里只说代码在哪。

公开入口：`.`、`./manifest`、`./plugin`、`./source-support`。

| 文件 | 内容 |
| --- | --- |
| `plugin.ts` | `prompt.runtime`（`SystemPromptService`）：按 Turn 缓存规则与 Skill 的加载结果，转交 Host 的 `selectSystem`；Host 端口 `actspace.host.prompt` 的类型 |
| `host-context.ts` | 读用户和工作区两处 `AGENTS.md`、发现 Skill（`prepareRuntimePromptSource`、`prepareUserPromptSource`） |
| `core-contributors.ts` | 内置提示段和模型事实的正文与取舍（Agent / Chat、是否带脚本说明）。改措辞只改这里 |
| `skills/contributor.ts` | Skill 目录和选中的 Skill 正文 |
| `context-source-support.ts` | `./source-support`：来源包用它把 contributor 转成 Context 内容（`contribute`、`promptSourceKey`、`runtimeInfo`、`SourceFactory`） |
| `extensions.ts` | `PromptExtensionRegistry`：Host 按会话或按 Agent scope 追加来源 |
| `contributor.ts` | contributor 的类型：层、种类、必需与可选 |
| `request-snapshot.ts` | `LogicalRequestCandidate`、`PreparedRequestMetadata`：Loop 拼请求、写请求记录时用的类型。`LogicalRequestSnapshot` 只有下一行的旧路径在用 |
| `assembler.ts`、`registry.ts`、`context-bridge.ts` | 旧的 `RequestAssembler` 路径：Loop 没配 Context 来源时的回退，只有测试在用；退役见[技术债表](../../../docs/exec-plans/tech-debt-tracker.md)「上下文引擎遗留」 |

测试：`pnpm --filter @actspace/prompt test`。
