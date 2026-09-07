# ActSpace DSH 风格 Runtime 全量插件组装 — 执行摘要

## 执行状态警告

> Phase 1–6 的代码迁移和自动化验证已完成；计划已归档。真实 Desktop/Electron/Chrome/发行宿主门禁仍需在对应宿主环境执行。

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-dsh-runtime-full-plugin-composition/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-dsh-runtime-full-plugin-composition/execution-process.md`
- **执行模式**：交互
- **执行结果**：自动化实施完成（Phase 1–6 完成；宿主人工门禁待执行）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Host service contract | `packages/runtime/src/runtime/host-services.ts`、CLI/Desktop Host Adapter | 在 Include 前注入一致且不可变的 Host facts，不混入领域 Runtime 实例 |
| Context-backed Runtime facade | `packages/runtime/src/runtime/runtime-facade.ts`、`runtime-handle.ts` | RuntimeHandle 通过 facade 查找服务，为后续插件 ownership 迁移建立稳定 Host API |
| Loader required service validation | `packages/boot/src/dsh-boot.ts` | settlement 后、发布前验证 required services，失败时释放 partial tree |
| Phase 1 lifecycle tests | Boot/Runtime tests | 覆盖 Host preparation、Context lookup、fallback、required service、失败清理和幂等 dispose 基础 |
| Phase 2 plugin-owned services | Runtime、LLM、Tools、Prompt、Context、Compaction、Session Journal | `cordis.yml` 真实组装基础领域实例；Host 仅提供外部端口和 capability |
| Phase 3 Agent ownership | Runtime Agent Behaviors | Registry、AgentLoop Service、RunController、Todo/Subagent registration 由 Context tree 创建 |
| Phase 4 Headless runner | `packages/headless`、CLI run adapter | 单次 run 由 `headless.runner` 驱动，CLI 不再直接调用 `handle.runTurn()` |
| Phase 5/6 收口 | Desktop adapter、Runtime boot | 默认不读取 `plugins.json`；无 Cordis config 不再隐式 fallback |

## 人工验证指引

### 必须验证

1. **CLI mock 单次任务仍可运行**
   - 验证方式：`node apps/cli/dist/cli.js run --input "phase one smoke" --workspace . --mock --json`
   - 预期结果：JSON 中 `ok` 为 `true`、`status` 为 `completed`，并包含 Session snapshot。

2. **确认阶段边界**
   - 验证方式：检查 `packages/runtime/src/runtime/boot.ts`。
   - 预期结果：Session、LLM、Tools、Agent、Subagent、Headless 均由 DSH plugin tree 提供。

3. **确认 Runtime-owned config tree**
   - 验证方式：检查 `packages/runtime/cordis.yml` 和 `packages/runtime/src/runtime/boot.ts`。
   - 预期结果：默认 DSH 路径使用 `runtimeCordisConfigPath()`，CLI run 通过 headless runner service 驱动。

### 建议验证

1. **真实 Desktop Host 启动**
   - 验证方式：在可运行 Electron 的环境启动 Desktop，创建 Session、执行一轮 mock/真实模型请求并退出。
   - 预期结果：Runtime ready、Session 可写、退出时 flush；本轮自动化没有替代真实 Electron 验收。

## Agent 已完成的验证

- `pnpm --filter @actspace/boot test`：7 tests 通过。
- `pnpm --filter @actspace/runtime test`：3 tests 通过。
- `pnpm --filter @actspace/agent-cli test`：14 tests 通过。
- Runtime、CLI、Desktop typecheck 通过。
- CLI 完整依赖闭包 build 通过。
- 真实 CLI 进程 mock smoke 通过。
- Phase 3–6 Agent/Headless/Desktop/legacy 自动化收口门禁通过。

## 已知风险和遗留事项

- `RuntimeV2BootManifest` 仍是面向 Host/UI 的 provenance projection，由现有 composition metadata 生成；实际激活和服务所有权以 `packages/runtime/cordis.yml` 的 settled Cordis Context 为准。后续如需展示逐项 Loader entry，可再增加只读的 tree inspection projection，但不能让它成为第二份激活真源。
- RuntimeServiceFacade 仍保留兼容 fallback 类型，以支持显式 legacy/test seam；默认 DSH path 已由 Context services 提供。
- RuntimeHandle 仍保留 `runTurn()` 作为 Desktop/chat facade API；默认 CLI 单次 run 使用 `runHeadless()`。
- 真实 Electron/Chrome、Provider、签名/公证和 clean-checkout 门禁仍待宿主环境验收。

## 后续建议

- 下一步执行真实 Desktop/Electron/Chrome/Provider/发行门禁；这些门禁不由本轮自动化替代。
