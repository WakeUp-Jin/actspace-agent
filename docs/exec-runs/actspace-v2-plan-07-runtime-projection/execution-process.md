# ActSpace v2 P07：Runtime Projection 与固定前端 DTO — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-07-runtime-projection.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 20:43
- **结束时间**：2026-08-22 20:52

## 执行时间线

### 步骤 1：固定 Shared Projection DTO

- **操作**：补齐 Session Snapshot、Tool View、Live Event、Artifact Ref 和 Diagnostics Snapshot 的 namespaced 类型与 package export。
- **决定**：renderer hint 只保存 allowlisted key/schema/JSON props；前端组件不进入 Agent Runtime。
- **验证**：Shared TypeScript 5.9.3 编译通过。

### 步骤 2：实现 Durable Session Projection

- **操作**：从 P04 Journal、codec fold 和 Surface 生成 canonical messages、tools、pending Inbox、lineage 与 access state。
- **决定**：projection cache 不是事实源；每次 cold Journal reload 都可重建同一 DTO。required codec 缺失时保持 browse-only，不伪装成可 resume。
- **验证**：消息、工具终态、outcome-unknown、脱敏参数和 reload parity 通过。

### 步骤 3：实现 Live Progress 与 Diagnostics

- **操作**：实现 runtimeInstanceId、单调 liveSeq、有限 ring buffer、snapshot/cursor handshake、overflow/runtime-change resync、late event drop，以及 deduplicated diagnostics collector。
- **决定**：Live Event 只表示非 durable delta；终态之后的进度事件和旧 Runtime/Agent run 事件直接丢弃并进入 diagnostics 回调。
- **验证**：cursor overflow、runtime change、late terminal event、诊断去重和 credential/path redaction 通过。

### 步骤 4：实现 Generic Tool DTO 与 renderer allowlist

- **操作**：把 ToolExecutionResult 映射为五态通用 DTO，unknown outcome 映射为 failed + `TOOL_OUTCOME_UNKNOWN`，补齐 artifacts、model output、detail、duration 和 renderer fallback。
- **决定**：专用 renderer 无法验证时只返回 null，通用 DTO 仍完整保留；artifact 缺失不会删除 tool/message projection。
- **验证**：allowlist 命中与未知 key fallback 通过；runtime projection 测试 5/5。

## 遇到的问题

- **问题**：P04 Journal 会拒绝 credential-like 字段，无法用真实 secret 写入 projection fixture。
  - **原因**：Session 安全边界要求 secret 在进入 Journal 前就失败关闭。
  - **应对**：fixture 使用 secret-shaped value 与普通字段验证 projection redaction，真实 secret rejection 继续由 P04 golden case 覆盖。
- **问题**：仓库当前完整 Vitest 依赖未安装。
  - **应对**：使用已存在的 `tmp/deepseek-harness/node_modules/.bin/vitest` 4.1.8 执行行为测试，并把标准安装门禁保留为环境风险，不修改 lockfile 猜测通过。

## 跳过或推迟的事项

- Electron IPC、CLI renderer 和 React 组件由 P13/P14 实现。
- 真实 artifact store、Renderer component registry 和跨进程 transport 由 P12-P15 接入。
- zstd/SQLite、v1 importer 和旧 Trace DTO 不属于 P07。
