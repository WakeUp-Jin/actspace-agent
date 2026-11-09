## [2026-11-09 12:00] | Task: 性能第三轮 P1–P4 落地，规模测试覆盖检查上线

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 之前这个项目有遇到性能问题……我们得到的教训和经验整理了一个 docs 的一些规范，但是我觉得不够，有没有更约束的方式呢，或者说每次改完，来一次性能测试之类的……
>
> 嗯嗯可以的，开始执行吧

### 🛠 Changes Overview

**Scope:** `packages/session/session-journal`、`packages/session/session-persistence-jsonl`、`packages/core/agent-loop`、`packages/approval/auto-review`、`packages/core/runtime`、`packages/core/agent-service`、`packages/client/client`、`apps/desktop/src/main/runtime-v2`、`scripts/`、`docs/`

**Key Actions:**

- **P4（`45b675b1`）** `event-history.ts` 读回旧事件改用新的 `freezeSessionJson`：只校验、深冻结，不再 `snapshotSessionJson` 序列化再解析一份。读 10k 条的 `snapshotSessionJson` 调用 10004 → 0。
- **P2（`1a300840`）** `SessionSurfaceEntry` 记 `compactionId`，`loop.ts` 的 `contextInput` 直接从 surface 取压缩摘要，不再对每个条目 `readEvents(seq, seq + 1)`。两次请求之间的归档读取 1k / 10k 由 337 / 1533 变为相等且 ≤ 16。
- **P1（`12810fea`）** `auto-review/context.ts` 拆成 `createReviewContext` / `reduceReviewContext` / `reviewSnapshot` 纯函数，`reviewSessionAction` 用 `journal.project` 取按会话常驻的增量状态，当前 `tool/call` 从有界 `toolCalls` 索引取，审查后的检查改 `eventsAfter(revision)`。第二次审查的归档读取 1k / 10k 由 1008 / 19008 变为相等且 ≤ 16。
- **P3（`8f1e6d4b`）** `subagent-list.ts` 拆成 `SubagentListState` + `reduceSubagentList`；`SessionController` / `agent-service` / 桌面契约新增 `inspectSessionEventsAfter`；`fixed-renderer-ipc.ts` 按会话缓存折叠状态（LRU 16），`getSubagents` 与 `revealSubagentRecord` 共用。连续轮询 10 次的归档读取 1k / 10k 由 4392 / 85428 变为第二次起 0。
- **覆盖检查（`d8fe2499`）** 新增 `scripts/scale-test-coverage.json` 与 `scripts/check-scale-test-coverage.mjs`，`pnpm check:scale-tests` 接入根 `pnpm test`：高频入口必须登记 `*.scale.test.ts`；每个规模测试必须同时比较 1k 与 10k、用读取计数、不计时；基线里仍整份读日志的文件要么有规模测试要么在 `pending` 并写明原因；`pending` 只能变短。
- **基线收紧（`24910abc`）** `hot-path-reads-baseline.json`：`loop.ts`、`review-session-action.ts` 归零，`fixed-renderer-ipc.ts` 3 → 1。
- **文档** `perf-backlog.md` P1–P4 移到已完成并写提交号与数字，上一轮两项补提交号；计划移入 `completed/`；新增 `docs/exec-runs/20261108-perf-round3/`；`perf-memory-conventions.md` §8、`AGENTS.md` 加覆盖检查；learnings 补「检查链」一节。

### 🧠 Design Intent (Why)

- 用户问的是「有没有更约束的方式」。之前的 `check:hot-path-reads` 只认写法、认不出高频路径；规模测试能抓到增长但没人保证会写。覆盖检查把两者接起来：基线里的每个整份读文件都得有规模测试或写明为什么不用，新的规模测试必须是「数读取、比 1k 与 10k」的写法，计时测试直接拦掉。
- 每项都先写规模测试、看它在旧代码上失败，再改，数字记进 backlog；这样下次采样对比有据可查，也证明测试确实能抓到问题。
- R1 没有按计划方案 A 改用 surface 视图：`reviewConversation` 的测试明确要求压缩之后审查仍看原始消息，surface 视图里这些已被摘要替换。云端无法当场问用户，所以保留语义、改成增量投影，首次审查仍回放一次（打开会话的一次性成本），之后只折叠新增事件；审查上下文本身有 64k 字符上限，状态不会无限长。
- R3 legacy `delegation/*` 的描述来自更早的 `tool/call`，所以状态里留一个有界的最近 `tool/call` 缓冲，两种到达顺序都有测试；增量结果在随机事件序列的每个前缀上都和整份重算相等。

### ✅ Verification

- `pnpm lint`、`pnpm typecheck` 通过。
- 根 `pnpm test` 脚本检查链通过（`check:hot-path-reads`、`test:hot-path-reads`、`check:scale-tests`、`test:scale-tests`、`check:docs`、契约矩阵等）；契约矩阵因新增 `inspectSessionEventsAfter` 重新生成。
- `pnpm -r --no-bail test`：`apps/desktop` 两份等价 golden 因 surface 条目新增 `compactionId` 失败，核对该字段不进 messages / manifest / 请求记录后在比较时抹掉它，golden 不动；其余只剩 `session-persistence-jsonl` 的 `refresh.test.ts` 1 个用例与 `tool-runtime` 的 3 个沙箱用例失败，`main` 上同样失败，与本次无关。
- 四个规模测试均验证过「旧实现失败、新实现通过」。
- 实机采样对比未做，验收指引见[执行摘要](../../exec-runs/20261108-perf-round3/execution-summary.md)。

### 📁 Files Modified

- `packages/session/session-journal/src/{event-envelope,surface}.ts`
- `packages/session/session-persistence-jsonl/src/event-history.ts`、`src/test/event-history.scale.test.ts`（新增）
- `packages/core/agent-loop/src/{loop,testing}.ts`、`src/test/context-input.scale.test.ts`（新增）
- `packages/approval/auto-review/src/context.ts`
- `packages/core/runtime/src/harness/review-session-action.ts`、`review-session-action.test.ts`、`review-session-action.scale.test.ts`（新增）
- `packages/core/runtime/src/session/session-controller.ts`、`live-child-reads.test.ts`
- `packages/core/agent-service/src/application.ts`
- `packages/client/client/src/sessions/{subagent-list,chat}.ts`、`src/test/subagent-list-fold.test.ts`（新增）
- `apps/desktop/src/main/runtime-v2/{runtime-registry,fixed-renderer-ipc}.ts`、`src/main/test/subagent-list-ipc.scale.test.ts`（新增）、`src/main/test/{context-trusted-equivalence,surface-derived-equivalence}.test.ts`
- `scripts/scale-test-coverage.json`、`scripts/check-scale-test-coverage.mjs`、`scripts/test/scale-test-coverage.test.mjs`（新增）、`scripts/hot-path-reads-baseline.json`、`package.json`
- `AGENTS.md`、`docs/coding-standards/perf-memory-conventions.md`、`docs/exec-plans/{README,perf-backlog}.md`、`docs/exec-plans/completed/{README,20261108-perf-round3}.md`、`docs/exec-runs/20261108-perf-round3/*`（新增）、`docs/learnings/2026-11/hot-path-cost-grows-with-session.md`、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
