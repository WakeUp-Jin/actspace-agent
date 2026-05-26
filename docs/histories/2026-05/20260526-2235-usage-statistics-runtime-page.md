# actspace Usage Statistics runtime page

## 用户诉求

点击左侧边栏 `Usage` 时，打开真实的统计页面，不再只显示占位内容；统计页数据来源于 `session.jsonl` 聚合结果。

## 本次变更

- 在 `packages/shared` 增加 Usage Statistics 的 IPC 与快照类型。
- 在 `packages/agent-core` 新增 session 统计聚合层，从 `session.jsonl` 生成统计快照。
- 在 `packages/desktop` 的 main / preload 暴露 `usage-statistics:get` IPC。
- 在 renderer 中把 `Usage` 入口接到正式统计页，并加入工具详情弹窗与 range 切换。
- 补充统计页的蓝色系紧凑布局样式。

## 设计动机

统计页需要直接消费事实数据，所以把聚合逻辑放在 `agent-core`，renderer 只负责展示。页面布局继续沿用原型的两栏仪表盘结构，但收紧了卡片尺寸和间距，让它更接近产品页而不是展示稿。

## 主要影响文件

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/usage-statistics.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsView.tsx`
- `packages/desktop/src/renderer/styles.css`
