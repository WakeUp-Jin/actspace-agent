# P03 执行过程：Context、Composer 与 Trajectory Projection

日期：2026-08-30

## 执行范围

本轮先完成 P03 的 Host projection 与 framework-neutral Client contract，确保 Context、Usage、Composer、Trajectory 都能从同一个 `sessionId + throughJournalSeq` 快照读取。按照计划，未在本轮改动 UI 视觉样式，也未修改工具 executor、LLM wire 或 Session Journal 物理格式。

## 过程记录

1. 在 `@actspace/session-projection` 增加 `providerUsage`、`requestContextEstimate`、`composer` 三类产品 projection。
2. 增加 `trajectory` projection，使用 `sessionId:event.seq` 作为稳定节点 key，支持全量 replay 与增量 apply。
3. 在 `@actspace/client` 增加对应的只读 selectors 和 revision-bound projection value 接收能力。
4. 在 Desktop projection snapshot IPC 中组装这些 projection values，沿用 Session-bound envelope。
5. 增加 product projection、trajectory parity 和 Client projection selector 测试。
6. 更新 P03 进度与总执行计划，明确 renderer 全量消费迁移仍是后续工作。
7. workspace 回归发现旧 Node 运行器不支持 `Array.prototype.at`，同步移除本轮新增核心路径中的 `.at(-1)`，并重建跨包 dist 后复测 Compaction。
8. Desktop 新增 `SessionProjectionProvider`，将活动 Session 的 Client store、typed bridge、live notification 和 selectors 绑定到 React 根树；Session 切换使用显式 `sessionId`，不再从会话列表猜测当前投影。
9. Workbench/Conversation/Composer/Context 接入 composer phase、durable Surface message count、provider usage/request context estimate 和 trajectory selectors；Context popup 与当前 Session hover 也增加 selector fallback；富消息 `MessageBlock[]` 暂时保留为显示适配层，不再作为生命周期事实源。
10. Right Panel 启用只读 Trajectory tab 和对象菜单入口，增加 ordered/empty renderer tests；Context view 增加 projection metric fallback 和 revision-bound revalidation。
11. 启动真实 `pnpm dev:log` Electron 实例，确认共享包构建时序短暂恢复后 main/preload/renderer watch 均回到 0 errors；真实 reload/quit/flush、Provider 和人工 UI 仍交给 G1 外部门禁。

## 决策记录

- Provider usage 与 request context estimate 保持不同 projection key、不同 DTO，避免把累计计量误当成单次请求上下文估算。
- Trajectory 是 Journal 的只读投影，不新建第二份事件日志；Conversation 继续只消费 Surface。
- Composer phase 由 Session snapshot facts 派生，Client 只读取 phase，不从 `messages.length` 或 streaming cache 推断生命周期。
- Renderer 迁移按“先 Session-bound selector、再逐步替换富消息 adapter”的顺序推进，避免为了满足投影契约而重写稳定的工具/消息 UI 映射。
