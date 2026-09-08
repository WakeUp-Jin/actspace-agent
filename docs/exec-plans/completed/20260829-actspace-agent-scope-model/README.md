# ActSpace P0：Agent Scope 模型重构

状态：实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收。

## 目标

把 ActSpace 当前“有 parent registry、但事件仍是扁平精确匹配”的局部 Scope 实现，收敛为一套同时驱动注册可见性、事件准入、资源所有权和 Agent subject dispatch 的 Scope 模型。完成后，main Agent、one-shot Subagent、Prompt/Tool contributors 和 Agent Loop listener 都使用唯一的 live Agent Scope identity；普通 child Agent 自动继承 parent Scope，父 Scope 能观察 child event，child 不会串入 sibling；需要注册隔离时可以显式选择 flat child Scope；Scope dispose 能等待所有拥有资源静止。

本计划只覆盖 Scope。Agent Loop 的事件字段/模式和核心领域对象的 Cordis Service 化由并行 P0 计划负责，本计划通过稳定适配边界与它们协作。

## 范围

### 包含

- opaque `ScopeKey`、`ScopeIdentity` 和 parent chain；
- parent-aware registry visibility/shadow；
- scope-aware event admission；
- Agent subject + Scope carrier fused dispatcher；
- Agent/ Subagent 的唯一 live identity 接入；
- Scope-owned setup、dispose、quiescence 和 contract tests；
- 设计文档、执行过程记录和验证摘要。

### 不包含

- Event ABI 的 9 个插入点和 5 个通知的字段/顺序/mode 重写；
- Session Journal、13 个核心事件和 persistence backend；
- Tool executor 的 read/list/grep/bash/browser 实现；
- 任意 Host capability、credential、sandbox 或跨进程安全策略；
- Dynamic plugin sandbox、marketplace、live reload；
- Desktop renderer/UI。

## 背景与依赖

- 设计契约：[Agent Scope 模型设计规范](../../../design-docs/agent-plugin-runtime/agent-spec-agent-scope-model.md)。
- 现有 Scope：[packages/core/scope](../../../../packages/core/scope)。
- 当前 Agent/Subagent 契约：[agent-spec-agent-and-subagent.md](../../../design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md)。
- 当前 Loop 事件契约：[agent-spec-agent-loop-cordis-surface.md](../../../design-docs/agent-plugin-runtime/agent-spec-agent-loop-cordis-surface.md)。
- Cordis 原生事件 P0：`20260829-actspace-dsh-core-rebuild/p01-cordis-loop-surface.md` 的事件部分；本计划不接管其事件字段和 mode。
- Cordis Service P0：`20260829-actspace-dsh-runtime-full-plugin-composition` 及当前并行执行的 Service 化任务；本计划只消费其 Context/effect 边界，不修改其服务所有权设计。

现有 `20260829-actspace-dsh-core-rebuild` 计划中关于 Scope 的实现任务由本计划细化；事件 ABI 任务仍由原计划负责。批准本计划后，应以本文档作为 Scope 的唯一执行入口，避免两个计划各自实现一套 Scope tree。

## 推荐方案

在现有 `AgentScope`、`ScopedRegistry`、`ScopeDisposer` 上演进，不引入第二套平行作用域系统：

```text
Cordis Context
  └── Scope Context（tag + effect ownership）
        └── AgentScope（domain identity + parent relation）
              ├── scoped registries
              ├── Agent fused dispatcher
              └── child scopes
```

Scope registry 的可见性沿 parent 向下继承；Agent event admission 沿 parent 向上扩大；两者共享一个可验证的 parent relation。普通 child 默认建立 parent link，flat child 只作为显式隔离模式。字符串 id 只用于诊断和 lineage，不能作为唯一事件路由 key。

## 文件所有权

### Scope 核心

- `packages/core/scope/src/scope.ts`
- `packages/core/scope/src/layered-registry.ts`
- `packages/core/scope/src/disposer.ts`
- `packages/core/scope/src/index.ts`
- `packages/core/scope/src/` 下新增的 key、carrier、admission 辅助模块
- `packages/core/scope/src/test/**`

### Agent identity / dispatch 接入

- `packages/core/agent/src/**` 中的 Agent identity、registry 和 dispatch adapter
- `packages/core/agent-loop/src/**` 中仅涉及 Scope carrier/Agent identity 的调用点
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/agent-runtime-plugin.ts`
- `packages/subagent/src/provider.ts`
- 对应 package tests

不得在本计划中修改：

- `packages/cordis-adapter/src/events.ts` 的事件 mode 设计；
- 工具 executor 和工具具体实现；
- Session event schema 或 writer/recovery 语义。

## 子计划

| 子计划 | 产物 | 依赖 | 可独立验收 |
|---|---|---|---|
| [P00 Scope contract and primitives](p00-scope-contract-and-primitives.md) | opaque key、parent relation、registry/admission contract 和单元测试 | 无 | 是；不改变 Agent Loop 行为 |
| [P01 Agent carrier and scoped dispatch](p01-agent-carrier-and-scoped-dispatch.md) | fused dispatcher、ancestor admission、subject/carrier invariant | P00；事件 ABI 只需提供最终 dispatch hook | 是；用 test Context 验证 |
| [P02 Agent/Subagent integration](p02-agent-subagent-integration.md) | 唯一 live identity、parent child scope、setup/dispose、CLI/Subagent 验证 | P00、P01；依赖 Agent Service 接口稳定 | 是；只使用 Cordis Context |

每个子计划完成后系统都保持可运行：P00 只增强 Scope 原语，P01 只增强 scoped dispatch，P02 才切换 Agent/Subagent 的生产调用点。

## 风险

- **身份错配风险**：继续使用 descriptor/preset id 会让多个 live Agent 共用 listener。缓解：P00 固定 opaque key，P02 用实例级 identity。
- **父子规则反转风险**：把 registry inheritance 和 event admission 写成同一方向会导致 child 看不到父贡献或 sibling 串线。缓解：分别测试“注册向下”和“事件向上”。
- **生命周期泄漏风险**：只注销 listener、不等待 stream/tool lease 会留下 orphan work。缓解：quiescent dispose 测试和反向清理顺序。
- **并行改动冲突**：事件 ABI 和 Service P0 可能同时改 Agent Loop。缓解：本计划只拥有 Scope/identity/carrier 代码，调用点采用小范围适配提交。
- **语义误用风险**：Scope 被误当成安全沙箱。缓解：保留 Host/Tool/Approval 的权威边界测试，不新增 Scope 权限声明。

## 验证方式

### 命令

- `pnpm --filter @actspace/core-scope typecheck`
- `pnpm --filter @actspace/core-scope test`
- `pnpm --filter @actspace/core-agent test`
- `pnpm --filter @actspace/core-agent-loop test`
- `pnpm --filter @actspace/subagent test`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm run check:docs`
- `git diff --check`

### 必须覆盖的行为

- 两个相同 descriptor 的 main Agent 事件不串线；
- 普通 parent listener 收到 child event；child listener 不收到 sibling event；显式 flat child 不读取 parent-local contribution，但仍保持独立 Agent/Session/lineage 关系；
- child registry 继承 parent，最近层 shadow 生效；
- child dispose 不影响 parent/sibling；
- subject/carrier mismatch fail closed；
- unpublished setup 失败不发布 Agent；
- Runtime shutdown 等待 child Scope 和 active work 静止；
- CLI one-shot 与 one-shot Subagent 通过同一 Scope 语义。

## 回退策略

本计划不改变 Session 数据格式，不删除工具实现，也不要求数据迁移。若 Agent carrier 与 Cordis event hook 的兼容性验证失败，只允许修正 Cordis Context carrier/测试 fixture；不得恢复自定义事件总线，也不得回退到 descriptor id 作为 live scope key。

## 执行模式

**交互模式**。这是 Agent identity、事件路由和生命周期的高风险后端契约变更；每个子计划完成后先验证，再进入下一子计划。

## 执行文档

执行开始时创建：

- `docs/exec-runs/20260829-actspace-agent-scope-model/execution-process.md`
- `docs/exec-runs/20260829-actspace-agent-scope-model/execution-summary.md`

P00/P01/P02 已完成 Scope 范围实现并通过定向 package 回归；全仓库与真实 Host 验收边界记录在对应 `docs/exec-runs/`。

## 进度记录

- [x] 完成当前 ActSpace 与 DSH Scope 语义对照。
- [x] 固定 Scope 设计规范。
- [x] 拆分 P00/P01/P02 执行计划。
- [x] 用户审核设计规范和 execution plan。
- [x] 用户明确批准后执行 P00。
- [x] P00 Scope contract 与基础原语实现并通过验证。
- [x] P01 Agent carrier 与 scoped dispatch。
- [x] P02 Agent/Subagent Scope 集成。

## 决策记录

- 2026-08-29：Scope 继续由 ActSpace 自有 `AgentScope` 拥有，不直接依赖 DSH Scope 包；吸收 DSH 的 opaque identity、parent-aware admission、layered visibility 和 fused dispatcher 语义。
- 2026-08-29：Scope 与工具权限、安全沙箱、Session lineage 分离；Scope 只负责可见性、路由和生命周期所有权。
- 2026-08-29：普通 child Agent 默认自动绑定 parent Scope；child 仍使用独立 ScopeKey、Agent subject、Session 和 disposer。flat child 仅作为调用方显式要求注册隔离时的特殊模式。
- 2026-08-29：本计划从现有 DSH core rebuild 的 Scope 任务中独立出来，事件 ABI 和 Service 化由其他 P0 计划负责。
