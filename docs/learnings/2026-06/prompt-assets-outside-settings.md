# Prompt 是运行时资产：按“给谁用”分模块，长文本做文件资产而非 Settings

合并自：Prompt assets need module boundaries、长文本 Prompt 适合做文件资产不适合塞进 Settings。

关联：`docs/histories/2026-05/20260525-1046-centralize-agent-prompts.md`、`docs/histories/2026-06/20260602-1048-system-prompt-path-settings.md`

> 历史说明：第 1 节的目录名（`prompt/main-agent.ts`、`prompt/kimi-assistants/*`、`context/modules/*`）是 2026-05 的 v1 布局，`kimi-assistants` 已不存在；“按给谁用分层”的规则仍适用。第 2 节的 `agent.systemPromptPath` 与 `readAgentSystemPrompt/writeAgentSystemPrompt` 仍在（`packages/util/shared/src/settings.ts`、`desktop-bridge/contract.ts`）。

Prompt 不是随手的字符串字面量：一旦影响 Agent 行为、工具输出质量、provider 辅助调用，就要有像代码一样明确的模块边界，也要有像资产一样明确的存放位置。

## 1. 先问“这条 prompt 是给谁的”

- 主模型行为 → 主 Agent prompt（稳定的身份与行为）。
- 辅助模型行为 → 紧挨该能力组的 helper prompt（内部薄调用，如 Kimi 辅助）。
- 运行时事实（会话状态、工具定义、用户/会话级指令）→ context 模块或工具输入，不写进静态 prompt 文件，否则过时且难测。
- Provider 协议细节 → 留在 adapter/client。

硬编码 prompt 容易写、难运维：行为藏进无关文件、review 噪音大、稳定规则与动态状态混在一起。陷阱：把工具协议细节放进主系统提示词（主模型被迫知道不必要的实现细节）；把用户/会话事实写进静态文件；设计文档里保留旧 prompt 路径——在 agent-first 仓库里过期文档和过期代码一样有害，因为后来的 agent 会照着做。

## 2. 长文本做文件资产，Settings 只存路径

系统提示词看似设置项，行为却像可编辑的运行时资产：内容长、可能版本化、被多条链路读取、可能由旧格式迁移而来。完整正文长期存进 `settings.json` 会让 Settings 契约臃肿，也让 renderer 把“改路径”和“改正文”混成同一个 update。

```text
settings.json: agent.systemPromptPath
  → main IPC: readAgentSystemPrompt / writeAgentSystemPrompt
  → prompt file: <userData>/prompts/main-agent.md
  → runtime context loader: 真实 turn / context describe
```

`settings.json` 只表达“去哪读”，prompt 文件表达“读什么”；renderer 仍可编辑正文，但只能经 main 暴露的专用 IPC，不直接碰本地文件系统。收益：契约更轻；来源唯一（真实 turn、Context describe、设置页读同一份文件，避免“UI 保存 A、LLM 用 B”）；迁移更安全（旧 `agent.systemPrompt` 在 main 侧一次性迁移到文件，写回后的 `settings.json` 移除旧字段）；扩展自然（打开文件、版本管理、模板切换、自定义路径）。

陷阱：只改 shared 类型不改 renderer mock（fixture 带旧字段，typecheck 才暴露漂移）；保存正文时调用 `updateSettings`（应走专用 `writeAgentSystemPrompt`）；检查视图单独读默认值（Context describe 必须复用真实 runtime loader）；迁移后不写回 settings（旧字段留着，后续 merge 一直以为需要迁移）。

## 自检

1. 这条 prompt 是给主模型、辅助模型，还是应该作为运行时事实注入？
2. Settings 契约里存的是 prompt 路径还是正文？设置页保存走的是 prompt 文件 IPC 还是 settings update IPC？
3. 真实 turn 与 Context describe 读同一份 prompt 文件吗？
