## [2026-09-30 21:52] | Task: 修复压缩耗时与辅助模型路由

### Execution Context

- Agent：当前 Codex 会话；独立 Agent ID 未提供。
- Model：GPT-6 系列（本会话未提供具体模型标识）。
- Runtime：本地工作区、pnpm、原生 Computer Use、真实 Electron。

### User Query

> 修复验收发现的两个 bug；确认提出的实施方案。

### Changes Overview

- compaction 在摘要前计时，end 事件持久化可选 durationMs；失败不提交压缩事务。
- client 优先持久化耗时，旧数据兼容时间差。
- routeId 优先显式配置，其次 utility，最后首个 Host route，兼容 CLI。
- 新增延时摘要、失败原子性、投影回放、路由优先级与桌面辅助模型热更新测试。
- 同步设计规范、执行计划、验收报告与学习记录。

### Design Intent

事务落盘时间不能代表前置网络工作耗时；为了真实重放应保存工作耗时，同时保持事务原子性。路由按任务用途选择，Desktop adapter 在每次请求准备阶段读取最新设置。

### Files Modified

- packages/compaction/src/plugin.ts 与 src/test/{compaction.test.ts,lifecycle.test.ts,session-fixture.ts}
- packages/session/journal/src/compaction.ts
- packages/client/src/sessions/chat.ts 与 src/test/compaction-projection.test.ts
- packages/shared/src/session.ts（耗时字段与注释）
- apps/desktop/src/main/test/runtime-v2-thinking-options.test.ts
- docs/design-docs/frontend/front-中间消息区规范.md
- docs/design-docs/agent-plugin-runtime/{agent-target-session-and-context.md,agent-target-llm-adapter.md}
- docs/exec-runs/20260930-compaction-duration-utility-fix/ 与原验收摘要

### Validation

98 项定向测试、desktop/compaction/client 类型检查与桌面启动构建通过。真实 Electron 手动 34,816ms→35s、自动 1,383ms→1s；utility 故障独立失败、恢复重试、热更新与重启持久化通过。临时设置已恢复。验收时未提交；原完整功能验收仍有未覆盖项。2026-10-01 提交整理时，独立暂存快照另通过 47 项测试与 client/compaction 类型检查，既有功能与其他任务改动保留未提交。

### Learning

命中可迁移、有陷阱、有模式，已读 WRITING_GUIDE 并记录“工作耗时与事务时间的区别”。
