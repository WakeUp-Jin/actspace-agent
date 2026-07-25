# 全局基线与 Shared 契约审查计划

## 目标

检查仓库整体结构、包依赖方向、共享契约、脚本和仓库级规范是否与 `docs/` 中的设计事实一致。这个模块也承担全局模块检查，负责发现跨包边界漂移、文档导航失效、测试入口缺口和开发期不再需要的兼容残留。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/core-storage-and-observability.md`

## 重点代码与文件范围

- `package.json`
- `pnpm-workspace.yaml`
- `scripts/`
- `packages/shared/src/`
- `packages/shared/src/test/`
- `packages/agent-core/package.json`
- `packages/desktop/package.json`
- 根目录配置文件和仓库级检查脚本

## 审查问题

- `desktop -> agent-core -> shared` 的依赖方向是否被破坏。
- `packages/shared` 是否只保存跨进程共享契约和类型，没有混入 desktop 或 agent-core 实现细节。
- IPC/session/model/context 等共享契约是否和设计文档中的数据流一致。
- 仓库级脚本是否仍服务当前开发方式，有没有过期脚本、重复脚本或无效入口。
- 文档导航是否仍能指向当前实现，是否存在已经迁移但仍被引用的旧路径。
- 测试入口是否覆盖共享契约关键恢复、聚合和 schema 逻辑。

## 输出格式

### 偏移点

- 记录代码和文档设计不一致的地方。

### 不合理设计

- 记录实现选择、职责边界、数据流问题。

### 可读性问题

- 记录难读函数、命名、重复逻辑。

### 耦合问题

- 记录过高耦合、边界混乱，或者过度拆分导致理解成本高的问题。

### 死代码/兼容残留

- 记录开发期不需要保留的旧入口、无用分支、废弃类型。

### 建议动作

- 只给建议，不改代码。建议类型包括：删除、收敛、重构、补文档、补测试。

## 产出要求

- 本轮只审查和记录，不修改代码。
- 结论需要引用具体文件路径，尽量给出行号。
- 对不确定的问题标注为“待确认”，不要当作确定缺陷。

## 审查结果

### 发现 1：`RunTurnInput` 设计文档未覆盖当前共享契约

- 偏移点：`docs/design-docs/agent-runtime/agent-turn-layers.md:32` 到 `docs/design-docs/agent-runtime/agent-turn-layers.md:40` 记录的 `RunTurnInput` 只有 `sessionId`、`turnId`、`userInput`、`model`、`thinkingEnabled`，但实际共享契约 `packages/shared/src/ipc.ts:29` 到 `packages/shared/src/ipc.ts:38` 已包含 `attachments` 和 `exploreModelId`。renderer 发送链路也已经使用附件字段，见 `packages/desktop/src/renderer/App.tsx:1001`、`packages/desktop/src/renderer/App.tsx:1082`、`packages/desktop/src/renderer/App.tsx:1131`；main 侧把 `exploreModelId` 注入 agent config，见 `packages/desktop/src/main/agent-turn.ts:190` 到 `packages/desktop/src/main/agent-turn.ts:192`。
- 不合理设计：共享契约增长后，四层职责文档仍停留在旧字段集，会让后续审查误以为附件和 Explore 模型选择不是正式 turn contract。
- 可读性问题：`RunTurnInput` 的真实来源需要同时读设计文档、shared 类型、renderer 发送点和 settings 注入点才能拼完整，入口文档失去“契约速读”价值。
- 耦合问题：`exploreModelId` 注释写“由 main 从 settings 注入”（`packages/shared/src/ipc.ts:36` 到 `packages/shared/src/ipc.ts:37`），但字段仍放在 renderer 可见的 IPC 输入类型中，容易让调用方误以为 renderer 也可以设置该字段；当前实际路径由 main/setting 注入，需在设计文档里明确所有权。
- 死代码/兼容残留：未发现直接死代码；这是文档滞后导致的契约漂移。
- 建议动作：补文档。更新 `agent-turn-layers.md` 的 `RunTurnInput` 字段表，明确 `attachments` 来源是 Composer 附件，`exploreModelId` 是 main/settings 注入字段，不应由普通 renderer 输入随意决定。

### 发现 2：Kairos sleep 事件 payload 在 core 存储文档中仍是旧形态

- 偏移点：`docs/design-docs/core-storage-and-observability.md:127` 到 `docs/design-docs/core-storage-and-observability.md:130` 写 `kairos_sleep_start` payload 为 `{ seconds, sleepEndsAt, biasApplied }`，但共享类型定义为 `{ plannedSeconds, reason }`，见 `packages/shared/src/session.ts:201` 到 `packages/shared/src/session.ts:205`；controller 实际写入也为 `{ plannedSeconds, reason: "after_tick" }`，见 `packages/agent-core/src/kairos/controller.ts:433` 到 `packages/agent-core/src/kairos/controller.ts:441`。同仓库另一份 Kairos 设计文档已使用 `plannedSeconds`，见 `docs/design-docs/kairos/agent-kairos-autonomous-mode.md:221` 到 `docs/design-docs/kairos/agent-kairos-autonomous-mode.md:231`。
- 不合理设计：同一事件在两个设计文档中出现两套 payload 事实，`core-storage-and-observability.md` 又是 AGENTS/计划指定的全局存储事实入口，容易误导后续存储或 renderer 聚合改动。
- 可读性问题：`sleepEndsAt` 实际属于 runtime state（`packages/shared/src/kairos-contracts.ts:74`），不是 `SessionEvent` payload；文档把状态字段和事件字段混在一起，读者需要倒查类型才能分清。
- 耦合问题：Kairos 聚合器直接读取 `payload.plannedSeconds` 和 `payload.reason` 展示 sleep 行，见 `packages/shared/src/kairos-aggregator.ts:133` 到 `packages/shared/src/kairos-aggregator.ts:142`；如果按 core 文档实现新生产者，会产生无法正确展示的事件。
- 死代码/兼容残留：未发现当前代码仍写 `seconds` / `biasApplied`；这是过期文档残留。
- 建议动作：补文档。把 `core-storage-and-observability.md` 的 Kairos sleep payload 改为 `plannedSeconds/reason`、`actualSeconds`、`reason/remainingSeconds`，并把 `sleepEndsAt` 留在 `KairosRuntimeState` 描述中。

### 发现 3：`@actspace/agent-core/kairos` 被描述为公共入口，但 package exports 未暴露

- 偏移点：`packages/agent-core/src/kairos/index.ts:1` 到 `packages/agent-core/src/kairos/index.ts:4` 注释称主进程通过 `import { createKairos, ... } from "@actspace/agent-core/kairos"` 装配 controller，历史文档也记录过该收口目标（`docs/histories/2026-05/20260527-2035-kairos-controller-runner.md:82`）；但 `packages/agent-core/package.json:10` 到 `packages/agent-core/package.json:16` 只导出 `"."`，没有 `"./kairos"` subpath。当前 desktop 实际从顶层 `@actspace/agent-core` import Kairos 类型和函数，见 `packages/desktop/src/main/kairos-bootstrap.ts:12` 到 `packages/desktop/src/main/kairos-bootstrap.ts:23`、`packages/desktop/src/main/kairos-ipc.ts:29`。
- 不合理设计：源码注释和历史设计把 subpath 当成公共边界，但包 manifest 没有对应 export；在启用 Node package exports 的消费场景里，`@actspace/agent-core/kairos` 会成为不可解析入口（待确认：当前构建是否有其它 bundler alias 绕过该限制）。
- 可读性问题：读者会在“顶层 re-export”（`packages/agent-core/src/index.ts:20` 到 `packages/agent-core/src/index.ts:21`）和“Kairos subpath 公共入口”之间看到两个入口说法，不清楚哪个才是稳定 API。
- 耦合问题：当前 desktop 被迫/实际消费顶层大入口，使 Kairos IPC/bootstrap 可以看到 agent-core 的大量非 Kairos 导出；这弱化了 `kairos/index.ts` 作为窄公共边界的价值。
- 死代码/兼容残留：`packages/agent-core/src/kairos/index.ts` 本身仍被顶层 re-export 使用，不是死代码；问题是 subpath 公共入口声明可能是未完成的收口残留。
- 建议动作：收敛。二选一：要么在 `packages/agent-core/package.json` 增加 `"./kairos"` export 并让 desktop 改用窄入口；要么删除/改写 `kairos/index.ts` 的 subpath 注释和相关文档，把顶层入口确认为唯一公共入口。

### 发现 4：shared 中保留多处旧 session 兼容逻辑，缺少可删除条件（待确认）

- 偏移点：`packages/shared/src/session-selectors.ts:16` 到 `packages/shared/src/session-selectors.ts:29` 仍识别旧 `turn_result` 包装记录，`packages/shared/src/session-selectors.ts:73` 到 `packages/shared/src/session-selectors.ts:91` 仍为缺少 `uiPreview` 的旧 tool result 生成通用 block；`assistant_reply` 也仍在 `SessionEventType` 和渲染聚合路径中保留，见 `packages/shared/src/session.ts:87` 到 `packages/shared/src/session.ts:104`、`packages/shared/src/session-selectors.ts:299` 到 `packages/shared/src/session-selectors.ts:300`。
- 不合理设计：待确认。早期 history 说明这些兼容曾用于恢复旧本地数据（例如 `docs/histories/2026-05/20260522-1350-contract-events-selectors.md:20` 到 `docs/histories/2026-05/20260522-1350-contract-events-selectors.md:21`、`docs/histories/2026-05/20260527-1027-legacy-tool-result-recovery.md:25`），但当前全局文档没有说明这些旧格式还需要保留多久、面向哪些版本数据。
- 可读性问题：`session-selectors.ts` 同时承担新事件聚合、旧包装展开、旧 tool result 降级展示和 Kairos 专属事件过滤，文件职责偏宽；读者很难判断哪些分支是长期契约，哪些只是迁移期兼容。
- 耦合问题：旧格式兼容逻辑位于 `packages/shared`，会被 renderer、main、agent-core 同时继承；如果某个旧分支已经不需要，保留在 shared 会把所有进程的恢复/展示路径继续绑定到历史格式。
- 死代码/兼容残留：待确认。未找到当前生产写入 `turn_result` 的路径；当前持久化已以逐条 `SessionEvent` 为主，见 `packages/agent-core/src/persistence/jsonl.ts:15` 和 `packages/agent-core/src/persistence/session-store.ts:22`。但本地用户旧数据是否仍需兼容无法仅凭代码确认。
- 建议动作：补文档或删除。先在共享契约/存储文档中明确旧格式保留策略；如果确认不再支持早期本地数据，再删除 `turn_result` / legacy tool result / `assistant_reply` 兼容分支并补恢复测试。若仍支持，则给这些分支加“为什么不能删”的文档锚点。
