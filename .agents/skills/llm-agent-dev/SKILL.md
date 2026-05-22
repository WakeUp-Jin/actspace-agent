---
name: llm-agent-dev
description: 指导开发基于大模型的 Agent 后端应用。当用户需要设计 Agent 架构、实现工具系统（Bash/Grep/Glob/文件操作）、构建上下文管理管道、开发 LLM 服务层、实现 Agent 执行循环、设计上下文压缩策略、开发结构化输出、集成 Skill/MCP 系统、或实现定时任务与自主 Agent 时使用此 Skill。即使用户只是提到"写一个 Agent"、"LLM 应用"、"工具调度"、"上下文管理"等关键词，也应主动触发。
---

# LLM Agent 应用开发规范

基于上下文工程（Context Engineering）的 Agent 后端架构设计。核心理念：上下文工程是设计原则，Agent Harness 是构建目标。

## 开始之前

在开始构建之前，确认两件事：

1. **编程语言**：本 Skill 的示例代码默认使用 TypeScript，支持 Python / TypeScript / Rust / Go 等，根据所选语言调整实现风格
2. **构建版本**：**V0 Demo 版**（完整骨架，快速理解 Agent 运行原理）还是 **V1 基础版**（生产可用，含调度/压缩/权限）

详见 `references/architecture.md`——该文档是从零构建 Agent 的第一站，定义了两个版本的完整目录结构和模块边界。

## 架构四大支柱

Agent 后端的核心由四个相互协作的模块构成：

1. **上下文管理** — 编排注入给 LLM 的完整输入（系统提示词、短期记忆、长期记忆、相关文档、结构化输出约束）
2. **工具系统** — 定义工具能力、管理调度流程、控制权限审批、裁剪输出结果
3. **LLM 模块** — 多模型接入的服务层，通过工厂模式创建具体实例，提供统一的 complete/chat 接口
4. **Agent 运行空间** — Agent 的执行形态（单体/多体/协同）与运行环境（定时任务/主动触发/KAIROS 模式）

这四个模块通过执行引擎（Engine）串联：LLM 输出 → 解析 tool_calls → 工具调度执行 → 结果回填上下文 → 循环直到完成。

## 模块导航

根据你当前的开发需求，阅读对应的 reference 文件：

| 你在做什么 | 去读 |
|------------|------|
| 从零构建 Agent、理解整体架构、选择版本（V0/V1） | `references/architecture.md` |
| 设计上下文管道、压缩策略、记忆模块、结构化输出 | `references/context/overview.md` |
| 开发工具（Bash/Grep/文件操作）、工具调度、权限审批 | `references/tools/overview.md` |
| 接入多个 LLM、设计服务层和工厂模式 | `references/llm/llm-service.md` |
| 设计 Agent 形态、执行循环、定时任务 | `references/agent-runtime/agent-patterns.md` |
| 搭建评估体系、多类型 Agent 评估策略、评估器实现 | `references/agent-evaluation/overview.md` |
| RAG、Skill 集成等基础设施 | `references/foundations/overview.md` |
| 工程实践经验与常见陷阱 | `references/practices/` |

所有代码示例位于 `examples/` 目录，文档中通过路径引用。

## 注意事项

这些是基于实际开发中反复出现的失败模式总结的：

- **上下文污染**：工具错误信息不精确导致 LLM 在错误方向上反复重试。设计工具时确保错误输出能准确反映真正原因
- **上下文膨胀**：工具输出未裁剪直接回填，导致上下文窗口被低价值信息占满。必须有 OutputTruncator 机制
- **压缩时机误判**：过早压缩丢失关键决策信息，过晚压缩导致窗口溢出。压缩应在 token 使用率达到阈值时触发，而非固定轮次
- **工具描述模糊**：description 写得太笼统，LLM 无法判断何时使用该工具。工具描述需包含 Instructions 指明使用场景和限制
- **记忆模块的"过时问题"**：用户记忆整理时的误解会持续污染后续交互，记忆需要有更新和精简机制
