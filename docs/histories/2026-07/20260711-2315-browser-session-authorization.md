# Browser Use 会话授权与连接诊断修复

| key | value |
|-----|-------|
| date | 2026-07-11 |
| scope | packages/agent-core, packages/desktop, packages/shared, plugins/browser-bridge |
| status | completed |

## 用户诉求

Browser 工具首次调用时显示一张简洁的“拒绝 / 允许”审批卡片。允许后，同一应用运行期间的同一会话不再重复审批；拒绝只阻止当前 Turn，下一次用户输入仍可重新申请。同时排查 Extension Native Messaging 连接状态误报和标签页关闭后的未处理错误。

## 主要变更

- 新增 `browser_session` 审批作用域，把 `sessionId`、`turnId` 从 Agent Core 调度链传递到 Desktop 主进程与 Renderer。
- Desktop 审批注册表维护内存态 Session grant 与 Turn denial：允许后静默放行该 Session，拒绝后静默拒绝同一 Turn 的后续 Browser 调用。
- 所有实际 `browser_*` 动作统一经过会话授权；纯帮助工具 `browser_help` 保持免审批，Settings 中的高风险能力开关仍优先硬拒绝。
- 新增 Browser 专用审批卡片，明确授权范围和生命周期，并提供“拒绝 / 允许”两个动作。
- 修正 Browser 工具运行状态文案，避免工具刚开始就显示 `Completed`。
- Extension 只在收到 Native Host 首条消息后标记连接成功；关闭标签页时消费 debugger detach 的 `runtime.lastError`，并清理失效 tab 引用。
- 更新 Browser Use 设计文档，使审批模型与实现保持一致。

## 关键验证

- Desktop 审批注册表覆盖 Session allow、Turn deny、下一 Turn 重新申请。
- Renderer 覆盖审批卡片按钮行为，以及 runtime stream 到审批卡片的集成链路。
- Agent Core 覆盖只读 Browser 动作也需要首次会话授权、拒绝后的 Turn 语义。
- Extension contract 覆盖 Native Host 连接确认时机与失效标签页清理。

## 设计意图

Browser Use 不是单个低风险函数，而是对用户真实 Chrome 会话的一组持续能力。审批应绑定“能力租约”的生命周期，而不是绑定 62 个叶子动作；拒绝则必须缩小到当前 Turn，既防止模型在同一轮反复弹窗，也允许用户在下一轮改变决定。

## 主要文件

- `packages/desktop/src/main/approval-registry.ts`
- `packages/desktop/src/renderer/components/messages/BrowserApprovalBlock.tsx`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/tools/browser/permissions.ts`
- `plugins/browser-bridge/apps/chrome-extension/src/background.js`
- `docs/design-docs/agent-browser-use-integration-design.md`
