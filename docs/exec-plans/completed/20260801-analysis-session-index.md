# 2026-08-01 分析观测会话索引

## 目标

恢复最初参考 Demo 已确认的“会话索引 -> 单会话钻取”结构：从设置进入分析观测时先展示全部未归档会话的轻量索引，用户选择会话后再进入现有 Agent Run / Turn / LLM Call 两栏详情。

## 范围

- 包含：全局分析会话轻量索引、汇总统计、搜索与筛选、会话选择、两级返回、响应式状态、测试与设计文档同步。
- 不包含：Agent 评估、跨供应商网络代理、原始 wire capture、Trace 删除入口、重做现有单会话详情组件。

## 背景

- 原始参考：`claude-tap` dashboard 的会话列表与单会话钻取。
- 相关文档：`docs/design-docs/frontend/front-agent-analysis-observability.md`、`docs/design-docs/agent-runtime/agent-observability-trace-model.md`。
- 相关代码：`packages/shared/src/ipc.ts`、`packages/desktop/src/main/agent-trace-service.ts`、`packages/desktop/src/renderer/components/analysis/`、`packages/desktop/src/renderer/components/WorkbenchLayout.tsx`。
- 当前问题：Settings 入口直接把活动 `sessionId` 传给详情页面，跳过了已确认的会话索引层；返回按钮也未复用设置导航的无边框样式。

## 数据与交互边界

- 首页只读取 Session 元数据和每个 Agent Run 的 summary sidecar；完整 JSONL 只在选中会话和 Agent Run 后读取。
- 当前活动会话仅在首页标记，不自动打开。
- 首页返回设置；详情返回会话首页；不增加常驻第三栏。
- 单个 Session 或 Trace summary 损坏时隔离该条记录，不阻断其他会话。

## 风险

- 风险：会话较多时逐 Session 扫描造成入口卡顿。
  - 缓解：main 提供单次批量轻量索引 IPC，限制为 Session 元数据与 summary sidecar，并隔离单 Session 失败。
- 风险：新增首页后破坏现有详情测试和选中状态。
  - 缓解：保留现有 `AgentAnalysisPage` 作为单会话详情，新增外层 Workspace 组件负责索引和导航。
- 风险：当前工作区存在并行未提交修改。
  - 缓解：只对分析观测相关 diff 做增量修改，不重写或回退既有变化。

## 里程碑与验证

- [x] 共享契约与 main/preload 索引 IPC：Agent Trace service 定向测试通过。
- [x] 会话首页与两级导航：Analysis renderer 定向测试通过。
- [x] 返回样式、响应式与主题：`pnpm check:frontend-theme` 通过。
- [x] 文档与工程收尾：Electron / Renderer 类型检查、Desktop build、`pnpm check:docs`、`git diff --check` 通过。
- [ ] Electron 视觉与交互由用户手动验收；按用户要求不由 Agent 代验。

## 决策记录

- 2026-08-01：以原始 dashboard Demo 为首页信息架构，不重新发明第三栏导航。
- 2026-08-01：首页保留全部未归档会话，包括暂无 Trace 的会话；无记录状态必须明确可见。
- 2026-08-01：会话详情继续复用现有两栏，不把 Session 列表常驻到详情页。
- 2026-08-01：实现完成并转入 completed；人工视觉验收仍作为明确的外部验证项保留。
