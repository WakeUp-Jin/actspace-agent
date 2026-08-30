# ActSpace v2 P01：Cordis 发布族准入门禁

状态：执行中（DSH published-build API/lifecycle 已通过；fresh registry integrity 与 packaged gate 待恢复）

父计划：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/README.md`

依赖：P00 `actspace-v2-p00-contracts-and-esm-island`

消费者：P03 Trusted Boot 与 Composition；后续所有需要 Cordis Context、Service、Fiber、Effect、Loader、Include、Group 或 Timer 的 Runtime 工作包

exec-run slug：`actspace-v2-p01-cordis-admission`

## 目标

在 `@actspace/agent-runtime` ESM 隔离岛中验证并锁定 DSH 维护发布的五个 Cordis 包，证明它们可以在 Node 和 packaged Electron 生命周期中提供 ActSpace 所需的 Context、Service、Fiber、Effect、Loader settlement、Include patch、Group 组织和 Timer 清理语义。只有全部准入门禁通过，Cordis 依赖才可以进入 v2 实现基线。

## 范围

包含：

- 精确安装并锁定以下五个包及版本：
  - `@deepseek-ai/cordis@4.0.1`
  - `@deepseek-ai/cordis-plugin-loader@1.0.2`
  - `@deepseek-ai/cordis-plugin-include@1.0.6`
  - `@deepseek-ai/cordis-plugin-group@1.0.1`
  - `@deepseek-ai/cordis-plugin-timer@1.1.3`
- 通过公开 exports、types、peer ranges、lockfile integrity 和单 runtime family 检查。
- 在 Node 与 Electron 目标中验证激活、PENDING、FAILED、Effect cleanup、异步 disposer、Loader settlement、Include patch 和 restart-only candidate 行为。
- 形成可供 P03 消费的 `CordisAdmissionReport` 和稳定的 Cordis root 生命周期适配入口。
- 记录 HMR 未进入生产 Profile，且不引入 `@deepseek-ai/cordis-plugin-hmr`。

不包含：

- 不采用旧上游 `cordis`、`@cordisjs/plugin-*`、`@deepseek-ai/dsh-app-boot` 或 DSH Agent Core。
- 不自行 vendor、fork、deep import `src/*` 或长期 patch `node_modules`。
- 不实现 ActSpace Profile、Bundle、Patch、Plugin Manifest、Session、Agent、Tool、LLM 或完整 RuntimeHandle。
- 不启用 HMR、在线 reconcile、live reload 或双实例零中断切换。
- 不改变 Desktop、CLI、旧 Agent Core 或 v1 默认启动路径。

## 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/PLANS_GUIDE.md`
- `docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-decisions-v2-foundation.md`
- `tmp/deepseek-harness/docs/cordis-primer.md`
- `tmp/deepseek-harness/docs/cordis-tutorial/02-lifecycle-and-effects.md`
- `tmp/deepseek-harness/docs/cordis-tutorial/03-services.md`
- `tmp/deepseek-harness/docs/cordis-tutorial/06-composition-and-hmr.md`
- `packages/agent-runtime/package.json`（依赖字段由主集成者串行合并）
- `packages/agent-runtime/tsconfig.json`
- `packages/agent-runtime/src/index.ts`
- `packages/shared/src/runtime-v2/host-dto.ts`
- `pnpm-lock.yaml`（由主集成者串行合并 exact Cordis family）

## 当前基线

- P00 提供 `packages/agent-runtime`，但当前没有 Cordis 生产依赖或 Cordis 适配模块。
- 当前 `packages/agent-core`、Desktop Main 和 CLI 仍是 CommonJS；它们不能通过静态 import 吸收 Cordis 类型。
- DSH 快照把 Cordis 源码放在 `tmp/deepseek-harness/vendor/cordis`、`vendor/loader`、`vendor/include`、`vendor/group` 和 `vendor/timer`；该目录是研究证据，不是 ActSpace 生产依赖。
- 当前仓库没有 v2 Boot、Loader settlement 或 Startup Validation 实现。
- v2 Cordis 采用决策已经固定五个精确版本，但 registry fresh install、Node/Electron 和 packaged smoke 尚未证明。

## 输入契约

- 五个 package name 和版本必须与本计划完全一致，生产依赖使用 exact version，lockfile integrity 必须被提交。
- 一个进程只能存在这一组 Cordis runtime family，禁止 `@cordisjs/*`、旧 `cordis` 或第二套 Cordis Core 传递到生产依赖。
- Cordis 只拥有 Context、Service、Fiber、Effect、Event 和 Loader 生命周期；ActSpace 拥有 Profile、Plugin ABI、Session、Host ceiling 和 Startup Validation。
- Cordis isolate、Context 和 Fiber 不是 OS 安全沙箱；计划中的安全断言只能是 trusted same-process admission。
- 配置变化只产生 `restartRequired`，不向 v2 产品暴露 HMR 或在线 reconcile。

## 输出契约

实现文件：

- `packages/agent-runtime/package.json`：加入五个 exact dependencies 和 test script。
- `packages/agent-runtime/src/compatibility/cordis/admission.ts`：定义准入报告。
- `packages/agent-runtime/src/compatibility/cordis/root.ts`：创建、等待 settlement、关闭 root Context 的内部适配。
- `packages/agent-runtime/src/compatibility/cordis/types.ts`：定义不泄漏到 shared/Host 的 Cordis 内部类型别名。
- `packages/agent-runtime/src/compatibility/cordis/test/admission.test.ts`：exports、版本和单 runtime family 检查。
- `packages/agent-runtime/src/compatibility/cordis/test/lifecycle.test.ts`：Node 生命周期、Effect cleanup、PENDING/FAILED 和 disposer 检查。
- `packages/agent-runtime/src/compatibility/cordis/test/loader-include.test.ts`：Loader、Include、Group、Timer 和 restart-only 检查。
- `packages/agent-runtime/src/compatibility/cordis/test/fixtures/cordis-fixtures.ts`：只包含本地、无凭据、无网络副作用的插件 fixture。
- `pnpm-lock.yaml`：五个 exact package 的完整依赖和 integrity。

固定类型名：

- `CordisPackageName`
- `CordisPackageFingerprint`
- `CordisAdmissionStatus`
- `CordisAdmissionReport`
- `CordisRootHandle`
- `CordisLifecycleProbe`

`CordisRootHandle` 只在 `packages/agent-runtime/src/compatibility/cordis/**` 内使用，不能从 `packages/agent-runtime/src/index.ts`、`@actspace/shared/runtime-v2`、IPC 或 Host DTO 导出。P03 只消费 `CordisAdmissionReport` 和 root 生命周期方法，不直接复制 package 检测逻辑。

## 允许修改

- `packages/agent-runtime/package.json`
- `packages/agent-runtime/src/compatibility/cordis/**`
- `packages/agent-runtime/src/test/**` 中与 Cordis 准入边界直接相关的测试
- `pnpm-lock.yaml`
- `docs/exec-runs/actspace-v2-p01-cordis-admission/**`
- `docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md` 仅在门禁失败且需要记录证据时更新
- 本计划的进度和决策记录

## 禁止修改

- `packages/shared/src/session.ts`、`packages/shared/src/ipc.ts` 和旧 shared root export
- `packages/agent-core/**`、`apps/desktop/**`、`apps/cli/**`
- `plugins/**`、Kairos 代码和 fs-watch 代码
- `@deepseek-ai/cordis-plugin-hmr`、旧上游 Cordis、DSH App Boot 或 DSH Agent Core 依赖
- `packages/agent-runtime/src/index.ts` 的公共 RuntimeHandle surface
- v1 默认 Profile、用户配置、Session 数据和生产启动命令

## 任务与测试

### P01.1：精确依赖与 fresh install

在 `packages/agent-runtime/package.json` 添加五个 exact dependencies，并用 workspace override 保证只有一套 Cordis runtime family。创建干净临时目录，使用 registry fresh install 解析依赖，读取 package exports、types、peer ranges 和 lockfile integrity，生成 `CordisPackageFingerprint[]`。

测试：`packages/agent-runtime/src/compatibility/cordis/test/admission.test.ts` 断言五个包名、版本、入口和 integrity 全部匹配；断言不存在 `@cordisjs/*`、旧 `cordis` 和 `cordis-plugin-hmr`。

### P01.2：Node 生命周期与 Effect cleanup

在 `packages/agent-runtime/src/compatibility/cordis/root.ts` 实现内部 `createCordisRoot()`、`awaitCordisSettlement()` 和 `disposeCordisRoot()`，只接受 JSON-safe fixture config。`lifecycle.test.ts` 覆盖 Service 注入、PENDING 缺失依赖、FAILED activation、timer/subprocess/watcher Effect disposer、异步 disposer 等待和二次 dispose 幂等性。

### P01.3：Loader、Include、Group、Timer

在 `loader-include.test.ts` 使用本地 fixture 验证 builtin、file、relative、bare package import，Include patch 的顺序、插入后继续 patch、整对象 config replacement、invalid candidate 的 last-good 保留，以及 Group 子树和 Timer 的生命周期归属。配置或代码变化只生成 `restartRequired` probe，不改变当前 root。

### P01.4：Electron packaged smoke

在不修改 Desktop 默认启动的前提下，对构建后的 `packages/agent-runtime/dist` 执行 Electron child-process smoke：启动一个 root、等待 settlement、读取 `CordisPackageFingerprint`、执行 shutdown，确认 packaged runtime 中只有一套 Cordis 且所有 Effect 进入静止状态。

### P01.5：准入报告与执行记录

让 `CordisAdmissionReport` 记录 package fingerprints、Node/Electron 结果、loader/include 结果、HMR absence、cleanup 结果和失败码。执行过程写入 `docs/exec-runs/actspace-v2-p01-cordis-admission/execution-process.md`，结束时写入 `execution-summary.md`。

## 并行边界

- P01 依赖 P00；P02 在 P00 完成后可与 P01 并行。
- P03 必须等待 P01 的 `CordisAdmissionReport.status === "passed"`；P03 不得在门禁未通过时引入替代 Cordis 包。
- P01 的修改范围集中在 `packages/agent-runtime/src/compatibility/cordis/**` 和依赖文件，不得与 P02 共改同一 adapter 文件。
- Electron smoke 只验证新 package，不接入 Desktop 默认 Boot；RuntimeHandle 集成由 P12 负责，Desktop 与 CLI Host 集成分别由 P13、P14 负责。

## 失败停线与回退

- fresh install、exports/types、Node/Electron lifecycle、Loader/Include、cleanup 或 packaged smoke 任一失败，P01 状态保持“待执行”并停止依赖提交。
- 若只能通过 deep import、Node 私有 API、`node_modules` patch 或 HMR 绕过，必须记录失败证据并重开 Cordis ADR；禁止把 workaround 写进生产代码。
- 回退只移除 P01 新增的五个依赖、`src/compatibility/cordis/**` 和 lockfile 变更，保留 P00 ESM package 与 v1 代码；不得用回退操作覆盖用户无关改动。
- Cordis 失败期间 P03 不得继续实现可启动 Boot；P02 可独立完成自己的准入记录。

## 验证命令

```bash
pnpm install --frozen-lockfile
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime exec vitest run src/compatibility/cordis/test/admission.test.ts src/compatibility/cordis/test/lifecycle.test.ts src/compatibility/cordis/test/loader-include.test.ts
pnpm check:repo
pnpm check:secrets
pnpm check:docs
git diff --check
```

预期结果：五个 exact package 全部解析；Node fixture、Loader/Include fixture 和 packaged Electron smoke 均通过；没有 HMR 或旧 Cordis 依赖；新 root shutdown 后无未清理 Effect。

## 完成标准

- `CordisAdmissionReport.status` 为 `"passed"`，并包含五个 package fingerprint。
- Node 与 packaged Electron 均证明 pending/failed/cleanup/settlement 语义满足 v2 门禁。
- Loader、Include、Group、Timer 的测试不依赖私有 API或源码 deep import。
- P03 能通过 `CordisRootHandle` 内部适配创建和关闭 root，但公共包根入口仍不暴露 Cordis 类型。
- Cordis ADR 已记录实际 registry 版本、integrity、测试命令和任何未通过项；无未记录的绕过方案。

## 进度

- [ ] P01.1：锁定五个 exact Cordis dependencies 和 fresh install fingerprint。
- [x] P01.2：完成 Node lifecycle 与 Effect cleanup probe。
- [x] P01.3：完成 Loader/Include/Group/Timer probe。
- [ ] P01.4：完成 packaged Electron smoke。
- [ ] P01.5：生成准入报告和 exec-run 摘要。

## 决策记录

- 2026-08-22：Cordis 采用基线固定为 `4.0.1 / 1.0.2 / 1.0.6 / 1.0.1 / 1.1.3`，五包整组升级，不允许独立漂移。
- 2026-08-22：P01 只验证 Cordis 生命周期；ActSpace Plugin ABI、Composition 和 Startup Validation 由 P03 拥有。
- 2026-08-22：`cordis-plugin-hmr` 永不进入 v2 生产 Profile，配置变化只产生 restart candidate。
