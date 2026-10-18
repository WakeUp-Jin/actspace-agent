# 2026-10-18 19:12 | Context 面板「路径」卡片

## 用户诉求

在右侧 Context 面板展示活跃路径和睡眠路径；先派子智能体看上下文管理引擎现状，做 HTML Demo 确认后再实现。

## 本轮变更

- Demo 迭代后确认：会话统计下方独立「路径」卡片；周期与活跃 n/100、睡眠 n 两格常显并兼当切换；只有列表默认收起；保留「待唤醒 / 将睡眠」预判。
- 预判规则抽到 `@actspace/shared`（`selectNextActivePathIds`），引擎压缩与 Desktop 分页响应共用；新增 `ContextPathEntry.nextCompaction`。
- Renderer 新增卡片、列表、分页 hook 与纯函数；mock 路径数据与多页 / 延迟 / 失败场景；对应测试。
- 更新交接文档、右侧面板规范、前端验证场景表；执行记录见 [exec-runs](../../exec-runs/20261018-context-paths-panel/execution-summary.md)。

## 核对结果

- Desktop typecheck、全量测试（1948 通过）、前端 token / 主题 / bridge 检查通过；`check:current-docs` 仅基线旧链接失败。
- 浏览器 mock 浅 / 深 / 窄面板截图核对，修正统计格对齐与脚注折行。
- 未做 Electron 实机验收；未提交、未推送。

去重与版本建键规则已写在交接文档和 hook 注释中，不另建学习文档。
