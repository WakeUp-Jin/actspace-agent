## [2026-06-06 16:20] | Task: Explore 内置聚焦子代理（拆分 agent / explore）

### 🤖 Execution Context

- **Agent ID**: `local-agent`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor / local`

### 📥 User Query

> Cursor 有个内置 Explore 子代理：搜索/分析代码库、用更快的模型、产出大量中间输出但隔离在子上下文。我们现有的 `agent` 工具其实是「用户主动触发的通用子代理」，能不能再设计一个固定的内置探索子代理，工具名叫 `explore`，重心是「任务小、范围小、更专注」、渲染也和 `agent` 不一样。先写设计规范，再写执行计划，然后 A/B/C/D 一起执行。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`（main + renderer）

**Key Actions:**

- **拆分 `agent` / `explore`**：`agent` 描述 reframe 为「通用、跨多文件的全面子代理」（走 Panel、主模型，行为不变）；新增内置 `explore` 工具——聚焦小探索、跑便宜模型（默认 `deepseek-v4-flash`）、由主模型自动 delegate、内联折叠展示。两者复用同一套 `runExploreSubAgent` 运行时。
- **runner 参数化**：`AgentToolRuntime` 加 `systemPrompt?` / `maxTurns?` / `display?`，把 `display`（"panel"|"inline"）透传到每一处 preview 构造点（初始 user 事件、循环 message_end、abort/error、最终 preview）。`explore` 用 `FOCUSED_EXPLORE_SYSTEM_PROMPT` + `maxTurns: 20` + `display: "inline"`。
- **展示判别字段（实现期偏差）**：未新增 `explore` 的 `ToolPreviewKind`/`ToolUiPreview`/`MessageBlock` kind，改为在既有 `AgentToolPreview` 加可选 `display: "panel" | "inline"`。`explore` 复用 `agent` 的 preview kind / MessageBlock / 流式 partial-args 解析，`ConversationView` 的 `case "agent"` 按 `display` 路由：`inline` → 新增 `ExploreRunBlock`，其余 → 既有 `AgentRunBlock` + Panel。收敛改动面、避免穿透所有 exhaustive switch。
- **flash 服务注入**：`create-agent-deps.ts` 新增 `createExploreLLMService(exploreModelId, env)`（照搬 `createSummarizerForAgent` 的 `buildLLMConfig + createLLMService`，缺对应供应商 key 返回 undefined）；`createToolManager` 加 `exploreLlm`，注册 `explore` 时 `config.exploreLlm ?? config.llm` 回落主模型。
- **设置与 IPC**：`AgentSettings.exploreModelId: ModelId | null`（`null` = flash 默认）+ settings-service 默认/sanitize；`RunTurnInput.exploreModelId` 由 main 从 `getSettingsService().get().agent.exploreModelId` 注入（renderer 不每轮上送）；设置页「Explore 子代理」模型选择器，镜像 Kairos `modelId`。
- **主系统 prompt**：加策略段「小而明确的探索优先 `explore`，大而全面的探索才用 `agent`」。
- **`ExploreRunBlock`**：复用 `ToolActivityGroup`（running 平铺 / done 折叠），并复用从 `SubAgentTranscriptModal` 导出的 `buildTranscriptSections` / `renderTranscriptItem` / `loadTranscript` 把 transcript 事件转成同款工具行；折叠头 `<description> · Worked for Xs`；重载后 events 为空且有 `transcriptRef` 时，首次展开经 `subagent:get-transcript` 懒加载。`ToolActivityGroup` 加可选 `label` 与 `onExpandedChange`。
- **测试**：`explore-tool.test.ts`（注册 agent+explore、disabledTools 关闭、dedicated exploreLlm、无 key 回落）、`explore-run-block.test.tsx`（done 折叠/展开、running 平铺、首展开懒加载）。更新 4 个含 `AgentSettings` 的测试 fixture 加 `exploreModelId: null`。

### 🧠 Design Intent (Why)

- 对齐 Cursor「通用 Task + 专精内置子代理」模式：`agent` 是「另开会话做大任务」（Panel 强调独立对象），`explore` 是「主流程里顺手的小探索」（内联折叠强调是主流程一部分、读完即收），二者在模型/scope/展示三点分叉，合并会让 preview/prompt 充满条件分支。
- `display` 判别字段而非新 preview kind：`explore` 与 `agent` 的数据形状、流式解析、transcript 机制完全一致，唯一差异是「内联 vs Panel」。用一个可选字段表达这个差异，比新开一套 kind 穿透 selectors/App/ConversationView/Modal 的所有 switch 风险小得多，且 TS 仍能保证路由正确。
- flash 缺 key 回落主模型：与 summarizer 缺 key 退化策略一致，保证「没配 DeepSeek key 的环境」功能不挂，只是 explore 跑主模型而非 flash。
- `exploreModelId` 走 `RunTurnInput`/main 注入而非 env：它是全局设置，和 `model` 同源、可在 turn 边界显式测试，不发明第二条 env 通道。
- `explore` block 不进 `WORK_TOOL_LIKE_KINDS`：它自身就是一个可折叠组，纳入外层 `Worked for` 会双重折叠；保持独立内联折叠更清晰。

### 📁 Files Modified

- `packages/shared/src/settings.ts`、`session.ts`、`session-selectors.ts`、`ipc.ts`
- `packages/agent-core/src/tools/tools/agent/{definition,explore-prompt,runner,index}.ts`
- `packages/agent-core/src/tools/{types,index}.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/prompt/main-agent.ts`
- `packages/agent-core/src/tools/test/explore-tool.test.ts`（新增）
- `packages/desktop/src/main/{index,agent-turn,settings-service}.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/{ExploreRunBlock.tsx（新增）,ToolActivityGroup.tsx,SubAgentTranscriptModal.tsx}`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/{explore-run-block.test.tsx（新增）,settings-page,app-streaming-user-message,kairos-settings,kairos-config-files}.test.tsx`
- docs：`design-docs/agent-explore-subagent.md`、`design-docs/agent-subagent-runtime.md`、`design-docs/index.md`、`exec-plans/active/20260606-explore-subagent.md`

### ✅ 验证

- `pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/agent-core typecheck`、`pnpm --filter @actspace/desktop typecheck`（含 electron tsconfig）全通过。
- `pnpm --filter @actspace/shared build`、`pnpm --filter @actspace/agent-core build` 产出 dist。
- `pnpm --filter @actspace/agent-core test` 全绿（591 测试），含新增 `explore-tool`。
- 受影响 renderer 测试全绿：`explore-run-block`(3)、`tool-activity-group`、`agent-run-block`、`app-streaming-user-message`、`settings-page`、`kairos-settings`、`conversation-view-tooltip`。
- 既有失败仅 `review-git-service.test.ts`（sandbox `git init` Operation not permitted），与本次无关。
- 待补（D4，留待用户验收）：`pnpm dev` 真机触发小探索，确认内联折叠不弹 Panel、跑 flash、`Worked for Xs` 真实耗时、浅/深双主题可读。

### 🔁 后续调整（同轮，16:25）

用户对照 Cursor 截图指出：之前从主 turn 工具组下线的「固定窗口滚动」其实正是 Explore 子代理**执行中**的状态，完成才是下拉。据此把 `ExploreRunBlock` 的执行中从「平铺」改为仿 Cursor「Exploring」实时视图——标题 `Exploring`（shimmer）+ 有界滚动窗口（`max-h-[168px]` + `overflow-y-auto`，新行钉底）。要点：滚动视口本身没错，错的是放错位置——它属于「小工具/思考行」的 Explore 执行中，不属于会塞进大块 agent panel 的主 turn 组。

### 🔁 后续调整 2（同轮，16:46）

用户再对照 Cursor 截图逐条反馈并要求先出方案再改，确认后实施：

- **执行中去盒子**：初版给滚动窗口加了 `bg-surface-subtle` 圆角盒子，「完整框」让用户误以为在调 agent 工具、且有隔离感。去掉底色/圆角，窗口与主流程同底色，仅保留 `max-h + overflow-y-auto` 滚动。
- **执行中加 chevron**：`Exploring` 头部补 chevron，可点折叠（默认展开）。
- **对齐修复**：`ExploreRunBlock` 外层去掉多余的一层 `px-[var(--conversation-text-inset)]`，折叠头与工具行各保留单层 inset，与外部 thinking / 最终回复对齐（此前双重缩进）。
- **完成头文案**：从 `<描述> · Worked for Xs` 改为 `Explored N files`（`N = stats.exploredFileCount`，0 退化 `Explored`），不再显示时间/描述；完成时自动收起。
- **过滤 usage 行**：内联视图过滤掉 `llm_usage`（`Usage Tokens …`），不展示。
- **自带折叠**：`ExploreRunBlock` 不再复用 `ToolActivityGroup`（running 需「带 chevron 展开态 + 有界滚动」，与主 turn 组「running=平铺无 toggle」契约冲突），改为内部 `expanded` 状态自管；`ToolActivityGroup` 回退掉上轮为 explore 加的 `label`/`onExpandedChange`（无其它消费者）。
- 工具集确认：explore 子代理只挂 `read_file`/`grep`/`glob`/`list_directory`，无需改。

同步设计文档「渲染契约」、learnings 旁注；`explore-run-block` 测试更新断言（`Explored 1 file` 折叠头、running `Exploring` 默认展开、视口无 `bg-surface-subtle`、usage 行不出现、懒加载）。`pnpm --filter @actspace/desktop typecheck` 与 `explore-run-block` / `tool-activity-group` 测试通过。
