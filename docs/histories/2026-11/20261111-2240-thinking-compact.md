## [2026-11-11 22:40] | Task: 简化思考过程

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`（demo、规范与计划阶段为 `claude-fable-5-2`）
- **Runtime**: `Claude Code CLI (macOS)`

### 📥 User Query

> 思考组件运行时会直接把正文显示出来，高度一直往下走，打扰性很强。在设置里加一个开关：关闭时保持现在的样式，开启时只显示时间和一层闪光。先做几版 HTML demo 给我看。

### 🛠 Changes Overview

**Scope:** `apps/desktop`、`packages/client/client`、`packages/util/shared`、`docs/`

**Key Actions:**

- **设置项**：`general.simplifyThinking`，缺省开启，放在「设置 › 通用 › 对话显示」。
- **思考行**：开启时运行中固定一行 `Thinking 6s · 开头一句` 加扫光，不展开正文；本轮内结束后 `Thought for 9s`；点标题仍可展开全文。开头一句取这段思考的第一个分句，出现后不变。
- **用时**：流式思考段记下第一个字和最后一个字的时间，只在流式状态里，不写入会话。
- **订阅**：「显示本轮代码改动」和新开关共用一次设置读取（`conversation/display-settings.ts`）。
- **mock**：新增浏览器场景 `?mock=thinking`。

### 🧠 Design Intent (Why)

- demo 选了 D：A 只有用时，信息太少；B（下面一行翻句子）在模型输出快时仍然打扰；C（三行滚动窗口）仍有持续滚动的文字。开头一句固定不换，因为按段落更换时仍会吸引视线，而且质量取决于模型怎么分段。
- 用时不落盘，是因为这次只简化显示；写入会话要改后端的消息内容契约。

### 📁 Files Modified

- `packages/util/shared/src/{settings.ts,session/message-block.ts}`
- `packages/client/client/src/live/{run-state,stream-state,stream-blocks}.ts`
- `apps/desktop/src/main/settings/{defaults,migrations}.ts`、`src/main/test/settings-characterization.test.ts` 与设置 golden
- `apps/desktop/src/renderer/components/{messages/ThinkingBlock.tsx,messages/thinking-title.ts,conversation/display-settings.ts,turn-tail/TurnTail.tsx,settings/sections/ConversationDisplaySection.tsx}`；删除 `turn-tail/useShowTurnCodeChanges.ts`
- `apps/desktop/src/renderer/mock/scenarios/{thinking,index}.ts`
- `apps/desktop/src/renderer/test/`：新增 `thinking-compact.test.tsx`；`stream-blocks-identity`、`tool-stream-typography`、`app-streaming-user-message`、`conversation-view-tooltip`、`tool-activity-group` 按开关关闭运行
- 文档：`front-中间消息区规范.md`、`front-设置页规范.md`、`frontend/README.md`、`FRONTEND_VERIFICATION.md`、计划与执行记录、demo `thinking-compact-demo.html`
