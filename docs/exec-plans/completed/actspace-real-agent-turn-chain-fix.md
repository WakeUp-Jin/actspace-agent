# actspace 真实 Agent Turn 链路修复计划

## Summary

本计划修复当前桌面端发送消息后的真实 Agent 链路偏差，让普通会话和新建会话默认走真实 DeepSeek provider，并完整记录与渲染一次 turn 的用户输入、中间执行、工具调用、最终回复。

当前问题不是单个 UI bug，而是运行链路存在三类偏差：

- `session.jsonl` 缺少 `user_message` 事件，导致前端恢复时无法渲染用户输入组件。
- Electron 运行时仍可能落到 `deepseek-mock`，导致不同用户输入得到相同的 mock thinking/tool/final reply。
- 工具工作目录使用 Electron `userData`，导致 `read_file README.md` 在应用数据目录查找文件，而不是在项目工作区查找文件。

本轮修复遵循 `docs/REPO_COLLAB_GUIDE.md` 的原则：优先选择简单、清晰、可观测的方案；同类问题不要靠多试 prompt 解决，而要修环境、脚手架和规范。

## Required Reading

新会话或子 Agent 执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/PLANS_GUIDE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`

不要读取 `.env` 文件内容；只允许通过运行时行为或安全的配置字段名判断 provider 是否生效。

## Goals

- 新建会话和普通真实会话默认调用真实 DeepSeek provider。
- `Learning doc plan` 作为唯一 demo/mock 展示会话保留，用于浏览器 mock UI 和历史设计样例。
- 每次用户发送消息后，持久化事件顺序至少包含：
  - `user_message`
  - `thinking`（如果模型返回 reasoning）
  - `tool_call`（如果模型请求工具）
  - `tool_result`（如果工具被执行）
  - `assistant_message`
  - `context_snapshot`
- 前端恢复会话时能渲染用户消息、Thinking、Read/Search、Edit diff、最终回复。
- 工具工作目录指向真实 workspace，而不是 Electron `userData`。
- 运行链路有足够日志区分：
  - 前端没有渲染
  - 后端没有推送
  - Agent 没有产生事件
  - 工具执行失败
  - provider 配置错误

## Non-Goals

- 不做完整多工作区管理 UI。
- 不做设置页里的 provider 管理。
- 不做长期记忆、自动压缩高级策略、MCP/Skill 完整运行时集成。
- 不把 mock provider 删除；mock 仍用于测试、fixture 和显式 demo。
- 不在 renderer 直接读取文件系统。

## Current Evidence

本地已观察到的新会话 `session.jsonl` 事件形态：

- 有 `thinking/tool_call/tool_result/assistant_message/context_snapshot`
- 没有 `user_message`
- `assistant_message.payload.provider` 为 `deepseek-mock`
- 两次不同 `turnId` 写入了内容几乎相同的 mock 回合

当前关键代码路径：

- `packages/desktop/src/main/index.ts`
  - `createAgentDeps()` 每次 turn 创建 LLM/tool/context 依赖。
  - 当前 `createToolManager({ workspaceRoot: app.getPath("userData") })` 会让文件工具指向应用数据目录。
- `packages/agent-core/src/engine/agent.ts`
  - `Agent.run(userText)` 创建了 `UserMessage` 并 append 到 context。
  - 但该 user message 没有进入 `AgentLoopResult.messages`。
- `packages/agent-core/src/engine/bridge.ts`
  - `runTurnWithAgent()` 用 `loopResult.messages` 生成 `SessionEvent[]`。
  - 因此最终结果缺少 `user_message`。
- `packages/agent-core/src/llm/services/mock.ts`
  - 固定输出 `read_file README.md` + `search_files` + 固定总结。
  - 这解释了多次输入得到相同内容。
- `packages/shared/src/session-selectors.ts`
  - 前端恢复渲染基于 `SessionEvent[] -> MessageBlock[]`，缺少 `user_message` 就不会出现用户输入组件。

## Design Decisions

### 1. Provider 默认策略

真实桌面端运行时默认 provider 应为 `deepseek`，不是 `mock`。

建议行为：

- `LLM_PROVIDER` 未配置时默认使用 `deepseek`。
- Electron 真实 turn 由 main 进程按 `deepseek|kimi` 创建真实 provider，不允许被 `MOCK_MODE` 静默替代。
- `MOCK_MODE=true` 和 `LLM_PROVIDER=mock` 只用于测试、浏览器 fixture 或显式 demo。
- 如果选择 `deepseek` 但缺少 `DEEPSEEK_API_KEY`，应返回清晰错误事件，不静默降级为 mock。

需要检查并修改：

- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/llm/factory.ts`
- `.env.example`
- `README.md`
- `docs/SECURITY.md`
- `docs/ARCHITECTURE.md`

### 2. Mock 的边界

mock 不应该伪装成普通会话的真实 Agent。

首版边界：

- 浏览器无 Electron bridge 时，可以展示 `Learning doc plan` fixture。
- Electron 里的历史 `Learning doc plan` 可以保留已经落盘的 mock 展示数据。
- 新建会话、普通会话、用户手动发送消息默认走真实 DeepSeek。
- 测试代码可继续使用 `MockLLMService`。

需要检查并修改：

- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/agent-core/src/llm/services/mock.ts`
- 相关测试用例命名，避免把 mock 行为描述成真实 provider 行为。

### 3. SessionEvent 是前后端唯一稳定契约

真实 turn 的持久化不能只写 assistant/tool 事件，必须显式写入用户输入。

建议行为：

- `runTurnWithAgent()` 在构造 `sessionEvents` 时，先写入本轮 `user_message`。
- user message event 的 `turnId` 与本轮所有 assistant/tool/context 事件一致。
- 流式 UI 可以先即时显示用户输入，但最终恢复必须以 `session.jsonl` 为事实来源。

需要检查并修改：

- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts` 或新增同级测试
- `packages/agent-core/src/persistence/test/recovery.test.ts`

### 4. 工具工作区必须独立于 app data

`userData` 是应用数据目录，不是 Agent 文件工具的工作目录。

首版建议：

- 新增 workspace root 解析函数。
- 优先级：
  - 显式环境变量，例如 `ACTSPACE_WORKSPACE_ROOT`
  - 开发态从当前仓库向上探测 `pnpm-workspace.yaml` 或 `.git`
  - fallback 到 `process.cwd()`，但要记录日志和 bootstrap state
- `ToolManager` 使用解析后的 workspace root。
- bootstrap state 可以暴露当前 workspace root，方便 UI 或日志排查。

需要检查并修改：

- `packages/desktop/src/main/index.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/tools/read-file/executor.ts`
- `packages/agent-core/src/tools/tools/search-files/executor.ts`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`

### 5. 可观测性应能定位三类错误

这部分若已由其他会话处理，本计划只消费其结果；若未完成，则至少保证本计划中的代码改动能被现有日志看见。

每次 turn 至少应能从日志或 session 文件看出：

- provider 名称和 model（不包含密钥）
- sessionId / turnId
- user input 长度或脱敏 preview
- stream event 类型计数
- tool name、参数 preview、成功/失败、错误消息
- result 持久化是否成功

需要检查：

- `docs/RELIABILITY.md`
- 根目录 `logs/latest-dev.log`
- 后续独立日志计划的产物

## Implementation Plan

### Task 1: 固定真实 provider 默认行为

修改目标：

- `packages/agent-core/src/env.ts`
- `.env.example`
- `README.md`

步骤：

1. 将默认 `LLM_PROVIDER` 从 `mock` 调整为 `deepseek`。
2. 保留 mock 能力给测试、浏览器 fixture 和显式 demo，但 Electron 真实 turn 不读取 `MOCK_MODE` 来创建 mock LLM。
3. 确保 deepseek 缺少 API key 时返回清晰错误，不自动使用 `mock-key` 假装成功。
4. 更新 `.env.example` 注释，说明真实桌面端默认 DeepSeek，mock 只用于测试或 demo。

验证：

- `pnpm --filter @actspace/agent-core test`
- 新增或更新 env/factory 测试：
  - 默认 provider 为 `deepseek`
  - Electron turn 即使环境中存在 `MOCK_MODE=true`，也不会静默使用 `mock`
  - deepseek 无 key 时产生可识别 auth 错误

### Task 2: 修复 user_message 事件持久化

修改目标：

- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts` 或新增测试文件

步骤：

1. 在 `runTurnWithAgent()` 中基于 `input.userInput` 创建本轮 `user_message` event。
2. 确保 `sessionEvents` 顺序为 user first，然后 assistant/tool/context。
3. 不依赖 `AgentLoopResult.messages` 是否包含 user message。
4. 保证 `createMessageBlocks()` 能恢复用户消息组件。

验证：

- 新增测试：`runTurnWithAgent()` 返回的 `events[0].type === "user_message"`。
- 新增测试：同一 turn 的 user/thinking/tool/final 事件 `turnId` 一致。
- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`

### Task 3: 修复 workspace root 和工具执行目录

修改目标：

- `packages/desktop/src/main/index.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/tools/test/*` 或新增 desktop main 辅助函数测试（如可行）

步骤：

1. 新增 `resolveWorkspaceRoot()`，不要散落在 `createAgentDeps()` 内。
2. 优先使用 `ACTSPACE_WORKSPACE_ROOT`。
3. 开发态自动向上查找 `pnpm-workspace.yaml` 或 `.git`，找到当前仓库根。
4. 将 `createToolManager({ workspaceRoot })` 改为使用真实 workspace root。
5. 在 bootstrap state 或日志中暴露 `workspaceRoot`，但不把敏感路径写进 session 事件。

验证：

- 本地开发态 `read_file README.md` 应能读到仓库根 `README.md`。
- `search_files` 应在仓库根执行，而不是 `~/Library/Application Support/actspace`。
- `pnpm typecheck`
- Electron 真实验收时发送一条明确让 Agent 读取 `README.md` 的消息，确认工具结果不是 `File not found`。

### Task 4: 限定 mock/demo 展示范围

修改目标：

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`

步骤：

1. 保留 `Learning doc plan` fixture 作为唯一 mock 展示会话。
2. 新建会话不显示 mock 附件、不显示 mock messages。
3. 普通会话如果没有本地事件，显示空状态或空白，不回退到 `mockMessages`。
4. 如果 Electron bridge 存在，renderer 不应将 `mockTurnResult` 注入真实会话。

验证：

- 浏览器 mock：初始 `Learning doc plan` 可展示 fixture。
- 浏览器 mock：点击 `New chat` 后消息区为空、Composer 无 demo 附件。
- Electron：新建会话后消息区为空，发送后展示真实事件。

### Task 5: 校正 renderer 流式与最终结果合并

修改目标：

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`

步骤：

1. 发送后立即显示用户输入临时 block。
2. `agent:stream` 到达时追加 thinking/text/tool 临时 block。
3. `agent:run-turn` 完成并 `session:get` 恢复后，用持久化 `SessionRecord` 替换临时 blocks。
4. 防止临时 blocks 和最终持久化 blocks 重复展示。
5. 切换会话时清空 streaming 状态和 turnResult。

验证：

- 发送期间能看到用户消息。
- 完成后用户消息仍存在，且不重复。
- 两次发送产生两组不同 turn，按顺序显示。

### Task 6: 文档与质量同步

修改目标：

- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
- `docs/histories/YYYY-MM/*.md`
- 如涉及学习沉淀，按 `docs/learnings/WRITING_GUIDE.md` 新增学习文档。

步骤：

1. 更新当前 provider 默认策略。
2. 更新 workspace root 与 userData 的边界。
3. 更新真实 Agent turn 的事件顺序。
4. 更新测试/验收记录。

验证：

- 文档中不再暗示普通会话默认 mock。
- history 记录本次修复的根因和验证。

## Test Plan

工程验证：

- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

浏览器 mock 验证：

- `localhost:5173` 可打开 renderer。
- `Learning doc plan` 展示 fixture。
- `New chat` 创建空 mock 会话，不显示 README.md demo 附件。

Electron 真实验证：

- 使用 `pnpm dev:log` 启动。
- 点击 `New chat` 创建真实空会话。
- 输入一条不含敏感信息的消息，例如：
  - `请读取 README.md 并用一句话说明这个项目目标。`
- 期望：
  - UI 先显示用户输入。
  - 若 DeepSeek 返回 reasoning，则显示 Thinking。
  - 若触发 read/search 工具，则显示工具调用和结果。
  - 最终显示 assistant reply。
  - `session.jsonl` 中包含 `user_message`。
  - `assistant_message.payload.provider === "deepseek"`。
  - 工具不再从 `userData` 查找 `README.md`。

日志验证：

- `logs/latest-dev.log` 或独立 agent run log 能看到：
  - sessionId / turnId
  - provider / model
  - stream event 类型
  - tool start / tool end
  - persist success/failure

## Failure Modes And Rollback

- DeepSeek API key 缺失：
  - 预期行为：返回清晰 auth 错误并展示错误消息，不自动降级 mock。
  - 回退：使用测试/浏览器 fixture 验证 UI；真实 Electron turn 不通过 mock 伪装成功。
- workspace root 未识别：
  - 预期行为：日志提示 fallback 到 `process.cwd()`。
  - 回退：设置 `ACTSPACE_WORKSPACE_ROOT`。
- 工具读取越界：
  - 预期行为：`workspace-guard` 阻止访问并返回可读错误。
  - 回退：不扩大工具权限，只修 root 解析。
- 前端重复渲染：
  - 预期行为：最终恢复以 `SessionRecord` 为准，临时 blocks 清空。
  - 回退：禁用临时流式合并，只显示最终持久化结果。

## Acceptance Checklist

- [x] 普通会话默认真实 DeepSeek，不再被 `MOCK_MODE` 静默切成 `deepseek-mock`。
- [x] `Learning doc plan` 是唯一保留 demo/mock 展示的会话。
- [x] 新建会话为空，不显示 mock messages 或 demo attachments。
- [x] 发送消息后 UI 显示用户输入组件。
- [x] `session.jsonl` 每轮包含 `user_message`。
- [x] 多次发送不会出现相同 mock 回合重复。
- [x] `read_file README.md` 在真实 workspace 执行，不再查找 `userData`。
- [x] 日志足够区分前端渲染、后端推送、Agent 执行和工具失败。
- [x] 文档与 history 已同步。

## Execution Notes

2026-05-24:

- 将 `LLM_PROVIDER` 默认值从 `mock` 改为 `deepseek`，`MOCK_MODE=true` 才显式使用 mock。
- 复查 `logs/latest-dev.log` 发现 Electron main 仍通过 `env.MOCK_MODE ? createLLMServiceFromEnv() : realProvider` 创建 mock LLM；已移除真实 turn 链路中的 mock 分支，并在依赖日志中记录 `mockModeIgnoredForElectronTurn` 便于排障。
- `runTurnWithAgent()` 显式将本轮用户输入写为首个 `user_message` 事件，并新增 bridge 测试锁定事件顺序。
- Electron main 将文件工具工作区从 `userData` 改为 workspace root，支持 `ACTSPACE_WORKSPACE_ROOT` 覆盖。
- renderer 完成 turn 后以恢复后的 `SessionRecord` 为事实来源，避免 `turnResult` 覆盖 active session 或造成重复展示。
- 已通过 `pnpm --filter @actspace/agent-core test`、`pnpm typecheck` 和 `git diff --check`。
- `pnpm build` 当前被并行会话新增的未跟踪 Kimi Assistants 文件阻塞：`packages/agent-core/src/llm/kimi-assistants/client.ts` 的 `APIContentPart[]` 与内部 `UserMessage.content` 类型不兼容。该文件不属于本计划修复范围，需由 Kimi 能力计划处理后再复跑全仓 build。
