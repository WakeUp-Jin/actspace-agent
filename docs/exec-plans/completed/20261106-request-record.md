# 请求记录只在变化时写完整内容，估算从日志推算

## 目标

按设计规范 [agent-spec-request-record.md](../../design-docs/agent-plugin-runtime/agent-spec-request-record.md)：

- 提示词、工具拆成两个只在变化时写的事件；
- `request/context` 只留小字段；
- token 估算统一成一套算法，全部从日志推算，压缩替换事件记录被替换部分的估算。

同一工作区重跑一次，日志总大小和 `request/context` 单条大小明显下降（run2：9.1 MB，单条最大 440 KB），原来 `requestContext` view 那 0.7 GB 分配消失，面板、统计、轨迹功能不变。

## 范围

- 包含：规范 §3–§7 全部条目。
- 不包含：
  - 系统提示词进对话（DSH `system/message`）；
  - `request/header` 改成变化才写；
  - 旧会话兼容与迁移（开发阶段，用户自行删除旧会话）；
  - 无关界面改动。

## 背景

- 必读：
  - 上面的设计规范；
  - [Runtime Projection](../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)；
  - [流式输出只走实时通道](../../design-docs/agent-plugin-runtime/agent-spec-live-assistant-stream.md) §7 的投影约束。
- 证据：`tmp/heap/run2/`（`journal-copy.jsonl`、`main.heapprofile`）。
- DSH 参考：
  - `tmp/deepseek-harness/packages/llm/token-meter/src/breakdown-projection.ts`、`estimate.ts`；
  - `packages/core/session/src/request-header.ts`。

## 任务（按顺序；前后有依赖，由主智能体自己写）

### T1 统一估算函数

- `@actspace/shared` 导出 DSH 同款估算（规范 §6.1）：
  - `estimateText(text)` = `Math.ceil(length / 4)`；
  - `estimateValue(value)`：字符串直接算，其他先 `JSON.stringify`；
  - `BLOCK_OVERHEAD = 4`、`MESSAGE_OVERHEAD = 4`，以及按块、按消息计价的函数；
  - `ESTIMATOR_VERSION`。
- 替换掉 `context-projection.ts` 里现有的 `estimateTokens`（包括今天刚改的 charCode 版本）。
- 改用它的地方：
  - `context-engine/src/content-manifest.ts` 的 `estimateContextTokens`（删掉，调用方改用 shared）；
  - `harness-stats-projection.ts` 的 `tokensOf`；
  - `loop.ts` 的 `checkContextCapacity`；
  - `context-engine/src/compaction.ts` 的 `compactionTokens`；
  - 自动压缩里的 manifest 估算。
- 测试：
  - shared 的算法测试（已有）；
  - 按块、按消息的开销计算各一例。

### T2 估算明细定义移到 shared

- `describeContextContent` 的分类与 key 逻辑改成 `@actspace/shared` 里的纯函数 `describeContextEntries(input)`。
  - 输入：系统各段、模型事实（含来源）、工具、补充项、对话节点、摘要 messageId 集合。
  - 输出：entries、buckets、total。
- 拆成「非对话项」和「对话项」两个函数，投影只用前一个。
- `renderSystemPrompt` 一起移到 shared。
- 引擎的 `describeContextContent` 改成薄封装：组装输入后调用它，`preview` / 全文 map 仍由引擎生成。
- 测试：`content-manifest.test.ts` 迁移，结果与改前一致（算法差异除外）。

### T3 两个新事件与 codec

- `session-journal/src/core-codecs.ts`：
  - 新增 `request/system-prompt`、`request/tools` 两个 codec。
  - 校验：`requestId` / `turnId` / `stepId`；`digest` 必须是字符串；`sections` / `modelFacts` / `tools` 必须是数组。
- `invariant-validator.ts`：
  - 两种新事件只能出现在已打开、还没写 `request/context` 的请求里；
  - 同一请求里每种最多一条。
- 读取函数（shared）：
  - `effectiveRequestRecord(events, atSeq)`：返回不晚于 `atSeq` 的最近一条提示词与工具；
  - `systemPromptDigest(...)`、`toolsDigest(...)`：sha256，规范化 JSON。
- 契约矩阵：`pnpm gen:contract-matrix`。
- 测试：
  - codec 正反例；
  - 不变量：请求外、`request/context` 之后、重复写都被拒绝；
  - 读取函数取到正确的那一条。

### T4 Agent Loop 写入

- `loop.ts`：
  - 首次请求（`:192` 附近）和重试（`:265` 附近）在 `request/header` 之后，分别与日志里最近一条 `request/system-prompt` / `request/tools` 比较 digest，不同才写；
  - 然后写精简后的 `request/context`。
- `context-engine/src/request-snapshot.ts`：
  - 改成产出三样东西：提示词记录、工具记录、`request/context` 快照（规范 §5）；
  - 删掉 960 KB / 256 KB 裁剪逻辑、`requestContentManifest` 和 `messages` 等字段。
- 旧拼装路径（无 `contextSources`，`assembler.finalize`）：生产代码不用（只有 `testing.ts` 用）。先确认能否连同 `@actspace/prompt` 里的 `request-snapshot` 一起删除；不能删就让它也走本规则。
- 测试（agent-loop）：
  - 第一次请求写两种新事件；
  - 第二次请求内容不变时不写；
  - 工具变化只写 `request/tools`；
  - 重试不重写；
  - 恢复会话后第一次请求，内容不变时不写；
  - `request/context` 不含规范 §5 删除的字段。

### T5 压缩替换带被替换估算

- `session-journal/src/compaction.ts` 的 `createCompactionReplacement` 增加必填参数 `replacedTokens: { conversation, summarizedConversation }` 和 `estimatorVersion`，写进 `surface/replaced.data`。
- `surface/replaced` 的 codec：`kind: "replace"` 时必须带这两个字段，且都是非负整数。
- `context-engine/src/compaction.ts`：提交时用 T1 的函数，按节点是否属于摘要（`summaryIds`）分别求和，然后传入。`afterTokens` 复用同一结果。
- 渲染进程 mock `mock/scenarios/compaction.ts` 同步。
- 测试：
  - 压缩事务里替换事件带正确的两个数；
  - 缺字段的 `replace` 被 codec 拒绝。

### T6 `contextEstimate` 投影

- `packages/core/runtime/src/projection/durable-session.ts`：
  - 用 `contextEstimate` 替换 `requestContext`，按规范 §6.3 折叠；
  - 只在规范列出的事件上返回新状态，其余返回原引用；
  - `stateVersion` 加一。
- 折叠逻辑写成纯函数，放在 `@actspace/shared`（`context-estimate.ts`），供 T7、T8 复用。
- view：总数、六个分类、上下文窗口、`percentUsed`、非对话明细、`throughJournalSeq`。
- `packages/util/shared/src/runtime-v2/projection.ts` 的 key 列表同步。
- 删除：
  - `context-projection.ts` 的 `projectContextState` / `projectManagedContextState` / `browseContextState` 读取；
  - 只为它们存在的类型。
- 测试：
  - 追加、提示词变化、工具变化、补充增删、压缩替换后的分类与总数；
  - 无关事件返回同一引用；
  - 状态大小不随消息数增长：1000 条消息后状态的 JSON 长度与 10 条时相同量级。

### T7 读取方：圆环、Web、面板

- `packages/client/client/src/sessions/selectors.ts`、`chat.ts`：
  - `contextState` / `contextSnapshot` 改读 `contextEstimate`；
  - 删掉 `projectContextSnapshot` 里直接调 `projectContextState` 的分支。
- `apps/web/src/sessions/session-observer.ts`：百分比改读新投影。
- 桌面：
  - `context-panel-service.ts`：
    - `describeComposer` 删除，`describeContext` IPC 与 `use-current-context.ts` 轮询一并删除；
    - `WorkbenchLayout.tsx` 与 `composer-run-context.ts` 只用投影；
    - 同步 `desktop-bridge` 契约、preload、mock handlers，跑 `check:ipc-channels`、`check:renderer-bridge`。
  - `describe` 的「当前」：
    - 总数、分类、非对话明细来自投影；
    - 对话明细按规范 §6.3.2 现算：引擎在线用引擎实例，否则用日志 surface，调用 T2 的对话项函数。
- 测试：
  - 圆环与面板「当前」在同一快照下数字相同；
  - 引擎不在线时面板仍有对话明细。

### T8 SQLite 历史投影与 Harness 统计

- `context-history-projection.ts`：
  - 在内存里维护一份 T6 的折叠状态（按会话）；
  - 遇到 `request/context` 时，按当时的状态写 `context_request`（总数、分类、模型）和 `context_manifest_entry`（非对话明细，只保留最近 2 次请求）；
  - 「工具清单已变化」：第一条之后，每条 `request/tools` 记一次事件；
  - 删除 `readPersistedContextManifest` 及 `persisted-manifest.ts`；
  - `CONTEXT_PROJECTOR_VERSION` 加一，触发重建。
- `context-history-query.ts`：对比上一次请求的对话项按规范 §6.4 处理，即 seq 在上一次请求之后的算新增。
- `harness-stats-projection.ts` 的 `requestContext()`：
  - 分类、总数、逐项改读同一个折叠状态；
  - 技能目录改读 `request/system-prompt` 的模型事实；
  - 工具曝光改读 `request/tools`；
  - 估算误差统计口径随之变化。
  - 找到 harness 统计的重建触发方式（`usage-read-model-worker.ts` 的 `last_rebuild_at` 或数据版本），让已有数据重建。
- 脚本：
  - `test-context-read-model.mjs`、`benchmark-context-read-model.mjs`、`create-context-acceptance-fixture.mjs`、`verify-usage-runtime.mjs`、`benchmark-usage-journal.mjs`、`verify-trajectory-electron.mjs` 改成新事件格式；
  - 能跑的都跑一遍。
- 测试：
  - `harness-stats.test.ts`、上下文历史测试改成新格式，补「工具变化事件来自 `request/tools`」一例；
  - 趋势图逐次请求的分类正确；
  - 压缩之后趋势图的总数下降。

### T9 轨迹、历史窗口、disclosure

- 轨迹：
  - `builder.ts` 的系统行、工具 Schema、「原始内容」改用 `effectiveRequestRecord`；
  - 删除 `inheritPrompt` / `promptUnchanged`；
  - `context-sections.ts` 改成比较相邻的 `request/system-prompt`；
  - `requests.ts` 只读 `requestOptions`，不变；
  - `fixtures.ts`、`fixtures/trajectory-complete.json` 改成新格式。
- `session-controller.ts` 的 `slimHistoryWindow`：
  - 删掉 `request/context` 的裁剪；
  - 窗口不从头开始时，把窗口起点之前最近一条 `request/system-prompt` 和 `request/tools` 加进窗口（`HISTORY_PAGE_TURNS` 加载处 `:115`）；
  - 翻页（`afterSeq`）时同样处理。
- `context-disclosure/src/plugin.ts`：`disclosureEnabled` 改读 `request/system-prompt` 的 `contributorProvenance`，起点用边界前最近一条。
- 测试：
  - 轨迹系统行与上下文增减记录；
  - 只加载最后 20 轮时系统行仍有内容；
  - disclosure 启用判断。

### T10 文档与记录

- 更新：
  - `agent-token-usage-and-context-state.md`（`request/context` 与估算来源）；
  - `Context数据结构和模型输入数据结构的设计规范.md` 第 216 行附近；
  - `05-Context面板与SQLite联合设计.md`；
  - `front-轨迹视图规范.md`（系统行来源）；
  - `docs/tools/session-viewer/README.md`（新事件）。
- 规范状态改成「已实现」。
- 写执行记录 `docs/exec-runs/20261106-request-record/` 与 history。

### T11 验证

- 命令：
  - `pnpm typecheck`；
  - 涉及包的测试：shared、session-journal、session-projection、agent-loop、context-engine、context-disclosure、runtime、client、`apps/desktop` 全量、`apps/web`；
  - `check:current-docs`、`check:docs`、`check:ipc-channels`、`check:renderer-bridge`、`check:packages`、`test:contract-matrix`。
- 实机（用户删除旧会话后）：同一工作区重跑记录器，对比规范 §9 的各项。

## 风险

- **读取方漏改。** 按 grep 清单逐个改，包括 `contextManifest`、`renderedSystemPrompt`、`systemSections`、`contextSections`、`contextModelFacts`、`snapshot.tools`、`snapshot.messages`、`contributorProvenance`、`promptUnchanged`、`requestContext`。T11 前再 grep 一次确认没有残留。
- **历史窗口缺提示词。** T9 专门测「只加载后半段」。
- **压缩后合计偏差。** 替换事件的估算和投影用同一个函数，测试覆盖压缩前后的合计。
- **估算口径变化。** 算法与引擎现在的「字数 ÷ 4」基本相同，只多了每块、每条消息的开销，实测整体平均偏低约 3%。自动压缩触发时机基本不变。
- **回退方式：** 每个任务单独可验证；T4 之前的改动不改变写入格式。

## 进度记录

- [x] T1 统一估算函数（2026-11-06）
- [x] T2 估算明细定义移到 shared（2026-11-06）
- [x] T3 两个新事件与 codec（2026-11-06）
- [x] T4 Agent Loop 写入（2026-11-06）
- [x] T5 压缩替换带被替换估算（2026-11-06）
- [x] T6 `contextEstimate` 投影（2026-11-06）
- [x] T7 圆环、Web、面板（2026-11-06）
- [x] T8 SQLite 历史与 Harness 统计（2026-11-06）
- [x] T9 轨迹、历史窗口、disclosure（2026-11-06）
- [x] T10 文档与记录（2026-11-06）
- [x] T11 验证（2026-11-06；实机 §9 对比待用户删除旧会话后重跑）

## 决策记录

- 2026-11-06：用户确认对齐 DSH。
  - A1 提示词单独成事件，不进对话；
  - B1 工具单独成事件；
  - C1 `request/header` 每次写；
  - D2 估算不进日志；
  - 统一算法，照 DSH：4 字 1 token，每块、每条消息加 4 token，自动压缩和容量检查也用它；圆环与面板用同一个估算数；
  - 删除 `browseContextState`；
  - 旧会话不兼容；
  - 压缩替换按 DSH 在替换事件上记录被替换估算。

## 执行模式

交互模式：持久格式与投影改动，人在线。

## 执行文档

`docs/exec-runs/20261106-request-record/execution-process.md`、`execution-summary.md`。
