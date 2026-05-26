# llm-agent-dev Skill 修复计划

本文件夹包含对 `llm-agent-dev` skill 的分析和改进方案，来源于 actspace-agent LLM 服务层重构过程中暴露的问题。

## 文档

| 文档 | 内容 |
|------|------|
| `01-skill-llm-module-fix.md` | Skill 现有 LLM 模块指导的 5 个缺陷分析和修复建议 |
| `02-pi-ai-core-design-extraction.md` | 从 pi-ai 源码中提取的 10 个核心设计思想，及对 skill 改进的具体建议 |
| `04-skill-rg-tools-fix.md` | Grep/Glob 工具中 ripgrep 共享执行流的 skill 修复建议 |
| `05-skill-file-tools-fix.md` | Edit/Write 工具、原子写入、diff 生成和权限预留的 skill 修复建议 |

## 问题根源

在 actspace-agent 的 LLM 重构中，旧代码出现了三个主要问题：
1. 手动 fetch + SSE 解析（329 行），没有使用 OpenAI SDK
2. `BaseLLMService` 抽象基类，增加不必要的间接层
3. `kimi-assistants/` 创建了不必要的文件夹

分析发现问题 1 和 2 **直接源自 skill 的指导内容**，skill 将 `BaseLLMService` + 手动 SSE 作为唯一推荐模式。

## 改进方向

1. **分层路径指引** — 按项目规模推荐不同模式，而非一刀切
2. **补充 OpenAI SDK 用法示例** — 对 OpenAI 兼容 provider 不需手动 SSE
3. **引入 pi-ai 的成熟设计** — 函数式 API、push-based EventStream、compat 配置等
4. **更新示例代码** — 提供完整的具体 provider 实现，而非只有抽象骨架

## Skill 源文件位置

`/Users/wakeup-jin/Desktop/code-project/side-project/agent-harness-dev`

需要修改的文件：
- `references/llm/llm-service.md`
- `references/architecture.md`
- `examples/llm-service.ts`
- 新增 `examples/llm-openai-sdk-service.ts`
- 新增 `examples/llm-functional-api.ts`
