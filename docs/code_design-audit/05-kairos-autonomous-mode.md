# Kairos 自治模式审查计划

## 目标

检查 Kairos 自治模式的 controller、scheduler、runner、prompt、memory、config、guard、IPC 和前端监控页是否符合设计文档。重点关注 Kairos 和主 Agent 的边界是否清晰，事件流是否可追溯，短期记忆、额度护栏、blocklist 和工具注入是否存在耦合或漂移。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/design-docs/agent-kairos-autonomous-mode.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/front-Kairos监控页规范.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`

## 重点代码与文件范围

- `packages/agent-core/src/kairos/`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/main/kairos-ipc.ts`
- `packages/desktop/src/main/kairos-ipc-internals.ts`
- `packages/desktop/src/main/test/kairos-bootstrap.test.ts`
- `packages/desktop/src/main/test/kairos-ipc-internals.test.ts`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/state/useKairos.ts`
- `packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx`
- `packages/shared/src/*kairos*`

## 审查问题

- Kairos 是否复用主 Agent 的 LLMService/ToolManager/runAgentLoop，但保持调度、记忆和事件外壳独立。
- `eventSink` 是否按“写盘 -> ring buffer -> listener”顺序，保证 UI 看到已持久化事实。
- Scheduler 的 sleep、interrupt、cooldown、budget exhausted 是否和设计一致。
- Runner 是否只把 Kairos tick 转成 SessionEvent，不污染主 session。
- Memory、usage accumulator、budget store 是否使用 append/debounce/atomic rename 等稳定写盘模式。
- Guard 是否只在 `callerAgent === "kairos"` 时生效，不影响主 Agent。
- Desktop IPC 是否只是控制和配置读写，不把 Kairos 内部状态散落到 renderer。
- Kairos 前端是否按照监控页规范展示，不直接解析低层工具参数。

## 输出格式

### 偏移点

- 记录代码和文档设计不一致的地方。

### 不合理设计

- 记录实现选择、职责边界、数据流问题。

### 可读性问题

- 记录难读函数、命名、重复逻辑。

### 耦合问题

- 记录过高耦合、边界混乱，或者过度拆分导致理解成本高的问题。

### 死代码/兼容残留

- 记录开发期不需要保留的旧入口、无用分支、废弃类型。

### 建议动作

- 只给建议，不改代码。建议类型包括：删除、收敛、重构、补文档、补测试。

## 产出要求

- 本轮只审查和记录，不修改代码。
- 结论需要引用具体文件路径，尽量给出行号。
- 对不确定的问题标注为“待确认”，不要当作确定缺陷。

## 审查结果

### 发现 1：`blocklist.timeWindows` / `tickBudget` 仍停留在 schema 和提示层，调度层没有硬执行（待确认）

- 偏移点：长期设计文档后半段把 `blocklist.timeWindows` 描述为 scheduler 硬拦截、把 `tickBudget.perHour` 描述为超限后自动 stop 并 emit error（`docs/design-docs/agent-kairos-autonomous-mode.md:897`, `docs/design-docs/agent-kairos-autonomous-mode.md:1322`, `docs/design-docs/agent-kairos-autonomous-mode.md:1323`），但 `QueueProcessor` 文件头仍明确写着“不实现 blocklist.timeWindows 推迟 / tickBudget 限额”（`packages/agent-core/src/kairos/scheduler.ts:10`, `packages/agent-core/src/kairos/scheduler.ts:11`, `packages/agent-core/src/kairos/scheduler.ts:12`）。
- 不合理设计：`Preferences.tickBudget` 和 `Blocklist.timeWindows` 已经进入配置契约（`packages/agent-core/src/kairos/config/schema.ts:20`, `packages/agent-core/src/kairos/config/schema.ts:53`），用户会以为它们是硬约束；实际 scheduler 只执行 sleep bias、cooldown 和 budget balance（`packages/agent-core/src/kairos/scheduler.ts:213` 到 `packages/agent-core/src/kairos/scheduler.ts:292`），没有读取这两个字段。
- 可读性问题：设计文档同一文件前段也保留了“v1 不硬执行”的历史说明（`docs/design-docs/agent-kairos-autonomous-mode.md:16`），后段又把它写成验收项，读者很难判断当前真相源。
- 耦合问题：配置 schema、prompt tip 和 scheduler 行为不一致，会让前端 raw config 编辑能力暴露出“不生效字段”，增加用户调试成本。
- 死代码/兼容残留：若当前产品仍不计划硬执行，则 `tickBudget` / `timeWindows` 是兼容残留字段；若计划硬执行，则 scheduler 是未完成实现。待产品确认。
- 建议动作：收敛。二选一：要么补 scheduler 层 time window / tick budget 硬约束和对应测试；要么从当前设计事实与默认配置说明里降级这些字段，明确“仅提示 / 预留”。

### 发现 2：`kairos:get-events-recent` 契约含 `before` / jsonl 回填，但 IPC 只读 ring buffer

- 偏移点：审查计划和设计目标要求“ring buffer 不够再读 jsonl”，IPC 契约也保留 `before?: EventId`（`packages/shared/src/kairos-contracts.ts:143` 到 `packages/shared/src/kairos-contracts.ts:153`）；但 main handler 忽略 `before`，只返回 `controller.getRecentEvents(limit)`，并固定 `hasMore: false`（`packages/desktop/src/main/kairos-ipc.ts:73` 到 `packages/desktop/src/main/kairos-ipc.ts:78`）。
- 不合理设计：controller 的公开能力也只有 ring buffer tail（`packages/agent-core/src/kairos/controller.ts:603` 到 `packages/agent-core/src/kairos/controller.ts:605`），而 `ShortMemoryStore` 已有 `loadAll()` / `loadDailyAll()` 等读取历史能力（`packages/agent-core/src/kairos/storage/short-memory-store.ts:86` 到 `packages/agent-core/src/kairos/storage/short-memory-store.ts:112`）却没有接到 IPC。
- 可读性问题：`KairosGetEventsRecentRequest.before` 看起来像已支持分页，但没有任何 handler 使用；这会误导后续前端或 e2e 测试编写。
- 耦合问题：监控页刷新完全依赖 main 进程内存 ring buffer；进程重启后 UI 首屏无法恢复已落盘事件，削弱“短期记忆 jsonl 是唯一事实源”的可观测性。
- 死代码/兼容残留：`before` 字段目前是未接线的契约残留；文档中也同时存在“应该回填”和“v1 不回填”的冲突说明（`docs/design-docs/agent-kairos-autonomous-mode.md:40`, `docs/design-docs/agent-kairos-autonomous-mode.md:380`）。
- 建议动作：补实现或补文档。若要符合本轮审查计划，建议让 controller 暴露按 `before/limit` 从 short-term jsonl 倒读的接口，并补 `kairos-ipc-internals.test.ts`；若保留 v1 取舍，删除/标注 `before` 和“buffer 不足回填”的描述。

### 发现 3：Kairos 的 thinking 事件没有落盘，前端也无法展示 thinking 详情

- 偏移点：存储与监控设计写明 Kairos short-term 同一文件中包含 `thinking` 事件，聚合 tick 行也包括 thinking（`docs/design-docs/core-storage-and-observability.md:132`, `docs/design-docs/agent-kairos-autonomous-mode.md:267`）；但 `agentEventToSessionEvents()` 注释明确“thinking 仍不落”，并且 switch 没有处理 thinking 类 AgentEvent（`packages/agent-core/src/kairos/runner.ts:213` 到 `packages/agent-core/src/kairos/runner.ts:222`, `packages/agent-core/src/kairos/runner.ts:229` 到 `packages/agent-core/src/kairos/runner.ts:277`）。
- 不合理设计：Kairos 支持从 settings 传入 `thinkingEnabled`（`packages/agent-core/src/kairos/runner.ts:166` 到 `packages/agent-core/src/kairos/runner.ts:175`），但启用后思考链既不进入 short-term 事实流，也不进入 Kairos 详情面板；这让“自治过程可解释”少了一块证据。
- 可读性问题：`controller.getContextSnapshot()` 的历史投影会拼 assistant thinking（`packages/agent-core/src/kairos/controller.ts:790` 到 `packages/agent-core/src/kairos/controller.ts:807`），但 short-term 转换层默认跳过 thinking（`packages/agent-core/src/kairos/context/short-term.ts:132` 到 `packages/agent-core/src/kairos/context/short-term.ts:139`）。这形成了“看似支持、事实无源”的阅读落差。
- 耦合问题：主 Agent 的 thinking 展示/持久化语义与 Kairos runner adapter 分叉；后续若要统一可解释性，需要同时改 shared session、Kairos runner、aggregator 和监控页。
- 死代码/兼容残留：`docs/design-docs/agent-kairos-autonomous-mode.md:178` 仍列出 `KairosEventDetail` 可展示 thinking，但当前默认页面只有最终回复/工具结果两个 tab（`packages/desktop/src/renderer/pages/KairosPage.tsx:725` 到 `packages/desktop/src/renderer/pages/KairosPage.tsx:769`）。
- 建议动作：补测试后决定语义。若 thinking 属于可观察事实，补 runner adapter 的 `thinking` SessionEvent、aggregator tick 关联和详情展示；若不希望落 thinking，则同步删掉设计文档里的 thinking 承诺。

### 发现 4：短期记忆压缩模块存在，但 controller 没有触发压缩链路（待确认）

- 偏移点：设计文档说 controller 在 tick 后按 short-term token 阈值触发压缩，`compression/compressor.ts` 也实现了 LLM 摘要函数（`docs/design-docs/agent-current-module-map.md:195`；`packages/agent-core/src/kairos/compression/compressor.ts:21` 到 `packages/agent-core/src/kairos/compression/compressor.ts:50`）；但全仓检索显示 `compressKairosSegments` 只在自身、导出和测试中出现，controller 没有调用。
- 不合理设计：`config.preferences.memory.compressionThreshold` 被解析并进入默认配置（`packages/agent-core/src/kairos/config/schema.ts:28` 到 `packages/agent-core/src/kairos/config/schema.ts:31`, `packages/agent-core/src/kairos/config/schema.ts:63`, `packages/agent-core/src/kairos/config/schema.ts:152` 到 `packages/agent-core/src/kairos/config/schema.ts:155`），但运行时没有对应消费点，短期记忆会只加载预算内原始事件/已有 summary，而不会自动生成新 summary。
- 可读性问题：`ShortMemoryStore.saveSummary()` 和 `loadDailyAll()` 注释都暗示 compression 用途（`packages/agent-core/src/kairos/storage/short-memory-store.ts:71`, `packages/agent-core/src/kairos/storage/short-memory-store.ts:86`），但实际调度入口缺失，读代码时需要靠 `rg` 才能确认链路断点。
- 耦合问题：压缩策略分散在 config、store、compressor、short-term loader 四处，缺少 controller 或 scheduler 中的单一编排点。
- 死代码/兼容残留：`QueueMessage` 仍保留 `system` 的 `"compress" | "monthly-archive" | "yearly-archive"` 类型（`packages/agent-core/src/kairos/scheduler.ts:22` 到 `packages/agent-core/src/kairos/scheduler.ts:26`），但 `processTick()` 对 system message 直接 no-op 返回（`packages/agent-core/src/kairos/runner.ts:88` 到 `packages/agent-core/src/kairos/runner.ts:91`）。
- 建议动作：重构/补测试。若压缩是 v1 要求，建议把“tick 后估算 -> 选择 segment -> compress -> atomic saveSummary”的编排接回 controller，并覆盖 reset_today 分卷；若不是，删除或明确标注 system queue / compressionThreshold 为预留。

### 发现 5：Kairos IPC dispose 不移除 controller listener，重建 controller 时存在 listener 残留

- 偏移点：设计把 desktop IPC 定位为薄控制/转发层；但 `registerKairosIpc()` 注册匿名 listener 到 controller（`packages/desktop/src/main/kairos-ipc.ts:154`, `packages/desktop/src/main/kairos-ipc.ts:155`），`dispose()` 只 dispose batcher 和 remove IPC handler，明确不 off controller listener（`packages/desktop/src/main/kairos-ipc.ts:157` 到 `packages/desktop/src/main/kairos-ipc.ts:166`）。
- 不合理设计：settings 更新会 stop 旧 controller、dispose IPC、再重建 controller 和 IPC（`packages/desktop/src/main/index.ts:689` 到 `packages/desktop/src/main/index.ts:701`）。旧 controller 上残留的 listener 捕获已 disposed 的 batcher；虽然 batcher 会 no-op，但 listener 生命周期不再可追踪。
- 可读性问题：注释说“dispose 后 batcher 不会再产生副作用，因此显式 off 已经无意义”（`packages/desktop/src/main/kairos-ipc.ts:160` 到 `packages/desktop/src/main/kairos-ipc.ts:162`），这解释了无副作用，但没有解释为什么可以接受 listener 泄漏。
- 耦合问题：IPC handle 的生命周期依赖 `KairosEventBatcher.disposed` 兜底，而不是显式解除与 controller 的订阅关系；这让 controller / IPC 之间存在隐形引用。
- 死代码/兼容残留：无明显业务死代码，但 listener 引用属于可清理的生命周期残留。
- 建议动作：收敛。把 event/state listener 存成具名函数，`dispose()` 时调用 `controller.off("event", onEvent)` 和 `controller.off("state", onState)`；补一个重建/ dispose 后旧 controller emit 不触发 sink 的单测。

### 发现 6：Kairos guard 的“无路径参数”策略与提取器注释相反，存在误放行风险

- 偏移点：`extract-paths.ts` 注释写“本模块也提不出路径，则视为无法判定 -> 拒绝（白名单式）”（`packages/agent-core/src/kairos/guard/extract-paths.ts:4` 到 `packages/agent-core/src/kairos/guard/extract-paths.ts:8`），但 scheduler guard 对 `extracted.length === 0` 直接放行（`packages/agent-core/src/tools/scheduler.ts:353` 到 `packages/agent-core/src/tools/scheduler.ts:361`）。
- 不合理设计：对 `web_search` 这类无路径工具放行是合理的；但对“实际操作路径却忘记声明 extractPaths、参数名也不在 fallback 列表”的工具也会放行，只能靠工具自身 workspace guard 或 `toolsDenied` 兜底。
- 可读性问题：同一策略在两个文件里的注释方向相反，新增工具作者不知道应该把“无路径”理解为安全无路径，还是无法判定。
- 耦合问题：Kairos blocklist 的可靠性耦合到每个工具 definition 是否正确声明 `extractPaths`，而不是由工具契约强制表达“有无路径参数”。
- 死代码/兼容残留：暂无确定死代码；这是注释/策略漂移。
- 建议动作：补文档/补测试。建议把工具 definition 增加显式标记（例如 `pathPolicy: "none" | "extract"`）或至少把 fallback 注释改成当前真实策略，并新增一个“文件类工具缺 extractPaths 时被拒绝”的测试。
