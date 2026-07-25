## [2026-05-30 22:33] | Task: Kairos 配置文件内联编辑器 + 模型真来源迁到 preferences.json

### 🤖 Execution Context

- **Agent ID**: `5cdc1005-b9ef-4c1c-8573-3e46a3c3c90a`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> 看 Kairos 配置问题：哪些配置文件可手动改？参考 Cursor rule「正常展示、点击变可编辑框」放进设置页的智能体分区。
> 进一步：model 字段和开关字段前后端是不是唯一来源？如果是，就该所见即所得——改开关字段 Kairos 就停，改模型字段前端显示也变。
> 经核对确认：选 B（把模型真来源迁到 preferences.json，下拉改成写文件）+ enabled 接通级联。

### 🛠 Changes Overview

**Scope:** `@actspace/agent-core`、`@actspace/shared`、`@actspace/desktop`（main + renderer）、docs

**Key Actions:**

- **模型来源迁移**：`resolveKairosEnv()` 改为 `resolveKairosEnv(modelId)`（模型来自入参/`preferences.modelId`，不再读 `KAIROS_MODEL_ID` env），新增 `resolveKairosModelSpec` / `resolveKairosModelId`。`createKairosLlm(modelId)` / `createKairosToolManagerFactory({modelId})` / `resolveKairosThinkingEnabled(modelId)` 全部按入参解析。
- **快照口径修正**：`CreateKairosOptions` 新增 `modelId`（解析后真实 id），`getContextSnapshot().modelId` 改报真实模型，消灭原「死字段只显示 null」的偏差。
- **设置剥离**：`AppSettings.kairos` 移除 `modelId`（保留 `thinking`）；`SettingsService` 不再 seed/sanitize modelId，也不再写 `KAIROS_MODEL_ID`；`settings:update` 只在 thinking 变化时重建。
- **级联接线**：`kairos:write-config` 新增 `onPreferencesWritten` 回调（`setImmediate` 延后避免拆自身 handler）；main 端 `reconcileKairosAfterPreferences`——modelId 变→重建 controller；否则按 `enabled` 起/停。`ensureKairosController` 先读 `preferences.json` 取 modelId、维护 `currentKairosModelId`。
- **渲染层**：新增 `KairosSettings.tsx`——模型下拉读写 `preferences.json`（与 raw 卡片同源）+ 思考链下拉（settings）+ 4 张配置文件卡片（展示↔编辑、JSON 校验失败内联报错、桥缺失降级）。`AgentSection` 用它替换原内联 Kairos 组。
- **测试**：新增 `kairos-config-files.test.tsx`（6 例）；同步 env / controller / kairos-bootstrap / settings-service / settings-page / app-streaming mock。
- **文档**：更新 `设置页规范.md`、`kairos-autonomous-mode.md`、`.env.example`（标注 `KAIROS_MODEL_ID` 弃用）。

### 🧠 Design Intent (Why)

原来 Kairos 模型有两个互相打架的来源：设置页下拉写的 `KAIROS_MODEL_ID` env（真决定模型）和 `preferences.json.modelId`（死字段、只喂上下文显示且恒 null），导致「显示 ≠ 实际」。用户希望配置文件即真来源、所见即所得。于是把模型唯一来源收口到 `preferences.json`，下拉退化为该字段的友好编辑入口，上下文显示直接报解析后的真实模型；并把 `enabled` 接通——在编辑器里改文件保存后真的起/停 Kairos，与 Kairos 页按钮落同一字段、reload 后一致。重建副作用用 `setImmediate` 延后，避免在 invoke handler 内 dispose 自身 ipc handler。

### 📁 Files Modified

- `packages/agent-core/src/kairos/env.ts`
- `packages/agent-core/src/kairos/index.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/test/{env,controller}.test.ts`
- `packages/shared/src/{settings,kairos-contracts}.ts`
- `packages/desktop/src/main/{kairos-bootstrap,kairos-ipc,index,settings-service}.ts`
- `packages/desktop/src/main/test/{kairos-bootstrap,settings-service}.test.ts`
- `packages/desktop/src/renderer/components/settings/{KairosSettings,SettingsPage}.tsx`
- `packages/desktop/src/renderer/test/{kairos-config-files,settings-page,app-streaming-user-message}.test.tsx`
- `docs/design-docs/frontend/front-设置页规范.md`、`docs/design-docs/kairos/agent-kairos-autonomous-mode.md`、`.env.example`
- `docs/exec-plans/active/20260530-kairos-config-editor.md`
