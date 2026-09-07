# P01：Plugin ABI 与 Cordis 包适配

状态：已完成（2026-08-25）。

父计划：[ActSpace v2 包拆分与真实插件包化](./README.md)

依赖：[P00 Workspace 与包契约地基](./actspace-v2-p00-workspace-and-package-contracts.md)

## 目标

把当前 Runtime 内部的 plugin、manifest、codec discovery、source loader、composition 和 boot 逻辑重组为真正的包级 Plugin ABI。每个候选包在行为代码 import 前都能被静态读取、验证和诊断；Behavior Entry 只在 Cordis activation Effect 中注册贡献，dispose 后进入 quiescence。

## 范围

包含：

- `packages/cordis-adapter/`：唯一的裸 Cordis 边界；
- `packages/composition/`：Profile / Bundle / Patch 到 Loader Entry 的适配；
- `packages/boot/`：Trusted Boot、Startup Validation、RuntimeHandle 发布前检查；
- `packages/diagnostics/`：manifest、Entry、Fiber、lease、frontend ignored 和失败诊断；
- Static Manifest、Codec Entry、Behavior Entry 的 package exports 与 contract tests；
- DSH Cordis family 的 exact pin、Loader/Include/Group/Timer public API 使用和 lifecycle tests；
- restart-only 语义和 fixed frontend `frontend.required` admission。

不包含：

- Agent、Session、LLM、Tools 具体语义实现；
- HMR、在线 reconcile、零停机替换；
- DSH `dsh-app-boot` 或 DSH Agent Core 包；
- 前端插件代码。

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p01-cordis-admission.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p03-trusted-boot-and-composition.md`

## 允许修改

- `packages/cordis-adapter/`
- `packages/composition/`
- `packages/boot/`
- `packages/diagnostics/`
- DSH Cordis family 的根依赖与 lockfile（只使用已批准 exact versions）
- Plugin ABI contract tests、fixtures 和 package exports

禁止修改：

- Session Journal schema 和 `packages/session/` 业务实现；
- LLM provider implementation；
- `apps/desktop/src/renderer/`；
- `browser-bridge/` 实现。

## 任务

1. 将当前 `src/plugin/{manifest,identity,codec-discovery,behavior-loader,source-loader}` 的职责拆入 `cordis-adapter`、`composition` 和 `boot`，删除对 monolith 内部相对路径的依赖。
2. 固定包级 Plugin Entry 形态：Static Manifest 不 import Behavior；Codec Entry 纯函数；Behavior Entry 只在 activation Effect 中注册贡献。
3. 实现 manifest、runtimeContract、Host ceiling、frontend requirement、Entry identity 和 contribution identity 的 fail-closed admission。
4. 将 Loader settlement 与 Startup Validation 接成唯一 Boot 流程：fiberless、FAILED、PENDING 和其他非 ACTIVE required Entry 均阻止发布 RuntimeHandle。
5. 用相同 composer 服务 boot、config dump、diagnostics 和 restart candidate；明确 optional patch miss 与 required patch miss 的诊断区别。
6. 增加每包 activation/dispose 测试：timer、watcher、subprocess、lease 和 registry contribution 均必须进入 Effect-owned disposer。
7. 增加 `frontend.required=true` 在固定 renderer 下拒绝激活、optional frontend contribution 忽略并告警的测试。

## 验证

```bash
pnpm install --frozen-lockfile
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/composition test
pnpm --filter @actspace/boot test
pnpm --filter @actspace/diagnostics test
pnpm check:docs
pnpm check:repo
git diff --check
```

必须追加已批准 Cordis admission 矩阵：fresh install、public exports/types、Loader/Include/Group/Timer、Effect cleanup、async disposer、packaged ESM load 和单实例依赖树。

## 失败与回退

- Cordis public API 或 Electron packaged gate 失败：停止 P02-P05，按 Cordis ADR 回退，不使用私有 deep import。
- Behavior import 在 manifest/codec 校验前发生：判定为 ABI 失败，禁止该包进入 Base Profile。
- dispose 后资源未静止：保留诊断并阻止 Startup Validation 通过，不通过强制 process exit 掩盖。
- Loader replacement 出现外部副作用不可回滚：保留 restart-only，不宣称零停机事务切换。

## 完成标准

- 至少一个最小示例包能独立完成 manifest → codec → behavior → dispose 全链路；
- Boot 不依赖 Agent Core 具体实现即可执行插件准入和 Startup Validation；
- 所有裸 Cordis 类型都被限制在允许的 adapter/boot/composition 边界；
- P02/P03 可以使用稳定的 plugin package contract，而不是继续向 monolith 添加目录。

## 依赖与消费者

- 依赖：P00。
- 消费者：P02、P03、P04、P05。

## 执行记录

执行记录：`docs/exec-runs/actspace-v2-p01-plugin-abi-and-cordis-adapter/`。
