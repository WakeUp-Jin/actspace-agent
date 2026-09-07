# P12：Base Profile、RuntimeHandle 与完整候选 Runtime

状态：执行中（候选 RuntimeHandle、外部插件 source 与行为测试已完成；P01/P03 前置和 package pack 门禁待恢复）

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P03-P11

消费方：P13-P15

Exec-run slug：`actspace-v2-plan-12-base-profile-and-runtime-handle`

## 1. 目标

把 P03-P11 的领域能力组装成完整 Base Profile，并发布唯一的进程级 `RuntimeHandle`。候选 Runtime 可以创建/恢复 main Session、运行 Turn、提交 Inbox、abort、inspect/export、flush、报告 restartRequired，并按明确顺序 quiesce / dispose；Desktop/CLI 不需要也不能直接接触 Cordis root、Session writer、AgentLoop 或 ToolRuntime。

## 2. 必读与基线

- [Runtime 与 Composition 目标设计](../../../design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md)
- [插件 Runtime ABI](../../../design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md)
- [v2 总体架构](../../../design-docs/agent-plugin-runtime/agent-target-overall-architecture.md)
- `packages/agent-core/src/runtime/`
- `apps/desktop/src/main/desktop-agent-runtime.ts`
- `apps/cli/src/runtime-adapter.ts`

## 3. 文件与公共 API

```text
packages/agent-runtime/src/
├── profiles/
│   ├── kernel.bundle.ts
│   ├── base.bundle.ts
│   ├── desktop.bundle.ts
│   ├── cli-run.bundle.ts
│   ├── cli-chat.bundle.ts
│   └── composition.ts
├── runtime/
│   ├── runtime-handle.ts
│   ├── runtime-state.ts
│   ├── session-controller.ts
│   ├── run-controller.ts
│   ├── restart-controller.ts
│   ├── shutdown.ts
│   └── errors.ts
├── index.ts
├── loader.cjs
└── loader.d.cts
```

`RuntimeHandle` 固定提供：

- `getBootManifest()`、`getDiagnostics()`、`getState()`；
- `listSessions()`、`inspectSession()`、`exportSession()`；
- `createMainSession()`、`resumeMainSession()`、`forkMainSession()`；
- `runTurn()`、`enqueueMainMessage()`、`cancelPendingMessage()`、`abortRun()`；
- `flushSession()`、`requestRestart()`、`stopAcceptingWork()`、`dispose()`。

child Session 只通过 inspect / browse / export 暴露，不进入 public resume / run API。方法的输入输出使用 P00 / P07 namespaced DTO，不暴露实现 class。

## 4. Base Profile required capabilities

Startup Validation 必须确认这些服务 active：Session / Codec / Persistence、Scope、Prompt / Request Assembly、Tool Runtime、LLM Registry、main Agent Registry、default Agent Loop、Inbox、Todo、Skills、Compaction、core tools、Agent / Explore Subagent，以及对应 Host surface required ports。

Browser plugin 对无 Browser capability 的 Host 可以 optional skip；Desktop 默认 Profile 要求 Browser capability 时缺失即 Boot 失败。任何 required service PENDING / FAILED / fiberless 都不能发布 RuntimeHandle。

## 5. 任务

### 12.1 Profile / Bundle 组装

- kernel bundle 只装 lifecycle / codec / boot 原语；base bundle 装 Agent required capabilities；Host bundle 只声明 Host ports 和 surface policy。
- default Profile 的 Entry id、config、inject 和 source provenance 固定为 fixtures，并生成 BootManifest digest。
- config dump、真实 boot 与 restart candidate 共享 P03 composer；不能各自拼配置。

### 12.2 RuntimeHandle 状态机

- 状态固定为 booting -> ready -> quiescing -> disposed；boot failure 直接 disposed 并返回 structured diagnostics。
- 同一 Host 进程只能存在一个 ready handle；第二次 boot 返回 typed conflict。
- persistent Session 只能位于 `sessions-v2/` 且持有 writer lease；ephemeral Session 不创建伪 Journal，也不能 resume/fork。
- `runTurn()` 返回 P07 snapshot/cursor stream，Host 不直接订阅 Cordis event emitter。

### 12.3 Restart-only

- 配置/插件变化只设置 `restartRequired`、reason、changed sources 和 candidate digest；当前 BootManifest、Fiber 和 contribution 保持不变。
- `requestRestart()` 只请求 Host 做完整 handle replacement；Runtime 内不做在线 reconcile 或 HMR。
- active Turn 时重启先 stop admission、quiesce、flush/dispose，再由 Host boot 新 handle。

### 12.4 Shutdown 顺序

- stop accepting new work；
- cancel pending approval / new prepare；
- 协作完成或取消 active LLM、tool、Subagent 和 main turn；
- flush persistent Sessions；
- dispose Agent scopes、plugin Effects、timer/watcher/subprocess/socket；
- dispose Cordis root；
- 输出剩余 blocker 和 final diagnostics。

graceful deadline 固定 30 秒；到期后再次发出 cooperative cancel 并等待 5 秒。仍未静止时 `dispose()` 返回 `RuntimeShutdownFailure`，Host 决定退出码或强制退出，Runtime 不调用 `process.exit()`。

### 12.5 CJS loader 与 package exports

- `@actspace/agent-runtime` 主 export 为 ESM；`./loader` 是唯一 CJS subpath，用原生 `import()` 返回 module namespace。
- Node/CLI/Electron tests 从安装后的 production package 加载，不从 `src/` 或 workspace alias 偶然成功。
- package export 测试拒绝所有未声明 subpath 和 Cordis deep import。

### 12.6 完整候选测试

- 用 fake Host ports boot default + CLI surface profile，运行 text、tool、Inbox、Todo、Agent、Explore、Compaction、resume、fork、restartRequired 和 shutdown。
- 故障注入 required service missing、Fiber PENDING/FAILED、writer conflict、LLM/tool lease hang、checkpoint fail 和 disposer timeout。

## 6. 允许修改

- `packages/agent-runtime/src/{profiles,runtime}/**`
- `packages/agent-runtime/{package.json,tsconfig.json}`、public exports 和 loader files
- P03-P11 的 Composition registration glue
- `packages/shared/src/runtime-v2/runtime.ts`
- tests、exec-run、design/history

禁止修改 Desktop、CLI、旧 `agent-core`、正式默认 Runtime、Kairos/fs-watch 或 root release scripts。

## 7. 失败与回滚

- required capability 无法 active 或资源无法静止时不发布 handle。
- deadline 不得通过静默丢弃 blocker 假装成功。
- 回滚移除 P12 integration；P03-P11 领域模块仍可单测，v1 仍为默认。

## 8. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/runtime src/profiles
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime build
pnpm --filter @actspace/agent-runtime pack --pack-destination artifacts/runtime-v2
pnpm check:docs
pnpm check:secrets
git diff --check
```

## 9. 完成标准

- fake Host 只持有 RuntimeHandle 也能覆盖完整候选语义。
- Boot、restart-only、shutdown、package loading 与 diagnostics 均有失败路径测试。
- P13/P14 不需要导入任何 Runtime 内部目录。
