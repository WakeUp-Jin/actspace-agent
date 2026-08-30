# P11：one-shot Subagent、Agent 与 Explore

状态：已完成

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P09、P10

消费方：P12-P15

Exec-run slug：`actspace-v2-plan-11-one-shot-subagent`

## 1. 目标

实现唯一的 synchronous one-shot Subagent seam，并用两个静态 descriptor 提供 `agent` 和 `explore`。每次委派创建独立 child Session、受限 child Scope、稳定 lineage 和结构化 terminal result；不实现 background、detached、continuation queue、child resume 或 StandingMount。

## 2. 必读与基线

- [Agent 与 Subagent](../../../design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md)
- `packages/agent-core/src/tools/tools/agent/`
- `docs/design-docs/collaboration/agent-explore-subagent.md`
- `docs/design-docs/collaboration/agent-subagent-runtime.md`

旧 runner 只提供行为与展示 fixture，不能作为新 child runtime。

## 3. 文件与固定 descriptor

```text
packages/agent-runtime/src/agent/subagent/
├── descriptor.ts
├── preset.ts
├── provider.ts
├── child-session.ts
├── publication.ts
├── terminal-result.ts
├── agent-tool.ts
├── explore-tool.ts
└── test/
```

- `actspace.agent`：通用一次性 child；工具集只能是 parent visible tools 与 static preset allowlist 的交集。
- `actspace.explore`：只读探索 child；固定只允许 read_file、list_directory、grep、glob 及明确只读 context contributors。
- child 没有 public Inbox、`resume`、`continue` 或 background handle。

## 4. 任务

### 11.1 Static Preset 与 child Scope

- Preset 在 Boot 时解析为不可变 descriptor；配置变化只触发 restartRequired。
- child Scope 继承 parent visible registry 后再收窄；任何 preset 都不能把 side-effect tool 重标为只读或扩大 Host ceiling。
- child 系统提示词、tool subset、token budget、max steps 和 model route 写入 child Header provenance。

### 11.2 Child Session 与 lineage

- 每次调用先创建独立 child Session，Header 包含 parentSessionId、parentCallId、delegationDepth、presetId 和 seed digest。
- parent 不复制完整历史；输入由显式 prompt、必要 workspace facts 和 artifact refs 组成。
- child 完成后生成 terminal result，再向 parent Tool result 追加幂等 link；同一 childSessionId 不得在 parent 重复提交。

### 11.3 有序发布与补偿

- child Session 与 Agent 先在 unpublished Scope 完整 setup，再按固定顺序发布。
- publication 中途失败时 reverse compensation、dispose child、写 terminal failure；不能留下可见但不可运行 child。
- 父进程在 child terminal 后、parent link 前崩溃时，恢复逻辑通过 child identity 补一次 link，不重跑 child。

### 11.4 级联取消和结果

- parent abort / Runtime shutdown 级联取消 child LLM、approval 和 tools，等待 child terminal facts 与 flush。
- terminal result 固定含 status、text、usage、toolUseCount、duration、childSessionId、artifact refs 和 structured failure。
- child Tool output 回填 parent 时使用 generic Tool DTO，不展开 child 全部 transcript 到 parent Surface。

### 11.5 Agent / Explore parity

- 迁移现有 Agent 与 Explore 的用户可见 tool name、核心 prompt intent、progress summary 和 usage。
- Explore 请求写工具、Browser side effect 或越界 path 时 fail-closed。
- 测试 parent/child lineage、nested depth limit、budget exhausted、publication failure、parent crash、cascade abort 和 child browse/export。

## 5. 允许修改

- `packages/agent-runtime/src/agent/subagent/**`
- P09 core tool plugin 中 Agent / Explore definition registration seam
- P10 Agent Registry 的 child factory port
- `packages/shared/src/runtime-v2/agent.ts` 的 child projection DTO
- tests、exec-run、design/history

禁止实现后台任务、continuation、child public Inbox、Agent Team/Room、修改普通 tool executor 或 Host。

## 6. 失败与回滚

- parent-child link 无法幂等恢复时停止 P12，不通过在 parent 里复制完整 child Journal 规避。
- child 取消无法静止时 Runtime shutdown 视为失败并列出 blocker。
- 回滚移除 Subagent plugin；main Agent P10 仍可独立运行，但整体 v2 不可切换。

## 7. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/agent/subagent
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime build
pnpm check:docs
pnpm check:secrets
git diff --check
```

## 8. 完成标准

- Agent 与 Explore 确实共用同一 Subagent provider，只有 descriptor 不同。
- child Session、lineage、tool restriction、cancel、terminal result 和 parent link 均有 crash/幂等证据。
- package public API 中不存在 background / continuation 能力。
