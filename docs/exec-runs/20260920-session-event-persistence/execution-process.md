# Session 事件持久化与检查点重构执行过程

## 2026-09-20

- 用户批准执行设计与计划，并要求实现、测试、文档更新和提交。
- 复核当前工作树：官网、部署、锁文件及其 history/learnings 存在既有修改；本任务保留这些修改，只操作和提交 Session 重构相关路径。
- 复核源码基线：`SessionHandle` 同时拥有 Journal、write-behind 与 driver；`session/event` 在 backend append 后发布；`session/flush` 在实际 flush 后才通知；检查点由 Loop 直接调用。
- 提取 `SessionPersistenceCoordinator`：write-behind、durable cursor 和 backend close 从 `SessionHandle` 移出；Store 为 create/open/fork 建立唯一 coordinator。
- 将 `session/event` 改为 accepted/queued 后通知，observer failure 单独上报；`flush` 成为 durable prefix barrier，后台失败立即反映为 blocked。
- 新增 `@actspace/session-checkpoint-policy`，生产 `cordis.yml` 在 `session-runtime` 之后加载；Loop 在 LLM、工具、下一步和 turn settlement 边界发布必需事件。
- 补齐 `session/created`、`session/disposed` 和 `llm/chunk` 通知；`llm/stream` 保持请求 waterfall。
- 测试发现手工调用 Cordis callback 时丢失 payload：`events.dispatch()` 会消费同一个参数数组中的 carrier/name，修正为使用 dispatch 后的原数组调用 callback。
- 实施复核决定保留现有 `@actspace/session-persistence` 公开导入；物理 `session-core` 包迁移涉及 42 个 consumer，继续由 P1-A 独立处理。
- 更新 contract matrix 为 13/10/6，新增 checkpoint plugin lifecycle contract、执行摘要、history 和学习记录。

## 验证记录

- `pnpm --filter @actspace/runtime... build`：通过，28 个依赖包构建完成。
- `@actspace/session-persistence`：6 files / 41 tests 通过。
- `@actspace/core-agent`：3 files / 12 tests 通过。
- `@actspace/core-agent-loop`：4 files / 16 tests 通过；覆盖 checkpoint 顺序和缺处理器不调用模型。
- `@actspace/tools-runtime`：2 files / 18 tests 通过。
- `@actspace/runtime`：6 files / 12 tests 通过。
- `@actspace/session-journal`：2 files / 9 tests 通过。
- `@actspace/session-checkpoint-policy`：1 file / 2 tests 通过。
- `@actspace/agent-cli`：6 files / 13 tests 通过；真实 CLI process smoke 2 tests 通过。
- `pnpm typecheck`：通过，Desktop 包含在检查范围内。
- `pnpm build`：通过，CLI、Desktop renderer 和 Electron main 构建完成。
- contract matrix 生成和 tests：通过，事件面为 13/10/6。
- `check:docs`、`check:current-docs`、`check:v2-legacy-removal`：通过。
- Desktop 全量 tests：744/758 通过；12 个失败来自两个既有 main test 的 `@actspace/llm-pi-ai` mock 缺少 `DeepSeekFileUploader`，另 2 个来自既有 renderer 交互断言。本次未修改这些测试和实现路径。
- `check:packages`：本次新增 package contract 已通过；命令仍被 3 个既有 Desktop test 深层源码导入阻断，未在本任务扩域修改。
