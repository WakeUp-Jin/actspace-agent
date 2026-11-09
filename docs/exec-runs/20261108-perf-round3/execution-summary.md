# 性能第三轮：高频路径不再整份读日志 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261108-perf-round3.md`
- **执行过程**：`docs/exec-runs/20261108-perf-round3/execution-process.md`
- **执行模式**：交互（Cloud Agent）
- **执行结果**：完成（实机采样对比未做）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| P4 读旧事件只校验、冻结，不再深拷贝 | `packages/session/session-journal/src/event-envelope.ts`、`packages/session/session-persistence-jsonl/src/event-history.ts` | 刚解析出来的对象没有别人引用，复制一份是纯浪费；run8 里约 860 MB |
| P2 surface 替换条目记 `compactionId` | `packages/session/session-journal/src/surface.ts`、`packages/core/agent-loop/src/loop.ts` | 每次请求不再对每个条目读一次日志；run8 里约 480 MB |
| P1 审查上下文按会话增量折叠 | `packages/approval/auto-review/src/context.ts`、`packages/core/runtime/src/harness/review-session-action.ts` | 第一次审查回放一次，之后只折叠新增事件；审查后检查改 `eventsAfter`；审查看到的内容不变；run8 里约 1.3 GB |
| P3 子 Agent 面板按会话增量折叠 | `packages/client/client/src/sessions/subagent-list.ts`、`packages/core/runtime/src/session/session-controller.ts`、`packages/core/agent-service/src/application.ts`、`apps/desktop/src/main/runtime-v2/{runtime-registry,fixed-renderer-ipc}.ts` | 新增 `inspectSessionEventsAfter`，每秒轮询只读新增事件；run8 里约 340 MB |
| 规模测试覆盖检查 | `scripts/scale-test-coverage.json`、`scripts/check-scale-test-coverage.mjs`、`scripts/test/scale-test-coverage.test.mjs`、根 `package.json` | `pnpm check:scale-tests`，随根 `pnpm test` 跑 |
| 基线收紧 | `scripts/hot-path-reads-baseline.json` | 三个文件的整份读计数归零或减少，基线只减不增 |
| 规范与文档 | `docs/coding-standards/perf-memory-conventions.md`、`AGENTS.md`、`docs/exec-plans/perf-backlog.md` 等 | §8 加覆盖检查；P1–P4 移到已完成 |

## 人工验证指引

### 必须验证

1. **实机内存对比（计划里的「实机」验证）**
   - 验证方式：按 [内存采样工具](../../tools/heap-monitor/README.md) 跑一轮，尽量复现 run8 的工作量（多会话、开自动审查、有子 Agent、会话超过 512 条事件），用 `analyze.mjs` 看 `reviewSessionAction`、`contextInput` / `resolve`、`getSubagents` 处理函数、`readEvents` / `snapshotSessionJson` 的分配。
   - 预期结果：这四项相对 run8 明显下降，主进程堆与 RSS 峰值下降；数字补回 [性能待办](../../exec-plans/perf-backlog.md) 的「已完成」表。

2. **自动审查行为不变**
   - 验证方式：开自动审查，在一个会话里连续触发多次需要审批的工具调用，其中至少一次发生在压缩之后。
   - 预期结果：审查正常给出决定；压缩之后审查仍能看到原始用户消息（不是摘要），不报「Original user authorization unavailable」。

3. **子 Agent 面板**
   - 验证方式：开一个带子 Agent 的会话，打开右侧子 Agent 面板，观察子 Agent 启动、运行、结束、来信时列表的变化；点开记录（reveal）。
   - 预期结果：列表与改前一致、实时更新；长会话（>512 条事件）下轮询不卡顿。

### 建议验证

1. **恢复旧会话**
   - 验证方式：重启应用，打开一个超过 512 条事件、有压缩和子 Agent 的旧会话，再发一条消息。
   - 预期结果：上下文正常（压缩摘要在），子 Agent 面板显示历史子 Agent，自动审查可用。

## Agent 已完成的验证

- 规模测试（旧实现失败、新实现通过，数字为归档读取条数或调用次数，1k / 10k）：
  - P4 `snapshotSessionJson` 调用：10004 → 0；
  - P2 两次请求之间：337 / 1533 → 两者相等且 ≤ 16；
  - P1 第二次审查：1008 / 19008 → 两者相等且 ≤ 16，且结果等于整份折叠；
  - P3 连续轮询 10 次：4392 / 85428 → 第二次起 0。
- 增量 vs 整份等价：子 Agent 列表折叠在 8 个随机种子 × 160 条事件的每个前缀上一致；审查快照与 `reviewConversation(readEvents())` 一致。
- `pnpm lint`、`pnpm typecheck`、根 `pnpm test`（含 `check:hot-path-reads`、`check:scale-tests`）、`pnpm check:docs`：结果见 history `docs/histories/2026-11/20261109-1200-perf-round3-hot-path-scale-tests.md`。

## 已知风险和遗留事项

- **R1 常驻状态**：审查上下文按会话常驻在 `journal.project` 里，上限由 64 000 字符的 `overflow` 与 24 / 64 条有界缓冲控制；会话释放时随 journal 一起释放。
- **R3 缓存**：主进程最多常驻 16 个会话的子 Agent 列表状态（LRU），日志被截断（`lastSeq` 回退）时从头重算。
- **既有失败**：`packages/session/session-persistence-jsonl` 的 `refresh.test.ts > same-size rewrite falls back to a full read`，以及 `packages/core/tool-runtime` 的 3 个沙箱相关用例（`runtime.test.ts`），在 `main` 上同样失败，与本次无关，未处理。
- **等价 golden**：`compactionId` 是 surface 条目的新字段，两份 golden 测试比较时抹掉它；它不进 messages、manifest、请求记录。若将来要把它交给渲染层使用，再按新语义更新 golden。
- **pending 清单**：`scripts/scale-test-coverage.json` 里 9 个文件仍整份读日志但没有规模测试（多为打开 / 恢复会话时的一次性读或低频读），改到时再补。

## 后续建议

- 实机重跑后，按 [性能待办](../../exec-plans/perf-backlog.md) 的 P5–P10 继续；P10（pi-ai 工具参数流式片段整段重解析，约 1.9 GB）待拍板。
- `getSubAgentTranscript` 仍整份读子会话日志，频率低；若面板加「实时轨迹」再改。
