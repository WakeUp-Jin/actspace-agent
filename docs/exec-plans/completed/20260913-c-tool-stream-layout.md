# C 方案：工具流与子 Agent 消息布局

> 状态：实现完成，2026-09-13。自动化、构建与主题/文档门禁通过；真实 Electron 交互截图待人工验收。

## 目标与结果

桌面端主消息流已按 C 方案收敛：包含 Read/Search/Grep/Glob/Directory List 的连续过程段，以及其中的 Thought，自动归组为 `Explored`；没有直接探索工具的独立 Thought 保持单独渲染。真正的 Agent/Explore 使用独立紧凑两行入口，点击后在右侧 Subagents 面板查看 child Session 详情。

## 已实施

- shared `AgentToolPreview` 增加可选 `agentKind: "agent" | "explore"`，固定 renderer、selector、App streaming projection 与右侧面板统一透传。
- 新增 `ExploredActivityGroup`，完成态默认折叠，运行态默认展开，折叠态保留最新一行活动；只有包含直接探索工具的连续段才进入该组，展开后保留真实工具行与 Thought 内容。
- `AgentRunBlock` 改为状态点、任务名、类型、状态、最新活动的两行入口；Agent/Explore 都使用右侧 panel，不在主流内嵌 transcript。
- 更新工具活动、Agent 行、文件打开、preview 类型和设计规范测试。

## 设计边界

- `Explored` 只表示当前主消息流中的基础探索活动，不表示 child Session。
- `display: "inline"` 仅保留为历史数据兼容值，renderer 主路径统一按 panel 处理。
- 未改变 Agent/Explore 执行权限、Prompt、调度、Journal 或 IPC 生命周期。

## 验证

- `pnpm typecheck`、`pnpm build`：通过。
- focused Vitest：68 项通过。
- `pnpm check:docs`、`pnpm run check:frontend-theme`、`git diff --check`：通过。
- `pnpm dev:log` 在受控本机权限下完成 Vite/Electron 启动；当前 CUA surface 未暴露开发窗口，真实截图和点击验收保留为人工项。

详细过程见 [`execution-process.md`](../../exec-runs/20260913-c-tool-stream-layout/execution-process.md) 和 [`execution-summary.md`](../../exec-runs/20260913-c-tool-stream-layout/execution-summary.md)。
