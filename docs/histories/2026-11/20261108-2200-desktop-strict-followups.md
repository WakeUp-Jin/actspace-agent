## [2026-11-08 22:00] | Task: desktop strict 收尾：models 补丁类型与轨迹 fixture 契约对齐

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `Claude Fable 5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> desktop 开 strict 的 PR 已合并，上一轮列出的三个可选后续（trajectory fixture 的 `time: null`、基线上失败的测试、`removeKeysPatch` 的 `as unknown as`）都可以做。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`apps/desktop`（main、renderer fixture）

**Key Actions:**

- **models 补丁显式类型**：`@actspace/shared` 新增 `SettingsV4ModelsPatch`，`connections` 和 `definitions / installed / overrides` 三张表的值允许 `null`（合并时表示删除），`taskBindings` 为 `Partial`。`SettingsV4NamespacePatch` 的 `models` 分支改用它。
  - `applyRecordPatch` 的 patch 参数接受 `T | null | undefined`，`undefined` 跳过。
  - `model-connections-service.ts`、`settings/service.ts`、`settings/facades/model-connections.ts` 的 `Partial<SettingsV4Models>` 改为 `SettingsV4ModelsPatch`；`removeKeysPatch` 的四处 `as unknown as`、删连接时的 `null as unknown as SettingsV4ConnectionSettings`、`updateModel` 的 `as SettingsV4Models["overrides"]`、`general.ts` 的 `as Partial<SettingsV4Models>` 全部删掉。
- **轨迹 fixture 契约对齐**：`trajectory-complete.json` 里 `assistant-5-1` 的 `time: null` 改为合法时间戳（落在 step 结束之前），说明文字改为「没有首 token 和 token 统计」；`fixtures.ts` 的 `longFixture` 删掉上一轮为兼容 null 加的分支。真实节点的 `time` 一律来自事件信封，不可能为 null；这条消息的 ttft / 生成耗时为空来自没有 `firstTokenAt` 和 chunk，不依赖 `time`。
- **基线失败测试**：重跑 desktop 全量测试 2897 通过、0 失败。上一轮看到的 8 个失败是 VM 同时跑 typecheck 时的负载超时，加上 `turn-tail` 的文案断言已在 main 上修正；没有需要改的测试。

### 🧠 Design Intent (Why)

- 「null = 删除」是 `applySettingsV4NamespacePatch` 一直有的运行时语义，之前只能靠断言绕过类型；把它写进补丁类型后，调用方和合并逻辑说的是同一件事，strict 也能真正检查这些路径。
- fixture 应当符合契约类型，否则 strict 对这类数据的检查形同虚设；保留演示语义（旧消息缺少 token 统计）只需去掉 chunk / `firstTokenAt`，不需要违反类型。

### 📁 Files Modified

- `packages/util/shared/src/settings.ts`
- `apps/desktop/src/main/model-connections-service.ts`
- `apps/desktop/src/main/settings/service.ts`、`settings/facades/general.ts`、`settings/facades/model-connections.ts`
- `apps/desktop/src/renderer/fixtures/trajectory-complete.json`、`apps/desktop/src/renderer/trajectory/fixtures.ts`
