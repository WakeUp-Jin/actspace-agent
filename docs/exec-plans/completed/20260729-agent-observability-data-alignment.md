# Agent 分析观测数据对齐与 HTML 原型执行计划

## 目标

将当前被前端、IPC 和持久化误称为 `turnId` 的 Agent Run 关联键统一改为 `agentRunId`，暴露并持久化后端真实 Turn 与 LLM Call 层级，建立本地安全 trace 文件，为分析观测页面提供可还原的请求、响应、工具、token、耗时和请求差异数据；完成后以单文件 HTML Mock 验证两栏分析观测 UI。

## 范围

- 包含：
  - 新增 `docs/design-docs/agent-runtime/agent-observability-trace-model.md` 作为数据契约事实来源。
  - `packages/shared` 的 ID、IPC、RuntimeStreamEvent、SessionEvent V2 契约。
  - `packages/agent-core` 的 Turn/LLM Call 生命周期事件、调用归属与 trace 写入能力。
  - `packages/desktop` Main/Preload/Renderer 对 `agentRunId` 的直接迁移。
  - Abort、Approval、Compaction、Eval、Usage、Session selector 与 SubAgent 关联字段的同步调整。
  - 安全的开发 Session 数据清理脚本与 package script。
  - 架构、存储、可靠性、历史记录同步。
  - 独立 HTML 分析观测原型和浏览器验证截图。
- 不包含：
  - 旧 SessionEvent 的兼容读取或自动格式迁移。
  - 自动删除 Electron `userData`。
  - 在本轮接入设置页入口或生产 React 页面。
  - 真实 provider 付费调用。
  - 将 API Key、Authorization Header、图片 Base64 或签名 URL 写入 trace。

## 背景

- 相关文档：
  - `docs/design-docs/agent-runtime/agent-observability-trace-model.md`
  - `docs/design-docs/agent-runtime/agent-turn-layers.md`
  - `docs/design-docs/core-storage-and-observability.md`
  - `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
- 相关代码路径：
  - `packages/shared/src/session.ts`
  - `packages/shared/src/ipc.ts`
  - `packages/shared/src/session-selectors.ts`
  - `packages/agent-core/src/engine/{types,loop,agent,bridge}.ts`
  - `packages/agent-core/src/observability/`
  - `packages/desktop/src/main/agent-run.ts`
  - `packages/desktop/src/main/approval-registry.ts`
  - `packages/desktop/src/renderer/App.tsx`
- 已知约束：
  - 当前工作树处于 detached HEAD；本轮不创建分支、不提交。
  - 当前开发 Session 数据可丢弃，因此 V2 不维护旧 Schema。
  - renderer 不直接读文件；trace 查询必须经 Main/Preload IPC。
  - `session.jsonl` 仍是会话恢复事实源，trace 不得取代消息恢复。
  - 完整上下文可能包含敏感本地内容，只允许本地保存与受控读取。

## 风险

- 风险：`turnId` 当前横跨聊天渲染、Abort、Approval、Usage、Eval、Kairos 和测试，机械替换容易造成错误关联。
  - 缓解方式：先修改 shared 类型建立编译失败清单，再按 Agent Core → Main/Preload → Renderer → selectors/tests 顺序收敛；每个切片运行对应包 typecheck/test。
- 风险：完整请求快照让 Session 文件体积快速膨胀。
  - 缓解方式：完整快照只写独立 `traces/<agentRunId>.jsonl`，SessionEvent 只保存 ID、usage 和稳定消息事实。
- 风险：trace 泄露鉴权或不可长期保存的媒体内容。
  - 缓解方式：trace writer 只接收 Context 与结构化响应，不接收 header；写入前递归裁剪 data URL、Authorization/Cookie/API Key 形态字段和上游原始错误体，并为脱敏写单元测试。
- 风险：旧 Session 使新读取器失败。
  - 缓解方式：提供 dry-run 默认、显式 `--confirm` 的清理脚本；应用不自动删除数据。
- 风险：HTML 原型与最终 React 能力不一致。
  - 缓解方式：原型只验证信息架构和交互，不声称已接真实数据；Mock 字段直接采用 V2 Schema。

## 里程碑

### 1. 契约与计划

- 新增分析观测数据模型设计文档。
- 新增本 execution plan，并检查全文不存在未决占位语。
- 验证：`pnpm check:docs`。

### 2. Shared V2 契约

- 新增 `AgentRunId`、`LlmCallId`。
- 将 IPC 和 `RuntimeStreamEvent` 的粗粒度 `turnId` 改为 `agentRunId`。
- 将 SessionEvent 升级为强制 `schemaVersion: 2 + agentRunId`，增加可选真实 `turnId/llmCallId`。
- 重命名 Agent Run 生命周期流事件，新增 Turn/LLM Call 流事件。
- 验证：shared build、shared typecheck、shared tests。

### 3. Agent Engine 与 Trace

- `runAgentLoop` 为每个真实 Turn 生成 `turnId`，为每次 provider 请求生成 `llmCallId + attempt`。
- 在调用 `llm.stream()` 前捕获安全请求快照，在响应完成后发出调用完成事件。
- `LLMUsageCall` 保存 `turnId/turnIndex/llmCallId/attempt/durationMs`。
- 新增 append-only trace writer，写入 Agent Run、Turn、LLM request/response/retry 事件。
- Bridge 将 Agent 事件映射到新 RuntimeStreamEvent，并使 SessionEvent 带正确关联字段。
- 验证：engine/bridge/observability 定向测试、agent-core typecheck。

### 4. Desktop 直接迁移

- `RunAgentInput`、Main active run map、ApprovalRegistry、Abort IPC 和 Renderer streaming state 使用 `agentRunId`。
- `SessionEvent` selectors 按 `agentRunId` 聚合聊天块和总 usage，按 `turnId/llmCallId` 保留分析归属。
- 同步 Compaction、Eval、SubAgent、Kairos 等共享契约消费者；非主 Agent Loop 路径可只填写 `agentRunId`。
- 验证：desktop 定向测试、desktop typecheck、renderer 流式交接测试。

### 5. 清理脚本

- 新增 `scripts/reset-session-data.mjs` 与 `pnpm reset:session-data`。
- dry-run 输出精确目标；只有绝对 data root + `--confirm` 才删除 allowlist 目录。
- 使用临时目录测试预览、确认删除和拒绝宽泛路径。
- 验证：Node 脚本测试或可重复临时目录 smoke test。

### 6. 文档、History 与完整验证

- 更新 `agent-turn-layers.md`、`core-storage-and-observability.md`、`RELIABILITY.md` 和 `ARCHITECTURE.md` 导航。
- 按 `docs/HISTORY_GUIDE.md` 记录破坏性数据契约升级和清理方法。
- 运行 shared build 后串行运行 agent-core/desktop 检查。
- 验证命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/shared typecheck`
  - `pnpm --filter @actspace/shared test`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm build`
  - `pnpm check:docs`
  - `pnpm check:secrets`

### 7. HTML 分析观测原型

- 产物：单文件 HTML，Mock 两次用户输入、多个 Turn、正常调用与重试调用。
- 左栏：搜索、Tools 筛选、用户输入折叠、Turn 列表。
- 右栏：Turn 内 LLM Call 切换、工具定义、系统提示词、消息、响应、完整 JSON。
- 顶部：汇总统计、对比上次、请求 JSON、cURL。
- 明确不展示独立“工具执行”折叠区。
- 使用 ActSpace 语义 token 模拟 Ink & Emerald 浅/深主题，不使用非主题感知颜色捷径。
- 验证：浏览器打开、控制台零错误、1440x900 与窄屏截图、核心点击交互。

## 验证方式

- 命令：见里程碑 1-7 的逐项命令，最终至少完成 typecheck、build、定向 tests、docs 和 secrets 检查。
- 手工检查：不启动真实付费 Agent；HTML 原型通过浏览器验证。数据迁移涉及 Electron IPC 和持久化，若本环境无法完成真实 Electron 窗口验收，最终明确列为用户手动验收项。
- 观测检查：使用 MockLLM 运行工具链和可重试错误，检查一个 `agentRunId` 下的 Turn、LLM Call、usage 与 trace 顺序可完整还原。

## 进度记录

- [x] 2026-07-29：确认旧 `turnId` 实际代表 Agent Run，旧 Session 数据允许直接废弃。
- [x] 2026-07-29：完成 V2 数据模型设计文档与 execution plan 初稿。
- [x] 2026-07-29：完成 Shared V2 契约。
- [x] 2026-07-29：完成 Agent Engine Turn/LLM Call 生命周期与安全 Trace。
- [x] 2026-07-29：完成 Desktop 直接迁移与 Trace 查询 IPC。
- [x] 2026-07-29：完成 dry-run 默认的安全清理脚本。
- [x] 2026-07-29：完成架构文档、History、学习文档和仓库门禁验证。
- [x] 2026-07-29：完成 HTML 原型与 1440×900、900×900 浏览器验证。

### 最终验证记录

- `pnpm --filter @actspace/shared build/typecheck/test`：通过，64 tests。
- agent-core typecheck/build 通过；本次 engine/bridge/Trace 定向测试 53 tests 通过。
- agent-core 完整测试中，本次相关用例通过；Browser Unix socket 用例在沙箱外单独运行 13 tests 通过；`tools/test/manager.test.ts` 仍有一个与本次改动无关的既有错误文案断言差异。
- `pnpm --filter @actspace/desktop typecheck/test`：通过，534 tests。
- `pnpm build`：通过；renderer 仅保留既有大 chunk warning。
- `pnpm check:docs`、`pnpm check:secrets`、`pnpm check:frontend-theme`、`git diff --check`：通过。
- HTML：搜索、Tools 筛选、用户输入折叠、Turn/LLM Call 切换、请求差异弹窗与浅深主题通过；控制台零错误。

## 决策记录

- 2026-07-29：不兼容旧 SessionEvent，不提供无法恢复真实 Turn/Call 的伪格式迁移；改为提供显式清理脚本。
- 2026-07-29：原前端 `turnId` 正式改名 `agentRunId`；`turnId` 只表示后端 `turn_start/turn_end`。
- 2026-07-29：完整请求与响应写独立 Session trace，不重复写入 `session.jsonl`。
- 2026-07-29：HTML 原型在数据契约稳定后制作，Mock 数据直接使用 V2 层级。
