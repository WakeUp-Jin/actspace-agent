# Kairos Short-Term Memory + Ring Buffer

## 目标

为 Kairos 建立"记忆层"：

- 移植 heartclaw 的 `ShortMemoryStore` + `ShortTermMemoryContext` 算法，但落盘行格式改为 actspace `SessionEvent`（不是 heartclaw 的 message dict）。
- 实现 `KairosShortTermMemoryContext`：每次 runner 实例化时按 token 预算从短期记忆和 summaries 中加载 history，输出可塞进 LLM 的 messages + 一段 summary 字符串。
- 实现 200 条 SessionEvent 内存 ring buffer，供前端首屏快速拉取。
- 实现"working memory 压缩触发"——单 tick 完成后检查阈值并按 heartclaw 算法压缩到磁盘 summary 文件。

完成后 controller 只需要"runner 启动时 new 一个 ShortTermContext"，剩下的加载/压缩/落盘全在本模块内闭环。

## 范围

- 包含：
  - `packages/agent-core/src/kairos/storage/short-memory-store.ts`（新增，参考 heartclaw 但行格式 = SessionEvent）
  - `packages/agent-core/src/kairos/storage/ring-buffer.ts`（新增）
  - `packages/agent-core/src/kairos/context/short-term.ts`（新增，KairosShortTermMemoryContext）
  - `packages/agent-core/src/kairos/compression/compressor.ts`（新增，复用主 Agent compressor + Kairos prompt 模板）
  - `packages/agent-core/src/context/modules/kairos-short-term.ts`（新增，可选 thin wrapper，让现有 ContextManager 注册风格统一）
  - 上述模块对应单测
  - 一组 fixture jsonl 文件（覆盖跨日 / 跨月 / 含 summary 等场景）
- 不包含：
  - 把 ShortTermContext 注入到 KairosRunner 中（在 `kairos_controller_runner` plan）
  - 月度/年度归档调度（同样在 `kairos_controller_runner` plan 的 briefs 内部维护任务部分）
  - IPC 推送（在 `kairos_main_ipc_and_renderer` plan）

## 依赖关系

- 依赖：`kairos_shared_contracts`（SessionEvent 4 个 Kairos 专属 type）
- 并行：可与 `kairos_config_and_tool_guard` / `kairos_observe_and_briefs` 同时启动
- 产出给：`kairos_controller_runner`（runner 实例化时 new ShortTermContext + 调 ring buffer 写入）；`kairos_main_ipc_and_renderer`（`kairos:get-events-recent` 走 ring buffer + jsonl 回填）

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md` 的「事件存储与前端聚合」「Working Memory 加载与压缩」「存储布局」三章
- `back-code/heartclaw/apps/ruyi-api/src/storage/short_memory_store.py`（移植算法的源头）
- `back-code/heartclaw/apps/ruyi-api/src/core/context/modules/short_term_memory.py`（加载策略的源头）
- `packages/shared/src/session.ts`（行格式定义）
- `packages/agent-core/src/context/` 现有 ConversationContext 注册风格（保持一致）

## 背景

- 相关代码路径：
  - `packages/agent-core/src/context/`（已有 ContextManager + ConversationContext 等模块）
  - `packages/agent-core/src/compression/`（如有；若主 Agent compressor 未拆出来则放在 engine 下）
- 已知约束：
  - 落盘行 = `SessionEvent` JSON。每行严格遵循 `packages/shared/src/session.ts` 的现有形态 + 4 个 Kairos 专属 type；不允许写入 heartclaw 风格的 message dict。
  - jsonl 路径：`<kairosRoot>/memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl`，`reset_today` 后切到 `<YYYY-MM-DD>_001.jsonl` 等同月新 segment。
  - summary 文件：`week_MM-DD_to_MM-DD.summary.md`、`month_YYYY-MM.summary.md`、`year_YYYY.summary.md`，全部位于同 `<YYYY-MM>/` 目录。
  - token 估算用 actspace 现有近似算法（字符 ÷ 3）；与主 Agent 一致。
  - Kairos 的 `loadBudgetRatio` 默认 0.75，`compressionThreshold` 默认 0.85，由 `preferences.json` 提供。

## 设计方案

### 1. `ShortMemoryStore`

```ts
export type ShortMemorySegmentMeta = {
  date: string;                                    // "YYYY-MM-DD"
  segmentIndex: number;                            // 0=主日段；1, 2... 为 reset_today 切出的新段
  path: string;                                    // 绝对路径
  byteSize: number;
};

export class ShortMemoryStore {
  constructor(rootDir: string);                    // rootDir = <kairosRoot>/memory/short-term

  // 写入（追加，带原子写或 fsync 之一保证不撕裂）
  appendEvent(event: SessionEvent, today?: Date): Promise<void>;

  // 列出所有日期（含 summary 覆盖区间）
  listSegments(): Promise<ShortMemorySegmentMeta[]>;

  // 读某日某段（按 segmentIndex 排序）
  readSegment(meta: ShortMemorySegmentMeta): Promise<SessionEvent[]>;

  // reset_today 切段
  rotateDaily(today?: Date): Promise<void>;

  // summary CRUD
  loadAllSummaries(): Promise<Array<{ kind: "week"|"month"|"year"; range: string; markdown: string }>>;
  saveSummary(kind, range, markdown): Promise<void>;

  // 判断某日是否已被某个 summary 覆盖
  isDateCovered(date: string): Promise<boolean>;
}
```

实现要点：

- 写入用 `fs.appendFile`（utf8 + `\n` 行分隔）；崩溃恢复靠 jsonl 天然 line-aware 解析容错（解析失败的最后一行跳过 + warn）。
- `listSegments` 走 `fs.readdir` + 文件名 regex；按日期降序、同日按 segmentIndex 升序排列。
- `readSegment` 按行解析 JSON；解析失败行 `console.warn` 但继续。
- `rotateDaily` 找当天最大 segmentIndex+1 创建新文件；不动旧文件。

### 2. `KairosShortTermMemoryContext`

```ts
export type KairosShortTermLoadResult = {
  messages: Array<{ role: "user"|"assistant"; content: string; toolCalls?: ... }>;
  summarySegments: string[];                       // 进 system [6] 段
  loadedTokenEstimate: number;
  totalTokenEstimate: number;
};

export class KairosShortTermMemoryContext {
  constructor(opts: {
    store: ShortMemoryStore;
    contextWindow: number;                         // 来自 preferences.modelId 对应模型
    loadBudgetRatio: number;                       // 默认 0.75
  });

  load(): Promise<KairosShortTermLoadResult>;
  estimateTokens(): Promise<number>;
}
```

`load()` 算法（直译 heartclaw `short_term_memory.py`）：

1. 计算 budget = `contextWindow * loadBudgetRatio`
2. 从 store 拿所有 date 降序。对每个 date：
   - 若该 date 已被某 summary 覆盖（`isDateCovered`）：加载该 summary（**全局只加载一次同一 summary**）
   - 否则加载该 date 的所有 segment（按 segmentIndex 升序），将 SessionEvent[] 转成 LLM messages 形态（详见 §3）
   - 累计 token 达 budget 即停
3. 加载所有 `year_*.summary.md`（独立于 date）
4. 反转 messages 顺序为升序，summary 段单独返回
5. 跑 `sanitizeMessages`：扔掉 orphan tool_call（无 tool_result）或 orphan tool_result，避免 LLM API 报错

### 3. SessionEvent → LLM message 转换

把一条 `SessionEvent` 翻译成 LLM 输入：

| SessionEvent.type | 翻译策略 |
|---|---|
| `user_message` | `{ role: "user", content: payload.text }` |
| `kairos_tick_injected` | `{ role: "user", content: payload.content }`（与 user_message 等价） |
| `assistant_message` / `assistant_reply` | `{ role: "assistant", content: payload.text }` |
| `thinking` | 进 assistant message 的 thinking 字段（如果模型支持） |
| `tool_call` | 累加到当前 assistant message 的 `toolCalls` 数组 |
| `tool_result` | `{ role: "tool", tool_call_id, content }` |
| `llm_usage` / `diff_preview` / `context_snapshot` | 跳过（不进 LLM 历史） |
| `kairos_sleep_*` | 跳过（仅 UI / 行动日志用） |
| `error` | 跳过（不进 LLM 历史，避免 LLM 误将历史错误当作当前任务） |

### 4. Ring buffer（`ring-buffer.ts`）

```ts
export class SessionEventRingBuffer {
  constructor(capacity = 200);
  push(event: SessionEvent): void;                 // 满了挤掉最旧
  tail(n: number): SessionEvent[];                 // 最近 n 条，时间升序
  size(): number;
  clear(): void;
}
```

实现：

- 内部用一个 `SessionEvent[]` + 头尾指针（循环数组）。
- `tail(n)` 拷贝出有序数组，避免外部修改影响内部。
- 不持久化；进程退出即丢，由 jsonl 兜底。

### 5. Compressor（`compression/compressor.ts`）

```ts
export type CompressInput = {
  segments: SessionEvent[];                        // 待压缩的"过去 7 天"事件
  kind: "week" | "month" | "year" | "intra_day";
  rangeLabel: string;                              // "05-17_to_05-23" 或 "2026-05" 等
  llm: LLMService;                                 // 复用主 Agent
};

export type CompressOutput = {
  markdown: string;
};

export async function compressKairosSegments(input: CompressInput): Promise<CompressOutput>;
```

实现：

- 用主 Agent `LLMService.complete()` 调一次 LLM（system prompt 在 `kairos/compression/prompts.ts` 维护，按 kind 区分模板）。
- prompt 限定：
  - "请把以下 Kairos 短期记忆压缩为不超过 1200 token 的 markdown 摘要"
  - "保留：tick 的关键决策、工具调用要点、回复摘要；丢弃：thinking、原始 tool args/result 全文"
- markdown 结构建议：`## 该区间 Kairos 做了什么` + `## 关键决策` + `## 未完成的事 / TODO`
- 失败时不退化为"先截断后跳过"——直接 throw，由 controller 决定是否进 cooldown。

### 6. 测试

`storage/__tests__/short-memory-store.test.ts`：

- 跨日 append、跨月 append（自动创建 `<YYYY-MM>/` 目录）
- `rotateDaily` 后 segment 升序排列；旧文件不删
- 解析行损坏（手动写一行垃圾）后跳过该行继续读
- `saveSummary` 写入 + `loadAllSummaries` 拿回
- `isDateCovered`：在 week summary 覆盖区间内返回 true

`context/__tests__/short-term.test.ts`：

- 3 个月的 short-term 数据 + 1 个 week summary：验证加载顺序、去重（已被 week 覆盖的 date 不再加载原 jsonl）
- token 预算紧张：只加载到 budget 即停，但 summaries 全部加载
- `sanitizeMessages`：故意写入 orphan tool_call → 加载后被剔除

`storage/__tests__/ring-buffer.test.ts`：

- push 满 + push 后挤旧
- `tail(n)` 返回的数组不影响内部
- `clear()` 后 size=0

`compression/__tests__/compressor.test.ts`：

- 使用 `MockLLMService.setResponses` 给定 fake summary 字符串
- 验证 prompt 模板按 kind 正确选择
- 验证返回 markdown 与 LLM 输出一致
- 验证 LLM throw 时 compressor 也 throw（不吞错）

## 任务拆分

- [ ] Step 1：新建 `kairos/storage/short-memory-store.ts`，按 §1 写完；写 `short-memory-store.test.ts` 覆盖跨日 / rotate / 损坏行 / summary CRUD。
- [ ] Step 2：在 `packages/agent-core/test/fixtures/kairos-memory/` 铺一份样例 jsonl（覆盖跨月 + 含 week summary 场景），用作 §3 测试输入。
- [ ] Step 3：新建 `kairos/context/short-term.ts`，按 §2 实现 load；写 `short-term.test.ts` 覆盖 token 预算、summary 去重、orphan tool sanitize。
- [ ] Step 4：新建 `kairos/storage/ring-buffer.ts`；写 `ring-buffer.test.ts` 覆盖容量边界、tail 拷贝。
- [ ] Step 5：新建 `kairos/compression/compressor.ts` 和 `compression/prompts.ts`（4 个 kind 的 prompt 模板）；写 `compressor.test.ts` 用 MockLLMService。
- [ ] Step 6：新建 `packages/agent-core/src/context/modules/kairos-short-term.ts` 作为 thin wrapper（实现 `ContextModule` 接口，让 ContextManager 可统一管理）；如发现 ContextManager 不需要 wrapper，则跳过本步。
- [ ] Step 7：补一条 history：`docs/histories/<month>/<timestamp>-kairos-short-term-memory.md`，列出移植算法的差异点（行格式 = SessionEvent + 默认比例 0.75）。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/agent-core typecheck`
- 手工检查：
  - 用 `ShortMemoryStore` 在临时目录写 100 条 fake SessionEvent，再 `ShortTermMemoryContext.load()` 拿回，确认 messages 数量与 token 估算合理。
  - 触发 `rotateDaily`，检查 `<today>_001.jsonl` 创建。
- 观测检查：
  - jsonl 文件可被任意 `jq -r '.type'` 读出 Kairos 4 type 与基础 type 混合存在。

## 风险

- 风险：行解析容错过松，错过严重 bug。
- 缓解：解析失败的行 `console.warn` 同时把原行 base64 写到 `logs/kairos-malformed-events.log`，便于事后排查。

- 风险：summary 覆盖 date 的判断错误，导致同一 date 被同时加载（jsonl + summary 双份）。
- 缓解：`isDateCovered` 严格按 week_/month_ summary 文件名解析的区间判断；单测覆盖跨月边界。

- 风险：压缩调用 LLM 失败把 Kairos 卡死。
- 缓解：compressor 不在 runner 关键路径执行；controller 在 tick 结束后异步发起，失败仅 emit warning + 跳过本轮压缩（runner 仍能正常 tick）。本 plan 只保证 compressor 函数行为正确，调用策略在 `kairos_controller_runner` 决定。

- 风险：ring buffer 在多线程访问下读到撕裂状态。
- 缓解：Node 单线程，main 进程内只有一个调用方（controller）；不引入 Worker。

## 决策记录

- 2026-05-27：jsonl 行格式选 SessionEvent 而非 heartclaw 的 message dict。原因：与主 Agent session.jsonl 对齐，未来若需要"主 Agent 看 Kairos 记忆"或"Kairos 看主 Agent session"可零成本互通；short-term 加载时再做"SessionEvent → LLM message"翻译。
- 2026-05-27：tool args/result 在压缩后**不保留细节**（仅 toolName + 摘要）。原因：actspace 的 tool args 经常包含路径、grep pattern 等长字符串，全保留会让 summary 永远突破预算。
- 2026-05-27：ring buffer 默认 200 条，不做用户可配置。原因：200 大约覆盖几小时活动，足够前端首屏；改大需要权衡内存，等用户提需求再加。
