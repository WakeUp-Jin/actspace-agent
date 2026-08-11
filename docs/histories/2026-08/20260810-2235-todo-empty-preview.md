## [2026-08-10] | Task: 修复 Todo 流式空白与状态图标

### 📥 User Query

修复 Todo 渲染中间短暂清空的问题，并按参考图调整摘要顺序和任务状态图标。

### 🛠 Changes Overview

- 新 Todo 工具的空 partial preview 不再覆盖上一版有效快照。
- 首次仍为空的 Todo 快照不渲染空列表区域。
- 顶部改为左侧折叠箭头加动态 `completedCount of totalCount To-dos Completed`。
- pending 使用空心圆，in-progress 使用旋转图标，completed 使用弱化删除线。
- 增加流式空 preview 保留旧列表的回归断言。

### 🧠 Design Intent (Why)

流式工具参数在完整 JSON 到达前不具备可展示的任务事实，界面应保持最近一次有效状态，避免执行状态在更新间隙闪烁为空。
