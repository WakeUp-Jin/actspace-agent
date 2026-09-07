# 工具体验与轨迹布局调整计划

用户反馈工具可以运行中渲染，但 Thinking、默认审批、Todo、子智能体、路径与参数显示仍需调整；补充轨迹页隐藏输入区。

初次排查仅编写计划，未改业务代码。受控 Todo 探针确认 activeForm 可用于新建和更新，未知 id 报不存在；没有写入用户会话。新增 [执行计划](../../exec-plans/completed/20260906-agent-tool-experience/README.md)，登记导航，并修正上一轮设计导航的过期状态。

具体方案待批准。文档检查与差异格式检查已执行；未提交或推送。

## 后续范围修正

用户确认 Todo 当前界面正常，撤回 Todo 位置、排序与清单状态调整。本计划仅保留后端参数契约说明：activeForm 已支持；新建省略 id，更新使用完整已有 id；未知 id 的不存在错误不等于 UUID 格式校验失败。未修改业务代码。

## Todo 最小修复已完成

用户批准简单有效的 Todo 修复。仅修改 `packages/core/agent/src/todo-tool.ts`：为 id 和 merge 各补一句参数说明，明确新建省略 id、更新复用完整返回 id，以及替换与合并的区别。没有扩展描述或示例，未改 TodoService 或前端。

验证：core-agent build、现有 11 项测试通过；真实 ToolRuntime 加内存 Session 探针通过 activeForm 新建、未知 id 拒绝、完整 id 更新、merge 保留、默认替换与读取确认。没有操作用户 Todo，也未启动真实 Provider。此改动只澄清既有参数语义，不满足新概念与深度等两项学习沉淀条件，不另写学习文档。其余体验计划尚未实施。

## 其余体验调整实施完成

用户批准 Thinking、默认仅 Bash 审批、稳定工具参数摘要、相对路径、轨迹输入区和右侧子智能体改造。

- Thinking 补齐 IPC、Desktop App、Runtime 和两种传输；按模型能力规范化开关及 effort。
- 工具参数不再逐字符渲染，清理 Main partial JSON 解析与参数缓冲定时器。仅 Bash 继续操作审批，边界检查保留。
- 工作空间内展示相对路径，Raw 与执行参数保持原值。
- 轨迹隐藏输入区域并保留组件状态，运行中保留 Stop。
- 子智能体新增右侧列表/详情，委派开始即可取得子会话 ID；修正 transcript 返回契约并支持运行中内容刷新。

已做受控测试及浏览器浅深色交互检查。真实 Electron 工具识别失败，真实 Provider 未调用。最终验证与人工检查步骤见 [执行摘要](../../exec-runs/20260906-agent-tool-experience/execution-summary.md)。本次状态生命周期与异步竞态知识具备可迁移和陷阱两项，记录 [学习速记](../../learnings/2026-09/20260906-view-switch-state-lifetime.md)。未提交、未推送，保留其他工作区改动。
