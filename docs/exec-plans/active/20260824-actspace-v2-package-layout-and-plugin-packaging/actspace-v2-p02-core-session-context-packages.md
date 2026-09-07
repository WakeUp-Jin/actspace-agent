# P02：Core、Session、Context 与 Prompt 包化

状态：已完成（2026-08-25）。

父计划：[ActSpace v2 包拆分与真实插件包化](./README.md)

依赖：[P00](./actspace-v2-p00-workspace-and-package-contracts.md)、[P01](./actspace-v2-p01-plugin-abi-and-cordis-adapter.md)

## 目标

把 Agent Core 和 Session 这组最重要的产品语义从单一 ESM 包内部目录拆成独立领域 workspace packages，并使它们通过 P01 的真实 Plugin ABI 参与 Base Profile。Session 只使用 raw UTF-8 JSONL；旧 Session 保留一份迁移参考文件但不加载、不导入、不混读。

## 范围

包含：

- `packages/core/scope/`、`packages/core/agent/`、`packages/core/agent-loop/`；
- `packages/session/journal/`、`packages/session/persistence/`、`packages/session/jsonl/`、`packages/session/projection/`；
- `packages/context/`、`packages/prompt/`、`packages/compaction/`；
- 每个包的 manifest、codec、behavior entry、exports 和 lifecycle tests；
- Session EventCodecRegistry 在 behavior activation 前的 codec discovery；
- Journal、Surface、request snapshot、flush/checkpoint、repair、fork 和 compaction 的跨包契约；
- Base Profile 中 required Session、Prompt、Context、Agent Registry 和 Agent Loop provider 的 activation audit。

不包含：

- LLM provider、Tool executor、Browser Bridge；
- zstd、SQLite、packed rows；
- v1 Session importer 或旧数据自动删除；
- fixed renderer 的视觉改动。

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-session-and-context.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-agent-core.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-prompt-context-contributors.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`

## 允许修改

- `packages/core/`
- `packages/session/`
- `packages/context/`
- `packages/prompt/`
- `packages/compaction/`
- `packages/shared/src/runtime-v2/` 中与 Session/Prompt/Agent package boundary 直接相关的 namespaced DTO
- Session golden fixtures、codec fixtures、contract/lifecycle tests

禁止修改：

- `apps/desktop/src/renderer/`；
- `packages/llm/`、`packages/tools/`；
- 旧 `sessions/` 数据文件；
- Browser Bridge 实现。

## 任务

1. 按领域从当前 `packages/agent-runtime/src/{scope,agent,session,projection,prompt,context,compaction}` 迁移实现，先建立 leaf package public API，再接入 Behavior Entry。
2. 将 Session Journal、Persistence、raw JSONL backend 和 Projection 分成独立 package；任何 package 不得通过另一个 package 的 `src/` 读取内部实现。
3. 使 `journal.jsonl` 首行 Header、事件 Envelope、Surface replacement、source provenance、required/ignorable codec、repair 和 fork 仍满足 Session Format v1。
4. 将 `EventCodecRegistry` 作为激活前能力装载：required codec 缺失阻止 resume/new write，但保留 raw browse；optional codec 缺失只能进入 degraded projection。
5. 将 ContextManager 的 conversation 所有权拆除：模型历史只能从 Session Surface 重建，Prompt/Context contributor 只提供本次 Request Assembly 的候选输入。
6. 将 Compaction 作为独立 plugin package，保留 append-only summary/replacement/end 事务，不删除 raw Journal。
7. 为每个 core package 添加独立 contract、activation、dispose、unknown dependency 和 required provider failure tests。
8. 建立一个明确的迁移参考 fixture：旧 Session 文件仅用于人工比对和 raw browse 检查，新 Runtime 不读取它。

## 验证

```bash
pnpm --filter @actspace/core-* test
pnpm --filter @actspace/session-* test
pnpm --filter @actspace/context test
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/compaction test
pnpm check:docs
pnpm typecheck
pnpm test
git diff --check
```

必须通过 Session golden cases：连续 seq、surface replacement、request snapshot、flush barrier、checkpoint fail-closed、writer lease、torn tail repair、cold fork、compaction provenance、required codec 缺失和旧参考数据不加载。

## 失败与回退

- Session codec 无法在 Behavior 激活前发现：禁止该 package 进入 Base Profile；保留 raw journal，不允许 resume。
- 包拆分导致 Session 与 Projection 双真相：回退到同一 Journal API，禁止复制 mutable messages。
- 旧数据被新代码自动扫描：立即停止执行，恢复到只保留参考 fixture 的路径，不删除用户文件。
- Core package cycle：把依赖下沉到 shared contract，不通过 barrel export 隐藏 cycle。

## 完成标准

- Session、Prompt、Context、Agent Registry、Agent Loop 各自是可被 Loader 识别的真实 package Entry；
- Base Profile 缺少任一 required core provider 时 fail-closed；
- `sessions-v2/<id>/journal.jsonl` 可独立创建、恢复、检查、repair、fork 和 compaction；
- 旧 Session 参考文件存在但没有任何读取路径；
- P03 可以直接消费稳定的 Session、Prompt、Context 和 Agent contracts。

## 依赖与消费者

- 依赖：P00、P01。
- 消费者：P03、P04、P05。

## 执行记录

执行记录：`docs/exec-runs/actspace-v2-p02-core-session-context-packages/`。
