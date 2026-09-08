# P01：Cordis Agent Loop 插入面与通知面

状态：完成候选（P01 已实施，待计划归档）

## 目标与依赖

在 Cordis adapter 中提供受限、可按 Agent scope 隔离的 `on/emit/waterfall/serial` dispatcher，接通 9 个 Agent Loop 干预点、5 个主要通知和 Agent/Runtime/Session 生命周期。依赖 P00 的 Envelope/Journal commit contract。

## 文件范围

- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/src/behavior-loader.ts`
- `packages/cordis-adapter/src/plugin-contract.ts`
- `packages/cordis-adapter/src/manifest.ts`
- `packages/cordis-adapter/tests/`
- `packages/core/agent/src/registry.ts`
- `packages/core/agent/src/publication.ts`
- `packages/core/agent/src/inbox.ts`
- `packages/core/agent/src/test/`

不得让 Cordis 私有 Context 类型穿过 Host、Session 或固定前端 ABI；不得让插件直接分配 seq 或写 journal 文件。

## 步骤与验证

1. 扩展 Behavior activation context：`scope`、受限 events API、journal inspect、services、logger、AbortSignal、dispose。
2. 实现 `system-prompt/assemble`、`agent/pre-step`、`agent/request`、`llm/stream`、`agent/request-error`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`、`agent/turn-stopping`。
3. 实现 `agent/session-start`、`agent/status`、`agent/error`、`tools/result`、post-commit `session/event`；补齐生命周期和 Inbox 通知。
4. 增加 subject scope、handler 顺序、Waterfall/Serial 错误/取消隔离、activation fail closed、dispose drain tests。

验证命令：

```bash
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/cordis-adapter typecheck
pnpm --filter @actspace/core-agent typecheck
```

通过标准：handler 可以改写输入且结果可追溯；通知订阅者抛错不影响 Loop；跨 Agent scope 写入被拒绝；dispose 后没有活动 handler 或 waiter。

## 非目标

本包不实现 Agent Loop 主链，不改 CLI chat，不创建 Goal/Schedule producer，不把通知追加进 Session JSONL。
