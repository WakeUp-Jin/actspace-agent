## [2026-10-15 21:00] | Task: 轨迹验收问题修复（B03、B04、I01）与思考默认展开

### Execution Context

- Agent ID: /root
- Base Model: Claude Opus 5.5（主智能体）；三个只读排查子智能体用 Sonnet 5.5（B03 前端链路、B01/B02、I01）
- Runtime: Claude Code CLI，本地开发工作区

### User Query

> 思考展开「按照 DSH 的做法来」；处理 Codex 验收报告 `docs/exec-runs/20261014-trajectory-streaming-split/acceptance-20261015.md` 的问题；B03 前端选方案 A；B01/B02 不加兜底（「没有找到原因，兜底是遮盖 bug」）。

### Changes Overview

**Scope:** `apps/desktop`（renderer 轨迹与对话、main 模型适配器、watcher 测试）

**Key Actions:**

- **思考默认展开**：照 DSH `thinkingDisclosure`，带思考的助手记录默认展开；手动切换只记在最近操作的那条记录上。补上 DSH compact 变体的 13px/20px、三级文字色。
- **B04**：应用基础重置清掉了 `ol/ul` 的标记和缩进；轨迹 Markdown 照 DSH `MarkdownText` 恢复 decimal/disc/circle、18px 缩进和次级色标记。
- **B03 后端**：关闭 Thinking 时适配器输出 `reasoningEffort: undefined`，经 `loop.ts` 写入请求快照的 `defaults` 后被 `freezeRequest` 拒绝。改为删除值为 undefined 的选项字段，快照校验保持严格；关闭时不会带上已存的推理强度。
- **B03 前端（方案 A）**：`error` 不再算工具过程行，`splitTurnMessages` 把它拆成 `failures`，在轮次末尾以红色状态行显示，不折进「Worked」组。
- **I01**：测试竞态。macOS 递归 watch 在 `ensure` 之后才生效，并会补发之前 `git init`/`worktree add` 的元数据事件。测试改为反复写探针直到收到事件再清空记录；实现不变。
- **轨迹帧合并**：`useFrameCoalesced` 清理时把 rAF 记录置空，避免 effect 重跑后不再提交。React 18 无法在单测中模拟，未加回归测试。

### Design Intent (Why)

B01/B02 只在长时间 HMR 的开发窗口出现，排查只找到隐患（`sessionStore` 用 `useMemo`、快照对账只结束 recovered 运行、无数据时不重拉），没有确认根因。用户决定不加兜底，以免掩盖问题。

### Files Modified

- `apps/desktop/src/renderer/components/trajectory/details/DetailPanel.tsx`、`styles/trajectory.css`、`components/trajectory/use-trajectory-source.ts`
- `apps/desktop/src/renderer/components/conversation/turns.ts`、`TurnView.tsx`、`render-message.tsx`、`components/messages/messageFlowStyles.ts`
- `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts`
- 测试：`test/trajectory-details.test.tsx`、`test/conversation-turns.test.ts`、`test/tool-activity-group.test.tsx`、`main/test/runtime-v2-thinking-options.test.ts`、`main/test/review-workspace-watcher.test.ts`
