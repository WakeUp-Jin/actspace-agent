# 后端 Agent 测试设计

## 当前状态

agent-core 后端模块化架构（llm/tools/context/engine/persistence）已就位，本文档定义其测试策略和目录约定。

## 测试策略

三层分级：

| 层级 | 目标 | 运行频率 |
| --- | --- | --- |
| 端到端 smoke | 用 mock LLM 跑通 Agent.run 全链路，确认各模块串联正确 | 每次代码变更 |
| 模块集成 | 验证 engine 执行循环、ContextManager 编排等模块级行为 | 每次代码变更 |
| 单元测试 | 验证消息工具函数、注册表、适配器转换、JSONL 读写等 | 每次代码变更 |

测试框架：vitest

## 目录约定

```
packages/agent-core/
  src/
    llm/test/             # LLM 服务层测试
    tools/test/           # 工具系统测试
    context/test/         # 上下文管道测试
    engine/test/          # 执行引擎测试
    persistence/test/     # 持久化层测试
    test/                 # 跨模块类型测试 + 端到端 smoke
```

规则：
- 每个模块目录内创建 `test/` 子目录，源码与测试分离
- 顶层 `src/test/` 放跨模块的公共类型测试和端到端 smoke
- 每个 `test/` 目录内文件控制在 1-3 个
- 测试文件以 `.test.ts` 结尾
- tsconfig 的 `exclude` 排除 `src/**/test`，确保不编译进 dist

## 覆盖范围

### 端到端 smoke

- `src/test/smoke.test.ts`：MockLLMService + ToolManager + ContextManager + Agent → 完整 turn → 事件序列 + 最终回复 + usage

### 执行引擎

- `engine/test/loop.test.ts`：双层循环、abort 中止、shouldStopAfterTurn
- `engine/test/agent.test.ts`：Agent.run / Agent.runAndGetText

### LLM 服务

- `llm/test/mock-service.test.ts`：流式事件产出、stream→result 聚合
- `llm/test/base-convert.test.ts`：convertMessages 转换
- `llm/test/kimi-service.test.ts`：Kimi OpenAI-compatible 流式调用、`$web_search` 请求参数和 auth 错误分类
- `llm/test/kimi-assistants.test.ts`：Kimi 辅助搜索函数按内置 `$web_search` tool call 协议回填 tool message

### 工具系统

- `tools/test/manager.test.ts`：注册/查询/执行/裁剪/未知工具错误
- `tools/test/exposure.test.ts`：`exposeOnlyTo` 工具暴露规则；DeepSeek + Kimi key 才注册 `web_search`、`web_fetch`、`analyze_media`

### 上下文管道

- `context/test/manager.test.ts`：编排、appendMessage、压缩判定、usageSnapshot
- `context/test/system-prompt.test.ts`：segment 注册/移除/优先级/core 保护

### 持久化

- `persistence/test/jsonl.test.ts`：appendEvent + parseJsonl 往返、坏行容错
- `persistence/test/meta.test.ts`：createMeta/readMeta/updateMeta/incrementTurnCount
- `persistence/test/recovery.test.ts`：recoverSession 多维恢复

### 类型与适配器

- `src/test/messages.test.ts`：getTextContent/getToolCalls/hasToolCalls/accumulateUsage
- `src/test/internal-tools.test.ts`：InternalToolRegistry/toToolDefinition
- `src/test/adapters.test.ts`：Message↔SessionEvent 双向转换一致性

## 运行命令

```bash
# 运行 agent-core 全部测试
pnpm --filter @actspace/agent-core test

# 监听模式
pnpm --filter @actspace/agent-core test:watch

# 全仓库测试
pnpm test
```
