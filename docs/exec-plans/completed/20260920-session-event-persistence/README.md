# Session 事件持久化与检查点重构执行计划

> 状态：代码实施完成；本次范围自动验证通过，全仓既有门禁失败已记录，人工 G4 保留。
> 日期：2026-09-20。执行模式：交互模式。
> 实施结果：完成事件接纳/持久化 coordinator/必需 checkpoint；物理 `session-core` 包拆分退回 P1-A 独立执行。

## 目标与设计真源

[已批准设计](../../../design-docs/agent-plugin-runtime/agent-session-event-persistence-refactor.md)：保留生产者直接 append，补齐 Session 事件驱动持久化，建立必需检查点；不采用 Loop 唯一事件生产者方案。

本计划交付 Session 行为语义和 CLI/process 回归。实施复核后保留现有包导入兼容面：一次性迁移 42 个 consumer 到新 `session-core` 包不会改变事件正确性，且会扩大本次行为切换的风险，因此物理包拆分继续由 P1-A 负责。本计划完成 coordinator 所有权、accepted/durable 边界、Cordis 处理器和 Loop 检查点。

## 必读与基线

执行前读 AGENTS.md、docs/REPO_COLLAB_GUIDE.md、ARCHITECTURE.md、PLANS_GUIDE.md、CODING_BEHAVIOR.md、HISTORY_GUIDE.md、QUALITY_SCORE.md、exec-runs/README.md，以及上述设计、agent-testing.md、agent-spec-session-format-v1.md、agent-spec-agent-loop-cordis-surface.md、agent-spec-tool-runtime-abi.md、FRONTEND_VERIFICATION.md。

源码基线：Loop 直接 append；SessionHandle 持有 write-behind；driver 完成后才通知 session/event；flush 完成后才通知 session/flush；Session created/disposed 只有声明。DSH 参考见设计正文。

已有工作树包含官网、依赖锁与其他任务修改。执行前重新检查 git status/diff，保留它们；共享 pnpm-lock.yaml 只合并本任务必要变化，不覆盖。禁止自动 commit/push、删除用户 Session、启动真实付费 Provider 或修改 tmp 参考仓库。

## 文件与接口所有权

涉及超过 8 个文件、两个新 package；不并行委派。

| 范围 | 修改目的 |
|---|---|
| packages/session/core/**（新增） | Session、Store、只读视图、事件生命周期及 contract tests |
| packages/session/persistence/src/{session-driver,session-persistence,write-behind,index,plugin,manifest}.ts | 中立 contract 与通用 coordinator；新增 coordinator.ts、contract.ts |
| packages/session/jsonl/src/** | 接收 writer-lease、文件布局、backend 与物理 recovery；保留原算法 |
| packages/session/journal/src/{journal,checkpoint,index}.ts | 只读视图类型、整批接纳边界及 checkpoint 错误契约；不进行性能重写 |
| packages/session/checkpoint-policy/**（新增） | 必需 checkpoint 插件及生命周期测试 |
| packages/cordis-adapter/src/{event-contract,dispatch,service-contract}.ts | 类型化 Session payload、必需/可选处理边界、诊断 |
| packages/core/agent-loop/src/{loop,service}.ts；packages/tools/runtime/src/prepared-execution.ts | 明确最终执行边界、settlement、llm/chunk；保留生产者事实 |
| packages/runtime/src/runtime/{session-controller,session-plugin,agent-factory-plugin}.ts | 单一 live owner，Host 委托、装配及关闭 |
| packages/runtime/src/profiles/**、packages/runtime/cordis.yml | 显式装配 backend/Core/checkpoint，启动失败清理 |
| packages/session/projection/src/**、packages/runtime/src/projection/** | live 从内存读取，冷数据从 backend 读取 |
| packages/english-learning/src/service.ts；apps/desktop/src/main/runtime-v2/** | payload 迁移、revision 与实时完成语义；限定相关 Session 链路 |
| packages/core/agent、packages/subagent、packages/compaction 及其他 SessionHandle 消费者 | 迁移包导入/只读访问；不修改业务策略 |
| package.json/tsconfig/manifest、pnpm-lock.yaml、边界检查脚本 | 新包可构建、可装载、依赖无环 |

非目标：文件格式变更、数据库、Journal O(n²) 优化、projection-cache 接线、重试策略重写、具体工具 executor 改造、UI 样式、后台热切换。

## 冻结的实施契约

1. SessionCore append/appendMany 保留 Promise；成功返回不可变 envelope，业务生产者不依赖 backend。
2. acceptedSeq 从 -1 起，durableSeq 为持久连续前缀；memory 模式为 null 并显式标注。flush 目标在入口捕获。
3. 中立契约位于 persistence/contract.ts，只包含 identity/header/seed/envelope/revision/error/backend binding，不返回 Core class 或物理路径。实例绑定以 sessionId + instanceId 隔离，单个 persistent Session 只允许一个 backend。
4. Backend binding 提供 appendBatch、flush、close、编码长度估算及写入状态；create/open/fork 在发布前完成 lease/seed 准备。Core 不调用 assertOwned，不读 fs。
5. Cordis Session payload 是具名对象，携带 sessionId/instanceId；event 携带 envelope，flush 携带 throughSeq，disposed 携带 close outcome。不以 this.sessionId 为唯一身份。
6. session/event 的必需消费者同步接收 immutable batch；appendMany 验证与接纳整批，不能循环半途入队。后台失败回写中立 blocked 状态，保存 cause；观察者失败独立诊断。
7. session/checkpoint 必需处理器调用 store.flush；reason 与设计一致。llm/chunk 替代增量 serial('llm/stream')。不创建第二套事件总线。
8. close 拒绝新工作，允许内部收尾，再 flush/释放；失败仍释放且返回失败结果。初始化失败不泄漏 live handle。

## S1：分离 live 接纳与 backend queue

这是可独立合并的结构切片；本阶段仍在写入完成后发 session/event，不提前宣称已实现目标事件语义。

- [x] 从 `SessionHandle` 提取 `SessionPersistenceCoordinator`，write-behind、durableSeq 和 backend close 由 coordinator 持有。
- [x] `SessionStore` 为 create/open/fork 建立唯一 coordinator；observer failure 与 durability failure 分离。
- [x] `SessionHandle` 暴露 acceptedSeq、durableSeq、blocked/closed 状态；后台写失败对下一次副作用 fail closed。
- [x] 保持 JSONL 格式、writer lease、recovery/fork 算法和公开导入兼容；相关 golden、lease、recovery tests 通过。
- [x] 物理 `@actspace/session-core` 包拆分与 42 个 consumer 导入迁移转回 P1-A，不与本次时序切换混合。

验证：G1（下文）及 session packages 的 typecheck/test；fake backend 与 JSONL parity、重复 open、关闭并发、初始化失败释放。验收时 Core 源码无 node:fs、node:path、session-jsonl 或 JsonlSessionWriter import。

回退：撤回 S1 包移动与装配；磁盘内容和通知 ABI 未改变。不得以 Core 重新 import writer 作为前进方向。

## S2：一次性切换 Session 事件与全部消费者

这是原子行为切片：Core 发布、持久化订阅、消费者读取必须同批切换，不能拆开上线。继续使用现有直接 checkpoint 调用，S3 不完成也必须安全可用。

- [x] 实现 created/event/flush/disposed 生命周期通知；Runtime live map 是 checkpoint 定位入口。
- [x] backend binding 和 seed 在 handle 发布前完成；恢复 seed 不重发 observer 通知。
- [x] append 先由 Journal 接纳，再由 coordinator 入队，随后通知 observer；维护 accepted/durable 进度。
- [x] flush 是 awaited durability barrier；超前 seq、写入失败、关闭竞态和重复 close 有测试。
- [x] live projection 继续读取唯一 live Store，冷 session 继续走 inspection；现有 envelope payload 无需 Desktop ABI 迁移。
- [x] observer failures 被隔离并上报；durability failures 保留 cause 并阻止后续写入。
- [x] 保留低延迟 onLiveEvent，最终完成路径在 after-turn-settled checkpoint 后返回。
- [x] 同步事件模型、Core/Persistence 规范、契约矩阵和执行记录。

验证：G1 + G2；注入入队/fsync/lease/observer 错误，断言持久化失败后新副作用数量为零；保存到临时根目录并重开验证连续 prefix；两 Session 交错、seed、fork、appendMany、close 覆盖。

回退：整体撤回 S2（含消费者），不能仅回退发布时序或仅回退订阅者；先停止运行并尝试 flush，失败保留诊断，不销毁内存错误证据。没有文件格式迁移。

## S3：检查点插件与真实执行边界

S2 已能正确持久化；本阶段迁移策略所有权，不改变安全保证。

- [x] 建立 checkpoint-policy manifest/plugin/index 和 lifecycle tests，生产 Profile 必装唯一必需处理器。
- [x] 模型初次请求与 retry 的最终 dispatch 前发布 checkpoint。
- [x] 工具 body 前在 `recordDispatch` 之后发布 checkpoint，审批/guard 顺序保持。
- [x] 正常、step-limit、错误和取消路径执行 after-turn-settled；双重失败使用 AggregateError 保留原始运行错误。
- [x] 删除 Loop 对 Journal `CheckpointPolicy` 的直接调用；关闭等非 Loop flush 保留。
- [x] `llm/stream` 保持请求干预，新增 `llm/chunk` observer 通知。
- [x] 更新生成契约与所有权文档；CLI process 回归见执行摘要。

验证：G1 + G2 + G3；缺失处理器启动失败；拦截器提前返回、retry、工具直接调用均不能绕过；拒绝审批不执行 body；同一次事实仅落盘一次。

回退：整体撤回 S3 并恢复 S2 的直接检查点调用，不允许出现既无旧检查点又无新处理器的中间状态。

## 验证命令与预期

以下是实施时要运行的命令，不表示本轮已通过。新包命令仅在 S1/S3 对应包建立后运行。

G1：每个切片构建及定向检查

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter './packages/session/**' typecheck
pnpm --filter './packages/session/**' test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/runtime test
pnpm run check:packages
pnpm run check:package-cutover
pnpm run check:current-docs
pnpm run check:docs
```

G2：事件消费者与运行回归

```sh
pnpm --filter @actspace/english-learning test
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm run gen:contract-matrix
pnpm run test:contract-matrix
pnpm run test:agent-cli:process
```

G3：最终合并前一次全局检查

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm run check:v2-legacy-removal
```

预期退出码为 0，新增负向 tests 不允许仅断言 mock 被调用：必须断言 durable prefix、恢复事实、真实组装下 LLM/tool fake executor 调用次数及释放状态。CLI process fixture 用临时 dataRoot 和可控假模型，无需密钥；覆盖 fresh --persist、--resume、重试、取消、错误及最终退出前 flush。若现有测试未覆盖，扩展 scripts/test/agent-cli-process.test.mjs，而不是手工声称通过。

## 验收矩阵

| 场景 | 通过条件 |
|---|---|
| append 与 flush | 观察事件早于落盘；flush 返回后文件含完整 throughSeq prefix |
| 无/重复 backend | 持久 Session 不对外发布，无模型/工具执行 |
| 入队失败 | 已接纳事实保留，Session blocked，无自动重复业务 |
| fsync/lease 失败 | 原始 cause 可追踪；模型和工具后续调用次数为零 |
| observer 抛错 | 其他 observer 仍接收；durability 不受污染 |
| 批量非法项 | Journal 与队列均零新增；有效批次顺序一致 |
| fork/resume | seed 不重播、不重复写；suffix 从准确游标追加 |
| 双 Session/关闭竞态 | seq、绑定、队列隔离；close 幂等且失败可见 |
| request hook/retry | 最终实际请求可由日志还原；每次 dispatch 前完成屏障 |
| tool direct/batch/subagent | body 前有 durable dispatch 事实；无公开旁路 |
| live projection | 先通知后落盘时 UI 仍从 live 状态正确读取 |

人工 G4：隔离 dataRoot 的 Electron 中验证流式显示、切换会话、后台工具、正常退出重开、取消与写入失败提示；在获得真实调用授权后验证 Provider 请求和工具执行。测试不得污染个人 Session。无新第三方服务/CLI/API key；真实 Provider 使用用户已有配置，不在文档收录凭据。自动通过不代替 G4。

## 文档与执行记录

实施开始建立 `docs/exec-runs/20260920-session-event-persistence/execution-process.md` 与 `execution-summary.md`，使用 exec-runs 模板。每个切片记录修改、运行命令、失败及证据路径，不把计划清单当执行证据。

每阶段同步设计状态；完成实现后记录 history，阅读 learnings/WRITING_GUIDE.md 并沉淀事件接纳/持久化屏障知识。更新 ARCHITECTURE、领域导航、包台账与相关设计；新 plan 实现完成后移 completed，未执行的人工门禁明确保留。本轮只生成计划，不建立虚假的实施成功记录。

## 进度与决策

- [x] 用户批准 DSH 分层的重构设计。
- [x] 生成目标契约、切片任务、失败矩阵、回退边界。
- [x] S1 live 接纳与 backend queue 分离；物理包迁移交回 P1-A。
- [x] S2 Session accepted/durable 行为切换。
- [x] S3 必需检查点与最终执行边界。
- [x] G1/G2/G3 已执行并记录；本次范围检查通过，Desktop 全量测试与 package 边界的既有失败见执行摘要；G4 人工边界保留。

2026-09-20：保留 Loop append；不采用 Loop 唯一事件源；不把所有可选钩子改为必需订阅；持久化失败不可吞；所有计划状态与验证结果严格区分。
