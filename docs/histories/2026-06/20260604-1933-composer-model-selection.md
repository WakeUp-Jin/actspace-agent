## [2026-06-04 19:33] | Task: Fix Composer Model Selection

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户反馈新创建会话时模型下拉选择似乎没有生效：选择 `deepseek-v4-flash` 后实际仍使用 `deepseek-v4-pro`。

### Changes Overview

**Scope:** `packages/desktop` renderer, `docs/histories`, `docs/learnings`

**Key Actions:**

- **[Composer state ownership]**: 将普通聊天当前模型选择提升到 `App` 的会话页状态中，避免 initial Composer 与 follow-up Composer 切换时丢失本地选择。
- **[Controlled Composer model]**: 为 `Composer` 增加受控模型 props，同时保留单组件测试和局部使用场景的本地默认模式。
- **[Renderer wiring]**: 通过 `WorkbenchLayout -> ConversationView -> Composer` 透传当前模型选择和变更回调，让空会话、新建会话、后续输入框共享同一个模型选择。
- **[Regression test]**: 新增 renderer 测试，覆盖空会话选择 `deepseek-v4-flash` 后创建会话并发送，以及切到 follow-up Composer 后继续发送，两次 `runTurn` 都必须携带 flash 模型。

### Design Intent (Why)

模型选择影响的是下一次普通聊天 turn 的运行配置，不应该只存在于某个会被卸载重建的输入框组件里。原实现中，空会话使用 initial Composer，发送后会切到 follow-up Composer；如果模型选择只在 Composer 内部，本地状态会在切换时重新按默认模型初始化，造成 UI 曾经选过 flash，但后续 turn 又回到 pro。

这轮把模型选择收口为聊天页级状态：用户从任意 Composer 选择模型后，上层保存为当前聊天选择；发送时 `ComposerSendOptions.model` 来自这个共享值。后端 `runTurn -> buildAgentConfig -> resolveModelSpec` 链路保持不变，只修正前端传入的事实。

### Verification

- `pnpm --filter @actspace/desktop test -- app-streaming-user-message.test.tsx`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

### Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/learnings/2026-06/component-local-state-can-be-too-local.md`
