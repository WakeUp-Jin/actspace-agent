# Lab 设计执行进度

本文档记录 Lab 从设计到实现的当前进度。它回答“现在做到哪一层了”，不替代长期设计文档，也不承载具体执行步骤；具体任务仍放在 `docs/exec-plans/`。

## 当前状态

- 状态：V0 renderer mock 已落地；后端 Lab Runtime、IPC、preload bridge 和持久化尚未实现。
- 可体验范围：桌面端 renderer 中的实验矩阵、新实验、卡片详情、阶段推进、暂停 / 取消、已完成实验弹窗。
- 数据来源：renderer 内存 mock fixture，刷新页面后创建、编辑和推进状态会重置。
- 产品边界：当前用于验证 Lab 工作流、信息密度和页面交互，不代表真实实验数据已经落盘。

## 已完成

### 1. 长期设计文档

- `lab-vision.md`：定义 Lab 的 North Star 和产品定位。
- `experiment-lifecycle.md`：定义假说构建、实证验证、能力锻造、晋升评审的生命周期。
- `data-model.md`：定义 Experiment、Stage、Evidence、Artifact、Review 等核心对象。
- `runtime-architecture.md`：描述 Lab Runtime 与 Main Agent、Kairos、ToolManager、Skill / CLI / Tool Registry 的关系。
- `promotion-and-safety.md`：定义候选能力晋升、风险分层、沙箱和人工审批原则。
- `versions/`：拆分 V0-V3 的渐进式路线。

### 2. 前端原型

- `prototype.html`：已沉淀单文件交互原型，覆盖四栏实验矩阵、卡片详情弹窗、新实验弹窗和已完成实验弹窗。
- `frontend-page-design.md`：已将原型转成前端页面规范，明确 V0 首页、阶段卡片、弹窗和不做项。

### 3. Renderer V0 Mock

- `packages/desktop/src/renderer/components/LabPage.tsx`：真实 React renderer 页面已落地。
- `packages/desktop/src/renderer/fixtures/labFixture.ts`：前端 mock view model 和初始数据已落地。
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`：Lab 已从占位页接入真实页面。
- `packages/desktop/src/renderer/test/lab-page.test.tsx`：renderer 测试已覆盖核心交互。
- 样式采用 Tailwind utility 和 `LabPage.tsx` 局部 class 常量，没有新增 `.lab-*` 全局 CSS。

已覆盖的 mock 交互：

- 打开 Lab 页面并查看四栏实验矩阵。
- 创建新实验，在假说构建列生成草稿卡。
- 打开阶段卡片详情。
- 轻量编辑卡片内容。
- 将卡片推进到下一阶段。
- 通过更多菜单暂停 / 取消实验，并移入已完成集合。
- 打开已完成实验弹窗并按结果过滤。

## 验证记录

最近一次 Lab V0 renderer mock 收尾记录见：

- `docs/histories/2026-05/20260528-0245-lab-v0-frontend-mock.md`

记录中的验证包括：

- `pnpm --filter @actspace/desktop test -- lab-page.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`
- Browser mock 打开 Lab 页面，检查四栏矩阵、新实验弹窗、卡片详情、阶段推进、更多菜单和已完成过滤。

## 尚未实现

### 数据与契约

- 尚未在 `packages/shared` 定义正式 Lab IPC / 数据契约。
- 尚未定义可持久化的 LabExperiment schema 与迁移策略。
- 尚未将 renderer mock view model 升级为跨进程共享模型。

### 持久化与桌面能力

- 尚未实现 Electron main / preload bridge。
- 尚未把实验、证据、产物、评审记录写入本地文件或用户数据目录。
- 尚未实现刷新后恢复 Lab 状态。

### Runtime 与 Agent 协作

- 尚未实现 `packages/agent-core` 中的 Lab Runtime。
- Main Agent 尚不能自动创建、推进或整理 Lab 实验。
- Kairos 尚不能把巡检发现沉淀为 Lab 实验。
- ToolManager / Skill / CLI / Tool Registry 尚未接入 Lab 产物晋升链路。

### 验证与晋升

- 尚未实现真实 evidence 采集、命令记录、工具调用记录和产物引用。
- 尚未实现沙箱验证、能力锻造和自动化回归。
- 尚未实现候选 skill / CLI / tool 的人工审批和启用流程。

## 下一阶段建议

下一阶段应从 `Lab Runtime / IPC / Persistence` 开始，而不是继续扩展 mock UI。

建议新建一份 execution plan，目标是把当前 renderer mock 升级为可保存、可恢复、可被 Agent 消费的最小真实 Lab：

- 在 `packages/shared` 定义 Lab 数据契约和 IPC 事件。
- 在 Electron main 中提供 Lab 本地存储读写。
- 在 preload 中暴露最小 `window.lab` bridge。
- 让 `LabPage` 从 bridge 加载真实数据，并保留测试用 mock fallback。
- 把 V0 的创建、编辑、推进、暂停 / 取消、已完成过滤接到真实持久化。

完成这一阶段后，Lab 才能从“可体验的前端实验台”进入“可信的本地实验记录系统”。
