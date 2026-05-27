# Kairos 监控页视觉与交互改造

## 目标

把当前 Kairos v1.0 的“header + 原始事件表 + 原始 JSON 详情”改造成更接近产品监控台的页面：顶部控制精简，运行轨迹低密度展示关键状态，主体为左侧执行列表和右侧统计/详情；最终回复默认完整可见，工具结果通过同一个详情容器里的 tab 按需查看。

## 范围

- 包含：
  - 更新 `packages/desktop/src/renderer/pages/KairosPage.tsx` 的页面结构、执行列表、统计区、详情区和 tab 状态。
  - 更新 `packages/desktop/src/renderer/styles.css` 中 Kairos 相关样式。
  - 更新 `packages/desktop/src/renderer/test/kairos-page.test.tsx`，覆盖 header 精简、执行列表选择、最终回复默认展示、工具结果 tab 和运行轨迹颜色语义。
  - 必要时在 `packages/desktop/src/renderer/state/useKairos.ts` 内增加轻量 selector，但不改变 IPC 契约。
  - 完成后按 `docs/HISTORY_GUIDE.md` 记录 history。
- 不包含：
  - 不改 `packages/shared/src/kairos-contracts.ts` 的公开类型。
  - 不改 `aggregateKairosEvents` 的聚合语义，除非发现现有 row 无法拿到最终回复或工具结果的必要事件。
  - 不恢复 Briefs / 配置 / 笔记 tab。
  - 不新增 Kairos 后端 IPC、存储、controller 或 scheduler 能力。
  - 不引入新的 UI 组件库或状态库。

## 背景

- 相关文档：
  - `AGENTS.md`
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/design-docs/agent-core/kairos-autonomous-mode.md`
  - `docs/design-docs/frontend-ui/Kairos监控页规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/HISTORY_GUIDE.md`
  - `docs/QUALITY_SCORE.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/pages/KairosPage.tsx`
  - `packages/desktop/src/renderer/styles.css`
  - `packages/desktop/src/renderer/state/useKairos.ts`
  - `packages/desktop/src/renderer/test/kairos-page.test.tsx`
  - `packages/shared/src/test/fixtures/kairos-events.ts`
  - `packages/shared/src/kairos-aggregator.ts`
- 已知约束：
  - 本仓库要求写代码前先描述方案并等待批准；本 plan 获批前不进入代码实现。
  - Kairos renderer 需要在没有 `window.kairos` 时保留明确的不可用状态。
  - `view === "kairos"` 时 Workbench 不渲染右侧文件面板，KairosPage 自己承担完整主区域。
  - 前端改动完成后需要工程验证和视觉/交互验证，桌面链路最终要看 Electron 窗口。

## 风险

- 风险：最终回复内容分散在 `assistant_message` 或 `assistant_reply` payload 中，详情 selector 写错会导致默认回复为空。
  - 缓解方式：用 fixture 覆盖两类 assistant 事件；selector 优先读 `payload.content`，找不到时显示明确空态。
- 风险：运行轨迹新增后，事件多时导致横向溢出或布局抖动。
  - 缓解方式：轨迹使用固定高度和可压缩块宽，超过窗口按容器宽度抽样或隐藏较早块，不影响执行列表完整性。
- 风险：工具结果和最终回复共享详情容器后，选中行与 tab 状态可能互相打架。
  - 缓解方式：规则固定为选中 `tool` 行自动切到 `工具结果`，选中 `reply` 行自动切到 `最终回复`；用户手动切 tab 不改变左侧选中行。
- 风险：视觉改造只靠单测无法证明 Electron preload / IPC 真实链路。
  - 缓解方式：先用 renderer 单测和浏览器 mock 验证布局；最终用 `pnpm dev:log` + Electron 窗口观察做桌面验收。

## 里程碑

1. 调研与方案收敛。
   - 对照 `Kairos监控页规范.md` 梳理现有 `KairosPage.tsx` 与 CSS 的差距。
   - 确认现有 fixtures 是否足够覆盖 reply / tool / sleep / failed。
2. 实现页面结构。
   - 精简 `KairosHeader`，移除 header meta。
   - 新增紧凑 `KairosRuntimeTrace`。
   - 将主体调整为左执行列表、右侧统计区和详情区。
3. 实现交互与 selector。
   - 执行列表类型文案和无色图标映射。
   - `最终回复` / `工具结果` segmented tabs。
   - 从 `selectedEvents` 中提取最终回复正文和工具结果摘要。
4. 样式打磨。
   - 收敛运行轨迹颜色：蓝/黄/红/灰。
   - 执行列表选中态、状态 badge、统计区、详情区响应式。
5. 验证、文档与收尾。
   - 更新单测。
   - 运行工程验证。
   - 浏览器 mock 或 Electron 验证后记录结果。
   - 读取 `docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`，按要求写 history；若本次知识沉淀命中学习文档条件，再读 `docs/learnings/WRITING_GUIDE.md`。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop test -- kairos-page`
  - `pnpm typecheck`
  - 如样式或构建链路有疑问，再跑 `pnpm build`
- 手工检查：
  - header 不出现 Workspace / Session / Last wake / Sleep today。
  - 运行轨迹只有蓝、黄、红、灰四类语义色。
  - 页面主体为两列，不出现第三个竖向详情栏。
  - 默认完整显示最终回复：`环境无变化，仍无配置路径、无会话、无 briefs。继续休眠。`
  - 点击工具执行行后，同一详情容器切到工具结果；未选中工具时工具结果为空态。
  - 执行列表图标无色，状态 badge 有色，选中态清楚。
- 观测检查：
  - 开发态优先用浏览器 mock 快速看布局密度。
  - 收尾用 `pnpm dev:log` 打开 Electron，按 `docs/FRONTEND_VERIFICATION.md` 观察真实窗口；若当前环境无法完成 Electron 观察，需要在 final 中说明并请用户用截图补验。

## 进度记录

- [x] 确认仓库协作、架构、前端验证和 plan 规范。
- [x] 新增 Kairos 监控页前端设计规范。
- [x] 更新 Kairos 长期设计文档的渲染规范入口。
- [x] 生成本 execution plan。
- [x] 等待用户批准代码实现方案。
- [x] 实现 KairosPage 结构和交互。
- [x] 更新样式与单测。
- [x] 完成验证、history 和收尾记录。

## 收尾记录

- 2026-05-28：`KairosPage.tsx` 已完成监控台化改造：精简 header、紧凑运行轨迹、执行列表分页、右侧统计区、最终回复/工具结果共享详情容器。
- 2026-05-28：`styles.css` 已按真实 Electron 窗口调整表格列宽和轨迹块宽度，避免中文类型列竖排；运行轨迹改为按 `durationMs` 映射固定像素宽度，短耗时事件保持可见，长耗时事件占比更大。
- 2026-05-28：根据运行轨迹反馈，轨迹改为保留全部事件并在超宽时水平滚动；宽度尺度收敛为 `20px + seconds * 5px`、最大 100px，不再从头部裁掉历史。
- 2026-05-28：`kairos-page.test.tsx` 已补充 header 精简、运行轨迹四类色、执行列表分页、工具行自动切 tab 等覆盖。
- 2026-05-28：已运行 `pnpm --filter @actspace/desktop test -- kairos-page` 和 `pnpm typecheck`，均通过。
- 2026-05-28：已用 `pnpm dev:log` 打开真实 Electron 窗口，观察到 `kairos controller ready`，并验证 Kairos 页面两列布局、最终回复默认展示、工具执行行切换到工具结果 tab。
- 2026-05-28：根据真实截图反馈，将桌面两列比例从左 45% / 右 55% 调整为左 70% / 右 30%，让执行列表拥有更稳定的阅读宽度。

## 决策记录

- 2026-05-27：Kairos 页面采用“左执行列表 + 右统计/详情”的两列结构。原因是执行列表负责定位，右侧负责解释，避免原始事件表与详情 JSON 抢占阅读重心。
- 2026-05-27：最终回复与工具结果不同时展示，改为同一详情容器内的 segmented tabs。原因是最终回复必须默认完整可见，工具结果只在用户主动查看或选中工具行时出现。
- 2026-05-27：运行轨迹颜色固定为蓝=回复、黄=睡眠、红=异常、灰=其他。原因是 Kairos 监控页需要突出关键状态，工具和 tick 不应形成彩虹噪音。
- 2026-05-28：执行列表使用固定列宽和 `white-space: nowrap` 保护类型列。原因是真实 Electron 窗口里中文类型标签会在默认表格算法下被压成竖排，必须把关键定位列从摘要列的挤压中解耦。
- 2026-05-28：运行轨迹块改为 duration-driven timeline。原因是 Kairos 轨迹要表达执行时间占比，但不能让 900s/1000s sleep 按真实秒数撑爆布局；最终尺度为无耗时 20px、每秒 +5px、封顶 100px。
- 2026-05-28：运行轨迹超宽时使用水平滚动，不丢弃头部事件。原因是轨迹属于历史观察面板，删除早期事件会让用户无法回看完整运行过程；横向滚动更符合日志/时间轴语义。
- 2026-05-28：桌面主区比例改为 7:3。原因是执行列表承担事件定位职责，摘要和类型列更需要横向空间；右侧详情负责解释单个事实，30% 宽度足够承载统计和换行后的最终回复。
