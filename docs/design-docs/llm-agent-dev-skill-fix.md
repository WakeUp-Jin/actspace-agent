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

### 3. llm-service.md 没有提到 mock provider 的设计要求

**位置**：`references/llm/llm-service.md`

**现状**：文档详细描述了 BaseLLMService、工厂模式、消息格式转换，但没有提到 mock provider 的设计要求——mock provider 在本地开发和测试中是必需的，需要能稳定产出 thinking、tool calls、final reply 等完整 turn 所需的事件序列。

**建议修复**：在 `llm-service.md` 中增加 mock provider 设计节，说明：
- mock provider 必须能产出完整 turn 所需的 AssistantMessage 序列
- 第一次调用应返回 toolUse（模拟工具调用），第二次调用应返回 stop（模拟最终回复）
- mock provider 是开发阶段验证执行循环的关键依赖
