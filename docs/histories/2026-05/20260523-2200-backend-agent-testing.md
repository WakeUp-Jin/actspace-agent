## 2026-05-23 22:00 | Task: 建立后端 Agent 集成测试体系

### 🤖 Execution Context

- **Agent ID**: `e3ba2e97-1923-47e9-a3c2-76374da1df50`
- **Base Model**: `claude-opus-4-7-thinking`
- **Runtime**: `Cursor Agent`

### 📥 User Query

> 完成后端 Agent 集成测试优先方向，使用 vitest 测试框架，测试文件放在各模块 test/ 子目录中，覆盖全部 5 个子模块 + 端到端 smoke。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`docs/`

**Key Actions:**

- **[测试设计文档]**：创建 `docs/design-docs/agent-core/backend-agent-testing.md`，定义测试策略、目录约定和覆盖范围
- **[vitest 基础设施]**：安装 vitest v3，创建 `vitest.config.ts`，配置 package.json scripts（test/test:watch），tsconfig exclude 排除测试文件
- **[端到端 smoke]**：`src/test/smoke.test.ts` — Agent.run 全链路验证（事件序列、最终回复、usage、tool events）
- **[引擎测试]**：`engine/test/loop.test.ts` — runAgentLoop 双层循环、shouldStopAfterTurn、abort；`engine/test/agent.test.ts` — Agent.run/runAndGetText/abort
- **[LLM 测试]**：`llm/test/mock-service.test.ts` — MockLLMService 流式事件和 stream→result 聚合；`llm/test/base-convert.test.ts` — convertMessages 各类消息转换
- **[工具测试]**：`tools/test/manager.test.ts` — ToolManager 注册/查询/执行/错误处理/裁剪/导出
- **[上下文测试]**：`context/test/system-prompt.test.ts` — SystemPromptContext 分段管理和 core 保护；`context/test/manager.test.ts` — ContextManager 编排、消息追加、压缩判定
- **[持久化测试]**：`persistence/test/jsonl.test.ts` — JSONL 读写和坏行容错；`persistence/test/meta.test.ts` — meta 增量更新；`persistence/test/recovery.test.ts` — 多维恢复
- **[类型测试]**：`src/test/messages.test.ts` — 消息工具函数；`src/test/internal-tools.test.ts` — 注册表；`src/test/adapters.test.ts` — 双向转换一致性

### 🧠 Design Intent (Why)

QUALITY_SCORE.md 测试评分为 C，明确建议"增加首条端到端 smoke path"。6 个模块独立存在但从未串联验证，需要用 mock provider 跑通完整链路确认模块间协作正确。测试目录采用"模块内 test/ 子目录"方案，源码与测试分离且就近，每个 test/ 控制 1-3 个文件避免膨胀。

### 📁 Files Modified

- `packages/agent-core/vitest.config.ts`（新建）
- `packages/agent-core/package.json`（添加 vitest + test scripts）
- `packages/agent-core/tsconfig.json`（添加 exclude）
- `package.json`（添加全局 test script）
- `packages/agent-core/src/test/smoke.test.ts`
- `packages/agent-core/src/test/messages.test.ts`
- `packages/agent-core/src/test/internal-tools.test.ts`
- `packages/agent-core/src/test/adapters.test.ts`
- `packages/agent-core/src/engine/test/loop.test.ts`
- `packages/agent-core/src/engine/test/agent.test.ts`
- `packages/agent-core/src/llm/test/mock-service.test.ts`
- `packages/agent-core/src/llm/test/base-convert.test.ts`
- `packages/agent-core/src/tools/test/manager.test.ts`
- `packages/agent-core/src/context/test/system-prompt.test.ts`
- `packages/agent-core/src/context/test/manager.test.ts`
- `packages/agent-core/src/persistence/test/jsonl.test.ts`
- `packages/agent-core/src/persistence/test/meta.test.ts`
- `packages/agent-core/src/persistence/test/recovery.test.ts`
- `docs/design-docs/agent-core/backend-agent-testing.md`
- `docs/design-docs/index.md`
- `docs/QUALITY_SCORE.md`
