# C 方案：工具流与子 Agent 消息布局 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260913-c-tool-stream-layout.md`
- **执行过程**：`docs/exec-runs/20260913-c-tool-stream-layout/execution-process.md`
- **执行模式**：交互
- **执行结果**：实现完成；自动化与构建门禁通过，真实 Electron 交互截图待人工验收

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `agentKind` 透传 | shared、fixed renderer、App、selector | 区分 Agent/Explore，旧数据按 Explore 兼容 |
| `ExploredActivityGroup` | ConversationView、消息组件 | 含直接探索工具的连续过程段与其中 Thought 统一折叠/展开；纯 Thinking 保持独立 |
| 紧凑 Agent/Explore 行 | AgentRunBlock、SubagentsPanel | 两行状态入口，点击打开右侧 child Session |
| 规范与测试 | frontend/collaboration/tool docs、renderer/main tests | 更新行为契约和回归断言 |

## 人工验证指引

实现完成后补充 renderer 和 Electron 的具体操作步骤、预期结果与截图证据。

## Agent 已完成的验证

- `pnpm --filter @actspace/shared typecheck`：通过。
- `pnpm --filter @actspace/desktop exec tsc --noEmit`：通过。
- 聚焦 Vitest：68 项通过（Explored、独立 Thinking、AgentRunBlock、SubagentsPanel、工具产物、preview）。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `pnpm run check:frontend-theme`、`pnpm check:docs`、`git diff --check`：通过。
- `pnpm dev:log`：在受控本机权限下启动 Vite/Electron 编译；开发窗口未被当前 CUA surface 暴露，未形成截图证据。

## 已知风险和遗留事项

- 当前工作树包含大量与本任务无关的未提交改动，已按计划范围增量修改，未执行 reset、clean、stash、commit 或 push。
- 全量 renderer 回归的历史记录曾有 5 项失败；本轮已修正其中 3 个旧 `Worked` 文案断言，当前仍有 2 项与本任务无关的 dirty-worktree 回归：写入流 fixture 未显示预期行（涉及未由本任务修改的 `FileDiffBlock` WIP）和 workspace picker 异步断言。它们不影响类型、构建和本计划聚焦测试，应在后续回归任务中单独收敛。
