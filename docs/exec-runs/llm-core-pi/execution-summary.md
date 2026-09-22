# LLM Core Pi 执行摘要

状态：M0–M4 实施完成；旧 Engine 公开层已清理，自动化结果、既有基线失败和外部验收边界已记录。

自动化通过不会被表述为真实 Provider 或打包运行时验收通过。

## 已完成自动化切片

- `@actspace/llm-service`：23 tests；typecheck/build 通过，包含 nested detached capture 与 async prepare/draining lease 回归。
- `@actspace/llm-pi-ai`：43 tests；typecheck/build 通过，包含 replay identity mismatch 回归。
- `@actspace/core-agent-loop`：16 tests；typecheck 通过。
- CLI：13 tests；typecheck 通过。
- Desktop LLM Host targeted tests：18 tests；Electron main typecheck 通过。
- `pnpm typecheck`：全 workspace 通过，site 0 errors。
- `pnpm build`：CLI 与 Desktop renderer/electron build 通过。
- `pnpm test:agent-cli:process`：2/2 通过；`pnpm test:agent-cli:package`：managed package smoke 通过。
- `pnpm check:docs`、`pnpm check:secrets`、`pnpm check:current-docs`、`pnpm check:v2-legacy-removal -- --strict`、`git diff --check`：通过。
- `rg` 源码扫描：`PiAiWireEngine`、`PiAiEngine`、`PiAiWireEngineOptions` 和 `legacyProxyEngine` 在 `apps/`、`packages/` 生产/测试源码中无残留；Runtime/plugin 只导出 `PiAiAdapter`。

## 已知基线失败

- `pnpm test` 与 `pnpm check:packages` 被 3 个既有 Desktop 深层 source import 阻断：`runtime-v2-output-reference-flow.test.ts`、`runtime-v2-tool-stream.test.ts`、`app-streaming-user-message.test.tsx`。
- `pnpm -r --if-present test` 的 Desktop 全量结果为 106 passed / 1 failed files，756 passed / 2 failed tests，失败位于 `app-streaming-user-message.test.tsx` 的既有 renderer 场景；受影响 LLM package 与 Host targeted tests 仍通过。
- `pnpm check:package-cutover -- --strict` 发现 2 个既有 site 生成文件的 `/eval` 残留：`apps/site/.astro/content-assets.mjs`、`apps/site/blog-migration.json`。

## 当前人工门禁

- DeepSeek、Kimi、OpenRouter 直连和 OpenRouter HTTP proxy：未验证。
- 多轮工具、reasoning replay、图片/文件上传、usage/cost、abort：未验证。
- packaged Electron 的加载、reload/quit、drain 和资源回收：未验证。

以上人工门禁需要真实凭据、外部网络或 packaged Electron 环境，当前轮未伪造为通过；后续验证应按设计文档 §14 的矩阵执行，并将结果追加到本摘要。
