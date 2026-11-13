# 资源监控：悬浮窗与「资源占用」页

## 目标

去掉侧栏底部那行不稳定的性能文字，换成两个入口：一个可拖动、常驻最上层的悬浮窗，和设置 › 系统 ›「资源占用」页。两处显示 ActSpace 整体的 CPU、内存、主线程延迟和分组进程表。数字要准，监控自身要便宜，悬浮窗和资源页都关着时零开销。

## 范围

- 包含：主进程采集器（订阅计数，最后一个订阅者离开即停）、Agent 子进程采集（`ps`，只读 `comm`）、悬浮窗窗口与静态页、设置页「资源占用」、复制快照（macOS 附 footprint）、删除旧性能面板与 `performance` IPC 域。
- 不包含：Web / 移动端、历史持久化、告警通知、按会话拆分占用。

## 背景

- 规范：[front-资源监控规范](../../design-docs/frontend/front-资源监控规范.md)。
- demo：悬浮窗样式 A 已选定，验收后 demo 已删除，结论在规范里。
- 代码：`apps/desktop/src/main/resource-monitor/`、`apps/desktop/public/monitor/`、`apps/desktop/src/renderer/components/settings/resources/`、`packages/util/shared/src/resource-monitor.ts`。

## 风险

- 风险：监控本身吃 CPU，读数失真。缓解：`ps` 每 6 秒一次且不排队，采集器自身耗时和 `ps` 开销单独列为「监控自身」、不计入合计；footprint（约 1.2 s CPU）只在复制快照时跑。
- 风险：悬浮窗挡住主窗口退出 / 重开。缓解：`activate` 改为看主窗口是否存在；非 macOS 关主窗口时一并关悬浮窗。

## 里程碑

1. 规范定稿（口径、分组、颜色、窗口行为、预算）。
2. 共享类型与 IPC 契约 `resourceMonitor`，采集器、进程表、快照文本。
3. 悬浮窗窗口与静态页，设置页「资源占用」，删除旧面板。
4. 测试、检查、文档同步。

## 验证方式

- 命令：`pnpm --filter @actspace/desktop typecheck`、desktop 全量测试（306 文件 / 2947 用例通过）、shared 测试、`check:ipc-channels`、`check:renderer-bridge`、`check:frontend-tokens`、`check:frontend-theme`、`check:current-docs`、`pnpm lint` 全部通过。
- 手工检查：用户在 `pnpm dev` 里手动验收悬浮窗与资源页，通过。
- 观测检查：开关前后 CPU 对比未做自动测量，按用户要求留给手动。

## 进度记录

- [x] 规范与 demo 确认（悬浮窗样式 A、资源页放系统组「更新」上方）。
- [x] 采集器、进程表、快照、悬浮窗位置持久化及单测。
- [x] 悬浮窗与设置页实现，旧性能面板与 `performance` 域删除。
- [x] 自动化验证与文档同步。
- [x] Electron 实机检查（用户在 `pnpm dev` 手动验收通过；悬浮窗收起宽度按反馈 290 → 340 px，展开 340 → 360 px）。

## 决策记录

- 2026-11-11：CPU 用 `cumulativeCPUUsage` 增量算单核百分比，不用按核数归一的 `percentCPUUsage`；内存用 RSS（含共享页），footprint 只进快照。
- 2026-11-11：沿用设置键 `general.performanceMonitoring` 作悬浮窗开关，不迁移数据；窗口位置存 `resource-monitor-window.json`。
- 2026-11-11：悬浮窗页用 `public/monitor/` 静态文件复用主 preload，不进 React 包，减小常驻成本。

## 执行模式

- **交互模式**。
