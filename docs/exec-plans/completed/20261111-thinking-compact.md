# 简化思考过程

## 目标

思考进行时不再把正文一路往下展开。设置里加一个「简化思考过程」开关（缺省开启）：开启时思考行固定一行，只显示 `Thinking 6s · 开头一句` 和扫光；关闭时保持现在的样子。

行为以 [中间消息区规范 › 简化思考过程](../../design-docs/frontend/front-中间消息区规范.md#简化思考过程) 为准，设置项见 [设置页规范 §3](../../design-docs/frontend/front-设置页规范.md)。本计划只写怎么改。

## 范围

- 包含：设置项 `general.simplifyThinking`；流式思考段记录开始时间和最后一个字的时间；`ThinkingBlock` 的简化样式；对应测试、规范、history。
- 不包含：
  - Web / 手机端（`apps/web` 的 `ThinkingRow`）。
  - 把思考用时写入会话。回复完成后重新展开 Worked、历史回读，标题仍是 `Thinking`。
  - 工具行、助手回复、等待模型提示、轨迹页、Context 面板。
  - 后端、Host、IPC 通道。

## 背景

- 必读：`AGENTS.md`、`docs/design-docs/frontend/front-新功能开发清单.md`、`front-中间消息区规范.md`、`front-设置页规范.md`、`docs/coding-standards/perf-memory-conventions.md`（T2、T4 在流式高频路径上）。
- 界面依据：`docs/design-docs/frontend/thinking-compact-demo.html` 的 D 格。
- 现状：
  - `apps/desktop/src/renderer/components/messages/ThinkingBlock.tsx`：`expanded` 初值是 `!replyCompleted && !message.collapsedByDefault`，流式思考的 `collapsedByDefault` 是 `false`，所以运行中一直展开。
  - `packages/client/client/src/live/stream-blocks.ts` 的 `streamingStateToBlocks`：流式思考块标题固定 `Thinking...`，最后一个 segment 才是 `running`；块上没有任何时间信息。
  - `packages/client/client/src/live/stream-state.ts` 的 `appendOrMergeSegment`：思考 delta 的唯一入口（`live-run.ts` 两处调用）。
  - 设置开关的现成写法：`general.showTurnCodeChanges`，涉及 `packages/util/shared/src/settings.ts`、`apps/desktop/src/main/settings/defaults.ts`、`migrations.ts`、`ConversationDisplaySection.tsx`、`components/turn-tail/useShowTurnCodeChanges.ts`。
- 约束：流式每个 delta、每帧渲染经过的代码，工作量不能随思考长度增长。

## 风险

- 风险：标题每秒变一次，带动整个消息流重渲染。缓解：计时器放在 `ThinkingBlock` 内部的子组件里，只有这一行重渲染；同一时间最多一段思考在运行。
- 风险：每次渲染都从头扫正文找开头一句。缓解：只看正文前 200 个字符；一旦取到就存进 ref，之后不再计算。
- 风险：`useShowTurnCodeChanges` 改成共用模块后，轮尾改动卡的行为变化。缓解：导出名和返回值不变，`turn-tail.test.tsx` 不改且必须通过。
- 风险：现有测试用 `getByRole("button", { name: "Thinking" })` 找标题。缓解：开关关闭和「已结束、不知道用时」两种情况标题文字不变；现有测试在 T5 里显式按开关关闭运行。

## 任务

顺序依赖：T1 → T2 → T3 → T4 → T5 → T6 → T7。

### T1 设置项

- `packages/util/shared/src/settings.ts`：`SettingsV4General` 加 `simplifyThinking?: boolean`，注释「思考进行时只显示一行标题；缺省视为开启」。
- `apps/desktop/src/main/settings/defaults.ts`：`general.simplifyThinking: true`。
- `apps/desktop/src/main/settings/migrations.ts`：`simplifyThinking: general.simplifyThinking !== false`。
- 测试：`apps/desktop/src/main/test/settings-characterization.test.ts` 加一条——旧快照没有这个字段时读出 `true`，写入 `false` 后读回 `false`。

### T2 流式思考段带时间

- `packages/client/client/src/live/run-state.ts`：`StreamingSegment` 的 `thinking` 分支加 `startedAtMs?: number`、`lastDeltaAtMs?: number`。
- `packages/client/client/src/live/stream-state.ts`：`appendOrMergeSegment` 加第五个参数 `nowMs = Date.now()`；`segType === "thinking"` 时，新建段写 `startedAtMs` 和 `lastDeltaAtMs`，合并段只更新 `lastDeltaAtMs`。`text` 段不写。
- `packages/util/shared/src/session/message-block.ts`：`thinking` 块加 `startedAtMs?: number`、`durationMs?: number`，注释「仅流式投影有；不写入会话」。
- `packages/client/client/src/live/stream-blocks.ts`：思考块带上 `startedAtMs`；`status` 为 `completed` 时带 `durationMs = max(1000, lastDeltaAtMs - startedAtMs)`。标题仍是 `Thinking...`（开关关闭时要用）。
- 测试：`apps/desktop/src/renderer/test/stream-blocks-identity.test.ts` 加两条——①两次思考 delta（`nowMs` 1000、4000）后接一个工具段，思考块 `status` 为 `completed`、`durationMs` 为 3000；②只有一次 delta 的已结束思考，`durationMs` 为 1000。

### T3 对话显示设置共用一个订阅

- 新建 `apps/desktop/src/renderer/components/conversation/display-settings.ts`：把 `useShowTurnCodeChanges.ts` 的模块级订阅搬过来，一次 `settingsApi.getV4()`、一个 `settingsChanged` 监听，保存 `{ showTurnCodeChanges, simplifyThinking }`；导出 `useShowTurnCodeChanges()` 和 `useSimplifyThinking()`，两者缺省都是 `true`，读取失败保持上一次的值。
- 删除 `components/turn-tail/useShowTurnCodeChanges.ts`，`TurnTail.tsx` 改从新文件引入。
- 验证：`turn-tail.test.tsx` 不改，全部通过。

### T4 ThinkingBlock 简化样式

- 新建 `apps/desktop/src/renderer/components/messages/thinking-title.ts`，纯函数：
  - `thinkingOpeningClause(content: string): string | null`：只看前 200 个字符，按规范取开头一句；结束标点还没到且宽度没超上限时返回 `null`。
  - `formatThinkingElapsed(ms: number): string`：`6s` / `1m 5s`，最少 `1s`。
- `ThinkingBlock.tsx`：
  - 读 `useSimplifyThinking()`。关闭时走现有代码，不改。
  - 开启时：`expanded` 初值恒为 `false`；`replyCompleted` 时收起的 effect 保留。
  - 标题拆成子组件 `ThinkingTitle`：运行中用 `setInterval` 每秒更新，秒数由 `Date.now() - message.startedAtMs` 算（没有 `startedAtMs` 时用组件挂载时间）；开头一句取到后存 ref 不再变。标题文字按规范表格四种状态生成，扫光沿用 `ToolLogShimmer`，`data-shimmer-text` 与标题文字一致。
  - 收起时箭头加 `opacity-0`，`group-hover` / `group-focus-visible` / 展开时可见。
- 样式只用现有 token 和 Tailwind 类，不新增 CSS 文件。

### T5 设置页开关与组件测试

- `ConversationDisplaySection.tsx`：加第二行「简化思考过程」，行说明用规范里的文案，写 `general.simplifyThinking`；保存中的禁用和错误提示两行共用现有状态。
- 新建 `apps/desktop/src/renderer/test/thinking-compact.test.tsx`（假计时器）：
  1. 开关开启、`status: "running"`：不渲染正文节点；标题是 `Thinking 1s`；推进 5 秒后是 `Thinking 6s`。
  2. 正文从「用户希望」增长到「用户希望思考过程不要打扰阅读。现在…」：第一句标点到达前标题没有 `·`，到达后是 `· 用户希望思考过程不要打扰阅读`；再追加第二段，短语不变。
  3. 点标题：正文出现；重渲染后仍展开；`replyCompleted` 后收起。
  4. `status: "completed"`、`durationMs: 9000`：标题 `Thought for 9s`；没有 `durationMs`：标题 `Thinking`。
  5. 开关关闭、`status: "running"`、`collapsedByDefault: false`：正文可见，标题是 `message.title`。
  6. `thinkingOpeningClause`：中文标点、英文 `. `（`file.ts` 里的点不算）、开头 `## ` 被去掉、超过宽度截断加 `…`、只有空白返回 `null`。
- `tool-stream-typography.test.tsx` 里现有的 Thinking 用例把开关设为关闭，断言不改。`app-streaming-user-message`、`conversation-view-tooltip`、`tool-activity-group` 三个文件断言的也是开关关闭时的样子（标题 `Thinking...`、运行中展开），在文件头把 `useSimplifyThinking` mock 成 `false`，断言不改。
- 设置页测试：切换开关调用 `onUpdateNamespace({ namespace: "general", patch: { simplifyThinking: false } })`。

### T6 文档

- 规范已在本分支写好（中间消息区、设置页、前端 README 的 demo 列表）；实现中有出入就改规范，保持一致。
- `docs/histories/2026-11/` 记一条 history。
- 本计划移到 `completed/`，更新 `docs/exec-plans/README.md` 和 `completed/README.md`。
- `docs/exec-runs/20261111-thinking-compact/` 写 `execution-process.md` 和 `execution-summary.md`。

### T7 验证

见下一节。全部通过后提交、推送、开 PR。

## 验证方式

- 命令（先 `pnpm install`，带代理）：
  - `pnpm --filter @actspace/desktop test`：全部通过，含新增用例。
  - `pnpm --filter @actspace/client test`：全部通过。
  - `pnpm typecheck`、`pnpm lint`：无错误。
  - `pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm check:hot-path-reads`、`pnpm check:scale-tests`、`pnpm check:docs`：通过。
- 手工检查（Electron，写进执行摘要）：
  1. 开关开启，发一个会长时间思考的问题：思考行始终一行，秒数每秒加一，开头一句出现后不变，下面的内容不被推走。
  2. 思考中点标题：正文展开并继续流式追加；再点收起。
  3. 思考后接工具再思考：第一行变成 `Thought for Ns`，第二段是新的一行，有自己的开头一句。
  4. 回复完成：整段收进 Worked；展开 Worked，思考行标题是 `Thinking`，点开能看到全文。
  5. 关闭开关再发一条：和改动前一样，正文边输出边展开。
  6. 深色主题、系统「减少动态效果」各看一遍。
  7. 子 Agent 面板里的思考行同样只有一行。

## 回退

单个 PR。合入后出问题，用户把开关关掉即回到原样；需要撤代码时整体 revert 这个 PR，`simplifyThinking` 字段留在已保存的设置里不影响读取。

## 进度记录

- [x] 2026-11-11 demo 四版，用户选定 D（开头一句固定不变）。
- [x] 2026-11-11 规范与本计划写完，用户审核通过。
- [x] T1 设置项（设置快照 golden 用 `UPDATE_SETTINGS_GOLDEN=1` 重新生成，只多了 `simplifyThinking: true`）
- [x] T2 流式思考段带时间
- [x] T3 对话显示设置共用一个订阅
- [x] T4 ThinkingBlock 简化样式
- [x] T5 设置页开关与组件测试（另加浏览器 mock 场景 `?mock=thinking`）
- [x] T6 文档
- [x] T7 验证；Electron 手工检查待做，见执行摘要

## 决策记录

- 2026-11-11：选 D（一行 + 开头一句）。A（只有用时）信息太少；B（下面一行翻句子）在模型输出快时仍然打扰；C（三行滚动窗口）仍有持续滚动的文字。
- 2026-11-11：开头一句固定为这段思考的第一个分句，出现后不换。按段落更换主题的做法被否决：换的时候仍会吸引视线，而且质量取决于模型怎么分段。
- 2026-11-11：开关放「通用 › 对话显示」，名字「简化思考过程」，缺省开启；只改桌面端。
- 2026-11-11：开关切换即时生效，没被点过、回复也没结束的思考行跟着切；规范同步改了这一条（原写「对之后出现的思考行生效」）。原因：设置是异步读到的，开启是缺省值，读到「关闭」时运行中的思考必须能回到原来的展开状态。
- 2026-11-11：开头一句里，标点后紧跟 `*` / `` ` `` / `_` 也算结束（`**Plan:** do it` → `Plan`），规范同步。
- 2026-11-11：用时不写入会话。写入需要改后端的消息内容契约，超出「只简化显示」的范围；代价是回复完成后重新展开 Worked 时标题没有用时。

## 执行模式

交互模式。

## 执行文档

开始实现时在 `docs/exec-runs/20261111-thinking-compact/` 创建 `execution-process.md` 和 `execution-summary.md`。
