## 2026-10-18 | Task: 修复子委派被任务查询误恢复

### Execution Context

- Agent：Codex 主智能体开发；gpt-6.1-sol Computer Use 复现及复验。
- Runtime：Codex desktop，沿用当前分支，未提交。

### User Query

> 遗留的子工具失败为什么不修复？继续修复。

### Changes Overview

- 捕获 DURABILITY_BLOCKED 的底层 INVALID_EVENT，证明运行中的子任务被第二 Ledger 写入 recover。
- AgentService 支持登记 Provider 持有的 Ledger；snapshot 读取已确认状态，禁止另建调度器。
- Subagent lease 明确登记/解除观察所有权，增加服务与真实 Harness 回归测试。

### Design Intent

读取不应夺取恢复权。保留单写者状态机，不吞掉真实持久化错误，也不放宽 finish 校验。

### Files Modified

- `packages/agent-service/src/service.ts`
- `packages/runtime/src/harness/agent-runtime-plugin.ts`
- `packages/agent-service/src/test/lifecycle.test.ts`
- `packages/runtime/src/harness/default-harness.test.ts`

[执行及验收](../../exec-runs/20261018-subagent-durability/execution-summary.md)。
