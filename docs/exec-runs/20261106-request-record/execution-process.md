# 请求记录只在变化时写完整内容 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261106-request-record.md`
- **设计规范**：`docs/design-docs/agent-plugin-runtime/agent-spec-request-record.md`
- **执行模式**：交互
- **开始时间**：2026-11-06（规范、计划经用户确认后）
- **结束时间**：2026-11-06 23:30（自动化验证完成；实机对比待用户删除旧会话后重跑）

任务前后有依赖，全部由主智能体按 T1→T11 顺序自己写，没有开写作子智能体。

## 执行时间线

### T1 统一估算函数

- **操作**：新增 `@actspace/shared` 的 `token-estimate.ts`，照 DSH `dsh-token-meter`：
  - 文本 `Math.ceil(length / 4)`，非字符串先 `JSON.stringify`；
  - 每块加 4，每条消息加 4；
  - `ESTIMATOR_VERSION = "chars4-block4-message4"`。
- **替换**：`context-projection.ts` 的 `estimateTokens`、`content-manifest.ts` 的 `estimateContextTokens`、Harness 统计的 `tokensOf`、`loop.ts` 的容量检查、`compaction.ts` 的 `compactionTokens`、自动压缩的估算，全部改用它。
- **验证**：`token-estimate.test.ts` 4 例（中英文同口径、非字符串、块开销、消息开销）。

### T2 估算明细定义移到 shared

- **操作**：新增 `context-entries.ts`，包含：
  - `describeSystemEntries`、`describeToolEntries`、`describeSupplementEntry`（非对话项）；
  - `describeConversationEntries`、`estimateConversationNode`（对话项）；
  - `renderSystemPrompt`、`sortSystemSections`。
  - 分类和 key 格式不变。
- **引擎**：`describeContextContent` 改成薄封装，只负责组装输入，并补上预览和全文 map。
- **验证**：`context-entries.test.ts` 4 例；`content-manifest.test.ts` 迁移后结果与改前一致，算法差异除外。

### T3 两个新事件与 codec

- **codec**：`core-codecs.ts` 新增 `request/system-prompt` 和 `request/tools`。
  - 必须带 `requestId` / `turnId` / `stepId` / `digest`；
  - `sections`、`modelFacts`、`contributorProvenance`、`tools` 必须是数组。
- **关系校验**（`invariant-validator.ts`）：两种新事件只能出现在已打开、还没写 `request/context` 的请求里，每种最多一条。
- **读取函数**：shared 的 `request-record.ts` 提供 `effectiveRequestRecord`、`indexRequestRecords` 和 `isRequestRecordEvent`。
- **生成物**：重跑契约矩阵。
- **验证**：
  - `journal.test.ts` 新增正反例：数组校验、缺 digest、请求外写入、`request/context` 之后写入、重复写入；
  - `request-record.test.ts` 2 例。

### T4 Agent Loop 写入

- **`request-snapshot.ts`**：`requestRecords` 产出三样东西，即提示词记录、工具记录和 schemaVersion 3 的小快照。删除了 960 KB / 256 KB 裁剪和 `requestContentManifest`。
- **`loop.ts`**：首次请求和重试都在 `request/header` 之后与日志里最近一条比 digest，不同才写，再写 `request/context`。
- **旧拼装路径**（无 `contextSources`）：只有测试用，保留。它同样经过 `requestRecords` 写入，所以也遵守本规则。
- **验证**：`request-records.test.ts` 5 例，覆盖：
  - 首次写、不变不写；
  - 只写变化的部分；
  - 只有工具变化时只写工具；
  - 重试不重写；
  - 恢复会话后按日志比较；
  - 快照不含 §5 删除的字段。
- 另外 `context-conversion.test.ts` 断言快照里没有 `messages` / `contextManifest`。

### T5 压缩替换带被替换估算

- **`createCompactionReplacement`**：新增必填参数 `replacedTokens: { conversation, summarizedConversation }` 和 `estimatorVersion`。
- **codec**：`kind: "replace"` 时两者必填，且必须是非负整数。
- **`context-engine/src/compaction.ts`**：按节点是否是之前的摘要分开求和，`afterTokens` 复用同一结果。
- **验证**：codec 拒绝缺字段和负数；压缩事务测试检查两个数。

### T6 `contextEstimate` 投影

- **`context-estimate.ts`（shared）**：`applyContextEstimate` 按规范 §6.3 折叠，无关事件返回同一引用。
- **`durable-session.ts`**：用 `contextEstimate` 替换 `requestContext`。
- **删除**：`projectContextState` / `projectManagedContextState` / `browseContextState` 及其测试 `context-projection.test.ts`。
- **验证**：
  - `context-estimate.test.ts` 7 例，含「与引擎同一输入数字相同」和「1000 条消息后状态大小不变」；
  - `durable-session.test.ts`：冷重放与在线一致；只在变化时推送，且推送值冻结共享。

### T7 圆环、Web、面板

- **client**：`selectors.ts` / `chat.ts` 的 `contextState` / `contextSnapshot` 改读 `contextEstimate`。
- **Web**：`session-observer.ts` 的百分比改读新投影。
- **桌面**：
  - 删除 `describeComposer`、`describeContext` IPC 和 `use-current-context.ts` 轮询；
  - `WorkbenchLayout.tsx` 与 `composer-run-context.ts` 只用投影；
  - 同步 desktop-bridge 契约、preload 和 mock。
- **面板「当前」**：总数、分类、非对话项来自投影；对话项现算。引擎在线时用引擎实例，不在线时用日志 surface。
- **验证**：
  - `context-panel-estimate.test.ts` 3 例：圆环与面板同数；引擎离线时有对话明细；在线时用引擎预览；
  - `check:ipc-channels`、`check:renderer-bridge` 通过。

### T8 SQLite 历史投影与 Harness 统计

- **`context-history-projection.ts`**：
  - 按会话把折叠状态存进新表 `context_estimate_state`；
  - 每个 `request/context` 时写 `context_request` 和 `context_manifest_entry`，后者只留最近 2 次请求；
  - 「工具清单已变化」改由第一条之后的每条 `request/tools` 触发。
- **删除**：`persisted-manifest.ts` 与 `readPersistedContextManifest`。
- **版本**：`CONTEXT_PROJECTOR_VERSION` 改为 4，`usage-read-model.sqlite` 的 `user_version` 改为 17。已有派生库会整库重建。
- **对比上一次请求**：seq 在上一次 `request/context` 之后的对话项算新增（`context-history-query.ts`）。
- **Harness 统计**：
  - 分类和逐项改读同一个折叠；
  - 技能目录读 `request/system-prompt` 的模型事实；
  - 工具曝光读 `request/tools`。
- **脚本**：6 个桌面脚本改成新事件格式。
- **验证**：
  - `context-history-estimate.test.ts` 4 例：工具变化事件、逐次分类与压缩后下降、小批次索引结果一致、新增对话项；
  - `harness-stats.test.ts`、`context-paths.test.ts`、`context-bash-projection.test.ts` 改成新格式。

### T9 轨迹、历史窗口、disclosure

- **轨迹 `builder.ts`**：
  - 每个请求按 `indexRequestRecords` 取生效记录；
  - 系统行锚在 `request/context` 上，比较固定系统文本和工具 digest，规则和技能分段变化不出系统行；
  - 删除了 `inheritPrompt`、`promptUnchanged` 和 `systemPromptParts`。
- **`context-sections.ts`**：改成比较相邻两条 `request/system-prompt`。
- **fixtures**：`trajectory-complete.json` 和 `fixtures.ts` 改成新事件。
- **历史窗口**：
  - `journal-cache.ts` 的事件索引新增 `prompts` / `toolSets` 两组 seq；
  - `session-controller.ts` 的窗口不从头开始时，二分查找起点之前最近的两条记录，放到窗口最前面；冷路径和 live 路径都处理；
  - `slimHistoryWindow` 删除对 `request/context` 的裁剪；
  - 轨迹把 seq 小于 `history.fromSeq` 的记录只当基准。
- **disclosure**：`plugin.ts` 改读边界前生效的 `request/system-prompt` 的 `contributorProvenance`。
- **验证**：
  - 轨迹新增「提示词与工具记录只投影成系统行」「窗口起点在记录之后，系统行和工具 Schema 仍在」，以及上下文分段的基准测试；
  - runtime 新增「把窗口前的记录带进后一页」，冷 / live 两条路径都覆盖；
  - disclosure 新增「只在生效提示词列出 disclosure 时跟踪读取」。
  - 后两例都先在旧代码上确认失败。

### T10 文档与记录

- **影响文件**：
  - `agent-token-usage-and-context-state.md`：重写 Request Snapshot 和 Context Projection 两节；
  - `Context数据结构和模型输入数据结构的设计规范.md`；
  - `05-Context面板与SQLite联合设计.md`：在开头注明被取代的部分；
  - `01-总体设计与调用流程.md`、`agent-progressive-disclosure.md`；
  - `front-轨迹视图规范.md`；
  - `agent-spec-dsh-event-model.md`：核心事件 12 → 14，并更新事件表和时序图；
  - `agent-tool-plugin-boundaries.md`、`agent-spec-agent-scope-model.md`；
  - `agent-spec-runtime-projection.md`（投影表、历史窗口）、`agent-spec-live-assistant-stream.md`（指向新投影）；
  - `core-storage-and-observability.md`、`agent-observability-trace-model.md`；
  - `agent-context-model-facts-and-composer.md`、`agent-english-learning.md`、`11-Harness统计设计.md`；
  - `docs/tools/session-viewer/`（README 与查看器的核心事件列表）；
  - `design-docs/index.md`、`exec-plans/README.md`。
- **状态**：规范状态改为「已实现」。

### T11 验证

- **typecheck**：根目录 `pnpm typecheck` 通过。
- **测试**：各包测试结果见执行摘要。
- **检查**：以下全部通过：
  - `check:current-docs`、`check:docs`；
  - `check:ipc-channels`、`check:renderer-bridge`；
  - `check:packages`、`test:contract-matrix`；
  - `check:harness-events`、`check:v2-legacy-removal`。
- **真实 Electron**：`verify-trajectory-electron.mjs` 11 项全部通过（重新构建 renderer 与 electron 后运行，使用临时数据目录）。
- **补充说明**：session-journal、session-persistence、agent-loop 要用各自的 `pnpm test`（带 `--globals`）运行，直接 `vitest run` 会报 `describe is not defined`。
- **残留 grep**：`promptUnchanged`、`browseContextState`、`projectContextState`、`projectManagedContextState`、`readPersistedContextManifest`、`describeComposer` 都是 0。其余命中都不是日志字段：
  - `renderedSystemPrompt` / `systemSections` 是 `@actspace/prompt` 内存里 `LogicalRequestCandidate` 的字段，旧拼装路径和 english-learning 使用；
  - `snapshot.messages` / `snapshot.tools` 是会话投影快照的字段；
  - `contextSections` / `contextModelFacts` 是轨迹 `TrajectoryPromptDetail` 的显示字段；
  - `requestContext` 是轨迹请求详情字段和 Harness 统计的私有方法名；
  - `contextManifest` 只出现在 composition 的变量名和「字段已删除」的断言里。

## 问题与处理

- **问题**：轨迹在分段变化时会多出一条系统行。
  - **处理**：照 DSH，系统行只比较固定系统文本和工具 digest，规则和技能的变化交给上下文行。
- **问题**：`trajectory-timeline-view` 浮点宽度断言失败。
  - **处理**：原因是旧 fixture 在 builder 改动后没有系统行；改 fixture 后通过。
- **问题**：disclosure 测试日志违反关系校验（请求未关闭就结束 step、上一轮未结束就开新轮）。
  - **处理**：每个请求各开一轮，并用 `assistant/message`、`step/end`、`turn/end` 收尾。
- **问题**：桌面 typecheck 报测试辅助函数返回 `unknown[]`。
  - **处理**：改为返回 `Json`。
- **问题**：english-learning 的 runtime 测试仍在 `request/context` 里找提示词。
  - **处理**：改为检查 `request/system-prompt`。
- **问题**：新文档链接相对路径多了一层，`check:current-docs` 报断链。
  - **处理**：已修正。

## 未完成与交接

- **实机对比（规范 §9）**：需要用户删除旧会话后，在同一工作区用 `tmp/heap/monitor.mjs` 重跑并与 run2 比较。
- **旧会话**：按规范 §8 不兼容。旧会话打开后缺少提示词记录，轨迹系统行和面板非对话项会为空，但不会崩溃。
- **Electron 实机**：圆环与面板同数、趋势图、工具变化事件、轨迹系统行在历史翻页后仍显示等，都待实机确认。
