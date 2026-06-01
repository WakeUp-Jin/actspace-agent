## 2026-05-23 21:42 | Task: 重建后端 Agent Runtime 模块化架构

### 🤖 Execution Context

- **Agent ID**: `e3ba2e97-1923-47e9-a3c2-76374da1df50`
- **Base Model**: `claude-opus-4-7-thinking`
- **Runtime**: `Cursor Agent`

### 📥 User Query

> 基于 backend-agent-design.md 设计文档，对照 llm-agent-dev Skill 重新审视并调整 6 个后端执行计划（A-F），然后逐一执行，将 agent-core 从单文件结构升级为模块化架构。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`

**Key Actions:**

- **[Plan A] 核心类型与契约**：创建 `messages.ts`（discriminated union Message/Content 类型体系）、`internal-tools.ts`（统一工具定义与注册表）、`adapters.ts`（内部类型到 shared 契约的双向转换）、`fixtures.ts`（测试用 mock 数据）
- **[Plan B] LLM 三层服务**：创建 `llm/` 模块——`types.ts` 配置与流类型、`base.ts` 抽象基类（stream-first）、`services/mock.ts` Mock 实现（含工具调用模拟）、`services/deepseek.ts` DeepSeek 骨架、`factory.ts` 工厂函数；迁移 `llm.ts` 为兼容层
- **[Plan C] 模块化工具系统**：创建 `tools/` 模块——`types.ts` 定义规范、`workspace-guard.ts` 路径边界守卫、`manager.ts` 工具管理器（注册/获取/执行/裁剪）、四个核心工具各自拆为 `definition.ts` + `executor.ts`；迁移 `tools.ts` 为兼容层
- **[Plan D] 上下文管道**：创建 `context/` 模块——`types.ts`（SystemPart/ContextModule/PromptSegment）、`token-estimator.ts` token 估算、`modules/system-prompt.ts` 分段系统提示词、`modules/conversation.ts` 会话历史管理、`manager.ts` 上下文编排器；迁移 `context.ts` 为兼容层
- **[Plan E] 执行引擎**：创建 `engine/` 模块——`types.ts`（AgentEvent discriminated union）、`loop.ts` 纯函数双层循环（内层工具调用+转向、外层跟进）、`agent.ts` Agent 入口类（run/abort）；迁移 `agent.ts` 为兼容层
- **[Plan F] 持久化与恢复**：创建 `persistence/` 模块——`types.ts` 路径与结果类型、`jsonl.ts` 健壮读写（坏行容错+结构化错误）、`meta.ts` 增量更新、`recovery.ts` 多维恢复（Messages/Blocks/Snapshot/DiffSummary）、`session-store.ts` 会话存储生命周期、`compat.ts` 兼容函数；迁移 `persistence.ts` 为兼容层
- **[Skill 修复] 同步记录**：创建 `fix-llm-agent-dev-skill.md` 记录 Skill 中缺少 `services/` 子目录设计、工具 `definition + executor` 目录结构矛盾、`context/modules/` 子目录说明缺失、Mock Provider 要求缺失等问题

### 🧠 Design Intent (Why)

agent-core 首版是 6 个平铺的单文件，随着后端设计文档确定了 stream-first LLM、模块化上下文管道、纯函数执行循环等架构方向，单文件结构无法承载。对照 llm-agent-dev Skill 的类型体系和模块化模式，将 agent-core 重构为 `llm/`、`tools/`、`context/`、`engine/`、`persistence/` 五大子模块，每个模块有独立的 types + 核心实现 + index 导出。原有单文件保留为兼容层，避免破坏 desktop 等现有消费方。所有模块均通过 V0 mock 实现验证核心链路，为后续 V1 真实 provider 接入和端到端测试铺路。

### 📁 Files Modified

- `packages/agent-core/src/messages.ts`
- `packages/agent-core/src/internal-tools.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/agent-core/src/fixtures.ts`
- `packages/agent-core/src/index.ts`
- `packages/agent-core/src/llm/types.ts`
- `packages/agent-core/src/llm/base.ts`
- `packages/agent-core/src/llm/services/mock.ts`
- `packages/agent-core/src/llm/services/deepseek.ts`
- `packages/agent-core/src/llm/factory.ts`
- `packages/agent-core/src/llm/index.ts`
- `packages/agent-core/src/llm.ts`（兼容层）
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/tools/read-file/{definition,executor}.ts`
- `packages/agent-core/src/tools/tools/search-files/{definition,executor}.ts`
- `packages/agent-core/src/tools/tools/list-directory/{definition,executor}.ts`
- `packages/agent-core/src/tools/tools/edit-file-diff/{definition,executor}.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools.ts`（兼容层）
- `packages/agent-core/src/context/types.ts`
- `packages/agent-core/src/context/token-estimator.ts`
- `packages/agent-core/src/context/modules/system-prompt.ts`
- `packages/agent-core/src/context/modules/conversation.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/context/index.ts`
- `packages/agent-core/src/context.ts`（兼容层）
- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/index.ts`
- `packages/agent-core/src/agent.ts`（兼容层）
- `packages/agent-core/src/persistence/types.ts`
- `packages/agent-core/src/persistence/jsonl.ts`
- `packages/agent-core/src/persistence/meta.ts`
- `packages/agent-core/src/persistence/recovery.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/compat.ts`
- `packages/agent-core/src/persistence/index.ts`
- `packages/agent-core/src/persistence.ts`（兼容层）
- `docs/design-docs/fix-llm-agent-dev-skill.md`
- `docs/exec-plans/active/actspace-backend-*.md`（6 个计划文档更新进度）
