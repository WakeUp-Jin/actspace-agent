# ActSpace v2 P03：Trusted Boot、Profile/Bundle/Patch 与诊断

状态：执行中（真实 published-build Cordis Loader/Include/Group/Timer lifecycle 已通过；registry integrity 与 packaged 门禁未完成）

父计划：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/README.md`

依赖：P00 `actspace-v2-p00-contracts-and-esm-island`、P01 `actspace-v2-p01-cordis-admission`

消费者：Session/Codec、Prompt、Tool、Agent、Host Adapter 子计划；最终候选验收和一次性 cutover

exec-run slug：`actspace-v2-p03-trusted-boot-and-composition`

## 目标

在 `@actspace/agent-runtime` 中实现 ActSpace 自有的 Plugin Manifest、Codec discovery、Profile/Bundle/Patch composer、Host capability ceiling、Trusted Boot、Loader settlement、Startup Validation 和脱敏 diagnostics。P03 只生成经过验证的 `BootManifest`/`TrustedBootCandidate`，不提前发布完整 `RuntimeHandle`，不激活完整 Agent Core 产品能力，不切换 v1 默认 Runtime。

## 范围

包含：

- 静态 Manifest、Codec Module、Behavior Entry 三段式插件 ABI。
- 受信任内置、本地显式路径和 managed exact npm package 三种来源校验。
- `Profile`、`Bundle`、`Patch` 的确定性组合顺序和 required/optional patch miss 语义。
- 稳定 plugin、Entry、Service、Event、contribution identity 冲突的 fail-fast 校验。
- Codec 在任何 Behavior import、Session decode 和行为激活前从 Core 与全部显式登记 trusted metadata 中发现。
- Behavior module 顶层无资源副作用，资源只由 activation Effect 持有。
- Host capability ceiling 只减不增、`frontend.required` fail-closed、optional skip diagnostics。
- Cordis root boot、Loader settlement、Startup Validation 和 last-good candidate 处理。
- `restartRequired` diagnostics；生产基线不提供 HMR、在线 reconcile 或全局 Composition Generation。
- 脱敏 `BootManifest`、`ResolvedComposition`、diagnostics 和 config dump。

不包含：

- 不实现或发布完整 `RuntimeHandle`、`runTurn`、Session writer、Tool scheduler、Agent Loop、Subagent、Prompt assembly 或 LLM dispatch。
- 不把 Cordis `Context`、`Fiber`、Service object 或 `Effect` 作为 shared/Host/IPC DTO。
- 不加载插件前端 JavaScript、React、CSS 或 HTML。
- 不启用 `cordis-plugin-hmr`、live reload、在线 reconcile、StandingMount 或全局 generation manager。
- 不删除 Kairos、fs-watch、旧 Agent Core 或旧 SessionEvent；清理由 P15 负责。
- 不自动扫描任意目录、下载插件、执行 URL、执行 `!!js` 或承诺同进程恶意代码隔离。

## 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/PLANS_GUIDE.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md`
- `docs/design-docs/agent-plugin-runtime/agent-decisions-v2-foundation.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md`
- `packages/agent-runtime/src/compatibility/cordis/admission.ts`
- `packages/agent-runtime/src/compatibility/cordis/root.ts`
- `packages/agent-runtime/src/compatibility/cordis/types.ts`
- `packages/shared/src/runtime-v2/host-dto.ts`

## 当前基线

- P00 建立 ESM package 和 Host DTO；P01 提供 `CordisAdmissionReport` 与内部 `CordisRootHandle`；P02 的 `PiAiAdmissionReport` 由 P05/P12 在 LLM capability 组装时消费，不是 P03 的启动前置。
- 当前没有 v2 Plugin Manifest、Composition、Boot 或 Startup Validation 实现。
- 现有 v1 `packages/shared/src/plugins.ts`、旧 plugin registry 和 Desktop Main 装配不符合 v2 ABI，P03 不在其上包一层动态 import。
- v2 的六份公共契约已经固定行为语义，精确 TypeScript shape、错误码和文件路径由本计划锁定。
- `ResolvedComposition` 只记录解析结果和 provenance，不拥有 Fiber、运行实例、旧实例引用或全局代际。

## 输入契约

### 稳定身份

在 `packages/agent-runtime/src/plugin/identity.ts` 定义 branded string：

- `PluginId`
- `EntryId`
- `ServiceId`
- `EventTypeId`
- `ContributionId`

同一解析范围内重复身份必须 fail-fast，并在诊断中记录双方 plugin、Entry 和 provenance。

### Plugin ABI

在 `packages/agent-runtime/src/plugin/manifest.ts` 定义：

- `PluginSource`：`"builtin" | "local-path" | "managed-package"`
- `PluginManifest`
- `PluginCodecDescriptor`
- `PluginBehaviorDescriptor`
- `PluginHostRequirement`
- `PluginFrontendRequirement`
- `PluginContributionSummary`

Manifest、Profile、Bundle、Patch 和用户配置只接受 JSON-safe 数据；secret 只能以 `credentialRef` 表示。

### Composition

在 `packages/agent-runtime/src/composition/types.ts` 定义：

- `Profile`
- `Bundle`
- `Patch`
- `PatchOperation`
- `PatchOperationResult`
- `ResolvedComposition`
- `BootManifest`

组合顺序固定为：empty root、kernel/base bundle、profile ordered bundles、Host surface bundle、profile patch、user-home patch、invocation patch、Host capability ceiling。Patch `config` 是整对象替换；required target miss fatal，显式 optional miss 只产生 warning。

### Boot 与诊断

在 `packages/agent-runtime/src/boot/types.ts` 定义：

- `StartupValidationResult`
- `StartupFailureCode`
- `TrustedBootCandidate`
- `RestartRequiredNotice`

在 `packages/agent-runtime/src/diagnostics/types.ts` 定义：

- `BootDiagnostic`
- `DiagnosticProvenance`
- `BootConfigDump`

`TrustedBootCandidate` 是内部 candidate，不是 `RuntimeHandle`；它可以暴露只读 `BootManifest`、diagnostics 和有界 `disposeCandidate()`，不能暴露 root Context、Fiber、Session writer 或 AgentLoop class。

## 输出契约

实现文件：

- `packages/agent-runtime/src/plugin/identity.ts`
- `packages/agent-runtime/src/plugin/manifest.ts`
- `packages/agent-runtime/src/plugin/codec-discovery.ts`
- `packages/agent-runtime/src/plugin/behavior-loader.ts`
- `packages/agent-runtime/src/composition/types.ts`
- `packages/agent-runtime/src/composition/compose.ts`
- `packages/agent-runtime/src/composition/patch.ts`
- `packages/agent-runtime/src/composition/config-dump.ts`
- `packages/agent-runtime/src/boot/types.ts`
- `packages/agent-runtime/src/boot/trusted-boot.ts`
- `packages/agent-runtime/src/boot/startup-validation.ts`
- `packages/agent-runtime/src/diagnostics/types.ts`
- `packages/agent-runtime/src/diagnostics/boot-diagnostics.ts`
- `packages/agent-runtime/src/plugin/test/plugin-admission.test.ts`
- `packages/agent-runtime/src/plugin/test/codec-discovery.test.ts`
- `packages/agent-runtime/src/composition/test/compose.test.ts`
- `packages/agent-runtime/src/composition/test/patch.test.ts`
- `packages/agent-runtime/src/boot/test/trusted-boot.test.ts`
- `packages/agent-runtime/src/boot/test/startup-validation.test.ts`
- `packages/agent-runtime/src/boot/test/fixtures/*.ts`

`packages/agent-runtime/src/index.ts` 只导出经过评审的只读 `BootManifest`、`ResolvedComposition`、`BootDiagnostic` 类型和 P00 Host DTO；`TrustedBootCandidate`、Cordis root 和所有 Behavior activation API 只能从内部路径使用。完整 `RuntimeHandle` 由 P12 在全部领域 Provider 完成后单独设计和发布。

## 允许修改

- `packages/agent-runtime/src/plugin/**`
- `packages/agent-runtime/src/composition/**`
- `packages/agent-runtime/src/boot/**`
- `packages/agent-runtime/src/diagnostics/**`
- `packages/agent-runtime/src/index.ts` 仅增加本计划规定的只读类型 export
- P00 创建的 `packages/agent-runtime/src/test/**` 中与 Boot boundary 直接相关的 fixture/test
- `docs/exec-runs/actspace-v2-p03-trusted-boot-and-composition/**`
- 本计划的进度和决策记录

## 禁止修改

- `packages/shared/src/session.ts`、`packages/shared/src/ipc.ts`、旧 `SessionEvent` 和 v1 `RuntimeStreamEvent`
- `packages/shared/src/runtime-v2/host-dto.ts` 中 P00 已锁定的类型名和语义
- `packages/agent-core/**`、`apps/desktop/**`、`apps/cli/**`
- `plugins/**`、Kairos、fs-watch 和 Browser Bridge 实现
- `packages/agent-runtime/src/compatibility/cordis/**` 的五包版本和 admission 判定
- `packages/agent-runtime/src/compatibility/pi-ai/**` 的 pi-ai probe 和 backend 判定
- `RuntimeHandle` class、Agent Loop、Session writer、Tool executor、Prompt contributor 和 renderer code
- HMR、在线 reconcile、全局 `CompositionGenerationManager`、URL plugin、自动下载和 `!!js`

## 任务与测试

### P03.1：锁定 identity、manifest 和 JSON-safe validator

实现 branded identity、`PluginManifest`、Codec/Behavior descriptor、Host/frontend requirement 和 contribution summary。`plugin-admission.test.ts` 覆盖 builtin、local-path、managed-package 三种允许来源，以及 URL、自动扫描、非 JSON 值、secret 明文、runtimeContract 不兼容和身份冲突拒绝。

### P03.2：实现 Codec discovery 与 Behavior 分离

在 `codec-discovery.ts` 从 Core 与全部显式登记、受信任、已安装插件静态 metadata 发现 codec；不得以当前组合、Session Header、event owner 或 Behavior 是否激活作为发现上限。`codec-discovery.test.ts` 用行为入口顶层副作用 sentinel 证明 codec decode 在 Behavior import 前完成，并拒绝带网络、文件写入、timer、socket 或全局注册副作用的 Codec。

### P03.3：实现 Profile/Bundle/Patch composer

在 `compose.ts` 和 `patch.ts` 实现固定顺序、稳定 Entry id、整对象 config replacement、required target miss fatal、explicit optional miss warning、applied/skipped/failed 结果和不可变 `ResolvedComposition`。`compose.test.ts`、`patch.test.ts` 覆盖 patch 顺序、插入后继续 patch、冲突 provenance、Host ceiling 只减不增和 deterministic config dump。

### P03.4：实现 Behavior loader 与 Effect admission

在 `behavior-loader.ts` 只允许校验完成后的 Behavior import；模块 evaluation 不能启动进程、socket、watcher、timer、listener 或写外部状态，所有资源必须通过 activation Effect 注册到内部 disposer。测试确认 activation 失败时贡献和资源全部回收。

### P03.5：实现 Trusted Boot candidate

在 `trusted-boot.ts` 串联 source/manifest/config/contract/identity/codec/Host/frontend 检查、P01 Cordis root 和 Loader settlement，生成 `TrustedBootCandidate`。candidate 只携带只读 `BootManifest`、diagnostics 和 dispose，不创建或发布完整 RuntimeHandle。

### P03.6：实现 Startup Validation 与 diagnostics

在 `startup-validation.ts` 检查 enabled Entry 是否有 Fiber、Fiber 是否为 `ACTIVE`、是否存在 `FAILED`/`PENDING`/其他非健康状态，以及 Base Profile required capability 是否有 active Provider。`trusted-boot.test.ts` 和 `startup-validation.test.ts` 覆盖 required failure、optional skip、frontend.required fail-closed、缺失 Codec、P01 admission failure、脱敏 config dump 和 `restartRequired`；P02 的 route 结果由 P05/P12 单独门控。

### P03.7：完成执行记录

执行过程写入 `docs/exec-runs/actspace-v2-p03-trusted-boot-and-composition/execution-process.md`，完成或停线时写入 `execution-summary.md`；报告 candidate dispose 后 timer、watcher、subprocess、Fiber 和 pending disposer 的静止状态。

## 并行边界

- P03 必须等待 P00 完成和 P01 `CordisAdmissionReport.status === "passed"`；P02 可以与 P03 并行执行。
- P03 内部 composition、plugin schema 和 diagnostics 可先并行编写，但 `trusted-boot.ts` 的集成测试必须在它们合并后串行执行。
- P09/P12 及其后续 Host 集成只能消费 P03 的 `BootManifest`、diagnostics 和 candidate boundary，不得各自实现 composer 或 Startup Validation；P04-P08 可按总 DAG 在各自领域并行推进，但不得复制这两项职责。
- P03 不接入 Desktop/CLI，不切换默认启动；RuntimeHandle 集成由 P12 负责，Desktop 与 CLI Host Adapter 分别由 P13、P14 负责。

## 失败停线与回退

- source、manifest、codec、identity、Host/frontend、Loader settlement 或 Startup Validation 任一步失败，Boot 必须 fail-closed，绝不发布可运行 RuntimeHandle。
- required Entry、required capability 或 required Codec 缺失时，停止 candidate；optional Entry 只能跳过并留下结构化诊断，不能 degraded activation。
- P01 Cordis admission 失败时停止 Boot 集成；P02 `CORE_HARD_FAIL` 由 P05/P12 处理，P03 只保留通用 required Provider capability 校验。
- Behavior 顶层副作用、静态全局 Registry、跨插件私有对象或 Host ceiling 绕过一旦出现，停止 P03 并删除该候选实现；不以测试白名单掩盖。
- candidate 失败回退只调用 `disposeCandidate()` 并保留原 composition 值；P03 不触碰 v1 默认 Runtime、Session 数据或旧代码。
- 不启用 HMR、在线 reconcile 或全局 generation 作为失败补偿；配置/代码变化只返回 `restartRequired`。

## 验证命令

```bash
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime exec vitest run src/plugin/test/plugin-admission.test.ts src/plugin/test/codec-discovery.test.ts src/composition/test/compose.test.ts src/composition/test/patch.test.ts src/boot/test/trusted-boot.test.ts src/boot/test/startup-validation.test.ts
pnpm check:repo
pnpm check:secrets
pnpm check:docs
git diff --check
```

预期结果：所有 identity、composition、codec、loader、startup validation 和 diagnostics fixture 通过；Boot candidate 失败时不产生 RuntimeHandle；配置 dump 结果可重放且不含 secret；新包和 shared v2 DTO 没有 Cordis 类型泄漏到 Host/IPC。

## 完成标准

- `ResolvedComposition` 和 `BootManifest` 能从同一个 composer 产生，并包含 profile/bundle/plugin versions、patch digest、Entry tree、Host ceiling、runtime contract 和 provenance。
- Codec discovery 在 Behavior activation 前完成，且不依赖未知代码或副作用。
- required/optional、identity conflict、frontend.required、Host ceiling、Loader state 和 required capability 的失败语义均有测试证据。
- `TrustedBootCandidate` 可以创建、诊断和有界 dispose；`RuntimeHandle`、Agent Loop、Session writer 和具体插件服务仍未从公共入口发布。
- P04-P07 可以直接消费本计划的类型和诊断，不再实现第二套 Boot、Composition 或全局 generation。

## 进度

- [x] P03.1：完成 identity、manifest 和 JSON-safe validator 的候选实现。
- [x] P03.2：完成 Codec discovery / Behavior 分离和本地 fixture 测试。
- [x] P03.3：完成 Profile / Bundle / Patch composer 与 config dump。
- [x] P03.4：完成 Behavior loader、声明服务校验和 disposer seam。
- [x] P03.5：完成 Trusted Boot candidate 的 fake Cordis 集成。
- [x] P03.6：完成 Startup Validation 和 diagnostics 的本地合同测试。
- [x] P03.7：完成当前候选的 exec-run 过程与摘要记录。
- [ ] P03.8：完成 P01 后的真实 Cordis Root、Loader / Include、Electron packaged 与资源静止门禁。

## 决策记录

- 2026-08-22：P03 只发布 `TrustedBootCandidate`，不提前定义完整 RuntimeHandle；完整句柄必须等 Agent、Session、Tool、LLM 和 Host 语义完成后由后续计划发布。
- 2026-08-22：Codec discovery 与 Behavior activation 是两条独立路径，codec 必须在 Session decode 和行为激活前可用。
- 2026-08-22：Startup Validation 属于 Trusted Boot 的启动检查，不新增全局 Composition Generation 或独立协议层。
- 2026-08-23：DSH published-build Cordis family 的真实 public API/lifecycle 已通过；由于 registry/install、integrity 与 packaged Electron 门禁仍未完成，P03 仍保持执行中，不宣告最终完成。
