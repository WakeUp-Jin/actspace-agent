# 工具流式渲染修复 — 执行过程

关联计划：`docs/exec-plans/completed/20260906-agent-tool-stream-rendering/README.md`。交互模式，用户已批准实施。

## 基线

2026-09-06：已读取计划、设计与协作规范；确认参数被映射为 assistant-delta 的代码仍存在。修改前精确文件与 git 状态已保存为本机临时基线，保留已有脏工作区。

## 失败基线与修复

- 初始 Core 回归两项失败：正文为 `Read now. {"path":"fixture.txt"}Done.`；done-only 场景缺少 prepared/started/finished。先保留失败输出，再改实现，没有回退脏工作区。
- Core 分离参数与正文，携带 messageId/requestId；工具 prepared 在 call append 后，started 在 executor 调用前，finished 在 result append 后。
- Tools 观察者异常隔离；并行 body 结束即提交结果，仍遵守 OrderedToolCommitQueue 顺序。新增回归确认首个快速工具不等后续慢工具才提交。
- Main 增加专用内部 adapter，共用历史 preview builder；限流、有界缓冲、终态清理、未知工具兜底，通用 live 不带新增工具参数。
- App 结果先到也 upsert，完成状态优先于迟到参数、进度、审批；保留会话切换的可见性保护。Shared selector 和 ToolLogLine 显示失败原因。
- 根 typecheck 暴露 CLI Host 仍转发整个旧 live 联合类型；增加必要过滤以保持通用 live 边界。测试导入运行时源码触发不同 tsconfig 的检查差异，改为依赖已构建的 Runtime projection，未更改无关生产代码。

## 验证中发现与处理

- 原 delete 审批用例完成事件不带 preview；upsert 必须保留已有预览，不能用 undefined 清除。修复后旧回归通过。
- 真实 App rehydrate 会折叠 Worked for 活动组；测试按现有产品行为展开后验证一条工具，未改变折叠交互。
- Main→App 测试增加 finish-only 路径、重复结果与迟到审批，确认工具不恢复 shimmer。
- 浏览器使用显式测试入口和真实组件，浅深主题下检查参数生成、Write 代码预览、执行、最终结果与失败原因。
- 沙箱首次启动因本地端口 EPERM 失败，经系统批准重试开发服务。开发版 Electron 的 app ID 从日志读取，但 Computer Use 返回 Invalid app，故真实窗口与 IPC 端到端验收未完成。开发服务已停止。

最终命令结果与人工步骤见 [执行摘要](execution-summary.md)。

## 最终收口

最终 Desktop 600 tests、根 build、根 typecheck、文档检查、主题检查和 diff --check 通过；计划移至 completed，history 与学习笔记同步。未提交、未推送，未运行真实付费模型验证。
