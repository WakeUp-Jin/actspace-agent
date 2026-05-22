# 上下文管理模块

上下文管理是 Agent 架构的核心编排层。它的职责不是"获取信息"，而是"整理信息"——在有限的上下文窗口中，组织最相关的内容输入给 LLM。

更长的上下文并不等于更好的响应。过度加载会导致污染、干扰、混淆和冲突四类失控问题。

## 文件命名约定

本目录使用前缀区分两个维度：

- **`type-`** 前缀：上下文类型文件 — 描述某种上下文是什么、它的构成、以及该类型特有的实现/存储
- **`mgmt-`** 前缀：上下文管理文件 — 描述跨类型的全局管理策略（压缩、修剪、隔离等）

## 上下文类型（type-）

| 文件 | 关注点 |
|------|--------|
| `type-system-prompt.md` | 系统提示词上下文：分段架构（PromptSegment）、动态注册、启用/禁用、优先级裁剪 |
| `type-session-history.md` | 会话历史记录上下文：类型定义、与短期记忆的区别、存储设计（Redis 缓存/WAL/多后端/降级） |
| `type-structured-output.md` | 结构化输出上下文：约束 LLM 输出格式的三种方法及成本考量 |

## 上下文管理（mgmt-）

| 文件 | 关注点 |
|------|--------|
| `mgmt-context-architecture.md` | 上下文系统架构：类型层次（Context/Message/Content 判别联合）、SystemPart、模块编排流程 |
| `mgmt-strategies.md` | 上下文失控的四种模式及管理策略（RAG 筛选/隔离/修剪/总结） |
| `mgmt-compression.md` | 压缩调度（何时压缩、压缩什么）与压缩指令（ClaudeCode 8 节算法/Gemini 5 点 scratchpad/工具消息裁剪） |
| `mgmt-token-strategies.md` | Token 压缩的具体执行策略：三种移除策略（中间/最旧/混合）、消息优先级系统、策略选择机制 |

## 阅读顺序

如果是从零设计上下文管道：先读 `mgmt-context-architecture.md` 了解整体架构和数据结构设计，再读 `type-system-prompt.md` 了解系统提示词的分段设计，然后读 `mgmt-strategies.md` 了解管理策略，最后读 `mgmt-compression.md` + `mgmt-token-strategies.md` 处理窗口溢出。

如果需要约束 LLM 输出格式：直接读 `type-structured-output.md`。

如果需要设计会话持久化和多后端存储架构：读 `type-session-history.md`。

参考代码: `examples/context-manager.ts`、`examples/system-prompt.ts`、`examples/context-compressor.ts`、`examples/session-storage.ts`
