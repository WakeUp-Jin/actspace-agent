## [2026-10-19 22:15] | Task: 恢复使用统计中的历史请求

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-6
- **Runtime**: Codex CLI

### 📥 User Query

> 已有会话，但使用统计为空；批准修复自动统计起点与历史索引恢复，在当前分支完成。

### 🛠 Changes Overview

**Scope:** Desktop main 使用统计读模型、旧缓存、回归测试与设计文档。

- 移除首次查询自动写入统计起点的逻辑，停止读取旧 `global-usage-reset.json`。旧文件保留，不改动 Session Journal。
- SQLite 投影、查询和有界 Session fallback 均保留完整历史；页面时间范围继续在查询时生效。
- 派生库 schema 升级到 10，经现有重建机制同时失效旧索引与游标，补回曾被过滤的活动。旧 JSON 缓存升级到版本 2。
- 保留工作区中原有前端和子会话目录过滤改动；没有提交、推送或切换分支。

### 🧠 Design Intent (Why)

旧实现把首次查询当作统计起点，排除所有之前的请求，并将游标标记为已处理。单独取消筛选不会回放已跳过的历史，因此必须同时使旧派生结果失效。查询范围不能成为丢弃持久事实的条件；价格未知继续由费用证据规则解释，不应丢弃请求与 Token。

### 📁 Files Modified

- `apps/desktop/src/main/runtime-v2/usage-read-model.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`
- `apps/desktop/src/main/runtime-v2/usage-read-model-schema.ts`
- `apps/desktop/src/main/runtime-v2/read-model-sync.ts`
- `apps/desktop/src/main/runtime-v2/usage-session-fallback.ts`
- `apps/desktop/src/main/runtime-v2/usage-source-cache.ts`
- `apps/desktop/scripts/test-usage-read-model.mjs`
- `apps/desktop/src/main/test/usage-source-cache.test.ts`
- 使用统计费用设计、数据存储设计与 Context/SQLite 联合设计同步更新。

### 验证与边界

- Red：修改实现前，首次查询与已截断 schema-9 索引两个 Worker 回归用例均返回 0 而非预期 2；旧缓存新增的两个用例也均失败。
- Green：`node --test apps/desktop/scripts/test-usage-read-model.mjs`，69/69 通过。覆盖首次查询、旧索引补回、Token、日/周/全部与搜索过滤、重启复用、分页和 fallback 等。
- `usage-source-cache.test.ts`，4/4 通过；统计页与 HoverCard 组件测试，10/10 通过。
- Electron main 编译与 Desktop renderer/main 类型检查通过。
- 真实 Session Journal 的临时副本使用生产 JSONL reader 与统计服务完成查询，返回非零请求、Token 和最近一天统计；请求总数与副本中的 `request/header` 数量一致。临时副本与派生库验证后移除，运行中的用户数据未改动。
- 扩展 `test-context-read-model.mjs`：9/10 通过。剩余的 `panel conditional reads...` 用例样例缺少 `projection.status`，在 `context-paths.ts` 读取 `status.plugins` 时失败；用 HEAD 版本的 ContextPanelService、context-paths 与 UsageReadModelService 隔离加载后，同一用例仍以同样错误失败。此项是既有测试问题，本轮未扩大范围修复。
- `git diff --check` 通过。`pnpm check:docs` 被未改动的 `docs/exec-plans/completed/20261005-desktop-frontend-refactor/00-总执行计划.md` 第 4 行既有失效链接 `../../../desktop-frontend-refactor/demo/` 阻断，本轮未修改该计划。
- 未完成真实 Electron 界面 Computer Use 复验；本轮没有重启用户正在运行的应用。新 main 代码需在应用重启后加载，首次升级会重建共享派生库，包括目录与 Context 索引，大量历史需要等待同步。

### 学习沉淀

命中“可迁移、深度、陷阱、模式”：派生索引修复必须同时处理旧结果与读取游标，见 [派生索引过滤恢复](../../learnings/2026-10/20261019-derived-index-filter-recovery.md)。
