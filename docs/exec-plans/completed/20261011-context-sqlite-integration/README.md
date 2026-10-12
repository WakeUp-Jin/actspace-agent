# Context 面板数据补齐与 SQLite 联合执行计划

状态：实现完成并收尾，保留明确验收边界。2026-10-12 用户取消 L（510 万条）余下验收，不作为本轮门槛；默认并行测试失败和资源观察仍如实登记。2026-10-11 用户批准六项决策及联合计划；主智能体实现与修复，最后由 gpt-6.1-sol 执行 Computer Use。

## 目标与执行边界

在 `fix/context_manager_v1` 上补齐 Context 五区块真实数据，修复共享查询基础问题，并在同一集成版本签收后端、规模和真实界面。基线为 `2cbb634f` + 现有未提交改动；不提交、推送或清理恢复 stash，除非用户另行要求。

这是一份跨层联合变更，不把任务编号当成可独立发布阶段。现有调用方在实施中保持可用，最终同一次集成验收。超过 8 个文件，主智能体负责开发、定位、修复；最终 Computer Use 委派 `gpt-6.1-sol`，不可静默改用 Astra。

原 [SQLite 验收计划](../20261011-usage-sqlite-acceptance.md) 继续作为 A/P/E 验收子计划与阈值来源；本计划是执行顺序唯一入口，不重复启动两套验收。原 [U-01–U-10 清单](../../../exec-runs/20261011-usage-sqlite-read-model/acceptance-bugs.md) 是这些 Bug 的唯一状态登记处，新 Context 问题在本次执行目录登记 C-编号并双向引用。

## 必读与事实来源

- 根 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/CODING_BEHAVIOR.md`。
- [联合设计](../../../design-docs/上下文管理引擎设计/上下文管理引擎V2/05-Context面板与SQLite联合设计.md)；[V2 总入口](../../../design-docs/上下文管理引擎设计/上下文管理引擎V2/README.md)。
- [面板数据需求](../../../design-docs/frontend/front-Context面板后端数据需求.md)、[前端开发清单](../../../design-docs/frontend/front-新功能开发清单.md)、[前端验证](../../../FRONTEND_VERIFICATION.md)。
- [SQLite 设计](../../../design-docs/筛选存储改版V2-增加SQLite/README.md)、[Worker 规范](../../../design-docs/筛选存储改版V2-增加SQLite/worker.md)、原执行摘要与上述 Bug 清单。
- [Agent 测试规范](../../../design-docs/agent-plugin-runtime/agent-testing.md)、[本计划验收矩阵](acceptance.md)。
- [原 SQLite 会话决策校验](../../../design-docs/上下文管理引擎设计/上下文管理引擎V2/06-原会话决策与联合方案校验.md)：区分已确认约束、新增提案和未交付的历史讨论项；不得把导出/doctor 自动视为已完成或擅自扩展本任务。

## 输入、输出与依赖

Session JSONL 是输入事实；Context 引擎暴露当前只读投影；Desktop 查询 Worker 保存可重建历史摘要；schemaVersion 2 面板契约是 renderer 的唯一入口。SQLite schema 9、Context manifest/estimator/projector 版本和独立水位以联合设计为准，当前实现为 schema 9。Runtime 不反向依赖 Desktop SQLite，来源插件不直接查询数据库。所有 SQLite 同步与迁移均由查询需求触发；关闭全部查询消费者后不持续扫描。

执行前记录 branch/HEAD、tracked diff 与 untracked 文件指纹、lockfile、Node/Electron 版本；核对原有 stash 的存在，但不恢复或删除它。不为“干净工作区”覆盖用户改动。隔离验收数据、workspace、cwd，禁止指向真实用户数据。

## 任务与验证

### T1 契约、时间正确性与回归基线

依赖：用户批准执行。修改 `packages/shared/src/context-panel.ts`、`apps/desktop/src/main/runtime-v2/usage-activity-write.ts`、`usage-catalog-projection.ts`、`usage-session-fallback.ts`、`usage-catalog-fallback.ts`、Worker 与 `apps/desktop/scripts/test-usage-read-model.mjs`。

- 定义 current/history 分别版本、代际、状态、truncation、分页和不可比较原因；同步 renderer/mock 兼容旧占位返回，不能把尚未实现字段当成功。
- 定义条件请求的版本令牌与 notModified 响应，覆盖模型 facts/估算器独立变化、历史进度与查询条件；保留旧 Usage page 输入兼容、FTS 范围和全局累计语义。
- 时间先规范化再作 resetAt 过滤和排序；补正负 offset、相等边界、同时间 sessionId 稳定 cursor、普通索引与 fallback。
- 先运行已有 U-08/U-10 原始失败断言，修复后移除对应 TODO 标记。日期修复不能只覆盖新数据；旧库迁移由 T3 完成。

验证：`node --test apps/desktop/scripts/test-usage-read-model.mjs`；记录失败→通过及原始统计口径未变。回退：仅回退本任务精确 diff，未改 Journal。

### T2 单会话查询与 durable 前缀校验

依赖：T1。修改 `packages/session/storage/src/index.ts`、`packages/session/jsonl/src/query-reader{,-worker}.ts`、`packages/runtime/src/session/session-controller.ts`、`packages/agent-service/src/application.ts`、Desktop `runtime-registry.ts` 和相邻测试。

- 增加单 Session descriptor 的 Runtime/App 转发；与批量接口共用 durable/codec/error 校验。
- 将文件 identity、物理 stamp 与 durable 前缀的判定分开；Runtime 已持有写权的合法尾部增长不触发同水位全量重建。
- 保留替换、截断、同大小覆盖、失效 cursor、codec 变化的检测；不可验证来源保守重建，不省略 stamp。

验证：JSONL Provider 与 Runtime 定向测试；同水位热查读 0 事件，1k/5k 追加只读新增；真实 Journal 未 flush 尾部场景与受控 Provider 分别报告。单会话调用须断言未枚举其他 Session。对应 U-04，并为 U-01 铺路。

### T3 可恢复同步、schema 9 与任务生命周期

依赖：T2。修改 `usage-read-model.ts`、`usage-read-model-worker.ts`、`usage-read-model-schema.ts`、`usage-journal-projection.ts`、`usage-rollups.ts`；允许新增同目录 `read-model-sync.ts` 拆出调度/状态机，不新增外部服务或 Worker owner。

- 区分 waiter 与共享同步任务；批次事务持久化关联状态/cursor/水位；同 schema 重建按 Session/投影使用 building/published generation，FTS/rollup/run 去重也须隔离，失败不得发布半成品或双计数。
- 按联合设计执行批次公平调度、8 请求预算、取消与退出；Worker 终止完成后才允许新 owner 启动。
- schema 8 → 9 在首次查询时显式重建，空表先建索引，按需 Session 分批导入；不能为 Context 查询强制同步全库。跨 schema 历史保持 rebuilding，不承诺旧 published 可读；同 schema 才复用旧代。记录旧 M/L 约 35/91 分钟重放基线、升级耗时和磁盘成本。
- 保留超时不删库、取消不重建、等待 owner 真正退出、单坏来源隔离及恢复重入；损坏/schema 恢复最多一次后进入有界 fallback。条件探测不得每轮触发清库重建；驱动不可用显式失败。清除隐式巨表补建路径，U-05 原长 SQL 仍需专项复验。
- `WorkbenchLayout.tsx` 使离页取消等待不破坏共享进度，显式取消独立处理；更新对应 Usage 交互测试。

验证：每个批次边界故障注入、重启不重复/漏数、发布切换原子性、旧版派生库升级、双 owner、取消/退出/重试；真实巨型 Session 复验 U-02/U-05/U-09。回退：停止 owner 后隔离派生库，由旧代码重建；不删除事实。当前 UI 保留可见失败状态。

### T4 启动与现有查询性能修复

依赖：T3。修改 `session-workspace-facts.ts`、`runtime-registry.ts`、`usage-read-model-worker.ts`、`usage-rollups.ts`、`usage-sql.ts` 及对应 benchmark/test 脚本。

- 首窗口只等待已注册 workspace，历史 workspace 发现后台有界运行；先核对接纳顺序，选中会话和后台恢复/写入都须从 Session 校验归属，不用 SQLite 授权。保留 pending-task 提示和 delegation lineage 预筛选，不能回退到列表触发全量恢复，也不借权限发现启动 SQLite 同步。
- 对新增事件链路分别测读/传输/投影/提交；复用 prepared statements、批绑定和 dirty group，禁止全历史 JS 数组。
- 标题部分命中查询用 session 索引限定集合，保留精确聚合；首查与缓存命中分别量测。

验证：U-01 原20次/规模追加及U-06首次/热查询分布保留为压力边界，按2026-10-12用户确认不再单独阻断本次完成；不将未达原目标改写为性能通过。继续验证U-03启动/权限、普通单次回复与少量工具调用更新、热查询及正常交互。

### T5 Context 清单、身份与轻量当前投影

依赖：T1，可在 T4 后顺序实施。修改 `packages/context/engine/src/{request-snapshot,projection,types,instances}.ts`，新增 `manifest.ts` 与单测；修改 `packages/core/agent-loop/src/loop.ts`、Session codec 及 Runtime/App 投影接线。

- 当前与请求基准共用分类/估算器，保留 owner/section/message/call/compaction 身份；估算在内容裁剪前完成。
- prepare 后输入的 manifest 采用向后兼容 metadata；未知旧身份标不可比较；请求输入记录不宣称网络送达。
- 暴露当前模型容量与实际压缩策略阈值；未知为 null；摘要独立分类，思考与工具类型可筛选并定位轨迹。
- 当前投影按实例代际/revision 及模型 facts/估算器版本缓存；纯读取不启动 Run、不读全 Journal、不触发带写入副作用的组装。Composer 复用轻量结果。

验证：转换内容与 manifest 同源、快照不可变、Step 后局部更新、切模型配置一致、重试 requestId、旧快照兼容、临界/超限体积和权限；运行 Context/Loop/Runtime 包测试。

### T6 Context 历史索引与查询

依赖：T3、T5。新增 Desktop `runtime-v2/context-history-projection.ts`、`context-history-query.ts`；扩展既有 Worker/schema/service；新增 `apps/desktop/scripts/test-context-read-model.mjs`。

- 创建联合设计指定的请求摘要、最近清单、事件和会话统计表，独立 projector/estimator 水位；只同步当前请求涉及的 Session。
- usage 按 requestId 与既有语义去重，处理跨批次重试和终态；会话累计不受全局 resetAt 影响。
- recent manifest 有界保留；500 趋势/200 事件与截断状态；inferred 事件及未知回收量不伪造。
- 添加 Context 查询 benchmark（`apps/desktop/scripts/benchmark-context-read-model.mjs`），支持与既有 Usage 负载同时运行，记录单会话枚举数、事件读数、IPC 字节和磁盘。

验证：同源受控期望与 SQLite/fallback 一致；重新打开、删库重建、新旧混合、累计计数、孤立请求、空态与损坏态；断言不存全文、不受全局 Usage 清零影响。

### T7 面板门面、分页与前端刷新

依赖：T6。新增 Desktop `runtime-v2/context-panel-service.ts`；修改 `fixed-renderer-ipc.ts`、`ipc/guards.ts`、`session-gateway.ts`，shared `desktop-bridge/contract.ts`、`runtime-v2/fixed-renderer.ts`，renderer `api/sessions.ts`、`components/right-panel/context/`、`ContextPopup.tsx`、mock 和对应测试。

- 接通 `describeContextPanel`；增加 `listContextEntries`、`readContextEntry`，sender/Session/revision/cursor 校验完整，不接受任意文件路径。
- 即刻返回当前数据与已提交历史；分页 ≤500 条、全文文本页 ≤64 KiB、主响应目标 200 KiB/硬限 1 MiB；全部总量在分页前计算。
- 事件触发与可见时条件探测合并，最多一个在途请求；同步中 1 秒、空闲退避 5/10 秒、错误 2/5/10 秒为初始参数，资源验收后校准。隐藏停止；相同令牌返回 notModified，不重传清单、不执行聚合、不读事件；实例/索引/模型 facts 变化使缓存失效。
- 当前/历史状态独立、最近请求文案准确、历史无当前实例来源明确；轨迹点击 messageId/callId 与现有导航一致；分页/全文 stale 可恢复。

验证：迟到响应、切会话、同步完成但无新消息、Context 独立变化、隐藏停止、空/null/错误/截断、分页总量不变；新 IPC mock 和不支持远端路由回归。UI 行为变化按主题规范实现，不改五区块布局方向。

### T8 工程集成与后端联合验收

依赖：T4、T7。运行 acceptance.md B1–B9 及旧计划 A1–A4；构建、类型、包边界、IPC 与定向/全量测试。记录最终 source 指纹与实际构建产物版本。修复仅限本计划问题，其他失败保留来源和复现，不改写成通过。

额外检查 SQLite 分支已有修复未退化：pending-task/子会话恢复、坏来源及同 descriptor 恢复、未知费用/混合币种、FTS 限定语义、旧 page 兼容、多 workspace 共享预算、Worker/驱动/打包入口。范围见 acceptance.md 的保留回归清单。

### T9 规模、资源与最终 Computer Use

依赖：T8。先运行 P1/P2 和 Context 并发/体积门禁，再按 acceptance.md 操作分组委派 `gpt-6.1-sol`，覆盖旧 E1–E6 和新增 C1–C8。主智能体修复后对受影响点复验；报告按验收点，不按分组数量签收。Node 性能、真实 Electron IPC 和 CU 三种证据分开。

### T10 收口文档与验收结论

依赖：T9 结果已逐项记录。同步设计实际字段、前端需求、SQLite/Worker 规范、Bug 清单、history；检查学习沉淀条件。统一给出通过/失败/未覆盖，保留已接受例外。只有实施工作实际完成后才按仓库规则移动计划；未做 UI 项仍在摘要明确保留，不能把“已移入 completed”当通过。

## 验证入口

文档阶段已结束，以下命令在实施阶段按依赖运行。实际执行从仓库根运行，先核对脚本参数与对应构建产物。

```sh
pnpm --filter @actspace/runtime... --filter @actspace/client... build
pnpm --filter @actspace/context-engine test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/session-jsonl test
pnpm --filter @actspace/runtime test
node --test apps/desktop/scripts/test-usage-read-model.mjs
node --test apps/desktop/scripts/test-context-read-model.mjs
node apps/desktop/scripts/verify-usage-read-model.mjs
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm test
pnpm build
pnpm check:packages
pnpm check:ipc-channels
pnpm check:renderer-bridge
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:current-docs
pnpm check:docs
```

新增 Context 测试/benchmark 脚本由 T6 创建，不是基线已存在命令。打包 Worker 定位另运行现有 `verify-usage-package.mjs`，先遵循脚本 stock Electron 探针入口，不启动真实用户 profile。

## 进度、记录与回退

- [x] 文档基线核对：分支包含 SQLite 提交，Context 改动保留，无未解决冲突；未代表编译/功能通过。
- [x] 联合设计、实施依赖与验收点落文档。
- [x] 对照用户提供的完整 SQLite 会话校验，修正按需刷新、失败恢复和迁移边界；新增参数仍为待审提案，历史导出/诊断遗漏单独登记。
- [x] 用户批准实施，已保存 artifacts/context-sqlite/implementation-baseline.json 并创建执行记录。
- [x] T1–T4 查询基础修复；已接受性能限制保留。
- [x] T5–T7 Context 数据与前后端接线；真实界面签收归 T9。
- [x] T8 工程/后端验证已执行并记录；默认并行测试失败不改为通过。
- [x] T9 本轮规模与 Computer Use 收尾；M/Small结果见矩阵，L余项用户取消，内存未定性观察保留。
- [x] T10 收口与结果报告；计划归档不等于全部验收通过。

实施获准时创建 `docs/exec-runs/20261011-context-sqlite-integration/{execution-process,execution-summary,acceptance-results,acceptance-bugs}.md`；当前不创建空白执行完成报告。每次修复附原 Bug id、source 指纹、命令、结果和必要证据。截图默认本地、不随 Git 分发。

回退以各任务精确 diff 为单位，保留其他未提交工作；派生库损坏只在停止 owner 后隔离重建。不得 reset --hard、删除 Journal、手改水位跳过验收或丢弃 stash。执行模式为交互模式；用户已批准实施，不重复询问已批准的常规任务。

## 实测后的设计复核

2026-10-12用户已明确同意：不做预先统计，不继续追求一次追加1k/5k的250ms目标，不开展大会话发布结构重构；原性能数据保留为已接受限制，不标为达标。后续重点为正常聊天、少量工具调用、会话切换、统计打开，以及大量历史同步期间这些操作是否可用。反复超时、无法恢复、错误统计和正常操作阻塞仍是待修问题。热查询、内存有界、正确性及既有C/E覆盖不撤销。

[性能复核](../../../exec-runs/20261011-context-sqlite-integration/performance-review.md)中的结构原型提议本次不执行；继续T8–T10验收收尾。Computer Use仍由gpt-6.1-sol执行。

## 最终范围（2026-10-12）

用户明确取消L最终统计、建完后的大库界面及长期资源测量；保留未验证标记，不自动重启。实现已完成，按PLANS_GUIDE进入completed。默认并行测试失败、Main GC后小幅增长未定性、外部服务/最终安装包等边界以执行摘要为准；没有提交或推送。
