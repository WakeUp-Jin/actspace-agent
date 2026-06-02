# Lab 设计文档

Lab 是 actspace 的能力实验台，用于让 Agent 以可追溯的实验方式增长长期能力。

本入口先沉淀长期设计事实，再按版本拆分实施范围。具体代码计划仍应从这里派生到 `docs/exec-plans/`，不要把执行步骤堆进长期设计文档。

`docs/design-docs/` 已改为扁平结构，Lab 专题文档统一使用 `lab-` 前缀；HTML prototype 统一放在 `public/lab/`。

## 当前状态

- 状态：V0 renderer mock 已落地；后端 Lab Runtime、IPC 和持久化尚未实现。
- 适用范围：`packages/desktop`、`packages/agent-core`、`packages/shared`，以及仓库内 `docs/` / skill / CLI / tool 候选产物。
- 核心界面：实验矩阵。一行是一轮实验，一列是一个阶段。
- 核心流程：假说构建 -> 实证验证 -> 能力锻造 -> 晋升评审。
- 当前进度详见：`lab-implementation-progress.md`。

## 文档列表

- `lab-product-design.md`：Lab 的 North Star、产品定位、实验生命周期、核心数据模型、晋升评审和安全原则。
- `lab-ui-experience.md`：实验矩阵页面的信息架构、交互原则和后续前端设计入口。
- `lab-frontend-page-design.md`：Lab 首页、阶段卡片、卡片详情弹窗、新实验弹窗和已完成实验弹窗的前端页面规范。
- `lab-implementation-progress.md`：Lab 当前设计执行进度，区分已落地 renderer mock 与尚未实现的 Runtime / IPC / 持久化。
- `public/lab/prototype.html`：Lab V0 页面单文件交互原型，包含四栏实验矩阵、卡片详情弹窗和已完成实验弹窗。
- `public/lab/prototype-refresh.html`：Lab 页面视觉刷新后的独立 HTML 原型。
- `lab-runtime-architecture.md`：Lab Runtime 与 Main Agent、Kairos、ToolManager、Skill / CLI / Tool Registry 的关系。
- `lab-versions-index.md`：Lab V0-V3 渐进式构建路线，覆盖实验矩阵、辅助实验、沙箱锻造和自主能力研发。

## 设计原则

- 先把实验生命周期做成稳定事实，再逐步提高 Agent 自动化程度。
- 长期能力必须带证据、边界、风险说明和评审记录。
- Lab 产物渐进晋升，不能从一次实验直接变成默认启用能力。
- 人类负责方向和授权，Agent 负责探索、实验、整理和候选能力锻造。
- 所有关键实验事实必须落盘，不能只存在聊天上下文。
