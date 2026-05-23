# actspace 后端计划 D：Context Pipeline — ContextManager + Module 编排

## 目标

建立后端上下文管道，采用 Skill 推荐的 ContextManager + ContextModule 编排架构。ContextManager 直接持有 Context 对象，通过 Module 的 `format()` 接口收集 SystemPart，协调 system prompt 组装、会话历史管理、工具结果回填和 token 估算。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `.agents/skills/llm-agent-dev/references/context/overview.md`（模块导航和阅读顺序）
- `.agents/skills/llm-agent-dev/references/context/mgmt-context-architecture.md`（核心：Context/Message 类型、SystemPart、ContextManager 编排流程）
- `.agents/skills/llm-agent-dev/references/context/type-system-prompt.md`（分段式系统提示词）
- `.agents/skills/llm-agent-dev/references/context/mgmt-compression.md`（压缩调度，V1）
- `.agents/skills/llm-agent-dev/references/context/mgmt-token-strategies.md`（Token 压缩执行策略，V1）
- `.agents/skills/llm-agent-dev/examples/context-manager.ts`（核心参考实现）
- `.agents/skills/llm-agent-dev/examples/system-prompt.ts`（系统提示词参考）
- `docs/design-docs/frontend-ui/聊天输入框规范.md`

## 相关路径

- `packages/agent-core/src/context.ts`（当前实现，需要按 Skill 重构）
- `packages/agent-core/src/types.ts`（依赖计划 A 的 Message/Context 类型）
- `packages/shared/src/session.ts`

## 范围

**V0 骨架（首要目标）：**

- 实现 `ContextManager` 编排器：
  - 直接持有 `Context` 对象（`{ systemPrompt?, messages, tools? }`）
  - `appendMessage(message: Message)`：直接操作 context.messages，自动为工具相关消息设置默认优先级
  - `getContext(): Context`：刷新 systemPrompt 后返回持有的 context 引用
  - `needsCompression(): boolean`：基于 token 估算判断是否需要压缩（预留入口，V0 不实现压缩逻辑）
- 实现 `SystemPart` 类：XML 标签包裹的系统级内容片段
  - `tag`：XML 标签名（如 system_prompt、user_instructions）
  - `description`：标签描述属性
  - `content`：实际内容文本
  - `render()`：渲染为 `<tag description="...">内容</tag>` 格式
- 定义 `ContextModule` 接口：`{ format(): ContextParts }`
  - `ContextParts = { systemParts: SystemPart[]; messages: Message[] }`
- 实现 `SystemPromptContext` 模块：
  - 分段式系统提示词（核心身份 + 行为约束 + workspace 上下文等段）
  - 每段是一个 SystemPart，通过 `format()` 返回
- 实现 V0 极简 `ConversationContext`：
  - 直接管理 messages 数组
  - 无持久化、无 turn 标记（留给 V1 ShortTermMemoryContext）
- 实现 Token Estimator：
  - V0 用字符数 / 3.5 估算（简单但稳定）
  - 不要求精确，但应稳定、可解释
- 生成 `ContextUsageSnapshot`：totalTokens/maxTokens/percentUsed/compressionCount/cumulativeTokens/buckets

**V1 增强（后续）：**

- `ShortTermMemoryContext` 替换 V0 ConversationContext：
  - 持久化支持（对接 Persistence 计划）
  - Turn 标记区分对话轮次
  - 压缩集成
- `LongTermMemoryContext`：用户画像/偏好，注入到 systemPrompt
- `CompressionConfig`：contextWindow / compressionThreshold / compressKeepRatio
- `compress()` 方法：使用 low tier 模型做压缩
- 压缩执行策略（来自 Skill `mgmt-token-strategies.md`）：
  - 三种移除策略（中间/最旧/混合）
  - 消息优先级系统
- 系统提示词 segment 优先级裁剪

不包含：

- 不实现高级自动压缩
- 不实现长期记忆
- 不实现 RAG
- 不实现 Skill/MCP 完整 runtime

## 上下文数据流（来自 Skill）

```
模块.format() -> ContextParts(systemParts, messages)
                        |                    |
                        v                    v
              渲染为 Context.systemPrompt   合并为 Context.messages
                        |                    |
                        +------组装为--------+
                                  |
                                  v
                    Context { systemPrompt, messages, tools } -> LLM.streamSimple()
```

### ContextManager 编排流程

1. 调用各模块的 `format()` 收集 systemParts
2. 所有 systemParts 通过 `render()` 渲染为 XML 标签文本，拼接为 `context.systemPrompt`
3. 返回 context（messages 已在 `appendMessage` 时直接写入）
4. 调用方在 Context 上附加 tools 后传入 LLM Service

### 工具结果回填规则

- 工具原始输出（rawOutput）默认不回填
- 只回填裁剪后的 `modelOutput`
- 回填时构造 `ToolResultMessage`，通过 `appendMessage()` 追加
- 错误消息保留足够诊断信息，但避免噪音

## Context Buckets（前端 Context popup 消费）

首版 buckets：

- `systemPrompt`
- `tools`
- `rules`
- `skills`
- `mcp`
- `subagents`
- `conversation`

V0 只有 systemPrompt、tools、conversation 有实际 token 值，其余 bucket 预留为 0。

## V0 → V1 触发信号（来自 Skill architecture.md）

- **需要会话持久化**（进程重启不丢失）→ ShortTermMemoryContext
- **需要 turn 标记区分对话轮次** → ShortTermMemoryContext
- **长对话 token 接近窗口上限** → 压缩机制
- **需要用户画像/偏好** → LongTermMemoryContext

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- 空会话可以生成有效 Context（systemPrompt 存在，messages 为空）
- `appendMessage()` 后 `getContext()` 返回的 Context 包含该消息
- SystemPromptContext 的 format() 返回多段 SystemPart，render 后为 XML 格式
- 包含工具定义时 `tools` bucket 非空
- 包含会话历史时 `conversation` bucket 非空
- 工具大输出只把 `modelOutput` 回填上下文（通过 ToolResultMessage）
- ContextUsageSnapshot 可驱动 Context popup 展示
- `needsCompression()` 在 token 超阈值时返回 true
- Token estimator 不要求精确，但应稳定

## 并行关系

- 依赖计划 A 的 Message/Content/Context/ContextUsageSnapshot 类型
- 可与 LLM Service、Tool Runtime、Persistence 并行
- Execution Engine 通过 `ContextManager.getContext()` 获取每次 LLM 调用的上下文
- LLM Service 的 `convertMessages()` 消费 Context.messages

## 进度

- [ ] 审查现有 `packages/agent-core/src/context.ts`
- [ ] 实现 SystemPart 类
- [ ] 定义 ContextModule 接口和 ContextParts 类型
- [ ] 实现 ContextManager（appendMessage / getContext / needsCompression）
- [ ] 实现 SystemPromptContext 模块
- [ ] 实现 V0 ConversationContext（极简）
- [ ] 实现 Token Estimator
- [ ] 生成 ContextUsageSnapshot（含 buckets）
- [ ] 通过类型检查
- [ ] 更新架构文档和 history

## 决策记录

- 2026-05-23：上下文管道首版重点是可见、可裁剪、可统计，暂不做高级压缩和长期记忆。
- 2026-05-23：按 Skill `mgmt-context-architecture.md` 采用 ContextManager + ContextModule.format() 编排架构。ContextManager 直接持有 Context 引用，appendMessage 操作 messages，getContext 刷新 systemPrompt。SystemPart 用 XML 标签渲染。V0 先做 SystemPromptContext + 极简 ConversationContext，V1 升级为 ShortTermMemoryContext + 压缩。
