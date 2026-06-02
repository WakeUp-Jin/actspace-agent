# 长文本 Prompt 适合做文件资产，不适合塞进 Settings

关联 history：`docs/histories/2026-06/20260602-1048-system-prompt-path-settings.md`

## 核心问题

系统提示词看起来像“设置项”，但它的行为更像一份可编辑的运行时资产：内容长、可能需要版本化、需要被多个链路读取，也可能从旧格式迁移而来。如果把完整正文长期存进 `settings.json`，Settings 契约会变得臃肿，renderer 也容易把“改路径”和“改正文”混成同一个 update 行为。

## 可迁移模式

把轻量配置和长文本资产拆开：

```txt
settings.json
  agent.systemPromptPath
        ↓
main IPC
  readAgentSystemPrompt / writeAgentSystemPrompt
        ↓
prompt file
  <userData>/prompts/main-agent.md
        ↓
runtime context loader
  real turn / context describe
```

这样 `settings.json` 只表达“去哪读”，prompt 文件表达“读什么”。renderer 仍然可以编辑正文，但只能通过 main 暴露的专用 IPC，不能直接碰本地文件系统。

## 为什么更稳

- **契约更轻**：`AgentSettings` 不再携带可能很长的 prompt 正文，Settings 更新只处理普通配置。
- **来源更清楚**：真实 turn、Context describe、设置页显示都读同一个 prompt 文件，避免“UI 保存的是 A，LLM 用的是 B”。
- **迁移更安全**：旧 `agent.systemPrompt` 可以在 main 侧一次性迁移到文件，写回后的 `settings.json` 移除旧字段。
- **扩展更自然**：以后支持打开 prompt 文件、版本管理、模板切换或用户自定义路径时，不必再重塑 Settings 正文契约。

## 常见陷阱

- **只改 shared 类型，不改 renderer mock**：测试里的 `AppSettings` fixture 还带旧字段时，typecheck 会暴露漂移。
- **保存正文时调用 `updateSettings`**：这会把长文本重新塞回 Settings 行为里，应该走专用 `writeAgentSystemPrompt`。
- **检查视图单独读默认值**：Context describe 必须复用真实 runtime loader，否则 prompt 文件改了，检查视图却仍显示代码默认 prompt。
- **迁移后不写回 settings**：旧字段如果持续留在 `settings.json`，后续 merge 逻辑会一直以为需要迁移。

## 自检问题

- Settings 契约里保存的是 prompt 路径，还是 prompt 正文？
- 设置页保存系统提示词时，调用的是 prompt 文件 IPC 还是 settings update IPC？
- 真实 turn 和 Context describe 是否读同一份 prompt 文件？
