# 性能第三轮：高频路径不再整份读日志 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261108-perf-round3.md`
- **执行模式**：交互（Cursor Cloud Agent，用户授权「开始执行吧」后自主完成）
- **开始时间**：2026-11-09
- **结束时间**：2026-11-09
- **分支**：`cursor/perf-round3-hot-path-scale-tests-7891`

## 执行时间线

执行顺序是 R4 → R2 → R1 → R3，先做改动面最小、其他三项都会受益的一项。每项都按「先写规模测试，确认在旧代码上失败，再改代码」做，数字记在各步骤里。

### 步骤 1：R4 从文件读旧事件不再深拷贝（`45b675b1`）

- **操作**：`session-journal/src/event-envelope.ts` 新增 `freezeSessionJson`（校验 + 深冻结，不复制）；`session-persistence-jsonl/src/event-history.ts` 的 `readEvents` 改用它。
- **影响文件**：上述两处；新增 `session-persistence-jsonl/src/test/event-history.scale.test.ts`。
- **决定**：保留读回时的 `validateJsonValue` 与大小校验（文件可能被外部改过），只去掉「序列化再解析一份」这一步。
- **验证**：规模测试旧实现读 10k 条调 `snapshotSessionJson` 10004 次，新实现 0 次；1k 与 10k 读回的对象仍被冻结、与写入相等。

### 步骤 2：R2 每次请求不再逐条读压缩摘要（`1a300840`）

- **操作**：`SessionSurfaceEntry` 增加 `compactionId`，`surface.apply` 处理 `surface/replaced` 时顺手记下；`agent-loop/src/loop.ts` 的 `contextInput` 改成从 surface 取 `compactionSummaries(surface)`，不再对每个条目 `journal.readEvents(seq, seq + 1)`。
- **影响文件**：`session-journal/src/surface.ts`、`agent-loop/src/loop.ts`、`agent-loop/src/testing.ts`（`session` 选项）；新增 `agent-loop/src/test/context-input.scale.test.ts`。
- **验证**：旧实现两次请求之间的归档读取 1k 为 337 条、10k 为 1533 条；新实现两者相等且 ≤ 16。已信任视图版本号未变。
- **golden 的处理（步骤 8 才发现）**：`apps/desktop` 的 `context-trusted-equivalence`、`surface-derived-equivalence` 两份 golden 把 surface 条目原样序列化比较，新字段 `compactionId` 让它们失败。核对后确认该字段不进 `messages`、manifest 和请求记录（`requestRecords` 只取 `replaceGeneration`），所以在两份测试里比较前抹掉这个键（与 `instanceGeneration` 同一处理），golden 本身不动、仍是改前代码的输出；抹掉后全部一致。

### 步骤 3：R1 自动审查不再整份读日志（`12810fea`）

- **操作**：`auto-review/src/context.ts` 改成可增量折叠的纯函数：`createReviewContext` / `reduceReviewContext` / `reviewSnapshot`，`reviewConversation(events)` 保留为整份折叠的包装。`runtime/src/harness/review-session-action.ts` 改用 `session.journal.project(REVIEW_CONTEXT, …)` 取按会话常驻的状态，当前 `tool/call` 从状态里的有界 `toolCalls`（最近 64 个，按 `callId`）取；审查后的检查改为 `journal.eventsAfter(revision)`，只看审查期间新增的事件。
- **影响文件**：上述两处；`review-session-action.test.ts` 重写为 `fakeSession`；新增 `review-session-action.scale.test.ts`。
- **决定（偏离计划方案 A）**：计划里的方案 A 是对话部分改用 surface 视图。开工前核对发现 `reviewConversation` 的测试「Use original messages even after compaction」明确要求压缩之后审查仍看到原始消息，而 surface 视图里这些已被压缩摘要替换；云端无法当场问用户，所以**保留原语义**，用增量投影达到同样的目标：第一次审查仍回放一次整份日志（打开会话的一次性成本），之后每次只折叠新增事件。审查上下文本身有 64 000 字符上限（`overflow`），常驻状态不会无限长。
- **验证**：旧实现第二次审查从归档读 1k 为 1008 条、10k 为 19008 条；新实现 1k 与 10k 相等且 ≤ 16，且结果与 `reviewConversation(journal.readEvents())` 完全相等。

### 步骤 4：R3 子 Agent 面板不再每秒整份读日志（`8f1e6d4b`）

- **操作**：`client/src/sessions/subagent-list.ts` 把 `projectSubagentItems` 拆成 `SubagentListState` + `reduceSubagentList`（legacy 调用参数、有界的最近 `tool/call`、`lastMessages`、`delegations`）；`SessionController` 与 `agent-service` 新增 `inspectEventsAfter(sessionId, afterSeq)`，桌面端契约新增 `inspectSessionEventsAfter`；`fixed-renderer-ipc.ts` 按会话缓存折叠状态（LRU 16 个），`getSubagents`、`revealSubagentRecord` 共用，dispose 时清空。
- **影响文件**：`packages/client/client/src/sessions/{subagent-list,chat}.ts`、`packages/core/runtime/src/session/session-controller.ts`、`packages/core/agent-service/src/application.ts`、`apps/desktop/src/main/runtime-v2/{runtime-registry,fixed-renderer-ipc}.ts`；新增 `apps/desktop/src/main/test/subagent-list-ipc.scale.test.ts`、`packages/client/client/src/test/subagent-list-fold.test.ts`。
- **决定**：legacy `delegation/*` 事件的描述来自更早的 `tool/call`，所以状态里保留一个有界（64）的最近 `tool/call` 缓冲，`delegation/requested` 到达时把对应参数移入 legacy 表；两种到达顺序都有测试。`getSubAgentTranscript` 读的是子会话自己的日志、频率低，没改，基线里保留 1 处。
- **验证**：旧实现连续轮询 10 次归档读取 1k 为 4392 条、10k 为 85428 条；新实现第二次起为 0。随机事件序列（8 个种子 × 160 条）上，增量结果在每个前缀都等于整份重算。

### 步骤 5：规模测试覆盖检查（`d8fe2499`）

- **操作**：新增 `scripts/scale-test-coverage.json`（`entries`：高频入口 → `*.scale.test.ts`；`pending`：基线里仍整份读日志但还没有规模测试的文件，各写原因）和 `scripts/check-scale-test-coverage.mjs`；接入根 `pnpm test`（`check:scale-tests`、`test:scale-tests`）。
- **检查内容**：登记的源文件和测试都存在且以 `.scale.test.ts` 结尾；每个规模测试同时比较 1k 与 10k、用 `@actspace/session-journal/testing` 的读取计数、不用 `performance.now` / `Date.now` 计时（除非 `perf-allow`）；仓库里所有 `*.scale.test.ts` 都已登记；hot-path-reads 基线里仍整份读日志的文件要么有规模测试要么在 `pending`；`pending` 里的文件一旦有了规模测试或不再读日志就要删掉。
- **同步**：`perf-memory-conventions.md` §8 增加覆盖检查一行与写法要求；`AGENTS.md` 提交前检查加 `pnpm check:scale-tests`；R4 的规模测试补上 1k 对照以满足检查。

### 步骤 6：收紧 hot-path-reads 基线（`24910abc`）

- **操作**：`node scripts/check-hot-path-reads.mjs --update-baseline`。`loop.ts` 的 `per-entry-read` 1 → 0，`review-session-action.ts` 的 `full-iterate` 2 → 0，`fixed-renderer-ipc.ts` 的 `inspect-events` 3 → 1。

### 步骤 7：文档

- `perf-backlog.md` P1–P4 移到「已完成」并写提交号与规模测试数字；上一轮两项补上提交号 `015b273f`、`297e170c`。计划移入 `completed/`，两份索引同步；本执行记录与 history。

### 步骤 8：全量验证

- `pnpm lint`、`pnpm typecheck` 通过；根 `pnpm test` 的脚本检查链（含 `check:hot-path-reads`、`check:scale-tests`、`check:docs`、契约矩阵）通过——契约矩阵因 agent-service 新增 `inspectSessionEventsAfter` 需要 `pnpm gen:contract-matrix` 重新生成。
- `pnpm -r --no-bail test`：除上文的两份 golden（已处理）外，只剩 `tool-runtime` 的 3 个沙箱相关用例与 `session-persistence-jsonl` 的 `refresh.test.ts` 1 个用例失败，`main` 工作树上同样失败，与本次无关。

## 遇到的问题

- **问题**：R1 规模测试首次运行报「Tool call requires an open Step.」。
  - **原因**：事件 codec 要求 `tool/call` 有开着的 turn / step。
  - **应对**：测试里先 append `turn/start`、`step/start`。
- **问题**：`runtime-registry.ts` 新方法报 TS2742（推断类型不可移植）。
  - **应对**：显式写 `ReturnType<DesktopAppServiceContract["inspectSessionEventsAfter"]>`。
- **问题**：覆盖检查首跑失败，R4 的规模测试只跑了 10k。
  - **应对**：改成 1k 与 10k 都跑并比较；这正是检查想拦的写法。
- **既有失败（非本次引入）**：`packages/session/session-persistence-jsonl` 的 `refresh.test.ts > same-size rewrite falls back to a full read` 在 `main` 上同样失败，本次未处理。

## 跳过或推迟的事项

- 实机采样对比（`tmp/heap/run8` 基线 vs 改后）：云端没有 Electron 实机环境，留给用户按[内存采样工具](../../tools/heap-monitor/README.md)重跑。
- R1 方案 A 的「对话改用 surface 视图」：按上文决定不做，保留原语义。
- `getSubAgentTranscript` 的整份读：频率低，保留在基线。
- `pending` 里的 9 个文件（`runtime-registry.ts`、`supplements.ts`、`task-ledger.ts`、`managed-runs.ts`、`session-controller.ts`、`journal.ts`、`repair.ts`、`recovery.ts`、子 Agent `manager.ts`）：多数是打开会话 / 恢复时的一次性读或低频读，原因写在清单里，后续改到时再补规模测试。
