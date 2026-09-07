# ActSpace P1/P2：Session、Service、Composition 与契约矩阵 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md`
- **当前工作包**：P1-A / P1-B / P1-C / P2 contract slices
- **执行模式**：交互
- **开始时间**：2026-08-29
- **结束时间**：2026-08-29

## 执行时间线

### 步骤 1：确认批准与工作区边界

- **操作**：读取 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、P1/P2 总计划、P1-A 计划和 LLM Agent 开发规范；确认用户已批准实施。
- **影响文件**：无代码文件修改。
- **决定**：不清理当前 dirty worktree，不执行 `git reset`、`git clean`、提交或发布；工具 executor、用户 Session 数据和 CLI chat 留在范围外。
- **验证**：确认仓库已有大量用户修改，按规则保留；P0 execution summary 和设计文档可访问。

### 步骤 2：创建执行记录并检查 Session 包现状

- **操作**：创建本目录，检查 `packages/session/journal`、`persistence`、`jsonl`、`projection` 的 package manifests、源码和现有 provider seam tests。
- **影响文件**：`docs/exec-runs/20260829-actspace-p1-session-core-persistence/execution-process.md`。
- **决定**：现有 `SessionPersistence` 已经存在，但 `SessionHandle` 仍直接导入 `@actspace/session-jsonl`，因此先做 contract extraction 和 writer-driver seam，不直接创建第二个并行 Session package。
- **验证**：发现 `packages/session/persistence/src/session.ts` 直接导入 `JsonlSessionWriter`；现有 `provider-seam.test.ts` 只验证 fake provider 能返回 ephemeral Session，尚未证明 Core 与 JSONL writer 的源码依赖隔离。

### 步骤 3：P1-A contract slice

- **操作**：新增 `SessionPersistenceDriver` 和 `SessionPersistenceBinding`；将 JSONL writer/lease 的创建、append、close 和物理目录准备保留在 `JsonlSessionPersistence`，让 `SessionHandle` 只消费 driver/binding；`SessionStore` 负责把 binding 组装为 live Session Core。
- **影响文件**：`packages/session/persistence/src/session-driver.ts`、`session.ts`、`session-persistence.ts`、`session-store.ts`、`index.ts`、`src/test/provider-seam.test.ts`。
- **决定**：不新建第二个 workspace package，采用现有 persistence package 内的等价 Core seam，避免 dirty worktree 中大规模迁移下游 imports；Core 生产文件不再导入 `@actspace/session-jsonl`、`JsonlSessionWriter`、writer lease 或 `node:fs`。
- **验证**：`pnpm --filter @actspace/session-persistence typecheck` 通过；Session persistence 34 个测试通过；Journal 9 个测试、JSONL 1 个测试及各自 typecheck 通过；全仓 `pnpm -r typecheck` 通过；Core source boundary 检查通过。

### 步骤 4：P1-A handoff

- **操作**：将 P1-A 的 detached binding、driver ownership、Session Service 注入要求记录为 P1-B/P1-C 的消费契约。
- **影响文件**：本执行记录和 P1-A 计划文件之外无新增跨包修改。
- **决定**：Provider 仍可返回 backend binding，但不返回 `SessionHandle`；live Session 的 append/flush/close 由 Core 统一拥有。
- **验证**：P1-A 定向门已通过；下游适配前先检查新的 `SessionPersistence` 类型。

### 步骤 5：P1-B Service Definition / Provider / Consumer

- **操作**：扩展 `@actspace/cordis-adapter` 的服务定义元数据、ProviderHandle 和 Consumer 身份；补齐 14 个核心服务的 role metadata，并增加 definition、graph、manifest consistency 校验。
- **影响文件**：`packages/cordis-adapter/src/service-contract.ts`、`packages/cordis-adapter/tests/service-contract.spec.ts`。
- **决定**：将服务的 ABI、owner、scope、required、config schema、错误面和 public surface 固化在 Definition；Provider 只负责实例化/释放，Consumer 只声明消费身份，避免把 runtime wiring 混回具体实现。
- **验证**：`pnpm --filter @actspace/cordis-adapter typecheck && pnpm --filter @actspace/cordis-adapter test` 通过（20 passed，1 skipped）；全仓 typecheck 通过。

### 步骤 6：P1-C Profile / Bundle / Patch 与 Loader transport parity

- **操作**：为 Composition 增加 service/codec admission、诊断、loaderConfig、startupRequirements 和 BootManifest；默认 Profile 提供不可变 trusted loader entries；Boot 在挂载前校验 `cordis.yml` 与 resolved loader metadata 的一致性。
- **影响文件**：`packages/composition/src/types.ts`、`compose.ts`、`config-dump.ts`、测试；`packages/runtime/src/profiles/composition.ts`；`packages/boot/src/dsh-boot.ts`、`packages/runtime/src/runtime/boot.ts` 及 Boot 测试。
- **决定**：Profile/Bundle/Patch 的结果成为 Boot 的唯一 composition facts；当前 transport 采用 checked-in immutable metadata + parity check，不让静态 `cordis.yml` 静默偏离 Composer。外部插件动态 admission 与 CLI restart acceptance 留到 G1。
- **验证**：Composition 6、Boot 8、Runtime 4 个测试通过；runtime build、transport parity 脚本和全仓 typecheck 通过。

### 步骤 7：P2 Contract Matrix generator

- **操作**：新增显式 allowlist 的契约矩阵生成器，读取事件/服务/manifest/package/composition/verification 声明，生成 JSON 与 Markdown 双产物；加入重复 ID、缺失字段、路径安全、服务 provider 和通知 veto 校验，并接入 `--check` 与 CI。
- **影响文件**：`scripts/contract-matrix/source-registry.mjs`、`generate.mjs`、测试；`artifacts/agent-contract-matrix.json`；`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`；根 `package.json` 和 `.github/workflows/ci.yml`。
- **决定**：矩阵只扫描显式 allowlist，不扫描 `.env`、session data、workspace 或网络；`goal/change`、`schedule/change` 保留为未来事件，但 producer status 明确标记为 `not-implemented`，避免把声明误报成可运行能力。
- **验证**：矩阵 69 行（13 core + 9 loop + 5 notification + 42 extension）、14 services、18 plugins、32 packages；`pnpm test:contract-matrix` 与 `pnpm run gen:contract-matrix --check` 通过，digest 稳定。

### 步骤 8：全量门禁与 legacy checker 修正

- **操作**：运行 package manifest、current docs、docs、legacy-removal、package-cutover、CLI process smoke、CLI package、全仓 typecheck/test 等检查；为 legacy-removal checker 增加对当前合法 `session.jsonl` Provider 的精确路径豁免。
- **影响文件**：`scripts/check-v2-legacy-removal.mjs`。
- **决定**：`session.jsonl` 是当前 JSONL persistence Provider，不是 v1 runtime 回连；只允许其在 trusted composition metadata 中出现，其他生产入口仍由 legacy token 扫描拦截，并由 package-cutover 与 contract-matrix admission 交叉检查。
- **验证**：`check:v2-legacy-removal --strict` 与 `check:package-cutover --strict` 均通过；全仓 `pnpm test`、`pnpm run typecheck`、`pnpm -r --if-present test`、CLI process smoke 和 managed CLI package persist/resume smoke 均通过。

## 遇到的问题

- **问题**：当前 `@actspace/session-persistence` 同时承载 Session Core、Persistence Definition 和 JSONL Provider，且 `session.ts` 直接依赖 `@actspace/session-jsonl`。
  - **原因**：早期 seam 只抽取了 `SessionPersistence` 接口，live `SessionHandle` 的 writer/lease 创建仍留在同一文件。
  - **应对**：先在现有 package 内建立明确的 Core/Provider driver 边界，避免在 dirty worktree 中一次性迁移所有下游 package；完成后用依赖检查和 parity tests 证明隔离。

- **问题**：仓库基线中 `packages/session/persistence` 目录本身处于未跟踪状态，无法通过普通 `git diff` 单独区分本轮新增内容。
  - **原因**：当前工作区已有大范围未提交/未跟踪重构内容。
  - **应对**：不执行清理、stage 或 reset；以精确路径、测试结果和 source boundary 检查作为本轮证据。

## 跳过或推迟的事项

- G1：CLI 单次无头任务的完整 `boot → run → flush → dispose`、显式 persist/resume 与真实重启验收仍需单独收口；本轮没有把 CLI chat 纳入范围。
- G2：真实 Provider、Browser Bridge、Electron、签名/公证等外部环境门禁不由本轮本地测试代替。
- execution summary：已根据上述结果更新；P1/P2 contract slice 完成，但不把 G1/G2 误报为完成。
