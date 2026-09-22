# ActSpace Session 持久化事实源与投影收敛

> 2026-09-20 任务边界：Session 事件时序、live/durable 读取接线已由[事件持久化计划](../../completed/20260920-session-event-persistence/README.md)交付；本计划保留其余 UI 映射及既有验收记录。


生命周期：2026-09-21 已被替代。原计划的生产投影与消息映射已由[2026-09-21 一次性切换](../../completed/20260921-session-projection-cutover.md)接替并完成。本目录保留早期契约和验收记录；当前实现以新计划及其摘要为准，不继续实施旧 Main projection 路径。

## 1. 目标

以 `Session Journal` 为唯一持久化事实源，把 ActSpace 当前散落在 Runtime、Desktop main、IPC 和 renderer 中的 Session 数据收敛为带统一水位的 Session Projection Snapshot。完成后，Conversation、Composer、Context、Usage、Trajectory、Todo 和 Diagnostics 都从同一 `sessionId + throughJournalSeq` 读取；Live Progress 只作为可丢失 overlay，projection cache 只作为可删除的加速缓存。

## 2. 设计真源与上游依赖

设计真源：

- [Session 持久化事实源与投影架构](../../../design-docs/agent-plugin-runtime/agent-target-session-persistence-projection-architecture.md)
- [DSH 风格 Session 事件模型](../../../design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md)
- [Session Core 与 Persistence Provider 分离](../../../design-docs/agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)
- [Runtime Projection 公共契约](../../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)
- [Agent 测试策略](../../../design-docs/agent-plugin-runtime/agent-testing.md)

上游契约：

- P0 已冻结的 13 个 Session 核心事件、持久化扩展事件、Surface、9 个 Agent Loop 插入面和 5 个主要通知；
- P1-A 的 Session Core/Persistence public contract；
- P1-B 的 Service Definition/Provider/Consumer public metadata。

P1-C Profile/Bundle/Patch 不阻塞纯 projection 实现，但 Desktop/CLI 生产 Boot 接线必须消费其最终 `BootManifest`。P2 Contract Matrix 在本计划的 projection metadata 稳定后补录 projection key、stateVersion 和验证证据。

## 3. 范围

包含：

- 统一 projection definition、registry、watermark、snapshot、change feed 和 checkpoint contract；
- 复用 `SessionJournal.surface` 作为 Conversation canonical source；
- projection cache 的冷读取、restore floor、stateVersion 失效和 fail-soft 写回；
- Desktop main/preload/renderer 的 Session-bound store 和 revision 检查；
- provider usage、request context estimate、composer phase 和 Trajectory 的投影消费迁移；
- regression、golden、通知丢失、live gap、旧响应和 Session 切换测试。

不包含：

- Session 事件名称、顺序或 JSONL 物理格式重设计；
- Session 数据迁移、旧事件兼容、双写、SQLite、远程 backend；
- 具体工具 executor、LLM wire、Browser Bridge、CLI chat；
- 不可信插件前端、在线 HMR、Goal/Schedule producer；
- UI 视觉改版。Composer 和 Context 只迁移数据来源与状态契约，不调整视觉样式。

## 4. 目标数据流

```text
User / Agent / LLM / Tool
          │
          ▼
Session Core append
          │ validate + seq + durable commit
          ▼
Session Journal, sole source of truth
          │
          ▼
Projection Registry, pure fold + view
          │
          ▼
SessionProjectionSnapshot
  sessionId + throughJournalSeq + values
          │
          ▼
Client SessionStore[sessionId]
          │ selectors
          ├─ Conversation
          ├─ Composer
          ├─ Context / Usage
          └─ Trajectory
```

## 5. 计划拆分

| 计划 | 目标 | 依赖 | 主要文件范围 | 可独立合并 |
|---|---|---|---|---|
| [P00 Projection Contract](./p00-projection-contract.md) | 冻结 projection keys、snapshot、revision、Surface adapter contract | P0；消费 P1-A/B 类型 | `packages/session/projection/**`、`packages/shared/src/runtime-v2/projection.ts`、contract tests | 是，只有类型和纯 projector |
| [P01 Registry and Cache](./p01-projection-registry-and-cache.md) | 实现 registry、per-session cells、change feed，以及独立 projection-cache 的 checkpoint/cold restore | P00；P1-A Provider contract | `packages/session/projection/**`、`packages/session/projection-cache/**`、Session projection tests | 是，可先由 main 直接调用 |
| [P02 Client Session Store](./p02-desktop-session-store-and-ipc.md) | 将 main/preload、`packages/client` 和 renderer bridge 收敛到 Session-bound snapshot 和 revision | P00、P01；P1-C Boot metadata | `apps/desktop/src/main/runtime-v2/**`、preload、`packages/client/src/sessions/**`、renderer bridge、IPC tests | 是，保留旧组件适配到新 store |
| [P03 Context Composer Trajectory](./p03-context-composer-and-trajectory.md) | 迁移 Context/Usage/Composer 消费，加入 Host 同源 Trajectory projection 与 Client/UI 消费 | P02；P2 可在 metadata 稳定后接入 | `packages/session/projection/**`、`packages/client/src/sessions/**`、Context/Conversation/Trajectory components、renderer tests | 是，Trajectory UI 可先只读隐藏 |

## 6. 依赖图与并行边界

```text
P0 contracts
   │
   ▼
P00 projection contract
   │
   ├──────────────► P01 registry + cache
   │                         │
   └─────────────────────────┴────► P02 Client SessionStore + Desktop IPC
                                      │
                                      ▼
                              P03 Context / Composer / Trajectory
                                      │
                                      ▼
                                  G1 验收收口
```

- P00 完成后，P01 可以与 P02 的 `packages/client` store 骨架并行，但 P02 的生产读取必须等待 P01 的 snapshot contract。
- P01 不修改 renderer；P02 不重新实现 projection fold。
- P03 不修改工具 executor 和 Session event codec；Trajectory Host builder 在 `packages/session/projection`，Client consumer 在 `packages/client`，两者必须消费同一 Session snapshot。
- 根 `package.json`、workspace lockfile、公共 index 和 P1/P2 总计划只在 G1 集中同步，子计划不得为了方便测试修改其他计划的所有权目录。

## 7. 文件所有权

| 计划 | 允许修改 | 明确禁止 |
|---|---|---|
| P00 | `packages/session/projection/**`、`packages/shared/src/runtime-v2/projection.ts`、对应 tests/exports | 不改事件 schema、JSONL writer、renderer、工具 executor |
| P01 | `packages/session/projection/**`、新建 `packages/session/projection-cache/**`、projection cache tests、必要的 detached persistence contract | 不改物理 JSONL 格式、Agent Loop、renderer；`session-projection` 不得依赖 Provider |
| P02 | `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`fixed-renderer-projection.ts`、preload、`packages/client/src/sessions/**`、`apps/desktop/src/renderer/session/**`、App/IPC tests | 不重写 projection fold、不得引入 `visibleSessions[0]` fallback、不得改 UI 样式 |
| P03 | `packages/session/projection/src/trajectory*`、`packages/client/src/sessions/**`、Context/Conversation/Trajectory components、renderer tests 和对应设计索引 | 不新增日志文件、不改变工具具体执行逻辑、不把 Live Progress 当 durable fact |

## 8. 全局验收门

### G0 Contract

- projection keys、版本、schema、watermark 和 Session identity 有唯一 public export；
- `SessionJournal.surface.entries` 与 Conversation projection 的 Surface 结果一致；
- `providerUsage` 和 `requestContextEstimate` 是不同类型和不同 estimator。

### G1 Registry

- 同一 Journal 前缀产生相同 snapshot；
- `apply` 对不相关事件返回相同 state reference；
- cache 删除、版本失效、Journal 缩短和 tail restore 都有可验证行为；
- change feed 丢失后可从 `throughJournalSeq` 修复。

### G2 Desktop

   - 一个 `sessionId` 贯穿打开、订阅、IPC、Client SessionStore 和 renderer selector；
   - 旧 IPC response、旧 Session live event 和 live gap 不会污染当前 Session；
   - renderer 不再把完整 Journal、writer、Provider class 或 credential 作为读取 API。

### G3 Product projections

- AgentLoop 完成后，用户输入仍由 durable Surface 投影提供；
- Composer 由 Session-owned phase 驱动并保持 resident；
- Context 页、hover、popup 对 provider usage 和 request context estimate 使用明确契约；
- Trajectory 的全量 replay 与增量 apply 结果一致。

### G4 Full regression

- 13 个核心事件、扩展事件、Surface、recovery、fork、CLI run 和现有工具 parity 不变；
- `pnpm -r typecheck`、`pnpm -r test`、`pnpm run check:docs`、`pnpm run check:current-docs`、`pnpm run check:packages` 通过；
- Electron 真实启动和手工 UI 验收单独记录，不用自动化测试冒充通过。

## 9. 验证命令

每个子计划先执行自己的定向命令，最终由 G1 执行：

```bash
pnpm --filter @actspace/session-projection typecheck
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/runtime typecheck
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/desktop test
pnpm -r typecheck
pnpm -r test
pnpm run check:docs
pnpm run check:current-docs
pnpm run check:packages
pnpm test:agent-cli:process
```

如 package script 名称变化，负责计划必须先更新本计划和对应子计划，再运行验证；不能把命令不存在解释为跳过门禁。

## 10. 风险与回退

- Projection 语义变化：只提升对应 `stateVersion` 并重建 cache，不修改 Journal。
- Registry 接线回归：回退 projection registry adapter，保留纯 definition、golden 和 fake tests。
- Desktop store 回归：回退 main/preload/renderer adapter，保留 Session Journal 和 projection contract，不恢复多事实源作为新设计。
- Trajectory 视图回归：移除 Trajectory consumer 或隐藏能力，保留同源 projection；不得建立独立日志。
- 跨计划冲突：停止进入 G1，按文件所有权拆分 patch；不得使用破坏性 git 回滚或 broad staging。

所有回退都不删除用户 Session，不修改工具 executor，不恢复旧 Session 事件双写。

## 11. 执行记录要求

每个子计划开始执行时，在 `docs/exec-runs/20260830-actspace-session-persistence-projection-<pXX>/` 创建：

- `execution-process.md`；
- `execution-summary.md`。

完成后把子计划移动到 `completed/`，并在本 README、`docs/exec-plans/README.md` 和执行摘要中同步状态。人工 UI、真实 Provider、Electron reload/quit/flush 和发行制品仍必须单独标记为外部门禁。

## 12. 进度记录

- [x] 2026-08-30：复核现有 Journal、Surface、RuntimeV2SessionSnapshot、Desktop IPC 和 DSH Projection/Trajectory 实现。
- [x] 2026-08-30：新增 Session 持久化事实源与投影架构设计规范。
- [x] 2026-08-30：拆分 P00 到 P03 执行计划并定义文件所有权和验收门。
- [x] 2026-08-30：根据 DSH 模块边界补充 `packages/client`，并将 Projection Cache 独立为 `packages/session/projection-cache`。
- [x] P00 projection contract 与 canonical Surface adapter，完成候选。
- [x] P01 registry、watermark、cache 和 cold restore，完成候选。
- [ ] P02 Client SessionStore、Desktop IPC revision 和 Session identity 收敛，基础通道完成；真实 reload/quit/flush 与人工 UI 验收待继续。
- [ ] P03 Context、Composer、Usage 和 Trajectory projection contract 已完成；Conversation、Composer、Context popup/Context view、Session hover 和 Trajectory 已具备当前 Session 的 selector 直读与兼容 fallback，Conversation 富消息 adapter 最终 durable Surface 映射和人工验收待继续。
- [x] 2026-08-30：workspace 级 `pnpm -r typecheck`、`pnpm -r test`、`check:packages`、`check:docs` 和 `check:current-docs` 通过。
- [ ] G1 跨 package regression、CLI、Desktop 手工验收交接。

## 13. 执行模式

默认使用交互模式。P00、P01 涉及公共契约和持久化读取边界，P02、P03 涉及 Desktop 数据源切换，执行时逐阶段确认；不使用夜间模式进行首次生产 projection cutover。
