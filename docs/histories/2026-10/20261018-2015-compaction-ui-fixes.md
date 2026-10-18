## 2026-10-18 | Task: 修复自动压缩取消与失败提示

### Execution Context

- Agent ID: `/root`
- Runtime: Codex desktop；Computer Use 委派 `gpt-6.1-sol`

### User Query

> 修复联合验收发现的两个 Bug。

### Changes Overview

- 自动压缩期间允许停止 Agent，继续使用现有取消链路；手动独立 `/compact` 无 Loop Run，不暴露无效取消按钮。
- 将自动压缩失败块同步到对应 Session 的本地展示状态，避免 Run 结束时随 live state 丢失；后续压缩状态或新发送清理旧提示。
- 同步中间消息区规范与类型注释，新增失败两种事件格式、回合结束保留、重试清理和取消入口的回归测试。

### Design Intent

按钮能否取消取决于执行能力，不能只看是否正在压缩。失败提示需覆盖 Run 结束后的用户恢复操作，生命周期比 live run 更长；本轮不改持久化结构，不承诺重启后仍显示自动压缩失败。

### Files Modified

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/composer/ComposerToolbar.tsx`
- `apps/desktop/src/renderer/components/composer/composer-types.ts`
- `apps/desktop/src/renderer/session/active-session-context.tsx`
- `apps/desktop/src/renderer/test/composer-toolbar.test.tsx`
- `apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend/front-中间消息区规范.md`

### Validation

- Red：新增回归在旧代码出现 4 项预期失败，其余 50 项通过。
- Green：193 项相关前端测试、8 项后端自动压缩测试通过；Desktop 类型检查通过。
- [真实界面复验](../../exec-runs/20261018-context-storage-cu/bugfix-computer-use.md)单独记录；测试 Provider 的结果不能代表真实外部 Provider。
- 同类排查：停止条件、两处类型注释、消息区规范已同步；手动压缩任务失败保留路径无需改动。
- 学习沉淀：[运行结束不等于提示结束](../../learnings/2026-10/20261018-live-run-notice-lifetime.md)。
