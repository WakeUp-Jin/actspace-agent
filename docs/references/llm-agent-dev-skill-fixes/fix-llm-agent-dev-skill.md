# llm-agent-dev Skill 待修复问题

本文档记录 `.agents/skills/llm-agent-dev` Skill 在实际项目落地中发现的缺失和需要改进的点。Skill 是初始版本，需要根据实际使用不断精进。

## 问题列表

### 1. LLM 模块缺少 services 子目录设计

**位置**：`references/architecture.md` V0 目录结构 + `references/llm/llm-service.md`

**现状**：V0 目录结构将 BaseLLMService 和具体 provider 实现（如 OpenAIService）平铺在 `llm/` 下：

```
llm/
  types
  base            # BaseLLMService
  openai_service  # 具体实现
  factory
```

**问题**：

- 当 provider 数量增加（DeepSeek、Claude、Qwen、Gemini...）时，基类和具体实现混在同一层级，目录会变得混乱。
- `llm-service.md` 详细描述了三层架构（工厂 → 基类 → 具体服务类）但完全没有提到推荐的文件组织方式。
- 没有 V0 → V1 的目录演进建议。

**建议修复**：

在 `references/llm/llm-service.md` 或 `references/architecture.md` 中增加推荐目录结构：

```
llm/
  types.ts           # LLMConfig, StreamOptions, SimpleStreamOptions, APIMessage 等
  base.ts            # BaseLLMService 抽象基类
  factory.ts         # createLLMService() 工厂函数
  registry.ts        # ProviderRegistry（V1）
  services/          # 具体 provider 实现
    deepseek.ts      # DeepSeekService
    mock.ts          # MockProvider（开发测试）
    claude.ts        # ClaudeService（V2+）
```

**理由**：`services/` 子目录让基类和具体实现职责分离，新增 provider 只需在 `services/` 下加文件，不会污染基础设施层。

### 2. architecture.md V0 目录结构中只展示了 V0，没有 V1 演进后的目录结构

**位置**：`references/architecture.md` "二、V0 Demo 版" 目录结构

**现状**：只展示了 V0 目录结构，V1 升级清单详细描述了新增模块（ToolScheduler、OutputTruncator、ShortTermMemoryContext 等），但没有给出 V1 对应的目录结构。

**建议修复**：在"三、V1 基础版"中增加与 V0 对应的 V1 目录结构 diff。

### 3. 工具模块 definition + executor 分离理念与目录结构矛盾

**位置**：`references/tools/tool-definition.md` + `references/architecture.md` V0 目录结构

**现状**：`tool-definition.md` 明确提出 **definition + executor 分离模式**，并解释"这种分离使得工具定义可以独立管理、动态注册，executor 可以独立测试和替换"。但 `architecture.md` 的 V0 目录结构中，每个工具是一个**单文件**：

```
tool/
  tools/
    read_file     # ReadFile 工具定义 + executor（合在一个文件）
```

**问题**：

- 理念层面说 definition 和 executor 应该分离，但目录结构示例把它们放在同一个文件，自相矛盾。
- 没有给出工具文件夹内部的推荐结构——每个工具应该是一个文件夹还是一个文件？definition 和 executor 分别放哪里？
- `references/tools/file-tools.md` 等具体工具文档描述了工具的功能设计，但完全没有提到文件组织。
- 当工具数量增多时，每个工具一个文件会导致 definition 和 executor 逻辑混在一起，难以独立测试。

**建议修复**：

在 `references/tools/tool-definition.md` 或 `references/architecture.md` 中增加推荐的工具文件夹结构：

```
tool/
  types.ts                  # InternalTool, ToolResult, PermissionResult
  manager.ts                # ToolManager（注册/查询/执行）
  scheduler.ts              # ToolScheduler（V1 生命周期管理）
  output-truncator.ts       # OutputTruncator（V1 输出裁剪）
  tools/
    read-file/
      definition.ts         # name, description, parameters, isReadOnly, category
      executor.ts           # handler 函数实现
    search-files/
      definition.ts
      executor.ts
    list-directory/
      definition.ts
      executor.ts
    edit-file-diff/
      definition.ts
      executor.ts
```

**理由**：每个工具一个文件夹（definition + executor 各一个文件），与 Skill 自身提出的"分离模式"理念一致。definition 可以被 LLM tool list 消费而不加载 executor，executor 可以独立单元测试。

### 4. Context 模块参考文档缺少 modules/ 子目录结构说明

**位置**：`references/context/mgmt-context-architecture.md` + `references/context/type-system-prompt.md`

**现状**：`architecture.md` 的 V0 目录结构展示了 `context/modules/` 子目录：

```
context/
  types
  base
  manager
  modules/
    system_prompt
    conversation
```

但 context 模块的**核心参考文档**完全没有提到这个目录结构：
- `mgmt-context-architecture.md` 详细描述了 ContextModule 接口、SystemPart、编排流程，但没有说明各模块应该放在哪里。
- `type-system-prompt.md` 描述了 SystemPromptContext 的分段设计，但没有提到 modules/ 目录。
- 与 LLM 模块（问题 1）和工具模块（问题 3）的问题一致：详细参考文档缺少文件组织指引。

**问题**：

- 开发者读完 context 参考文档后，知道如何设计 ContextModule 接口，但不知道各模块文件应该放在哪里。
- `architecture.md` 有目录结构，但它离 context 参考文档太远——开发者需要在两份文档间跳转才能拼凑完整画面。
- 随着模块增多（SystemPromptContext、ConversationContext、ShortTermMemoryContext、LongTermMemoryContext），没有明确的 modules/ 目录约定会导致模块文件散落在 context/ 根目录下。

**建议修复**：

在 `references/context/mgmt-context-architecture.md` 的"模块接口约定"或"上下文组装流程"节增加推荐目录结构：

```
context/
  types.ts                    # SystemPart, ContextParts, ContextModule, CompressionConfig
  manager.ts                  # ContextManager 编排器
  token-estimator.ts          # Token 估算工具函数
  modules/                    # 各类上下文模块
    system-prompt.ts          # SystemPromptContext（分段式系统提示词）
    conversation.ts           # ConversationContext（V0 极简会话历史）
    short-term-memory.ts      # ShortTermMemoryContext（V1 带持久化的会话历史）
    long-term-memory.ts       # LongTermMemoryContext（V1 用户画像/偏好）
  index.ts                    # 统一导出
```

**理由**：`modules/` 子目录将编排器（manager）和被编排的模块分离。新增模块只需在 `modules/` 下加文件并实现 `ContextModule` 接口。与 `architecture.md` 的 V0 目录结构保持一致，但应在 context 参考文档中也明确提及。

### 5. llm-service.md 没有提到 mock provider 的设计要求

**位置**：`references/llm/llm-service.md`

**现状**：文档详细描述了 BaseLLMService、工厂模式、消息格式转换，但没有提到 mock provider 的设计要求——mock provider 在本地开发和测试中是必需的，需要能稳定产出 thinking、tool calls、final reply 等完整 turn 所需的事件序列。

**建议修复**：在 `llm-service.md` 中增加 mock provider 设计节，说明：
- mock provider 必须能产出完整 turn 所需的 AssistantMessage 序列
- 第一次调用应返回 toolUse（模拟工具调用），第二次调用应返回 stop（模拟最终回复）
- mock provider 是开发阶段验证执行循环的关键依赖
