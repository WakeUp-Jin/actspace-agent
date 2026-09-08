# ActSpace v2 P03：Trusted Boot 与 Composition - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-p03-trusted-boot-and-composition.md`
- **执行模式**：交互
- **开始时间**：2026-08-22
- **当前状态**：本地 published-build API/lifecycle 验证完成；registry integrity 与 packaged Electron 门禁未完成

## 执行时间线

### 步骤 1：Plugin identity、manifest 与 source admission

- 实现稳定 plugin / entry / service identity、JSON-safe manifest 校验和显式 `plugins.json` source。
- 仅允许 builtin、受信任本地绝对路径和 exact managed package；拒绝 URL、自动扫描、路径逃逸、重复 ID 和非精确 managed version。
- 本地插件 integrity 同时覆盖 canonical manifest 与 codec/behavior 模块实际字节，且在模块求值前完成。

### 步骤 2：Codec 与 Behavior 分离

- Codec 从全部已登记插件预发现，再创建 Session Event Codec Registry。
- Behavior 只在 composition 和 Host/frontend admission 后激活；实际 services 必须与 manifest `provides` 完全相等。
- activation/dispose 通过 Cordis root seam 归属到对应 Entry；optional frontend 记录结构化 warning，required frontend 拒绝启动。

### 步骤 3：Composition 与 Startup Validation

- 建立独立 kernel/base/external/Host bundle，按 Profile、home patch、invocation patch 固定顺序组合。
- Startup Validation 拒绝 fiberless、FAILED、PENDING 和其他非 ACTIVE enabled entries。
- Boot diagnostics 合并 composition warning、entry provenance 与 activation failure，不创建全局 Composition Generation。

## 当前证据

- Agent Runtime 全量测试：36 files、153 passed，6 个真实 published-package smoke 按环境变量 gated；显式门禁 6/6 通过。
- Agent Runtime strict TypeScript 检查：通过。
- `pnpm check:docs`：通过。
- DSH 已构建的 exact Cordis family（4.0.1 / 1.0.2 / 1.0.6 / 1.0.1 / 1.1.3）通过实际 public ESM/types fingerprint；`createCordisRoot()` 通过真实 Loader/TIMER boot，Loader settlement 为 settled，Entry 为 ACTIVE，dispose reverse cleanup 通过。
- Include/Group builtins 已在真实 Loader context 注册并由 real lifecycle test 检查；生产仍不启用 HMR。

## 尚未完成

- registry fresh install、npm integrity/peer resolution 和 lock integrity。
- Loader / Include / Group / Timer 的 registry-installed 公开 API 合同测试（DSH published-build local smoke 已通过）。
- Electron packaged root lifecycle、异步 disposer 和资源静止证明。
- 因此当前只能消费为候选合同，不能将 `CordisAdmissionReport` 标成 passed。
