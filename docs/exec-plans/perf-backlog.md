# 性能待办

性能与内存优化任务的总表。每次实机采样（[内存采样工具](../tools/heap-monitor/README.md)）发现的热点都先登记在这里，确定方案后再开执行计划。写代码时遵守的规则见 [性能与内存约定](../coding-standards/perf-memory-conventions.md)。

**怎么用：** 想知道「还有什么性能任务」，先看这张表。状态有四种：

- **待查**：知道有分配，还不知道来源。
- **待拍板**：来源清楚，方案还要用户定。
- **进行中**：已经开了执行计划。
- **已完成**：写明提交号。

一项做完，就从「待做」移到「已完成」，写上实测前后的数字。

## 待做

数字来自 run8（2026-11-07，约 800 秒，4 个会话，约 242 次请求，约 340 次自动审查），是采样期间这一项累计分配了多少 MB。run8 的工作量和之前几轮不同，只按单个函数对比。

| # | 进程 | 热点 | run8 分配 | 状态 | 方案 / 下一步 |
|---|---|---|---|---|---|
| P1 | 主进程 | **自动审查整份读日志**：`reviewSessionAction` 每次审批对整个会话做两遍 `iterateEvents()`（`packages/core/runtime/src/harness/review-session-action.ts`），内存窗口外的事件逐行从文件解析 | 约 1.3 GB | 进行中 | 第三轮 R1，见 [执行计划](active/20261108-perf-round3.md) |
| P2 | 主进程 | **每次请求查压缩摘要**：`loop.ts` 的 `contextInput` 对每个 surface 条目调一次 `journal.readEvents(seq, seq + 1)`（`packages/core/agent-loop/src/loop.ts`） | 约 480 MB | 进行中 | 第三轮 R2 |
| P3 | 主进程 | **子 Agent 面板每秒整份读日志**：`getSubagents` 每次调 `inspectSessionEvents`（`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`），同文件的 `revealSubagentRecord`、`getSubAgentTranscript` 也一样 | 约 340 MB | 进行中 | 第三轮 R3 |
| P4 | 主进程 | **读旧事件时多余的深拷贝**：`JsonlEventHistory.readEvents` 对刚 `JSON.parse` 出来的每一行再做 `snapshotSessionJson`（`packages/session/session-persistence-jsonl/src/event-history.ts`） | 约 860 MB（和 P1–P3 有重叠） | 进行中 | 第三轮 R4 |
| P10 | 主进程 | **工具参数流式片段整段重解析**：pi-ai 每收到一个工具参数片段，就对已收到的全部参数做一次 `parseStreamingJson`（含 `repairJson`），参数越长越慢，是 O(n²)（`openai-completions.js`；`anthropic-messages.js`、`openai-responses-shared.js` 同样如此）。我们的适配层（`packages/llm/llm-pi-ai/src/pi-ai-stream.ts`）只用 `delta`，不用这份中间结果 | 约 1.9 GB（2026-11-07 用 `analyze.mjs` 复查 run8 时发现） | 待拍板 | 建议在现有 `patches/@earendil-works__pi-ai@0.82.1.patch` 里去掉片段时的解析，只在工具调用结束时解析一次；要先确认 pi-ai 自己的 `partial` 消息有没有别的读者 |
| P5 | 主进程 | `inspect` / `readModel` | 约 350 MB | 待查 | 第三轮做完重跑后，用 `callers.mjs` 查调用方 |
| P6 | 主进程 | `sharedView` / `assertJson` | 约 295 MB | 待查 | 同上 |
| P7 | 渲染进程 | 每个实时事件都重算整份聊天投影：`selectChatSession` / `projectChatWindow` / `applyLiveEvent` | 约 175 MB | 待查 | 查是否能只更新受影响的消息 |
| P8 | 渲染进程 | `toolPreview` | 约 91 MB | 待查 | 查是否每帧重算 |
| P9 | 主进程 | `usage-source-cache.ts` 对每个会话调 `inspectSessionEvents` 后再过滤 | 未单独测 | 待查 | 低频（统计页），先确认触发频率 |

## 未收尾的上一轮

| 项 | 状态 |
|---|---|
| 上下文引擎直接用日志视图（[计划](active/20261107-context-trusted-surface.md)） | 已实现，run8 验证有效；未提交 |
| 流式 Markdown 解析降频（[计划](active/20261107-markdown-stream-throttle.md)） | 已实现，run8 验证有效；未提交；Electron 里流式观感待用户看 |

## 已完成

| 轮次 | 内容 | 效果（实测） | 提交 |
|---|---|---|---|
| 第一轮 | 流式增量不写日志、只走实时通道；投影注册表不再每个片段深拷贝请求上下文；删掉没有调用方的事件缓冲 | run1 一次运行主进程分配约 11.5 GB，其中 58% 来自每个片段深拷贝约 0.9 MB 的请求上下文 | `c6538dd7` |
| 第一轮 | 请求记录只在变化时写完整内容 | run4 日志 8.57 MB → 1.60 MB | `c6538dd7` |
| 第一轮 | 子 Agent 运行时主进程不再整份重读日志；回复渲染共用一个高亮器 | run6 主进程每分钟 2～3.4 GB 分配，渲染进程高亮 1.8 GB | `0e0070a3` |
| 第二轮 | 对话内容只存一份，surface 只做标记 | — | `cd0ff335` |
| 第二轮 | 上下文引擎直接用日志视图 | `stateDigest` 239 → 87 MB，`toLlmInput` 156 → 31 MB，对话 `cacheKey` 133 → 约 0 MB（run7 → run8） | 未提交 |
| 第二轮 | 流式 Markdown 解析降频、处理器常驻 | 渲染进程 Markdown 约 722 MB → 约 48 MB（run7 → run8，run8 时长是两倍） | 未提交 |
