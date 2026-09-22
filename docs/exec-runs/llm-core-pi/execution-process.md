# LLM Core Pi 执行过程

## 2026-09-22

- 执行入口：`docs/exec-plans/active/20260922-llm-core-pi.md`。
- 执行模式：交互模式。
- 运行时代码与执行文档按已确认 M0–M4 方案修改；保留既有 dirty worktree 和兼容 backend。
- M0 开始：核对依赖、Provider public boundary、Desktop/CLI 构造点和 Agent Loop retry 调用。
- M0：安装 lockfile 依赖并构建 Runtime dependency closure；确认 `@earendil-works/pi-ai@0.82.1`、Node `>=22.19.0`、core/providers/api exports。基线在 dist 缺失时先失败，闭包构建后 service 19/19、pi-ai 40/40、Agent Loop 16/16 通过。
- M1：增加 `LlmAdapter.prepare` / `LlmPreparedAdapterCall`，在第一次 await 前取得 lease，允许已有 retry scope 从 draining registration 派生 attempt；Agent Loop 传递 prepared adapter call。
- M2：Desktop/CLI 改为 Host prepare 绑定模型事实、reasoning model、endpoint/proxy/pricing；生产构造使用 `PiAiAdapter({ wire, legacyProxy })`。增加版本化 replay envelope。
- M3：增加 direct backend、Adapter backend policy、cancel/dispose seam 和 policy/replay fixtures。相关 LLM、CLI、Desktop targeted tests 通过。
- 后续清理：删除公开 `PiAiWireEngine`/`PiAiEngine` 间接层，direct protocol 实现收进 `pi-ai-stream.ts`，Runtime/plugin 只保留 `PiAiAdapter`；service 增加 nested detached capture 与 async prepare/draining lease 回归。

### 当前门禁

- `pnpm install --frozen-lockfile`：通过，747 packages。
- M0 契约和 public API 测试：通过，依赖闭包后 package tests/typechecks 通过。
- M1–M3 受影响测试：service 21 tests、pi-ai 42 tests、Agent Loop 16 tests、CLI 13 tests、Desktop targeted 18 tests 通过。
- M4：全 workspace typecheck/build 通过；CLI process 2/2、managed package smoke 通过；pi-ai 43、service 23、Agent Loop 16、CLI 13、Desktop LLM targeted 18 通过。
- `pnpm test` / `pnpm check:packages` 保留 3 个既有 Desktop 深层 source import 失败；递归测试保留 2 个既有 renderer 失败；`check:package-cutover -- --strict` 保留 2 个 site 生成 `/eval` 残留。均未触及本次 LLM 文件。
- `check:docs`、`check:secrets`、`check:current-docs`、`check:v2-legacy-removal -- --strict`、`git diff --check` 通过。
- 真实 Provider、packaged Electron：未开始，已在执行摘要列为外部验收边界。
