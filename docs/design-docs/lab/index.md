# Lab 设计文档

Lab 是 actspace 的能力实验台，用于让 Agent 以可追溯的实验方式增长长期能力。

这个目录先沉淀长期设计事实，再按版本拆分实施范围。具体代码计划仍应从这里派生到 `docs/exec-plans/`，不要把执行步骤堆进长期设计文档。

## 当前状态

- 状态：V0 renderer mock 已落地；后端 Lab Runtime、IPC 和持久化尚未实现。
- 适用范围：`packages/desktop`、`packages/agent-core`、`packages/shared`，以及仓库内 `docs/` / skill / CLI / tool 候选产物。
- 核心界面：实验矩阵。一行是一轮实验，一列是一个阶段。
- 核心流程：假说构建 -> 实证验证 -> 能力锻造 -> 晋升评审。
- 当前进度详见：`implementation-progress.md`。

## 文档列表

- `lab-vision.md`：Lab 的 North Star、产品定位、角色关系和最终形态。
- `experiment-lifecycle.md`：一轮实验从诞生、推进、暂停到毕业或废弃的完整生命周期。
- `data-model.md`：Experiment、Stage、Artifact、Evidence、Review 等核心数据对象。
- `ui-experience.md`：实验矩阵页面的信息架构、交互原则和后续前端设计入口。
- `frontend-page-design.md`：Lab 首页、阶段卡片、卡片详情弹窗、新实验弹窗和已完成实验弹窗的前端页面规范。
- `implementation-progress.md`：Lab 当前设计执行进度，区分已落地 renderer mock 与尚未实现的 Runtime / IPC / 持久化。
- `prototype.html`：Lab V0 页面单文件交互原型，包含四栏实验矩阵、卡片详情弹窗和已完成实验弹窗。
- `runtime-architecture.md`：Lab Runtime 与 Main Agent、Kairos、ToolManager、Skill / CLI / Tool Registry 的关系。
- `promotion-and-safety.md`：长期能力晋升、权限、风险、沙箱和人工审批原则。
- `versions/README.md`：版本拆分总览。
- `versions/v0-experiment-matrix.md`：V0 实验矩阵与手动记录。
- `versions/v1-assisted-experiment.md`：V1 Agent 辅助研究和实验记录。
- `versions/v2-sandbox-forge.md`：V2 沙箱验证与能力锻造。
- `versions/v3-autonomous-capability-rd.md`：V3 自主能力研发闭环。

## 设计原则

- 先把实验生命周期做成稳定事实，再逐步提高 Agent 自动化程度。
- 长期能力必须带证据、边界、风险说明和评审记录。
- Lab 产物渐进晋升，不能从一次实验直接变成默认启用能力。
- 人类负责方向和授权，Agent 负责探索、实验、整理和候选能力锻造。
- 所有关键实验事实必须落盘，不能只存在聊天上下文。
