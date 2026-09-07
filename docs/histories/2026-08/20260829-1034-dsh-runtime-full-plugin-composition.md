# DSH Runtime 全量插件组装

## 用户诉求

将 ActSpace 从“Host/Runtime 手工创建领域实例、Cordis 局部接管”的桥接态，迁移为 DSH 风格：固定 Bootstrap 启动由 `cordis.yml`、Include、Loader 和 `apply(ctx, config)` 组成的 Runtime 插件树。

## 当前进度

本轮已完成执行计划 Phase 1–6 的代码迁移与自动化验证：

- 建立 CLI/Desktop 共用的 Host service contract；
- 将 Host capability 在 Loader tree 挂载前注入 Context；
- RuntimeHandle 改为通过 Context-backed facade 解析领域服务；
- Loader settlement 后验证 required services，失败不发布 RuntimeHandle并释放 partial tree；
- 保持现有 Session、LLM、Tool、AgentLoop 行为不变，为后续 ownership 迁移提供兼容地基。
- 增加 Runtime-owned `cordis.yml` 和 `runtimeCordisConfigPath()`，作为默认 DSH 组合真源；
- 将 Session Runtime、LLM、Tool Runtime、Prompt、Context、Compaction、Core Tools 和 Browser Tools 的实例创建与清理迁入 Behavior；
- CLI/Desktop Host 改为提供 LLM route/credential、工具端口、Prompt source、Browser 和审批/制品 capability，不再直接 new 基础 Runtime 实例或注册工具；
- Agent Registry、主 Agent、AgentLoop Service、RunController、Todo/Subagent registration 现在由 Cordis Behaviors 创建；Boot 只注入 Host agent port。
- 新增 `@actspace/headless` 和 `headless.runner` Behavior，CLI 单次 run 改为 `boot → runner → followup → durable inbox → flush → output`。
- Desktop 默认不读取 `runtime-v2/plugins.json`；旧配置只有显式 `legacyPluginsConfigPath` 才会加载。
- `bootRuntime` 要求显式 `cordis.configPath`；旧构造器仅在明确 `legacy: true` 且传入旧实例时可用。

## 关键文件

- `packages/runtime/src/runtime/host-services.ts`
- `packages/runtime/src/runtime/runtime-facade.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/boot/src/dsh-boot.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- `packages/runtime/cordis.yml`
- `packages/runtime/src/runtime/session-plugin.ts`
- `packages/runtime/src/config-path.ts`

## 验证

- Boot 7 tests；
- Runtime 3 tests；
- CLI 14 tests；
- Runtime、CLI、Desktop typecheck；
- CLI 依赖闭包 build；
- 真实 CLI mock process smoke 通过，Journal 证据包含 title、inbox enqueue/claim、turn/step、request、assistant 和 `session/end-seed`。
- `pnpm -r typecheck`、`pnpm -r test`、`check:docs`、`check:current-docs`、`check:packages`、`check:v2-legacy-removal --strict`、`check:secrets`、`git diff --check` 通过。
- `pnpm -r typecheck`；
- `pnpm -r test`（Desktop 522、CLI 14，以及各 Runtime package tests）；
- persistent Journal 进程 smoke：确认 inbox durable-first、核心 Session 事件和 `session/end-seed`。

计划标记为自动化实施完成，但暂留 `active/` 等待真实 Desktop/Electron/Chrome/Provider/签名宿主门禁；通过后再归档。
