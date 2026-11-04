# 卡顿与内存修复

## 目标

消除桌面端"时不时卡一下"和主进程内存只涨不降：主进程不再因读会话而同步整本解析大 journal；空闲会话会被释放；流式输出时只有消息区在重画，外围区域（左栏、右栏、输入框）不随每帧重渲染；面板轮询不做无用功。用前后对比数据证明改善。

## 范围

- 包含：本计划 M1–M3、R1–R4 全部条目，一次做完。
- 不包含：消息列表虚拟化（决策 ③ 不做）；开发模式本身的开销（监听进程、StrictMode 保留）。

## 已确认的决策（2026-11-04 用户：「你的卡顿修复方案我觉得超级好，可以开始执行」）

1. 主进程读大文件用增量读取 + 先查缓存，不把解析整体搬到后台线程。
2. 释放规则：运行中、当前查看、有界面订阅的会话不释放；其余空闲会话保留最近 3 个，超出释放最旧的。
3. 消息列表不做虚拟化。
4. 进程间消息先做频率合并（不改消息格式）；两份重复通道查清各自消费方后再去重，同在本计划范围内。

## 现状证据（已读代码确认）

- `packages/session/session-persistence-jsonl/src/jsonl-reader.ts:20-59` `inspectJsonlSession`：整文件 readFile → 整 buffer sha256 → split → 逐行 JSON.parse → `validateSessionEvents` → `Object.freeze([...events])`，同步段在主线程。
- `packages/session/session-projection-cache/src/journal-cache.ts` `#read`：第一步就 `storage.inspect(sessionId)`（整本解析），之后才查缓存；缓存字节数用 `JSON.stringify(read).length * 2` 计算（再序列化整本），预算 16MB，因此 >≈8MB 的会话永远不进缓存。
- 本机 `~/Library/Application Support/ActSpace/sessions-v2` 最大 journal 37MB / 30MB / 24MB，至少 9 个超过 10MB。
- `packages/core/runtime/src/session/session-controller.ts:277` `closeOpen` 无任何调用方；`#open` 只增不减。
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts` `#emitRuntimeLive` 与 `fixed-renderer-ipc.ts`：每个 assistant/reasoning delta 发 `agentStream` + `sessionLiveEvent`（+ `journal-update`）2–3 条，无节流。
- `apps/desktop/src/renderer/session/SessionProjectionContext.tsx:40,76`：任何会话任何 cell 变化都 bump `version`，context value 换新；App 根通过 `useLiveRunView` 每帧重渲染；`WorkbenchLayout`、Sidebar、RightPanel、Composer 无 memo；`SidebarSessions` 每帧重排序分组。
- `packages/client/client/src/sessions/session.ts:151,154,156,170`：每个事件 `[...events].reverse().find`、整表复制追加。
- `right-panel/SubagentsPanel.tsx:176-203` 运行中每 750ms 拉完整 transcript 并整份重建 blocks；`:48-57` 列表每 1s 无条件 setState。`right-panel/context/use-context-panel.ts:30-60` 每 5s 轮询，`notModified` 仍 setState、setLoading 抖动。
- 启动主 chunk 2.2MB，无路由级懒加载；`MarkdownImage.tsx:10`、`useFileApplications.ts:10` 缓存无上限；`styles/base.css:131-176` 运行中工具行 shimmer 动画 `background-position`。

## 方案

### M1 会话读取增量化（主进程）

- 缓存命中判断前置：先用轻量的文件指纹（大小 + mtime，或存储层已有 revision）判断缓存是否有效，命中直接返回，不读文件。
- journal 只追加：已缓存会话文件变长时只读新增字节，解析新增行后追加到缓存的事件数组与索引（starts / requests / calls），校验只对新增事件做；文件变短或指纹异常则全量重读。
- 去掉 `JSON.stringify(read)` 计算字节；缓存成本用文件字节数估算；预算改为按会话个数（与决策 2 对齐），大会话也能进缓存。
- 整 buffer sha256：只在确实需要完整性校验的路径做，或改为增量哈希；不在每次读取时重算。
- 保持对外接口与语义（revision、integrity、问题报告）不变。

### M2 释放空闲会话（主进程）

- 在 runtime 层维护打开会话的 LRU：运行中、当前查看（有渲染端订阅/选中）、有 pending 审批或后台任务的会话为"钉住"；其余超过 3 个时对最旧的调用 `closeOpen`。
- 重新打开已释放会话走正常 resume 路径（M1 之后只是一次性解析）。

### M3 进程间消息合并（主进程 ↔ 渲染端）

- `#emitRuntimeLive` / 流式适配处把同一会话的连续文本与推理 delta 按约 33ms 合并为一条再发送；非 delta 事件（工具开始/结束、审批、run 结束）立即发送且先冲刷已缓冲的 delta，保证顺序。
- 查清 `agentStream`、`sessionLiveEvent`、`journal-update` 三条通道各自的渲染端消费方；只保留一份携带 delta 正文的通道，其余去掉正文或不发，渲染端相应调整。去重方案先在执行记录里写清依赖再改。

### R1 渲染端精确订阅与外围防重渲染

- 会话投影 context：只在当前 `sessionId` 的 cell / overlay 引用变化时更新 value；需要其他会话的组件改用按 id 的 selector hook。
- 实时输出订阅从 App 根下移到真正需要的组件（消息区、用量胶囊等）。
- Sidebar、RightPanel、Composer 外壳等加 `memo`，传入的回调与对象稳定化；`SidebarSessions` 的排序/分组 `useMemo`；`WorkbenchLayout`、`ConversationView` 的 select 计算按 cell 缓存。
- 设置、使用统计、Harness 统计、轨迹视图、Space 页改为 `React.lazy` 路由级懒加载。
- 新增渲染次数测试：模拟流式 N 帧，断言 Sidebar / RightPanel / Composer 外壳渲染次数不随帧数增长。

### R2 客户端事件追加去 O(n)

- `session.ts`：事务边界状态（compaction / recovery 是否进行中）记在 cell 上随事件更新，不再复制反转整表查找；事件窗口追加避免整表复制（保持对外不可变语义或改为受控的追加结构），messages / tools 更新同理。
- 用基准测试证明单事件成本与会话长度无关。

### R3 面板轮询减负

- 子 Agent 记录：运行中改为增量（按 seq 拉增量或订阅 live 事件）；即使仍轮询，也要数据没变不 setState、已有消息块复用引用只追加新块；列表轮询做相等判断。
- Context 面板：`notModified` 时不 setState；loading 只在首次或可见的手动刷新时显示。

### R4 次要项

- `MarkdownImage` data URL 缓存与 `useFileApplications` 图标缓存加按字节/条数的 LRU 上限。
- 运行中工具行 shimmer 改为 transform/opacity 驱动的合成层动画，保持视觉一致与 `prefers-reduced-motion`。
- `ToolLogLine` 的每行 ResizeObserver + window resize 合并为共享 observer。

## 分工（Opus 5.5 high，并行，文件不重叠）

| 子智能体 | 条目 | 主要文件 |
|---|---|---|
| PERF-A | M1 | `packages/session/session-persistence-jsonl/**`、`packages/session/session-projection-cache/**`、存储层相关 |
| PERF-B | M2、M3 | `packages/core/runtime/src/session/**`、`apps/desktop/src/main/runtime-v2/**`、`packages/client/client/src/live/stream-adapter.ts`、渲染端 live 事件接入（`renderer/session/desktop-session-bridge.ts`、`renderer/api` 的 live 事件） |
| PERF-C | R1 | `renderer/App.tsx`、`renderer/session/SessionProjectionContext.tsx`、`live-runs/**`、`components/WorkbenchLayout.tsx`、`ConversationView.tsx`、`sidebar/**`、`right-panel/RightPanel*.tsx`、`composer/Composer.tsx` 外壳 |
| PERF-D | R2、R3、R4 | `packages/client/client/src/sessions/session.ts`、`right-panel/SubagentsPanel.tsx`、`right-panel/context/use-context-panel.ts`、`messages/markdown/MarkdownImage.tsx`、`turn-tail/useFileApplications.ts`、`styles/base.css`、`messages/ToolLogLine.tsx` |

跨范围需要改的点：在自己的执行记录里写明，交主智能体协调，不直接改别人的文件。

## 验证方式

- 基线与对比（改前、改后各一次，数字写进执行记录）：
  - 读 journal：对本机最大 journal 的只读副本（复制到 `tmp/perf/`，不碰用户数据目录）跑 inspect / projection-cache 读取基准：首次读取耗时、命中缓存耗时、追加 1 条事件后读取耗时。
  - 客户端事件追加：5k / 20k 事件窗口下单事件 `applyLiveUpdate` 耗时。
  - 渲染次数：流式 100 帧下外围组件渲染次数。
  - IPC：流式 1 秒内 `webContents.send` 次数（单测或计数器）。
- 自动化：`pnpm --filter @actspace/shared build && test && typecheck`；client test/typecheck；desktop typecheck + 全量 test；web test/typecheck；受影响 packages 的 test/typecheck；`check:frontend-tokens`、`check:frontend-theme`、`check:ipc-channels`、`check:renderer-bridge`。
- 实机（Electron，打包版与开发版）：打开 37MB 会话耗时与主线程延迟峰值（性能面板 `mainDelayMs`）；流式输出 1 分钟手感；开着 Context 面板空闲 1 分钟延迟峰值；连续打开 10 个会话后主进程内存回落。

## 风险

- 增量读取与 journal 修复/截断路径：文件被截断、修复或换写者时必须回退全量重读。
- 释放会话与运行中状态：钉住条件遗漏会导致运行中会话被关；需要测试覆盖。
- IPC 合并改变时序：非 delta 事件必须先冲刷缓冲，测试覆盖顺序。
- memo 引入陈旧闭包：回调稳定化要配合测试。

## 进度记录

- [x] 基线数据（37MB / 30MB / 17MB 三份 journal 只读副本）
- [x] PERF-A（M1）：增量续读 + 缓存优先、LRU 3 会话 / 96MB、校验不重复
- [x] PERF-B（M2、M3）：空闲会话释放（常驻 3 个，钉住运行、排队、子 Agent、后台任务、正在看、侧边对话父会话、英语学习目标）；正文增量只走 agentStream 并 33ms 合并，chunk 批量发送，去掉无人读的 delta live 信封
- [x] PERF-C（R1）：transcript store + `useProjectionSelect` 订阅隔离，外壳 memo，设置 / 轨迹 / 扩展 / 子 Agent 面板懒加载
- [x] PERF-D（R2、R3、R4）：客户端追加不再整窗复制，子 Agent 转录按块复用，Context 面板未变不 setState，图片 / 图标缓存有上限，扫光改 transform
- [x] 主智能体审 diff、复跑全量、对比数据（2026-11-05）
- [ ] Electron 实机验收（打开 37MB 会话耗时与主线程延迟、流式 1 分钟手感、Context 面板空闲 1 分钟、连开 10 个会话后主进程内存回落、首次打开设置 / 轨迹的懒加载闪烁）

### 对比数据（自动化，本机）

| 指标 | 改前 | 改后 |
|---|---|---|
| 37MB 会话首次读取 | 640ms | 308ms |
| 同一会话再次读取（缓存命中） | 633ms | 0.3ms |
| 追加 1 条事件后读取 | 605ms | 11ms |
| 30MB / 17MB 会话追加后读取 | 647ms / 335ms | 6ms / 3ms |
| 读取基准进程峰值 RSS（37MB） | 899MB | 622MB |
| 流式 100 帧：侧栏 / 右栏外壳 / 输入框外壳渲染次数 | 各 202 | 0 |
| 100 个 delta（10ms 间隔）的 `webContents.send` 次数 | 300 | 50 |
| 打开 10 个会话后常驻的空闲会话 | 10 | 3 |
| 渲染进程主包 | 2161KB（gzip 643） | 1800KB（gzip 529） |

增量结果与冷读逐项相等（`equalsCold`），三份 journal 都通过。全量：`pnpm typecheck` 通过；`pnpm -r test` 73 个包全部通过（desktop 290 文件 2739 用例）；各 `check:*` 与脚本测试通过。
