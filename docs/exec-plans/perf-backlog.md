# 性能待办

性能与内存优化任务的总表。每次实机采样（[内存采样工具](../tools/heap-monitor/README.md)）发现的热点都先登记在这里，确定方案后再开执行计划。写代码时遵守的规则见 [性能与内存约定](../coding-standards/perf-memory-conventions.md)。

**怎么用：** 想知道「还有什么性能任务」，先看这张表。状态有四种：

- **待查**：知道有分配，还不知道来源。
- **待拍板**：来源清楚，方案还要用户定。
- **进行中**：已经开了执行计划。
- **已完成**：写明提交号。

一项做完，就从「待做」移到「已完成」，写上实测前后的数字。第三轮（P1–P4）2026-11-09 完成，实机对比待用户按[内存采样工具](../tools/heap-monitor/README.md)重跑一轮后补数字；执行记录见 [执行摘要](../exec-runs/20261108-perf-round3/execution-summary.md)。

## 待做

数字来自 run8（2026-11-07，约 800 秒，4 个会话，约 242 次请求，约 340 次自动审查），是采样期间这一项累计分配了多少 MB。run8 的工作量和之前几轮不同，只按单个函数对比。

| # | 进程 | 热点 | run8 分配 | 状态 | 方案 / 下一步 |
|---|---|---|---|---|---|
| P10 | 主进程 | **工具参数流式片段整段重解析**：pi-ai 每收到一个工具参数片段，就对已收到的全部参数做一次 `parseStreamingJson`（含 `repairJson`），参数越长越慢，是 O(n²)（`openai-completions.js`；`anthropic-messages.js`、`openai-responses-shared.js` 同样如此）。我们的适配层（`packages/llm/llm-pi-ai/src/pi-ai-stream.ts`）只用 `delta`，不用这份中间结果 | 约 1.9 GB（2026-11-07 用 `analyze.mjs` 复查 run8 时发现） | 待拍板 | 建议在现有 `patches/@earendil-works__pi-ai@1.5.0.patch` 里去掉片段时的解析，只在工具调用结束时解析一次；要先确认 pi-ai 自己的 `partial` 消息有没有别的读者 |
| P5 | 主进程 | `inspect` / `readModel` | 约 350 MB | 待查 | 第三轮做完重跑后，用 `callers.mjs` 查调用方 |
| P6 | 主进程 | `sharedView` / `assertJson` | 约 295 MB | 待查 | 同上 |
| P7 | 渲染进程 | 每个实时事件都重算整份聊天投影：`selectChatSession` / `projectChatWindow` / `applyLiveEvent` | 约 175 MB | 待查 | 查是否能只更新受影响的消息 |
| P8 | 渲染进程 | `toolPreview` | 约 91 MB | 待查 | 查是否每帧重算 |
| P9 | 主进程 | `usage-source-cache.ts` 对每个会话调 `inspectSessionEvents` 后再过滤 | 未单独测 | 待查 | 低频（统计页），先确认触发频率 |

## 已完成

| 轮次 | 内容 | 效果（实测） | 提交 |
|---|---|---|---|
| 第一轮 | 流式增量不写日志、只走实时通道；投影注册表不再每个片段深拷贝请求上下文；删掉没有调用方的事件缓冲 | run1 一次运行主进程分配约 11.5 GB，其中 58% 来自每个片段深拷贝约 0.9 MB 的请求上下文 | `c6538dd7` |
| 第一轮 | 请求记录只在变化时写完整内容 | run4 日志 8.57 MB → 1.60 MB | `c6538dd7` |
| 第一轮 | 子 Agent 运行时主进程不再整份重读日志；回复渲染共用一个高亮器 | run6 主进程每分钟 2～3.4 GB 分配，渲染进程高亮 1.8 GB | `0e0070a3` |
| 第二轮 | 对话内容只存一份，surface 只做标记 | — | `cd0ff335` |
| 第二轮 | 上下文引擎直接用日志视图 | `stateDigest` 239 → 87 MB，`toLlmInput` 156 → 31 MB，对话 `cacheKey` 133 → 约 0 MB（run7 → run8） | `015b273f` |
| 第二轮 | 流式 Markdown 解析降频、处理器常驻 | 渲染进程 Markdown 约 722 MB → 约 48 MB（run7 → run8，run8 时长是两倍） | `297e170c` |
| 第三轮 | P1 自动审查：审查上下文按会话增量折叠（`journal.project`），审查后的检查改 `eventsAfter`；审查语义不变（压缩后仍交原始消息） | 规模测试：第二次审查从归档读的事件数 1k / 10k 都 ≤ 16（旧实现 1008 / 19008）；实机待重跑 | `12810fea` |
| 第三轮 | P2 每次请求查压缩摘要：surface 替换条目记 `compactionId`，`contextInput` 直接从 surface 取 | 规模测试：两次请求之间归档读取 1k / 10k 相同（旧实现 337 / 1533）；实机待重跑 | `1a300840` |
| 第三轮 | P3 子 Agent 面板：按会话常驻折叠状态，只折叠 `inspectSessionEventsAfter(throughSeq)` 的新增事件 | 规模测试：连续轮询 10 次，第二次起归档读取为 0（旧实现 4392 / 85428）；实机待重跑 | `8f1e6d4b` |
| 第三轮 | P4 读旧事件：只校验、深冻结，不再 `snapshotSessionJson` 深拷贝 | 规模测试：读 1k / 10k 条 `snapshotSessionJson` 调用 0 次；实机待重跑 | `45b675b1` |
| 第三轮 | 配套：`pnpm check:scale-tests` 规模测试覆盖检查，hot-path-reads 基线收紧 | — | `d8fe2499`、`24910abc` |
