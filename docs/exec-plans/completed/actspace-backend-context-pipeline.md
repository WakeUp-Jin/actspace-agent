# actspace 后端计划 D：Context Pipeline — ContextManager + Module 编排

## 目标

建立后端上下文管道，采用 Skill 推荐的 ContextManager + ContextModule 编排架构。ContextManager 直接持有 Context 对象，通过 Module 的 `format()` 接口收集 SystemPart，协调 system prompt 组装、会话历史管理、工具结果回填和 token 估算。

## 设计来源

- `docs/design-docs/agent-backend-design.md`
- `.agents/skills/llm-agent-dev/references/context/overview.md`（模块导航和阅读顺序）
- `.agents/skills/llm-agent-dev/references/context/mgmt-context-architecture.md`（核心：Context/Message 类型、SystemPart、ContextManager 编排流程）
- `.agents/skills/llm-agent-dev/references/context/type-system-prompt.md`（分段式系统提示词）
- `.agents/skills/llm-agent-dev/references/context/mgmt-compression.md`（压缩调度，V1）
- `.agents/skills/llm-agent-dev/references/context/mgmt-token-strategies.md`（Token 压缩执行策略，V1）
- `.agents/skills/llm-agent-dev/examples/context-manager.ts`（核心参考实现）
- `.agents/skills/llm-agent-dev/examples/system-prompt.ts`（系统提示词参考）
- `docs/design-docs/fix-llm-agent-dev-skill.md`（Skill 缺少 context modules 目录结构说明的补充）

## 目标目录结构

```
packages/agent-core/src/context/
  types.ts                    # SystemPart, ContextParts, ContextModule, CompressionConfig, PromptSegment
  manager.ts                  # ContextManager 编排器
  token-estimator.ts          # Token 估算 + ContextUsageSnapshot 生成
  modules/                    # 各类上下文模块
    system-prompt.ts          # SystemPromptContext（分段式系统提示词）
    conversation.ts           # ConversationContext（V0 极简会话历史）
  index.ts                    # 统一导出
```

Skill 的 `architecture.md` V0 目录结构展示了 `context/modules/` 子目录，但 context 参考文档（`mgmt-context-architecture.md`）未提及此结构。已记录到 `docs/design-docs/fix-llm-agent-dev-skill.md`。

## 相关路径

- `packages/agent-core/src/context.ts`（当前实现，将被拆分为上述目录结构）
- `packages/agent-core/src/messages.ts`（计划 A 产物：Message/Context/Content 类型）
- `packages/shared/src/session.ts`（ContextUsageSnapshot、ContextUsageBucket）

## 范围

**V0 骨架（首要目标）：**

- 实现 `SystemPart` 类：XML 标签包裹的系统级内容片段
  - `tag`、`description`、`content`、`render()`
- 定义 `ContextModule` 接口：`{ format(): ContextParts }`
  - `ContextParts = { systemParts: SystemPart[]; messages: Message[] }`
- 定义 `CompressionConfig`：contextWindow / compressionThreshold / compressKeepRatio
- 实现 `ContextManager` 编排器：
  - 持有 `Context` 对象
  - `appendMessage(message: Message)`：直接操作 context.messages
  - `getContext(): Context`：刷新 systemPrompt 后返回
  - `needsCompression(): boolean`：基于 token 估算判断
- 实现 `SystemPromptContext` 模块（modules/system-prompt.ts）：
  - 分段式（PromptSegment）：id/content/priority/enabled
  - 核心指令 segment（priority=100，不可移除）
  - register/update/remove/enable/disable segment
  - `format()` 返回 ContextParts
- 实现 `ConversationContext` 模块（modules/conversation.ts）：
  - 内存中持有 messages 数组；构造函数接受可选 `initialMessages`
  - `static async createFromSession(sessionPath)` 在构造阶段一次性完成 `parseJsonl + sessionEventsToMessages` 恢复历史，与 SystemPromptContext 的"构造时吃数据、运行期只读内存"机制对齐
  - `format()` 返回 ContextParts（messages 部分）
- 实现 Token Estimator：字符数 / 3.5 估算
- 生成 `ContextUsageSnapshot`（含 buckets）
- 迁移现有 `context.ts` 引用到新结构

**V1 增强（后续）：**

- ShortTermMemoryContext 接替 ConversationContext（会话历史恢复能力已在 V0+ 提前到 `createFromSession`，V1 升级只需引入 turn 标记 / 多日切片 / 压缩接入，构造入口签名不破坏）
- LongTermMemoryContext
- 压缩机制 + 执行策略
- segment 优先级裁剪

不包含：

- 不实现高级自动压缩
- 不实现长期记忆
- 不实现 RAG

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

## Context Buckets（前端 Context popup 消费）

首版 buckets：systemPrompt / tools / rules / skills / mcp / subagents / conversation

V0 只有 systemPrompt、tools、conversation 有实际 token 值，其余 bucket 预留为 0。

## 安全边界

- 工具原始输出（rawOutput）默认不回填
- 只回填裁剪后的 modelOutput
- 错误消息保留足够诊断信息，但避免噪音

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
- ContextUsageSnapshot 可驱动 Context popup 展示
- `needsCompression()` 在 token 超阈值时返回 true
- Token estimator 不要求精确，但应稳定

## 并行关系

- 依赖计划 A 的 Message/Content/Context/ContextUsageSnapshot 类型
- 可与 LLM Service、Tool Runtime、Persistence 并行
- Execution Engine 通过 `ContextManager.getContext()` 获取每次 LLM 调用的上下文

## 进度

- [x] 审查现有 `packages/agent-core/src/context.ts`
- [x] 创建 `context/` 目录结构（含 modules/ 子目录）
- [x] 实现 SystemPart 类 + ContextModule/ContextParts/CompressionConfig 类型（types.ts）
- [x] 实现 Token Estimator + ContextUsageSnapshot 生成（token-estimator.ts）
- [x] 实现 SystemPromptContext（modules/system-prompt.ts）
- [x] 实现 ConversationContext（modules/conversation.ts）
- [x] 实现 ContextManager（manager.ts）
- [x] 创建 index.ts 统一导出 + 迁移现有 context.ts 为兼容层
- [x] 通过类型检查（agent-core + 全项目）
- [ ] 更新架构文档和 history

## 决策记录

- 2026-05-23：上下文管道首版重点是可见、可裁剪、可统计，暂不做高级压缩和长期记忆。
- 2026-05-23：按 Skill `mgmt-context-architecture.md` 采用 ContextManager + ContextModule.format() 编排架构。
- 2026-05-23：context 模块采用 modules/ 子目录结构，与 Skill architecture.md V0 目录保持一致。Skill context 参考文档缺少此目录结构说明，已记录到 `docs/design-docs/fix-llm-agent-dev-skill.md`。
