# 工具流式渲染修复 — 执行摘要

状态：实现与自动化验证完成；真实 Electron / DeepSeek 验收待人工执行。

## 交付行为

工具参数不再出现在 assistant 正文。参数生成和 done-only 调用均产生 typed 工具预览，执行开始和结果分别更新同一条工具；每次已提交结果立即收尾，模型可以继续输出。失败、拒绝、中止和迟到事件不会把条目错误恢复为成功或运行中。实时与历史共用预览构建器，正常结束后无重复工具。

并行 body 完成后立即提交结果，Journal 保留调用顺序：后发先完成的结果仍等待前序提交。这是确定性历史的边界，不额外创建未提交的终态通道。

## 工程验证

| 检查 | 结果 |
| --- | --- |
| Core AgentLoop | 9 tests 通过；原始两项失败回归转绿 |
| Tools Runtime | 18 tests 通过，含安全流水线顺序、观察者异常与增量提交 |
| Shared | 63 tests 通过 |
| Desktop 全量 | 最终 600 tests 全部通过，含 finish-only 与迟到审批回归 |
| CLI | 13 tests 通过 |
| 根 `pnpm typecheck` | 通过，包含完整 Runtime 依赖构建 |
| 根 `pnpm build` | 通过，CLI、renderer、Electron main/preload 均生成；保留已有 Vite chunk-size 提示 |
| 文档、主题与差异检查 | `pnpm check:docs`、`pnpm check:frontend-theme`、`git diff --check` 均通过 |

测试使用本地假 Provider、真实 AgentLoop、ToolRuntime 和 ephemeral Session，不读取真实凭据、不复制用户会话正文。Main adapter 与历史 projection 对照；App 在工具执行与下一次文本之间有独立停顿，验证 shimmer 收尾及重新加载后的唯一条目。

## UI 验收

浏览器显式测试入口：启动 `pnpm dev:log` 后访问 `http://127.0.0.1:5173/tool-stream-check.html`。源码位于 `apps/desktop/src/renderer/test/fixtures/tool-stream-visual.tsx`，不从生产入口导入。已查看浅深主题的 Read/List/Grep、Write 流式代码、Edit、Bash、失败摘要和最终结果；这只证明组件显示，不代表真实 IPC 验收。

真实 Electron：开发运行时能启动且 main 类型检查通过，Computer Use 按日志 app ID 选择应用仍返回 Invalid app。因此真实窗口、preload/IPC、运行中会话切换和重新打开的人工检查保留；未声称通过。

真实 DeepSeek：未执行付费 Provider 验证。人工验收时使用临时 workspace：

1. 让 Agent 读取两个文件、列目录，再执行一个安全 Bash；在最终回复前观察工具行和状态。
2. 在临时目录执行 Write/Edit，确认 Write 有代码预览，Edit 在结果前不伪造 diff。
3. 用隔离测试覆盖权限拒绝、无效参数和文件不存在：检查失败原因、不执行被拒绝操作。
4. 最终完成后展开活动组，再重新打开会话；比较工具数量、种类、摘要和正文。切换会话时旧流不能污染当前会话。

## 范围与回滚

未提交、未推送；保留先前设置分析观测删除和工作区其他改动。无 Journal 迁移、权限策略或 Provider 协议变更。回滚只能撤销本修复补丁并一起重建 Core/Runtime/Desktop，不得整文件回退到 HEAD。

关联：[已归档计划](../../exec-plans/completed/20260906-agent-tool-stream-rendering/README.md)、[设计](../../design-docs/frontend/front-agent-tool-stream-rendering.md)、[执行过程](execution-process.md)。
