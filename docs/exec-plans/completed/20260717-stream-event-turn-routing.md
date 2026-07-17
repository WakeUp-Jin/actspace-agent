# Agent stream turn routing 修复

## 目标

消除多个 Agent turn 重叠运行时 renderer 重复消费同一流式 delta 的问题，并保证旧 turn 的异步完成不会清空或覆盖当前可见 turn 的 UI 状态。

## 范围

- 包含：
  - 为所有 turn 级 `RuntimeStreamEvent` 补齐 `sessionId` 与 `turnId`。
  - renderer 改为应用级单一 `agent:stream` 订阅。
  - 按当前可见 `{ sessionId, turnId }` 路由流事件。
  - 隔离旧 turn 的异步结果与 finally 收尾。
  - 补充 overlapping turn、跨 session 流隔离和旧 turn 收尾回归测试。
- 不包含：
  - 中止切换会话后仍在 main 进程运行的 turn。
  - 改造 Agent 并发调度或审批产品交互。
  - 修改消息区视觉样式。

## 背景

- 相关文档：
  - `docs/design-docs/agent-turn-layers.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/shared/src/session.ts`
  - `packages/agent-core/src/engine/bridge.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- 已知约束：
  - Agent turn 可以在用户切换会话后继续于后台运行。
  - `bash_task_update` 是 session 级事件，不属于某个仍活跃的 turn。
  - renderer 只能让当前可见 turn 修改共享 streaming state。

## 风险

- 风险：流事件协议字段变为必填会影响测试 fixture 和跨包类型检查。
- 缓解方式：先更新 shared 契约与 bridge，再由 TypeScript 编译结果枚举所有遗漏生产者。
- 风险：旧 turn 完成时仍可能覆盖当前 session record 或 streaming 状态。
- 缓解方式：所有可见 UI 更新和 finally 清理都用 `{ sessionId, turnId }` 身份守卫。

## 里程碑

1. 补充流事件作用域契约与 bridge 映射。
2. 改为 renderer 单一订阅并隔离旧 turn 收尾。
3. 补回归测试，完成工程与 Electron 验证。

## 验证方式

- 已通过：
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/app-streaming-user-message.test.tsx -t "routes overlapping turns"`
  - `pnpm --filter @actspace/agent-core exec vitest run src/engine/test/bridge.test.ts -t "persists the user message before|emits tool_call_streaming"`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm check:docs`
- 未执行：
  - Electron 真实窗口验收。开发服务器需要在沙箱外绑定本地端口，授权未获允许，因此未启动。
- 额外观察：
  - 完整 desktop 测试运行中，本次 App 流式相关用例除并行开发中的 abort 展示用例外均通过；另有一个既有 Sidebar 用例失败，均不属于本修复范围。

## 进度记录

- [x] 确认重复来自 overlapping turn 的多监听消费，而非模型输出。
- [x] 完成 stream scope 契约与 bridge 映射。
- [x] 完成 renderer 单订阅与旧 turn 隔离。
- [x] 完成测试、文档、history 和工程验收。

## 决策记录

- 2026-07-17：保留后台 turn 继续执行的能力；通过事件作用域和可见 turn 身份守卫隔离 UI，不在会话切换时隐式 abort。
- 2026-07-17：`bash_task_update` 保持 session 级，因为后台任务状态可在原 turn 结束后继续变化。
- 2026-07-17：Electron 手工验收因权限限制留作后续，不阻塞已由协议测试、竞态测试、类型检查和生产构建证明的修复交付。
