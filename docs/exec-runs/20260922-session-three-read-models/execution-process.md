# Session 三类读模型统一计划 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260922-session-three-read-models.md`
- **执行模式**：交互
- **开始时间**：2026-09-22 14:30
- **结束时间**：2026-09-22 15:20

## 执行时间线

### 步骤 1：P0 Canonical Fold

- **操作**：抽出 shared Todo reducer，按 `todoId + item revision` 合并 `todo/write.items[]`；Host facts 与 `TodoService.list()` 共用该规则。
- **影响文件**：`packages/shared/src/runtime-v2/todo.ts`、`packages/session/projection/src/facts.ts`、`packages/core/agent/src/todo.ts`、P0 tests。
- **决定**：忽略 event-level revision，保留未出现在增量中的 Todo 与 cancelled 状态。
- **验证**：full replay、incremental apply、partial update、stale revision parity tests 通过。

### 步骤 2：P1-P2 DTO、watermark 与 observation

- **操作**：增加 Global summary、Session observation、Window support/deferred refs、水位类型；Runtime controller、Desktop App、IPC、preload 和 renderer bridge 接入一次性 observation。
- **影响文件**：`packages/shared/src/runtime-v2/projection.ts`、`packages/runtime/src/runtime/session-controller.ts`、`packages/desktop-app/src/service.ts`、Desktop registry/IPC/preload/bridge。
- **决定**：保留旧 projection envelope 作为兼容 DTO，但由 observation 同一读取切面生成；equal-seq same-value 幂等，冲突要求 resync。
- **验证**：runtime observation/cursor tests、client equal-seq conflict tests、shared/runtime/desktop typecheck 通过。

### 步骤 3：P3 Global Index 与 Usage Index

- **操作**：新增可删除的 `global-session-index.json` 和 `global-usage-index.json`；Global list 读取 summary，Usage activity/statistics 从按 Session 水位校验的 activity rows 聚合。
- **影响文件**：`packages/session/projection-cache/src/global-index.ts`、`packages/runtime/src/runtime/session-controller.ts`、`packages/client/src/sessions/indexed-usage.ts`、Desktop usage cache/IPC。
- **决定**：索引写入挂在 durable flush 后；append/recovery 不依赖索引成功，索引丢失时从 Journal 重建。
- **验证**：Global Index persistence/rebuild tests、Usage cache concurrency/retry test 通过。

### 步骤 4：P4-P5 Window 与 Client targets

- **操作**：Window 加入事件数/JSON 字节上限；大工具事件只传短状态和 deferred ref；Client store 支持 watermarks、equal revision 幂等/conflict，Trajectory/Tool selector 独立读取 Window/facts。
- **影响文件**：`packages/runtime/src/runtime/session-controller.ts`、`packages/client/src/sessions/session.ts`、`selectors.ts`、window/runtime/client tests。
- **验证**：25 Turn 分页、超大 args/result、tool detail、trajectory/chat/client tests 通过。

## 遇到的问题

- **问题**：早期 Host Todo reducer 将 `todo/write.items[]` 当完整列表，更新一个 Todo 会丢失其它 Todo。
  - **原因**：Host 与 Agent Service 各自解释同一 Journal event，增量语义未共享。
  - **应对**：建立 shared canonical reducer，并用 replay/incremental parity test 固化。
- **问题**：Desktop 全量测试中 `app-streaming-user-message.test.tsx` 稳定失败 31/39。
  - **原因**：失败集中在既有 App/workspace fixture 的 bridge 调用和输入框查找，本轮新增 observation/usage API 的 typecheck、IPC tests 和其余 104 个 Desktop test files 均通过。
  - **应对**：不修改无关 UI 行为，在执行摘要中保留为外部门禁，需单独修复/验收。

## 跳过或推迟的事项

- 真实 Provider、Electron packaged reload/quit、性能长 Journal 和手工 UI 验收未在本轮自动化环境中宣称通过。
- Journal 物理格式、Goal producer、工具执行器和 Browser Bridge 未改造。
