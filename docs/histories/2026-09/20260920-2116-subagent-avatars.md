## [2026-09-20 21:16] | Task: 子智能体角色头像与独立运行状态

### Execution Context

- Agent ID: /root
- Base Model: GPT-6
- Runtime: Codex desktop

### User Query

为子智能体使用提供的九张图片增加头像，替换状态点，并独立设计运行状态。设计确认后实施。

### Changes Overview

Scope: desktop renderer。

- 九张图片逐张裁切并生成 128px 无损 WebP，保持原色及透明通道。
- 新增共享 AgentAvatar / AgentStatus；消息、右侧列表及详情标题统一头像和四态反馈，兼顾减少动态效果模式。
- child Session ID 确定性映射角色，状态与投影行 ID 的变化不会换图；有限图片池允许重复。
- 更新展示规范、四态浏览器样例，补充头像身份稳定性回归。

### Design Intent

头像提供稳定身份线索，图标与文字表达状态；不再让同一圆点承担两种职责。不修改 Agent Runtime、IPC 或存储契约。

### Files Modified

- `apps/desktop/src/renderer/components/messages/AgentIdentity.tsx`
- `apps/desktop/src/renderer/components/messages/AgentRunBlock.tsx`
- `apps/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx`
- `apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`
- `apps/desktop/src/renderer/assets/subagents/`
- `apps/desktop/src/renderer/test/agent-run-block.test.tsx`
- `apps/desktop/src/renderer/test/fixtures/tool-experience-visual.tsx`
- `docs/design-docs/frontend/front-agent-tool-stream-rendering.md`

### Validation

- renderer production build、主题 token 检查、文档检查、git diff --check 通过。
- 默认 typecheck / Vitest 受当前依赖环境的 jest-dom matcher 注册与类型扩展问题阻塞。使用一次性 setup 对运行中的 Vitest expect 显式注册相同 matchers 后，相关 3 个文件、16 项测试全部通过；临时补齐同一类型扩展后完整 renderer typecheck 通过，Electron typecheck 也通过。临时文件已清理，未改变默认配置。
- 已查看浏览器 renderer 浅色截图，头像裁切、消息卡片与右侧列表一致。
- 浅色截图之后 Computer Use 会话不可继续访问，深色、system、减少动态效果和真实 Electron 窗口的视觉验收未完成；主题契约检查已通过。浏览器 mock 不代表真实 Electron / Provider 验收。

### Learning

命中可迁移、陷阱与模式：稳定业务身份和投影行身份的区别，以及有限头像池的稳定性/唯一性取舍。已记录 `docs/learnings/2026-09/20260920-stable-avatar-identity.md`。
