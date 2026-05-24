## [2026-05-24 14:58] | Task: real Agent turn chain fix

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 普通会话和新建会话应该调用真实 DeepSeek API，mock 只保留在 `Learning doc plan` 示例会话中。修复时不要短期补丁，要按仓库原则做最佳修复。

### Changes Overview

**Scope:** `packages/agent-core`, `packages/shared`, `packages/desktop`, `docs`

**Key Actions:**

- **Provider default**: 将默认 `LLM_PROVIDER` 改为 `deepseek`，并让 Electron 真实 turn 不再被 `MOCK_MODE` 静默切到 mock provider。
- **Session event contract**: `runTurnWithAgent()` 显式将本轮用户输入写为首个 `user_message` 事件，保证恢复后能渲染用户消息。
- **Bridge test**: 新增 bridge 测试，锁定 `user_message -> thinking/tool_call/tool_result -> assistant_message -> context_snapshot` 事件顺序。
- **Workspace root**: Electron main 将文件工具工作目录从 `userData` 改为 workspace root，并支持 `ACTSPACE_WORKSPACE_ROOT` 覆盖。
- **Renderer source of truth**: 发送完成后以恢复后的 `SessionRecord` 为事实来源，清掉 `turnResult`，避免旧结果影响 active session 或重复展示。
- **Runtime guard**: 根据 `logs/latest-dev.log` 复查发现主进程仍因 `MOCK_MODE` 创建 mock LLM；已移除 Electron turn 链路中的 mock 分支，并在日志中记录 `mockModeIgnoredForElectronTurn`。
- **Docs**: 更新 README、架构、可靠性、安全、质量评分和 active plan。

### Design Intent (Why)

这次问题不是单一 UI 渲染错误，而是 provider 默认策略、事件持久化契约和工具工作区边界同时偏离真实产品链路。按 `docs/REPO_COLLAB_GUIDE.md` 的原则，应该修环境、修脚手架、修规范，让同类问题只修一次，而不是靠多试 prompt 或继续追着截图打补丁。

### Verification

- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`
- `git diff --check`

`pnpm build` 当前被并行会话新增的未跟踪 Kimi Assistants 文件阻塞：`packages/agent-core/src/llm/kimi-assistants/client.ts` 的 `APIContentPart[]` 与内部 `UserMessage.content` 类型不兼容。该问题不属于本次真实 Agent turn 链路修复范围，需由对应 Kimi 能力计划处理后再复跑。

### Files Modified

- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `.env.example`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
- `docs/exec-plans/active/actspace-real-agent-turn-chain-fix.md`
