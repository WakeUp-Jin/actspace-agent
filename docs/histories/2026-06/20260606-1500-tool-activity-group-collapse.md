## [2026-06-06 15:00] | Task: 主消息流工具流折叠与滚动视口

### 🤖 Execution Context

- **Agent ID**: `local-agent`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor / local`

### 📥 User Query

> 工具流展示前端两个问题：(1) 模型输出工具调用时往往也带 content 文本（如「我要调用读取工具看看」），希望前端把它显示出来并和工具绑定；(2) 大量工具输出会铺满屏幕，希望像 Cursor 一样用 `Worked for xxx` 折叠，且执行中用一个固定高度滚动视口展示过程行。先对齐方案再实现。

### 🛠 Changes Overview

**Scope:** `packages/desktop`（renderer）

**Key Actions:**

- **新增 `ToolActivityGroup`**：把一个 turn 内的「过程行」（thinking + 工具 + 工具间旁白 content）聚合展示。执行中直接平铺过程行（保持正常阅读节奏）；完成后塌缩成单行 `Worked for Xs`，默认折叠、可点开。（初版执行中曾用固定高度滚动视口，但子 Agent block 等大块塞进小窗口很憋屈，按用户反馈下线了滚动视口。）
- **`ConversationView` turn 二次分组**：新增 `splitTurnMessages`（末尾连续 assistant 块=最终回复，其余=过程段）、`hasToolLikeItem`、`workDurationMs` 与 `renderTurnBody`。含工具时过程进折叠组、最终回复留组外；纯问答 turn 回退到原平铺渲染。
- **抽共享 util `workedDuration.ts`**：把 `formatWorkedDuration` 从 `SubAgentTranscriptModal` 抽出，主消息流与子 Agent panel 共用同一套文案。
- **修复 `Worked for` 恒为 1s 的 bug（agent-core）**：根因是 `adapters.ts` 的 `createSessionEvent` 落盘时统一打 `new Date()`（flush 时刻），整轮事件挤在同一毫秒，时间差≈1ms → `max(1, round)=1s`。给 `createSessionEvent` 加可选 `occurredAtMs`，在 `userMessage / assistant / thinking / tool_call / tool_result` 转换时回填消息真实 `timestamp`，前端基于 `createdAt` 算出的 `Worked for Xs` 随之准确。
- **测试**：新增 `tool-activity-group.test.tsx` 覆盖折叠/展开、最终回复留外、执行中平铺、纯问答不折叠。

### 🧠 Design Intent (Why)

- 问题 1 的 content 后端其实已采集（`text_delta` → `assistant_message`，真实 session 验证有「好的，我先了解…」这类旁白），无需改后端；前端只需把旁白文本归进折叠组，即可自然实现「文字在上、工具在下」的绑定关系。
- 折叠范围按用户决策取「全部」（thinking+工具+旁白一起折叠），并仅在过程段含真实工具/diff 时才成组，避免把「只 thinking + 回答」的常见 turn 也包成 `Worked for`。
- 为避免流式期间「旁白文本被误判成最终回复 → 折叠 → 下一个工具到达 → 重新展开」的抖动：执行中（最后一个 turn 且 `isStreaming`）整段过程平铺、不出折叠 toggle；最终回复始终全宽渲染在组外。turn 结束后才塌缩成 `Worked for`。
- 复用子 Agent panel 已验证过的 `Worked for` 交互语言，不造第二套；耗时取过程首块 `createdAt` 到最终回复 `createdAt` 的差。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/messages/ToolActivityGroup.tsx`（新增）
- `packages/desktop/src/renderer/components/messages/workedDuration.ts`（新增）
- `packages/desktop/src/renderer/components/messages/SubAgentTranscriptModal.tsx`（改为引用共享 util）
- `packages/desktop/src/renderer/components/ConversationView.tsx`（turn 二次分组 + 渲染工具活动组）
- `packages/desktop/src/renderer/test/tool-activity-group.test.tsx`（新增测试）

### ✅ 验证

- `pnpm --filter @actspace/desktop typecheck` 通过。
- `pnpm --filter @actspace/desktop build:renderer`（vite build）通过，确认新 Tailwind 任意值类编译正常。
- 新增 + 既有 renderer 测试通过（tool-activity-group / conversation-view-tooltip / agent-run-block / app-streaming-user-message）。
- 浏览器 renderer 启动健康检查：`http://127.0.0.1:5173/` 正常加载空态、无白屏。
- 待补：真实 Electron 多工具 turn 的视觉确认与浅/深双主题目测（renderer 无 preload，无法在浏览器驱动 live model）。
