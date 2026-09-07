# DSH 风格轨迹 renderer 重做

## 用户诉求

在 ActSpace 会话内保留 Chat / Trajectory 单按钮切换，参考 DeepSeek Harness 重做轨迹工作区；先完成 mock snapshot 下的前端展示，真实 Projection / IPC 延后到浏览器验收之后。

## 变更

- `TrajectoryView` 改为 toolbar、时间线、虚拟化 ledger 与详情 inspector 的连续布局。
- renderer 通过 `buildTrajectorySnapshot` 消费完整 trajectory runtime，保留 turn/step、assistant partial 聚合、tool/result 关联、搜索、折叠、source/raw 追溯。
- 使用 `@tanstack/react-virtual` 渲染 ledger，并在无布局尺寸的测试环境提供可见行回退。
- 支持 sequence、duration、actual、time 四种时间线模式和显式 fixture URL 入口。

## 验证

- `pnpm --filter @actspace/desktop exec tsc --noEmit -p tsconfig.json`
- `pnpm --filter @actspace/desktop test -- --run src/renderer/test/trajectory-render-view.test.tsx src/renderer/test/trajectory-builder.test.ts`
- 结果：相关测试通过；完整 desktop 测试套件 82 个文件、553 个断言通过。

## 边界

本轮未接入真实 Session Projection、preload 或 IPC；这些工作等待用户完成浏览器视觉和交互验收。

## 2026-09-05 交互与语义对齐复验

- 隐藏独立的 Sequence/Duration/Wall Time/Time 模式条，保留 toolbar 的 Duration、Turns、Calls 和 Search。
- 主 ledger 使用 SYSTEM、USER、ASSISTANT、TOOL、ERROR 语义标签；Turn 编号嵌入每个 Turn 第一条消息，折叠后显示步骤数和工具调用数。
- Turns 与 Calls 改为真实虚拟行分组，调用折叠保留已归并的 call/result 记录；原始 turn/step 节点继续在 source/raw 中可追溯。
- 详情 tabs 按记录类型调整，assistant 使用 Summary/Preview/Raw，tool 使用 Summary/Payload/Result/Timing/Raw，内部 request/context 显示为 SYSTEM 记录。
- 时间轴增加 pointer 点击与拖拽范围筛选，筛选会同步 ledger。

验证：trajectory focused tests 8/8、renderer TypeScript 和 renderer build 通过；`git diff --check` 通过。`pnpm run check:frontend-theme` 仍被既有 `ProviderLogo.tsx` 与 provider settings 测试中的 legacy brand naming 阻塞，与本轮轨迹样式无关。

## 2026-09-06 核心 UI correction 完成

此前“内部 request/context 显示为 SYSTEM”是错误实现，现已修正：只有提示词快照生成 SYSTEM，初始快照独立于 Turn；其余请求事实从详情追溯。去掉额外模式/统计条，Turn 标签嵌入首条消息左上角；工具组展开恢复整组记录。

详情拆分为独立组件，Assistant 显示 Step 与完整时间指标，Tool 使用 Summary/Payload/Result/Schema/Timing，User 使用 Summary/Preview/Raw/Source。时间轴采用实时选区、最小拖动阈值、范围外淡化、滚轮缩放及右键平移；缺失时间不使用 epoch 零点。空白会话轨迹下的底部 Composer 与草稿已恢复。

完整 fixture 为 96 个 raw event、6 Turn；长 fixture 为 144 Turn，关联 ID 与时间按批次偏移。新增回归覆盖 prompt 去重、Step 编号、缺失指标、重叠时间压缩、长列表身份和空白会话草稿。29 项 focused tests、desktop typecheck、renderer/main/preload build 与主题检查通过。浏览器完成核心交互和浅/深主题目视验证；不将旧版本全套测试数量当作本轮验证结果。

后续同轮补齐本地历史分页入口、详情 resize、逐行 diff、请求边界导航和嵌套工具折叠/跳转；最终 31 项 focused tests 通过。Electron 进程已启动但 Computer Use 不识别临时应用，实机验收和 Phase 5 仍未签收。学习笔记：`docs/learnings/2026-09/20260906-trajectory-fixture-identity.md`。

最终主题检查、文档检查和 scoped diff whitespace 检查通过；renderer build 保留既有大 chunk 提示。

## 2026-09-06 内容块与工具导航收尾

- 根因：builder 保留了部分 sourceBlocks，但详情未消费；工具返回 Assistant 依赖相邻消息推断。已增加明确的 assistantRecordId，按调用块 / assistantMessageId 解析，嵌套工具保留父级关系，身份不完整时不猜测。
- 新增 TrajectoryContent 共用 Summary、Preview、Raw 的内容与工具入口。Raw 保留块顺序和原始文本；完整事件仍在 Source events。Schema 展示请求当时的完整工具定义，Payload 保持本次实参。移除列表请求编号，详情 Request 入口保留。
- 回归守卫：trajectory-relations 的最初两个用例先红后绿；最终 35 项 focused tests、desktop typecheck、renderer/main/preload build 通过。浏览器对照 DSH 完成双向跳转，验证搜索/折叠恢复、第二个调用准确性、浅深 Schema 和无结果 Running 状态。
- 检查同类入口：Summary / Preview / Raw 统一走内容组件，Tool Hierarchy 使用显式归属；未扩展到真实 IPC。Computer Use 仍不识别开发 Electron，实机门禁保留。未提交代码。
- 本轮命中可迁移、陷阱和模式，已补充现有 trajectory fixture identity 学习笔记，解释身份关系与时点快照。

## Phase 5 真实接入（2026-09-06）

- 用户验收前端后批准执行。默认轨迹接入真实 Session Projection / preload / IPC，fixture 仍为显式开发入口。
- 保留 surface/source，适配真实 request snapshot、tool modelOutput/inputSchema、Inbox、压缩与异常终态；Assistant 工具关联使用真实 callId/requestId。
- 主进程投影按单一版本截取，20 Turn 累计历史窗口；bridge 并发/销毁/运行时 gap 保护与稳定消息选择。
- 监听实际 Journal commit，以 40ms 合并事件解决原 live 版本为 0 无法持续刷新的问题。
- 56 项相关回归、类型检查、构建、主题与文档检查；隔离真实 Electron 通过 11 项路径验收，包含 reload 与 Composer 草稿。未执行真实 Provider 和超大 Journal 压测。
- 学习沉淀：同一次投影里的版本一致性，以及真实事件正文未必保存在 data 的接入陷阱，补充到 trajectory fixture identity 学习文档。
