# Session 三类读模型统一计划

状态：已完成。代码、测试、执行记录和已知外部门禁已同步。

设计依据：[Session 三类读模型设计规范](../../design-docs/agent-plugin-runtime/agent-session-three-read-models.md)。本计划以当前源码为准，不执行早期方案中已经完成或已删除的 BrowseIndex、Main projector 和旧 cache 迁移步骤。

## 目标与范围

在不改变 Journal 物理格式、不引入第二事实源的前提下，统一三种读模型：Global Aggregate、Session Projection、Window Presentation。完成后，Session 当前状态、跨 Session 查询和客户端历史展示拥有清楚的完整性边界、独立水位和可删除缓存。

包含：Session facts canonical fold、Global summary/index、Session observation、Window reader、Projection Cache、Client Chat/Trajectory/Tool Card 合并规则、相关 IPC 和回归测试。

不包含：Journal 格式迁移、Goal producer、工具执行器重写、Browser Bridge、UI 视觉改版、真实 Provider 行为改造、Session 数据删除或清理。

## 必读文件

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/agent-plugin-runtime/agent-session-three-read-models.md`
- `packages/session/persistence/src/session-store.ts`
- `packages/runtime/src/projection/durable-session.ts`
- `packages/session/projection/src/facts.ts`
- `packages/session/projection-cache/src/journal-cache.ts`
- `packages/client/src/sessions/session.ts`

## 阶段

### P0：Canonical Fold 正确性

修改：`packages/core/agent/src/todo.ts`、`packages/session/projection/src/facts.ts`、`packages/runtime/src/projection/durable-session.ts` 及对应测试。

动作：

1. 抽取 Todo 共享纯 reducer 或 merge 函数；
2. 按 todoId 合并 `todo/write.items[]`；
3. 使用每个 item revision，不用批次 revision 替代；
4. 覆盖新增、更新、取消、部分更新、重放和增量 apply；
5. 审计 usage retry 去重、`callId/toolCallId` 和 failed tool status。

验收：TodoService 与 Host projection 对同一 Journal 得到相同 Todo；full replay 与 incremental apply 相同。

### P1：三种 DTO 与水位契约

修改：`packages/shared/src/runtime-v2/projection.ts`、`packages/shared/src/runtime-v2/index.ts`、`packages/session/projection/src/registry.ts`、`packages/client/src/sessions/session.ts` 及 contract tests。

动作：

1. 定义 Global summary、Session projection、Window presentation 独立类型；
2. 引入 accepted/durable/projection/window/index generation 语义；
3. 区分完整 baseline、partial hint、window response；
4. 定义 equal-seq same-value 幂等和 equal-seq conflict resync；
5. 为 checkpoint state 和公开 view 保留独立版本号。

验收：类型和测试能阻止把 Window 当作完整 Session 状态；旧响应不能覆盖新 facts。

### P2：Host Observation

修改：`packages/runtime/src/runtime/session-controller.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/src/renderer/session/desktop-session-bridge.ts`、`packages/client/src/sessions/session.ts`。

动作：

1. 增加一次性 observation 读取入口；
2. projection baseline 与 window 从同一读取切面返回；
3. bridge 不再分别请求 snapshot 与 events 后自行拼接；
4. history prepend 只扩展 Window，不覆盖完整 Session facts；
5. compaction、surface replacement、runtime restart 统一走 resync。

验收：并发 append、旧响应、跨页 replacement、Session 切换不会产生混合水位或跨 Session 污染。

### P3：Global Index

修改：`packages/runtime/src/runtime/session-controller.ts`、`packages/session/projection-cache/src/journal-cache.ts` 或同 package 的 Global Index 模块、`apps/desktop/src/main/runtime-v2/usage-source-cache.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts` 及 Global list/usage tests。

动作：

1. 从 Session Projection 生成 summary contribution；
2. 维护旧贡献减、新贡献加的 replacement；
3. 保存列表摘要和 Usage 所需的日/月、模型、状态 bucket；
4. 支持缺失、损坏、版本过期的单 Session 重建；
5. 将列表和 Usage 查询切换到 Global Index；
6. 保留 Journal replay 作为重建路径。

验收：冷启动列表和 Usage 不逐个扫描所有 Journal；删除 Global Index 后结果可重建且与逐 Session 结果一致。

### P4：Window Reader 与资源边界

修改：`packages/runtime/src/runtime/session-controller.ts`、`packages/session/projection-cache/src/journal-cache.ts`、`packages/shared/src/runtime-v2/projection.ts` 和 Window/large-tool tests。

动作：

1. 保留完整 Turn 分页，同时加入事件数和 JSON 字节数上限；
2. 支持超大 Turn 的内部续页；
3. 对 args、result、detail、artifact 统一使用 deferred reference；
4. 将窗口 support 信息与连续 events 分离；
5. 按 sessionId + callId/artifactId 读取详情并重新执行 redaction。

验收：25 Turn 产生稳定的 10/10/5 窗口；超大事件不会突破页上限；删除 Window Index 后展示结果不变。

### P5：Client Presentation 收敛

修改：`packages/client/src/sessions/chat.ts`、`trajectory.ts`、`tool-card.ts`、`selectors.ts`、`apps/desktop/src/renderer/App.tsx` 及 Chat/Trajectory/Tool Card tests。

动作：

1. Chat 只消费 Window + Session facts；
2. Trajectory 只解释 raw events；
3. Tool Card 只消费结构化 ToolView/detail；
4. 删除 Chat、Context、Usage 的重复完整 Journal fold；
5. 增加 append/prepend/replace 的 identity 去重和独立更新。

验收：三个 Client target 可以独立刷新；加载历史不改变 title/todo/usage；live gap 后可恢复 durable baseline。

### P6：生产入口清理

修改范围以 P0-P5 的实际结果为准，并同步 `docs/design-docs/`、`docs/exec-runs/`、`docs/histories/`。

动作：

1. 删除旧 SessionRecord/Main projection fallback；
2. 删除仍存在的重复 Context/Usage 读取；
3. 删除不再使用的 cache/index compatibility wrapper；
4. 更新架构、验证入口和当前文档；
5. 保留仍被 recovery/compaction 使用的 projection，不按文件名误删。

验收：生产读取链只有 Journal → Host Projection/Global/Window → Client targets；自动化、Electron、Provider、性能和手工门禁分别记录。

## 依赖、回退与验证矩阵

顺序为 `P0 → P1 → P2 → (P3 || P4) → P5 → P6`。P3 与 P4 在 P2 契约稳定后可以并行，但必须共享 P1 的 DTO 和水位定义。

每个阶段都不修改 Journal 物理格式。失败时可以禁用 Global Index、Projection Cache 或 Window Index，回到 Journal replay；不能回退到第二事实源或 renderer-owned history。Client 新 DTO 可以保留短期 adapter，但 adapter 必须绑定 P6 删除任务。

验证矩阵：

```text
领域：service fold == Host fold；full replay == incremental apply
水位：accepted/durable/projection/window 不混用
客户端：旧响应、equal-seq conflict、gap、runtime restart、Session switch
缓存：删除、损坏、版本变化、Journal truncate、append tail replay
Global：summary replacement、bucket 聚合、单 Session 重建、全索引删除重建
Window：10/10/5 分页、超大 Turn、deferred tool detail、Surface replacement
宿主：Desktop typecheck/build、Electron IPC/reload、真实 Provider 单独验收
```

## 完成标准

- [x] 设计规范已评审并冻结契约；
- [x] P0 parity tests 通过；
- [x] P1-P2 三种 DTO 和 observation 进入生产调用链；
- [x] P3 Global Index 覆盖列表与统计；
- [x] P4 Window 资源边界和 deferred detail 通过；
- [x] P5 三个 Client target 独立消费同一 Window；
- [x] P6 旧入口和兼容代码完成清理；
- [x] 自动化结果、Electron/UI 外部门禁和未验证范围已分别记录。
