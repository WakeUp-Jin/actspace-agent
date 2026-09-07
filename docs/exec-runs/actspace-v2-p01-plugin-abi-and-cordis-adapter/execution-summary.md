# P01 执行摘要

状态：已完成（2026-08-25）

## 交付

- `@actspace/cordis-adapter`：Manifest/Identity、Codec Discovery、Behavior Loader、Source Loader、Cordis admission 与真实/可控 lifecycle seam。
- `@actspace/composition`：Bundle/Profile/Patch composer、required/optional patch admission、frontend ceiling 与 config dump。
- `@actspace/boot`：Trusted Boot、Loader settlement、Startup Validation、RuntimeHandle 发布前检查和 candidate dispose。
- `@actspace/diagnostics`：结构化 BootDiagnostic，默认对 token / key / secret / authorization 字段脱敏。
- 所有候选领域包均已使用独立 `package.json`、Static Manifest、Behavior Entry、package exports 和 lifecycle test skeleton。

## 验收结果

- fake Cordis lifecycle：通过；timer 与 async disposer cleanup：通过。
- real Cordis public API gate（`ACTSPACE_REAL_CORDIS=1`）：通过。
- composition、boot、root typecheck、package boundary、docs/repo、diff check：通过。
- packaged ESM smoke import：通过（从 workspace package `dist` 入口加载）。
- 所有可装载 workspace plugin package 均有直接 Behavior `activate()` / `dispose()` contract；最终 boundary verifier 会拒绝缺少 manifest、plugin、lifecycle test 或 codec/export 不一致的 package，负向 fixture 已验证 fail-closed。

## 后续消费者

P02 可以直接依赖 `@actspace/cordis-adapter`、`@actspace/composition`、`@actspace/boot` 和 `@actspace/diagnostics`，无需继续向 `@actspace/agent-runtime/src` 添加新的插件目录。
