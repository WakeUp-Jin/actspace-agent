# ActSpace v2 P11：one-shot Subagent、Agent 与 Explore — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-11-one-shot-subagent.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 21:21
- **结束时间**：2026-08-23 13:40

## 执行时间线

### 步骤 1：固定 static Preset 与 descriptor

- **操作**：实现 `actspace.agent`、`actspace.explore` descriptor 和不可变 StaticPresetRegistry。
- **决定**：Agent/Explore 只差 Preset；Explore allowlist 固定裁剪为 read_file/list_directory/grep/glob，Preset 只能收窄 parent visible tools。
- **验证**：tool intersection、readonly enforcement 和 depth limit 通过。

### 步骤 2：实现 child Session、Scope 与 lineage

- **操作**：扩展 Session lineage 的 parentCallId/seedDigest，创建独立 child Session、child Scope，并写入 preset/manifest/codec provenance。
- **决定**：child 不复制 parent transcript，只接收显式 task；child Session terminal/flush 完成后才提交 parent linked result。
- **验证**：cold inspect 的 child Header lineage 与 parent call 一致。

### 步骤 3：实现统一 OneShotSubagentProvider

- **操作**：实现 invoke、父到子 AbortSignal、active child tracking、terminal result 和 childSessionId 幂等 parent link。
- **决定**：public API 只返回 terminal result；没有 Inbox、background handle、continue、resume 或 StandingMount。
- **验证**：Agent/Explore 共用 provider、每个 child 只有一次 parent terminal link，nested depth fail-closed。

### 步骤 4：关闭 crash window 与级联取消

- **操作**：child 在关闭 Scope 前先把 `delegation/child-terminal` 追加并 flush 到自己的 Journal；Runtime resume 在通用 open-tail repair 前扫描 parent lineage，幂等补 `delegation/completed` 和对应 `tool/result`。
- **决定**：child terminal seq 作为 parent event data 的证据，不跨 Journal 伪造 `sourceEventSeqs`；只有完整验证、非 browse-only/corrupt 的 child Journal，且 parent 已有匹配 `invocationId + parentCallId + presetId` 请求时才补链，缺失 parent link 时不重跑 child。
- **验证**：terminal 已 durable、parent link 未写入的 crash fixture 在新 RuntimeHandle 上只补一次 link/result，不产生 `tool/recovery-outcome`；重复 resume 不重复提交。

### 步骤 5：资源静止

- **操作**：Provider 跟踪 active controllers/inflight invokes；dispose 停止 admission、级联 AbortSignal、等待 child terminal flush、child close 和 Scope dispose。
- **验证**：active child 在 Runtime shutdown 时进入 aborted terminal，activeCount 回到 0，parent terminal link 已写入。

## 遇到的问题

- **问题**：P11 需要真实 child AgentLoop，但单元测试不能依赖 Provider 或 Host。
  - **应对**：provider 通过 typed `ChildLoopFactory` 接收 P10 AgentLoop；测试注入确定性 loop，P12 Base Profile 负责真实组合。

## 后续集成边界

- crash-window 补链、重复 resume 和 cascade abort 已完成自动化故障注入；packaged 进程强杀仍由 P15 真实 Host 验收。
- Agent/Explore 已由 P12 组合到真实 AgentLoop/Session/Prompt seam；真实 Provider、Browser 与 packaged executor 验收仍属于外部门禁。
