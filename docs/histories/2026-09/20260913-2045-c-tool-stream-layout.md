## 2026-09-13 | Task: 实现 C 方案工具流与子 Agent 消息布局

### 用户诉求

根据 Cursor/Codex 对比，统一主消息流的工具交互：含直接 Read/Search/Grep/Glob/Listed 的连续过程段与其中 Thought 归为 `Explored`；纯 Thinking 或 Thinking + 非探索工具保持独立，真正的 Agent/Explore 独立展示并在右侧打开详情。

### 主要变更

- 新增 `ExploredActivityGroup`：完成态默认折叠，运行态展示最新活动，展开后保留真实工具行与 Thought。
- 重做 `AgentRunBlock`：两行紧凑入口，展示状态点、任务名、类型、状态和最新活动；点击打开右侧 Subagents panel。
- 新增可选 `agentKind`，让 Agent/Explore 类型从 preview 到 selector、streaming projection 和 panel 稳定透传。
- 更新 ConversationView 分段逻辑、右侧 panel 标题、相关测试与前端设计规范。
- 归组边界修正：只有包含 Read/Search/Grep/Glob/Directory List 的连续过程段才把 Thought 放进 `Explored`；纯 Thinking 或 Thinking + Bash 保持独立渲染。

### 验证与边界

- shared/desktop 类型检查、全仓 `pnpm typecheck`、`pnpm build`、focused Vitest、主题检查、文档检查和 `git diff --check` 通过。
- 受控启动 `pnpm dev:log` 成功；当前 Computer Use surface 只能读取已安装 ActSpace 窗口，开发窗口截图与真实点击验收待后续人工完成。
- 保留工作区其他未提交改动，未执行 reset、clean、stash、commit 或 push。
