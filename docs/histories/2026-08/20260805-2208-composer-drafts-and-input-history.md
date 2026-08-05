## [2026-08-05 22:08] | Task: 保留 Composer 草稿并支持输入历史

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 修复未发送输入在进入设置或切换会话后消失的问题，并支持通过方向键回到当前会话的历史输入；完成后测试、更新 release 并提交。

### Changes Overview

**Scope:** `packages/desktop`、Composer 前端规范、release 与 history。

**Key Actions:**

- **[会话草稿]**: 在 Workbench 生命周期内用稀疏缓存按会话保存未发送文字，Composer 切页、切会话或切换 initial/follow-up 形态后重新读取对应草稿。
- **[输入历史]**: 从当前会话的真实用户消息构造文字历史；空输入时用方向键上、下浏览，保留 Slash、IME 与非空 textarea 的原生键盘边界。
- **[失败恢复]**: 给发送失败的草稿补上会话归属校验，防止切换会话或页面重挂载时把旧会话文字回填到新会话。
- **[回归覆盖]**: 增加设置返回、双会话草稿隔离、历史上下界和真实消息贯通测试。
- **[公开记录]**: 同步 Composer 设计规范与面向用户的 8 月更新日志。

### Design Intent (Why)

草稿属于会话工作流，不属于一次 Conversation 或 Composer 组件挂载。把它放在跨页面存活的 Workbench 中，既能覆盖导航恢复，也不需要把未发送内容写入正式会话事件；使用稳定读写回调而不是顶层受控 state，还避免每次敲键触发整棵消息树重渲染。历史回溯只在空输入或已经浏览历史时接管方向键，防止覆盖新草稿或破坏多行光标移动。

### Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/desktop/src/renderer/test/workbench-responsive.test.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/releases/feature-release-notes.md`
- `docs/learnings/2026-08/composer-drafts-belong-to-navigation-lifecycle.md`

### Verification

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/composer.test.tsx src/renderer/test/workbench-responsive.test.tsx`：50/50 通过。
- 发送失败草稿恢复的 App 回归用例：1/1 通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `pnpm check:docs`、`pnpm test:site`、`pnpm check:frontend-theme`：通过。
- Desktop 全量套件：720/722 通过；两个既有 App 侧边栏状态用例在全量并发运行时等待超时，使用原命名分组单独复跑时 2/2 通过。
