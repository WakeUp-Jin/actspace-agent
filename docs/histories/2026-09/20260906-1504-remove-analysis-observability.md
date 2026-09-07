## [2026-09-06 15:04] | Task: 删除设置中的分析观测功能

### Execution Context

- Agent：Codex 主任务代理。
- Runtime：Codex desktop，本地 workspace。

### 用户诉求

> 设置页面里的分析观测没有必要，删除功能及相关代码。用户已确认删除范围并批准执行。

### 变更

- 删除设置导航的 analysis 分区、会话索引、独立详情工作区及 Workbench 路由和状态。
- 删除 5 个 Analysis 组件/视图模型文件、2 个专用测试文件，以及退役的 HTML 原型。
- 删除 5 个 Analysis / Trace 专用 IPC channel、preload bridge、Window 声明、Shared DTO 和专用 Journal 投影与汇总函数。
- 将工作台路由测试改为验证：设置不含分析观测，Usage 和归档仍可见，返回聊天恢复 Composer。
- 同步架构、设置、存储、Journal 观测与文档导航；旧页面规范保留退役说明。相关未结束计划标明原有 Analysis 保留条目已失效，历史发布与已完成计划保留追溯事实。

### 边界

聊天、Trajectory、Context、Usage、Runtime 事件记录和用户 Journal / Artifact 数据保持不变。本次按修改前工作区快照检查差异，保留已有未提交工作；未提交或推送。

### 验证

- `pnpm --filter @actspace/runtime... build`：通过，重建依赖闭包。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop test`：83 个文件、573 项测试通过。
- `pnpm --filter @actspace/desktop build`：通过；Vite 报告主 chunk 大于 500 kB 的提示。
- `pnpm check:docs`：通过。
- `git diff --check`：通过。
- 源码和 Desktop/Shared 构建产物扫描：无 AgentAnalysis、AgentTrace、agent-analysis 或 agent-trace 专用代码残留。
- Chrome renderer：实际查看设置页，活动分组仅有 Usage 和归档会话；没有分析观测，点击返回正常恢复聊天与 Composer。
- Electron：通过仓库 launcher 使用独立临时数据目录启动。Computer Use 无法解析该开发应用的 bundle ID 或 app 路径，故真实 Electron 窗口交互未验收；浏览器检查不替代 preload/IPC 验收。启动日志存在 Chromium cache 目录初始化错误，未据此宣称桌面启动验收通过。

### 学习沉淀

本次是已批准的功能退役，主要为依赖追踪和删除既有代码，未同时命中新概念、深度或新模式等两项条件，不新增学习文档。
