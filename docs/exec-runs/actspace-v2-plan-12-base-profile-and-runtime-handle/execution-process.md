# ActSpace v2 P12：Base Profile、RuntimeHandle 与完整候选 Runtime — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-12-base-profile-and-runtime-handle.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 21:24
- **当前状态**：候选实现与行为测试完成；P01/P03/pack 外部门禁待恢复

## 执行时间线

### 步骤 1：固定 Runtime DTO 与 Base Profile

- **操作**：新增 Runtime state、BootManifest、restart、session list、run response 和 shutdown DTO；建立 kernel/base/desktop/cli-run/cli-chat bundle 与 deterministic default manifest。
- **决定**：Browser capability 缺失时 optional skip；Base required capabilities 不齐时不发布 Handle。
- **验证**：manifest digest、required entry 和 optional Browser skip 通过。

### 步骤 2：实现 RuntimeHandle 状态机

- **操作**：实现 booting/ready/quiescing/disposed、进程级 single-ready guard、Session create/resume/fork/list/inspect/export、run/inbox/abort/flush/restart API。
- **决定**：Host 只持有 RuntimeHandle；child Session 不允许 public resume；当前 Runtime 不做在线 reconcile。
- **验证**：fake Host 可通过 Handle 完成 Session/Turn/Projection/Restart/Dispose。

### 步骤 3：实现关闭与 CJS loader

- **操作**：实现 stop admission、Agent quiesce、Session flush/close、plugin/Cordis disposer、30 秒 deadline 和 shutdown blockers；新增唯一 CJS `./loader` dynamic import bridge。
- **验证**：构建后的 `loader.cjs` 动态导入 ESM 并暴露 `bootRuntime`。

### 步骤 4：接入显式插件源和完整 Runtime 候选

- **操作**：新增 `<dataRoot>/runtime-v2/plugins.json`，支持受信任本地绝对路径和 exact managed package；在执行代码前校验 manifest、codec/behavior 路径与内容完整性。
- **决定**：Codec discovery 先于 Session Registry 和 Behavior activation；Behavior 实际提供的 service 必须与 manifest `provides` 完全一致；optional frontend 只记录 warning，required frontend fail-closed。
- **验证**：外部插件的 codec、behavior、service、duplicate identity、路径逃逸、内容漂移、启动失败 guard 和 diagnostics fixture 通过。

### 步骤 5：补齐 ephemeral 与主/子 Agent 一致性

- **操作**：新增真正的内存 Session；CLI run 默认不创建 `sessions-v2`。main/subagent 共用同一组 Host、workspace、Skills 与 Agent descriptor contributors。
- **验证**：真实 RuntimeHandle 组合覆盖 main Turn、Explore child、child browse/export、ephemeral、restart 与 shutdown。

### 步骤 6：补齐候选失败矩阵

- **操作**：Startup Validation 拒绝 fiberless、PENDING、FAILED 和 required provider missing；Session writer conflict、Tool checkpoint fail-closed、LLM/Tool lease timeout、Subagent parent crash 和 Runtime disposer timeout 分别注入。
- **操作**：LLM lease drain 清理 deadline timer，Tool/LLM timeout 后都可在 lease 释放后完成第二次 dispose；Runtime disposer timeout 保留 quiescing state 和 fatal blocker。
- **验证**：全量 Agent Runtime 36 files、153/153，6 个真实 published-package smoke 默认跳过且显式门禁 6/6 通过；strict TypeScript 与按 shared -> runtime 顺序的 build 通过。

## 遇到的问题

- **问题**：BootManifest 多个 Core entry 生成重复 plugin provenance。
  - **应对**：Session Header plugins 按 plugin id 精确去重，保留 entry 级 manifest 明细。
- **问题**：`pnpm pack` 无法解析未安装的 `@actspace/shared` workspace dependency。
  - **原因**：此前 registry/network 失败导致 workspace install 不完整。
  - **应对**：源码 build 和 loader smoke 已通过；pack gate 保留未通过状态，待依赖安装恢复后重跑，不通过临时 vendor 或改写依赖协议绕过。

## 尚未完成的门禁

- P01 的真实 Cordis family fresh install、Loader / Include、Electron 和单实例依赖树尚未完成；当前 fake Cordis 合同不能替代准入。
- P02 的真实 pi-ai Provider、packaged 和 fresh registry 门禁尚未完成；本地三 route、proxy、retry-disabled 合同已通过。
- production `pnpm pack` 与安装后 subpath smoke 尚未通过。
- 已删除未使用的 `createDefaultBootManifest()`；真实 Boot 只允许由 `createDefaultComposition()` 的 resolved composition 加 activation facts 生成 manifest。
- 因此 P12 不标记最终完成，但 P13/P14 可以消费稳定 RuntimeHandle 候选契约继续集成。
