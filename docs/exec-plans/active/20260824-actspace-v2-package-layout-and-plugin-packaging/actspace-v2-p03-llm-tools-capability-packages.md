# P03：LLM、Tools 与具体能力插件包化

状态：已完成（2026-08-25）。

父计划：[ActSpace v2 包拆分与真实插件包化](./README.md)

依赖：[P01](./actspace-v2-p01-plugin-abi-and-cordis-adapter.md)、[P02](./actspace-v2-p02-core-session-context-packages.md)

## 目标

把 LLM Service、pi-ai Adapter、Tool Runtime 和现有具体工具 executor 拆成真正独立的领域插件包。上层只依赖 ActSpace 自有 LLM/Tool ABI；pi-ai 类型和工具实现细节不能泄漏到 Host、Session 或固定 renderer。

## 范围

包含：

- `packages/llm/service/`、`packages/llm/pi-ai/`、条件需要时的 `packages/llm/legacy-transport/`；
- `packages/tools/runtime/`、`packages/tools/approval/`、`packages/tools/core-tools/`、`packages/tools/browser-tools/`；
- LLM/Tool package manifest、codec（如有 durable event）、behavior entry、exports 和 lifecycle tests；
- `PreparedLlmCall`、Adapter registration lease、proxy/credential/error/usage/retry 边界；
- Tool definition、prepared execution、approval、checkpoint、bounded parallelism、ordered commit 和 generic result projection；
- 现有文件、搜索、Shell、图片和 Browser 工具行为迁移；
- Browser Tools Adapter 到 Host capability 的协议契约。

不包含：

- Agent Loop、Subagent、Desktop/CLI Host；
- 前端 renderer component 或后端插件携带的前端代码；
- 新工具能力或更改现有工具产品语义；
- 通过私有 pi-ai API 注入 proxy。

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-llm-adapter.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-agent-core.md`
- `docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p02-pi-ai-admission.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-09-built-in-tools-and-browser.md`

## 允许修改

- `packages/llm/`
- `packages/tools/`
- `packages/shared/src/runtime-v2/` 中与 LLM/Tool Projection 直接相关的 DTO
- 现有工具 executor 的迁移适配和 parity fixtures
- pi-ai/Cordis package manifest 与 lockfile（遵守已批准 exact versions）

禁止修改：

- `apps/desktop/src/renderer/`；
- `packages/core/agent-loop/`、`packages/subagent/`；
- Browser Bridge Go/Extension 源码；
- Session Journal schema。

## 任务

1. 将当前 `src/llm/` 拆为 LLM Service、pi-ai Adapter 和必要的 fallback transport；所有上层使用 ActSpace `Message`、`Stream`、`Failure`、`Usage` 和 `PreparedLlmCall`。
2. 为 LLM Adapter package 增加 manifest、route registration、registration-bound lease 和一次调用只使用一代 Adapter 的测试。
3. 复现三条 provider route、reasoning/tool/image/abort/replay、usage/cost、结构化错误、关闭 SDK retry、scoped proxy 和 secret redaction 门禁。
4. 将当前 `src/tools/` 拆为 Tool Runtime 与具体能力包；具体 executor 不能反向写 SessionEvent、renderer DTO 或旧 ToolManager registry。
5. 实现 tool prepared execution：definition/policy/middleware/executor 在审批前锁定，checkpoint 在 body 副作用前 fail-closed，结果按模型调用顺序提交。
6. 将核心工具迁移到 `tools/core-tools`，Browser 工具迁移到 `tools/browser-tools`，每个具体工具都拥有稳定 contribution id、manifest 和 parity test。
7. 将 Browser Tools Adapter 的 Host capability 要求写入 manifest；缺少 Browser Bridge 时 required/optional 行为按 ABI 处理，不静默假装成功。
8. 为卸载、取消、outcome-unknown、approval timeout、proxy error、credential missing 和 executor failure 增加 lifecycle/error fixtures。

## 验证

```bash
pnpm --filter @actspace/llm-* test
pnpm --filter @actspace/tools-* test
pnpm check:browser
pnpm typecheck
pnpm test
pnpm check:secrets
git diff --check
```

必须通过：LLM 三 route 与 failure matrix、pi-ai package gate、每个保留工具的 v1 parity、approval/checkpoint 顺序、有界并行、有序 commit、generic projection、Browser protocol static/Go tests。

## 失败与回退

- pi-ai scoped proxy 公开注入面缺失：保留 ActSpace legacy transport 作为明确双 backend；若基础 route 或错误语义只能依赖私有 API，停止并重开 ADR。
- 工具 executor parity 失败：保留旧 executor 行为作为 fixture 对照，不把失败工具标记为迁移完成，也不通过 renderer 特判修复。
- Browser Bridge 协议失败：只禁用 Browser Tools Entry，不能让 Tool Runtime 直接绕过 Host capability。
- Tool body 在 checkpoint 失败后仍执行：视为安全门禁失败，阻止 P04。

## 完成标准

- LLM Service、pi-ai Adapter、Tool Runtime、Core Tools、Browser Tools 均能以独立 package Entry 激活和 dispose；
- pi-ai 类型不会出现在 Host、Session 或 Projection 公共 exports；
- 现有保留工具行为 parity 通过；
- Browser Tools 缺少 Host capability 时结构化失败；
- P04 可以只消费 package exports，不再读取 `agent-runtime/src/llm` 或 `src/plugins`。

## 依赖与消费者

- 依赖：P01、P02。
- 消费者：P04、P05。

## 执行记录

执行记录：`docs/exec-runs/actspace-v2-p03-llm-tools-capability-packages/`。
