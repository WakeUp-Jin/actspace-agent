# ActSpace P0：Agent Scope 模型重构 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-agent-scope-model/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29 00:00
- **结束时间**：2026-08-29 17:21

## 执行时间线

### 步骤 1：开始 P00 Scope Contract 与基础原语

- **操作**：确认 Scope package 当前实现、测试和 DSH 参考边界；创建本执行记录。
- **影响文件**：`packages/core/scope/src/**`、`docs/exec-runs/20260829-actspace-agent-scope-model/*`（计划中的后续步骤将继续补充）。
- **决定**：先只实现 P00，不接入 Agent Loop、Cordis 事件 ABI 或工具执行逻辑。
- **验证**：待 P00 实现后执行 package typecheck、test、docs check 和 diff check。

### 步骤 2：实现 P00 Scope 原语与契约测试

- **操作**：为 `AgentScope` 增加实例级 opaque `ScopeKey`、cycle-checked parent relation、共享 registry layers、祖先可见性和显式 registration disposer；为 `ScopeDisposer` 增加 active/quiescing/disposed 状态与并发 dispose promise；新增 identity、rebind、shadow、cleanup 和 disposer race 测试。
- **影响文件**：`packages/core/scope/src/scope.ts`、`packages/core/scope/src/layered-registry.ts`、`packages/core/scope/src/disposer.ts`、`packages/core/scope/src/test/scope.test.ts`、`packages/core/scope/src/test/disposer.test.ts`。
- **决定**：Registry 的 parent 关系改为共享 opaque key 的 WeakMap 层，而不是每个 AgentScope 拥有嵌套 registry 实例；这样 rebind、ancestor traversal 和独立 view 使用同一份关系。
- **验证**：`pnpm --filter @actspace/core-scope typecheck` 通过；`pnpm --filter @actspace/core-scope test` 通过，3 个测试文件、18 个测试全部通过。

### 步骤 3：P01/P02 Agent carrier 与生产接线

- **操作**：将 `Agent subject + Scope carrier` fused dispatcher 接入 `AgentLoop` 和 `AgentLoopService` 生命周期通知；为 main Agent 与 one-shot child Agent 生成实例级 subject；普通 child 继续通过 `parentScope.child()` 自动继承父 Scope，并增加显式 `isolatedChild()` flat scope 入口。
- **影响文件**：`packages/core/scope/src/scope.ts`、`packages/core/agent/src/dispatch.ts`、`packages/core/agent/src/test/dispatch.test.ts`、`packages/core/agent-loop/src/service.ts`、`packages/runtime/src/runtime/run-controller.ts`、`packages/runtime/src/runtime/boot.ts`、`packages/runtime/src/runtime/agent-factory-plugin.ts`、`packages/subagent/src/provider.ts`。
- **决定**：生命周期通知不再以 `{ agentId }` carrier 作为 live routing identity，而是复用 assembly 的 subject 与 opaque scope carrier；descriptor/preset id 仅保留在 subject/诊断字段中。`scopeOf()` 使用模块私有 tag，避免把可伪造的字符串字段当作 live scope。
- **验证**：Scope 18、Agent 11、Agent Loop 4、Subagent 6 项测试通过；Scope、Agent、Agent Loop、Subagent、Runtime typecheck/build 通过。

### 步骤 4：修复并验证预存测试阻断

- **操作**：发现 `packages/subagent/src/test/provider.test.ts` 中 one-shot factory fixture 存在预存括号语法错误，导致 Vitest 无法 transform；修正为等价的合法 fixture 表达式。
- **决定**：该修正仅恢复测试文件语法，不改变生产行为或工具执行实现。
- **验证**：`pnpm --filter @actspace/subagent test` 通过（2 个测试文件、6 项测试）。

### 步骤 5：依赖包回归

- **操作**：检查 P00/P01/P02 对 Prompt、Subagent、Agent Loop 和 Runtime 类型/测试的影响，并确认并行 Service/Event ABI 改动仍只通过 Scope public exports 消费。
- **影响文件**：本步骤无额外生产文件。
- **验证**：Scope、Agent、Agent Loop、Subagent、Runtime typecheck/build 通过；Scope 18、Agent 11、Agent Loop 4、Subagent 6 项测试通过。

## 遇到的问题

- 初次运行 Subagent 测试被 provider fixture 的括号语法错误阻断；已在测试范围内修复并重新通过。
- `scopeTarget()` 的 context tag 不能依赖公开 `scopeKey` 字段，否则普通对象即可伪造路由；已改为模块私有 symbol tag，并增加 `scopeOf()` 读取入口。

## 跳过或推迟的事项

- P01/P02 的事件 ABI 字段重写、工具执行本体和 Session schema 均未触碰，继续由对应专项计划负责。
