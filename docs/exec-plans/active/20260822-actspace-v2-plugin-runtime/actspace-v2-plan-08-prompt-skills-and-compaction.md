# P08：Scope、Prompt、Skills、Request Assembly 与 Compaction

状态：已完成

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P04、P05、P06

消费方：P10-P15

Exec-run slug：`actspace-v2-plan-08-prompt-skills-and-compaction`

## 1. 目标

用不可变、可重建的 Request Assembly 替换旧 ContextManager：从 Session Surface、Agent Scope、Prompt / Context contributors、Tool definitions 和 one-shot LLM metadata 构造 logical request snapshot。迁移 Skills 发现与渐进披露，提供 append-only Compaction；不再维护与 Journal 并行的 mutable conversation truth。

## 2. 必读与基线

- [Prompt 与 Context Contributor](../../../design-docs/agent-plugin-runtime/agent-spec-prompt-context-contributors.md)
- [Agent Core 目标边界](../../../design-docs/agent-plugin-runtime/agent-target-agent-core.md)
- [Session Format v1](../../../design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md)
- `packages/agent-core/src/context/`
- `packages/agent-core/src/prompt/`
- `packages/agent-core/src/skills/`
- `apps/desktop/src/main/agents-md-service.ts`

## 3. 文件与固定接口

```text
packages/agent-runtime/src/
├── scope/
│   ├── scope.ts
│   ├── layered-registry.ts
│   └── disposer.ts
├── prompt/
│   ├── contributor.ts
│   ├── registry.ts
│   ├── assembler.ts
│   ├── request-snapshot.ts
│   └── core-contributors.ts
├── skills/
│   ├── catalog.ts
│   ├── discovery.ts
│   └── contributor.ts
└── compaction/
    ├── policy.ts
    ├── region.ts
    ├── summarizer.ts
    └── plugin.ts
```

固定公共名：`AgentScope`、`ScopedRegistry<T>`、`PromptContributor`、`ContextContributor`、`ContributorRegistry`、`RequestAssembler`、`LogicalRequestCandidate`、`LogicalRequestSnapshot`、`SkillCatalog`、`CompactionPolicy`。

## 4. 确定性规则

- Scope 是 opaque identity + parent chain + layered registry + scope-owned disposer，不是权限沙箱。
- contributor identity 固定为 `<pluginId>/<localId>`；重复 id fail-fast。
- 排序 tuple 固定为 `compositionLayer -> numericOrder -> contributorId`，任何 Map 插入顺序、并发完成顺序或文件发现顺序都不能改变结果。
- required contributor 失败阻止 request；optional contributor 失败产生 diagnostics 并从 snapshot 中明确记为 skipped。
- contributor 输出必须 JSON-safe、可冻结、无 credential、live object、AbortSignal、Cordis Context 或 SDK client。

## 5. 任务

### 08.1 Agent Scope 与 scoped registry

- 实现 parent visibility、child shadow、ordered enumeration 和 child-first quiescent disposal。
- 所有 registry contribution 返回 disposer，并由 Scope / Cordis Effect 共同拥有；不能写静态全局 map。
- 只允许 Host ceiling 和 parent policy 收窄工具/能力，不允许 child 扩大。

### 08.2 Contributor registry 与 core contributors

- 建立 core/system、core/agent-descriptor、host/user-instructions、host/workspace-instructions、core/skills-catalog、host/workspace-facts、host/capabilities 和 plugin contributor。
- Host 内容通过 typed port 注入，不由 runtime 直接读取 Electron、TTY 或全局 process state。
- user/workspace instructions 保留 source digest、path identity 和排序 provenance。

### 08.3 Request Assembly

- 固定流程：Surface -> scoped contributors -> visible tools -> logical candidate -> P05 `prepare()` -> resolved metadata -> append snapshot -> P04 checkpoint -> dispatch same PreparedCall。
- prepare 后所有失败路径在 `finally` release/cancel lease；checkpoint 失败 wire invocation count 为 0。
- snapshot 保存 assembled system、messages boundary、tool schemas、route/model/defaults/retry metadata 和 contributor provenance；不保存 credential 或 provider wire payload。
- 随机化 contributor 注册/完成顺序，snapshot canonical bytes 保持一致。

### 08.4 Skills 迁移

- 保留 `.actspace/skills`、`.agents/skills`、`.claude/skills` 的现有发现优先级、frontmatter 校验、workspace boundary 和 catalog 渐进披露。
- Skill 内容通过受限 read path 按需进入 request；catalog 不把全部正文预注入 Prompt。
- 插件 Skill contribution 也必须 effect-owned，并携带 plugin / source provenance。

### 08.5 Compaction

- policy 使用实际 token usage 和模型 context limit 决定 region，不按固定轮数触发。
- summarizer 通过 P05 LLM route 调用；失败不删除历史，也不提交半个 replacement。
- transaction 固定为 compaction start -> summary -> replacement user message -> end；replacement 引用所有 shadow source seq。
- original Journal、tool facts、approval 和 request snapshots 永远保留。

## 6. 允许修改

- `packages/agent-runtime/src/{scope,prompt,skills,compaction}/**`
- P04 request snapshot / compaction codec 对接
- P05/P06 的只读 provider interfaces
- namespaced Shared request preview DTO
- 测试、exec-run、设计勘误和 history

禁止修改旧 ContextManager、Desktop AgentsMdService、具体 tool executor、Agent Loop 或默认 Runtime。

## 7. 失败与回滚

- 无法从 Journal + snapshot 重建同一 logical request 时阻止 P10，不增加隐藏 Context cache 作为真相。
- Compaction summarizer 不可用时保留未压缩 Surface，并返回明确 capacity failure；不静默丢消息。
- 回滚删除新模块，v1 ContextManager 保持默认运行。

## 8. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/scope src/prompt src/skills src/compaction
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime build
pnpm check:docs
pnpm check:secrets
git diff --check
```

## 9. 完成标准

- request snapshot 在随机注册顺序、cold reload 和 cache deletion 后稳定。
- Scope / Skill / contributor 卸载后不再可见且资源静止。
- 代码中不存在 v2 `ContextManager` 或独立 mutable messages truth。
