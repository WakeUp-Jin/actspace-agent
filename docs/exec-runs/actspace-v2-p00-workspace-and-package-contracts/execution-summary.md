# ActSpace v2 P00：Workspace 与包契约地基 — 执行摘要

状态：完成。

P00 已建立 DSH 风格多包结构的 workspace 地基：两级 leaf package discovery、NodeNext/strict/ESM 公共配置、package/plugin/Entry ledger、独立 package manifests/exports、静态 manifest/behavior/codec 入口，以及 package graph/deep-import/cycle verifier。

旧 `packages/agent-runtime` 仍按计划保留到 P05，P00 没有迁移业务实现、删除旧数据、修改 Browser Bridge 或改变 renderer。

验证通过：frozen install、workspace typecheck、root tests、package boundary、docs、repo hygiene 和 `git diff --check`。

2026-08-26 完成应用边界收口：Desktop、CLI、Site 迁入 `apps/`，package identity 与产品行为保持不变；`packages/` 只保留可复用 Runtime、领域能力、Plugin ABI package 和共享契约。workspace、lockfile、构建/打包脚本、CI 和 boundary verifier 已同步，且离线 frozen install、全量 typecheck/test/build、Site、CLI package/process、Browser/Go 验证通过。

最终完成审计补齐真实插件包结构门禁：`check:packages` 会强制所有 `./plugin` package 同时拥有 `src/manifest.ts`、`src/plugin.ts`、对应 exports 和 lifecycle contract；codec 文件与 export 必须成对存在。负向测试证明缺少生命周期测试时检查器会失败。
