# ActSpace v2 P01：Cordis 发布族准入 - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-p01-cordis-admission.md`
- **当前状态**：本地 published-build API/lifecycle 通过；fresh registry integrity、lockfile 与 packaged Electron gate 待外部 registry 恢复

## 已验证

- `inspectCordisAdmission()` 对五个 exact package 读取 version、ESM、public exports、types、peer 和 family root；DSH 构建包报告 4.0.1 / 1.0.2 / 1.0.6 / 1.0.1 / 1.1.3，single family 通过。
- `createCordisRoot()` 使用 public `Context`、Loader、Timer，真实 Entry mount/ACTIVE/settlement/dispose 通过。
- Loader context 的 Include/Group builtin 注册通过真实 smoke；Effect reverse cleanup 和 async disposal 通过。
- 真实 Cordis consumer 在服务缺失时保持 `PENDING`，provider 发布后进入 `ACTIVE`；Include 已覆盖 ordered patch、insert 后继续 patch、relative/file/bare import、坏 YAML last-good、失败候选整树回滚和后续有效刷新。
- HMR 是显式 forbidden package。DSH workspace 的 virtual store 暴露 `@deepseek-ai/cordis-plugin-hmr` 时，准入拒绝并返回结构化 failure；这证明门禁有效，不能作为生产 package gate 的通过证据。
- `packages/agent-runtime` 全量本地回归：36 files、153 tests passed，6 个真实依赖 smoke 默认跳过；`ACTSPACE_REAL_CORDIS=1 ACTSPACE_REAL_PI_AI=1` 时 6/6 通过。

## 外部门禁

- `pnpm install --lockfile-only` 受到 registry DNS `ENOTFOUND` 阻断；一次 escalated retry 被审批服务 503 拒绝。
- 因此没有手工写 Cordis integrity，也没有把 DSH vendor 路径写进生产 lockfile。fresh registry install、pnpm lock integrity、Electron packaged ESM 单实例仍必须重跑。
- 当前锁文件已登记 root overrides 与 `packages/agent-runtime` exact specifiers，但 registry package/snapshot records 尚无法生成；`pnpm install --frozen-lockfile --offline` 明确报告缺少 `@deepseek-ai/cordis@4.0.1` package entry。
