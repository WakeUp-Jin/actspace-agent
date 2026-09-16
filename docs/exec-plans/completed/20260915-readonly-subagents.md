# 只读子智能体与实时活动行

状态：实现完成，保留视觉与真实运行验收边界。保留工作树中的其他改动，不提交或发布。

## 目标与边界

Agent / Explore 均只开放 read_file、list_directory、grep、glob，保留 workspace guard；不实现子任务审批，不引入 Codex 图标。默认 300 步，最后一步保留无工具总结；总时限由 5 分钟放宽为 30 分钟，仍支持取消。失败原因与已有部分结果传回父会话。

消息行采用主题感知轻边框；第二行由真实子任务事件生成读取、搜索、分析、整理回复状态，合并频繁更新并使用翻页动画，支持 reduced motion。通过现有 live event 的父子关联投影到父工具行，不轮询完整 transcript。

## 执行与验证

1. 修改 subagent preset/provider/tool 描述与错误结果，验证工具白名单、预算、超时、取消、部分结果与持久化。
2. 修改子任务最后一步收尾和 Runtime live lineage，验证主任务行为不变、最后一步无工具、父工具行收到子任务进度。
3. 修改 Desktop stream adapter 与 AgentRunBlock，验证并行调用、正文隐藏、迟到事件、状态合并、终态即时显示、点击详情。
4. 运行相关 Vitest、依赖构建、Desktop typecheck/build、主题检查与文档检查；使用浏览器显式 fixture 检查浅深主题、动画，并观察 Electron 窗口。真实 Provider 的长任务验收单列。

## 风险与回退

运行预算扩大可能增加长时间无效搜索；只读提示要求路径不匹配时及时报告阻塞，不推断任务成功。UI 状态不是任务结论。回退仅恢复本次相关代码，不改任何历史 Journal 或用户数据。

## 结果

后端与前端实现、定向回归、类型检查和构建已完成。具体验证与剩余人工门禁见 [执行摘要](../../exec-runs/20260915-readonly-subagents/execution-summary.md)。
