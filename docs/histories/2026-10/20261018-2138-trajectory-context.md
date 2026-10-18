## 2026-10-18 | Task: 修复轨迹时间与子工具，并按来源展示上下文

### Execution Context

- Agent：Codex 主智能体开发；gpt-6.1-sol 真实 Electron Computer Use。
- Runtime：Codex desktop；当前分支实现，保留已有工作区改动，未提交。

### User Query

> 修复轨迹验收发现的问题；参考 DeepSeek Harness，将固定系统提示词、规则、技能与动态上下文清楚展示。确认开始实施。

### Changes Overview

- 请求快照保留上下文贡献项及文件来源，历史窗口保留首份和变化份。
- 轨迹区分固定系统、规则、技能目录、已加载技能、运行信息与动态补充；保留实际完整 system 输入和来源，支持上下文版本差异。
- user/context 概述补开始时间和 Local/Unix 切换。
- 父轨迹通过已有 Session store 读取直接子会话工具；保留子 Schema、命名空间和父子链接，不合并父子请求统计。

### Design Intent

上下文分类依赖组装时的结构化来源，避免从 XML/Markdown 文本反推身份。显示分类不改变模型消息角色，也不改写会话事实。

### Files Modified

- `packages/context/engine/src/request-snapshot.ts`
- `packages/prompt/src/context-source-support.ts`
- `packages/runtime/src/session/session-controller.ts`
- `apps/desktop/src/renderer/trajectory/context-sections.ts`
- `apps/desktop/src/renderer/trajectory/subagents.ts`
- `apps/desktop/src/renderer/components/trajectory/use-subagent-trajectories.ts`
- `apps/desktop/src/renderer/session/desktop-session-bridge.ts`
- 轨迹详情组件、回归测试与运行时投影规范。

验证及边界见[执行摘要](../../exec-runs/20261018-trajectory-context/execution-summary.md)。学习记录见[上下文来源](../../learnings/2026-10/20261018-context-provenance.md)。
