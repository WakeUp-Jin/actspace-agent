# Lab 设计文档

Lab 是 ActSpace 的能力实验台，用于让 Agent 以可追溯的实验方式增长长期能力。本目录集中维护 Lab 产品、页面、Runtime、版本路线、Rust CLI 和原型文件，不再创建二级目录。

## 当前状态

- V0 renderer mock 已落地；后端 Lab Runtime、IPC 和持久化尚未实现。
- 核心界面是实验矩阵，一列代表一个生命周期阶段。
- 核心流程是：假说构建 → 实证验证 → 能力锻造 → 晋升评审。
- 当前实现进度以 `docs/design-docs/lab/lab-implementation-progress.md` 为准。

## 文档列表

- `docs/design-docs/lab/lab-product-design.md`：North Star、产品定位、实验生命周期、核心数据模型和晋升评审。
- `docs/design-docs/lab/lab-frontend-page-design.md`：实验矩阵、阶段卡片、详情弹窗和 V0 页面规范。
- `docs/design-docs/lab/lab-implementation-progress.md`：当前 renderer mock 与待实现 Runtime 边界。
- `docs/design-docs/lab/lab-runtime-architecture.md`：Lab Runtime 与 Main Agent、Kairos、ToolManager 和 registry 的关系。
- `docs/design-docs/lab/lab-versions-index.md`：V0-V3 渐进式构建路线。
- `docs/design-docs/lab/lab-rust-cli-design.md`：由 Agent 安全调用的 Rust 实验室 CLI 和 Docker sandbox 设计。

## 原型

- `prototype.html`：Lab V0 单文件交互原型。
- `prototype-refresh.html`：视觉刷新后的独立 HTML 原型。

## 设计原则

- 先把实验生命周期做成稳定事实，再逐步提高 Agent 自动化程度。
- 长期能力必须带证据、边界、风险说明和评审记录。
- Lab 产物渐进晋升，不能从一次实验直接变成默认启用能力。
- 人类负责方向和授权，Agent 负责探索、实验、整理和候选能力锻造。
- 所有关键实验事实必须落盘，不能只存在聊天上下文。
- 页面应呈现为克制、清晰的实验台，不做成通用项目管理看板。
