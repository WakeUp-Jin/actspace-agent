# 分析观测与工作台交互收口

## 目标

修复 Workspace 菜单误触、右侧 Tab 选中态过重，以及分析观测页面信息密度、相邻请求比较和 Tools 筛选语义问题。

## 范围

- 包含：Workspace 右键菜单、右侧 Tab 主题样式、分析观测标题与相邻调用比较、实际工具调用索引、旧 Trace summary 兼容、测试与设计文档。
- 不包含：删除 Trace 清理 IPC、修改原始 Trace JSONL、重做分析观测信息架构。

## 背景

- 相关文档：`docs/design-docs/frontend/front-左侧会话栏规范.md`、`front-右侧面板与文件渲染规范.md`、`front-agent-analysis-observability.md`。
- 相关代码路径：`packages/desktop/src/renderer/components/`、`packages/desktop/src/main/agent-trace-service.ts`、`packages/agent-core/src/observability/agent-trace.ts`。
- 已知约束：颜色只消费现有主题 token；旧记录必须继续可读；聊天记录与 Trace 清理能力保持独立。

## 风险

- 风险：旧 summary 把已声明工具当成已调用工具。
- 缓解方式：新增工具汇总版本标记；旧 sidecar 从有边界的 JSONL 重建后回写。
- 风险：比较翻页与页面当前 Turn 选择相互干扰。
- 缓解方式：弹窗维护独立的相邻调用索引，不改变背景页面选择。

## 里程碑

1. 修复 Workspace 菜单和右侧 Tab 视觉。
2. 精简分析标题，完成相邻调用比较翻页。
3. 修正实际工具调用索引并兼容旧记录。
4. 更新测试、设计文档并完成 Electron 验收。

## 验证方式

- 命令：相关 Vitest、`pnpm typecheck`、`pnpm build`、`pnpm check:frontend-theme`。
- 手工检查：真实 Electron 中验证右键菜单、Tab 深浅主题、分析页工具筛选与比较翻页。
- 观测检查：确认旧 summary 可从 JSONL 重建，未调用工具不进入索引。

## 进度记录

- [x] 确认范围、设计约束和根因。
- [x] 完成交互、视觉和 Trace 索引修改。
- [x] 完成自动化与真实 Electron 验收。
- [x] 同步 history 并移入 `completed/`。

## 完成结果

- Workspace 左键不再打开菜单；右键、Context Menu 键与 `Shift+F10` 仍可访问菜单。
- Review 活动 Tab 改用更轻的主题表面色；分析页标题、操作和筛选信息完成收口。
- 相邻 Turn 对比支持前后翻页，Tools 只索引响应中真实出现的工具调用。
- 旧版 Trace sidecar 会从有边界的 JSONL 重建工具摘要，并以版本 2 原子回写。
- 自动化：Desktop `705/705`、Agent Core `903/903`；`pnpm typecheck`、`pnpm build`、`pnpm check:frontend-theme` 通过。
- 真实 Electron：验证 Workspace 左/右键、分析标题、本地记录、实际工具筛选、Turn 对比翻页和 Review 活动 Tab。

## 决策记录

- 2026-08-01：Tools 继续复用 `toolNames` 字段，但语义收紧为响应中实际出现的 `toolCall`；使用 `toolSummaryVersion: 2` 区分旧 sidecar。
- 2026-08-01：比较弹窗只比较同一 Agent Run 内相邻调用，并在弹窗内部翻页。
