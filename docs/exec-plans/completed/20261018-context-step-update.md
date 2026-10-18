# Context Step 更新、压缩与路径面板接口

状态：2026-10-18 已完成约定实现与自动化验证；路径 UI 和真实 Provider 验收边界见执行摘要。用户已批准 T1–T5 实现；使用主仓库 codex/context-incremental-design，不创建 worktree，不提交或推送。

## 范围与依据

必读：AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、CODING_BEHAVIOR、上下文引擎 V2 的 07 决策记录。实现后端与客户端读取契约、刷新通知及前端交接；CloudOps 负责路径 UI 布局。排除存储重构、数据迁移、趋势删除和 Token 精确计费。

## 实施步骤

1. T2：ContextSourceRegistry 为显式声明依赖的来源缓存贡献，按 session/logical scope 隔离；内置规则/技能按 Turn、模式与选择失效；工具定义按定义变化失效；会话与披露按各自状态失效。无声明扩展继续重算，失败不缓存，注销清缓存。使用不可变快照保留未变分片；reducer 的兼容链路保留。
2. T1/T3：loop.ts 保留完整工具批次之后的 checkpoint/reconcile，使用最新 Context 估算（及 Provider 使用量作为未压缩时参考）触发压缩，传递取消信号，压缩后持久化并重新发布投影。每个安全点最多一次自动尝试；请求前检查当前容量，超过硬容量不得继续发出。最终 Step 同样检查，失败可报告，但持久化失败不能吞掉。
3. T4：shared ContextPanelView 添加可用性、周期、数量与活跃上限，提供带 revision 的路径分页接口。返回路径元数据而非全文；游标绑定会话、版本与筛选，限制响应大小；不可用不冒充零路径。接通 Desktop IPC 类型、guard 与 handler。
4. T1/T5：发布 Context 已更新通知，客户端复用单在途/合并刷新；保持隐藏释放。编写前端交接文档，列出接口、刷新、版本、空态/不可用态、压缩后展示及验收点。
5. 定向测试、构建依赖闭包和类型检查；更新设计、history、学习记录及执行摘要，完成后移动计划到 completed。

## 验证

- engine registry/instance 测试：未变来源不调用、相关依赖改变才重算、多个模块同时失效、未知扩展正常刷新、错误/注销/隔离、不可变快照。
- agent-loop 测试：工具批次→checkpoint→更新→压缩→下一请求的顺序；大工具结果、压缩后投影、失败/取消、最后一步。
- Desktop ContextPanelService 与 IPC guard 测试：路径数量与分页、错误游标、迟到版本、无能力、读取无副作用；刷新单在途测试。
- pnpm --filter @actspace/runtime... build；受影响包 test/typecheck 与 Desktop typecheck；git diff --check；pnpm check:docs。
- UI 布局由前端工作接手，本轮不将源码测试说成 Electron/Computer Use 验收。真实模型性能和压缩质量不以 mock 测试替代。

## 风险与回退

缓存错用通过来源显式依赖与未声明重算避免；按 Turn 刷新规则不改变现有文件更新语义。超过容量但无法压缩时明确失败，不无界重试。仅回退本任务改动，不清理 Session/SQLite 或其他会话文件。新路径字段为增量契约，保留旧前端读取。

## 进度

- [x] 核对范围及关键入口。
- [x] 增量来源与不变分片。
- [x] Step 压缩及更新通知。
- [x] 路径读取契约与 IPC。
- [x] 测试、交接及文档。

## 执行模式

交互模式；用户已授权上述五项的连续实现。重大范围变化另行讨论。

## 完成记录

[执行摘要](../../exec-runs/20261018-context-step-update/execution-summary.md) · [前端交接](../../design-docs/frontend/front-Context面板Step刷新与路径展示交接.md)。文档检查仍有一处基线旧失效链接；未将其写成通过。
