## 2026-09-16 | Task: 收敛只读子任务并展示实时活动

### Execution Context

- Agent：Codex 主会话；GPT-6；本机工作树。
- 未提交、未发布，保留其他任务的未提交改动。

### 用户诉求

排查子智能体频繁失败；暂不开放 Bash、编辑和子任务审批；上限改为 300 步；消息流用轻边框与实时翻页活动行区分子任务，回复生成时只显示状态。Codex 图标不接入。

### 变更

- `packages/subagent`：两个内置 Preset 均限制为四个读取/搜索工具；300 步、30 分钟；明确 step-limit / timeout 原因，保留部分发现和失败详情入口；恢复发布也保留失败信息。
- `packages/core/agent-loop`：子任务最后一步不暴露工具，要求返回已确认发现；终态仍标记 step-limit。live event 附带父 Session / Call 关联。
- Desktop：子事件转换为父工具行活动标签，正文与推理内容不进入标签；读取、搜索、并行数量、整理回复等状态替代流式正文。主题感知轻边框、400ms 合并、翻页动画和 reduced motion。
- 显式 React fixture：`apps/desktop/test-fixtures/subagent-activity.html`，供浅深主题与活动切换验收。

### 验证与边界

- Subagent 10 项、Core Loop 14 项、Desktop 相关预览/状态/UI 37 项通过；工具流 6 项通过；App 子任务入口用例通过。
- Runtime 依赖闭包构建、相关包类型检查、Desktop typecheck、renderer/Electron 构建、主题与文档检查通过。
- 全 Desktop 测试曾产生 15 项失败，其中旧子任务文案断言已更新通过；App 文件重跑剩余 2 项与本次无关的写入/工作区选择失败；模型适配测试仍有 DeepSeekFileUploader mock 缺失，不宣称全仓测试通过。
- 浏览器已检查真实组件浅色布局；深色、连续动画观感及最新 Electron 窗口/真实 Provider 長任务验收仍需完成，不能用 fixture 代替。

### 学习沉淀

命中可迁移、陷阱和模式：见 [执行活动与任务结论](../../learnings/2026-09/20260916-subagent-activity-vs-outcome.md)。

### 2026-09-16 活动详情与动效修正

- 去掉 renderer 的 400ms 合并延迟，语义状态即时更新；Main 保留最近完成的工具对象，工具结束后显示“正在分析 · 刚读取 文件名”，失败调用使用“刚尝试读取”，并行调用保留当前操作对象。
- 凭据形态过滤替代关键词全量过滤，token-usage.ts 等正常文件名可见；不展示模型正文或推理正文。
- 翻页替换为 180ms、4px 上移交叉淡入淡出，无入场延迟，保留 reduced motion。同步设计文档、测试样例与学习记录。
- 55 项活动/组件/工具流/预览定向测试通过；renderer 与 Electron 构建、主题检查、文档检查通过。整体 Desktop typecheck 被后台会话测试文件中 3 处类型错误阻塞（NodeList 迭代、backgrounded 状态、Promise<unknown> mock），这些位置未在本次修正中修改。
- 本次浏览器仅打开了测试页；浅深主题动态切换及真实 Electron 子任务端到端验收尚未完成，不作为通过项。
