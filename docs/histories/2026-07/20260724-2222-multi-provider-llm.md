## [2026-07-24 22:22] | Task: 实现多供应商 LLM 与模型管理

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 按已经确认的设计规范和执行计划，完成 DeepSeek、Kimi、OpenRouter 多供应商、供应商级代理、模型管理和任务轻量模型选择能力。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、设计/现状/安全/可靠性/发布文档与 execution plan；实现完成，待用户统一手动验收。

**Key Actions:**

- **Plan 0-1**：建立三家供应商、provider-qualified `ModelKey`、purpose resolver、显式 provider runtime、OpenRouter OpenAI-compatible 适配和可复用的 Undici 供应商级代理。
- **Plan 2**：settings v1 原子迁移到 v2，生成一次性 backup；DeepSeek/Kimi/OpenRouter Key 统一由 `safeStorage` 加密，renderer 只见脱敏状态。
- **Plan 3**：实现 OpenRouter 目录缓存、精选默认模型、远端模型归一，以及模型添加、启用、停用、删除引用守卫。
- **Plan 4**：主会话、标题/摘要/compact、Explore、Kairos、context describe、eval candidate、usage/session preview 全部改为动态模型运行时。
- **Plan 5**：新增类型化 IPC/preload；设置页拆成「服务商」和「模型」，支持服务商级代理、任务模型选择、模型分组开关和 OpenRouter 目录弹窗；Composer 只消费真实可用候选。
- **验收修复**：`untested` 连接状态不再阻断已配置 Key；旧 ModelId 会规范化显示；新版空候选与旧 bridge 缺接口使用不同语义。
- **故障注入收口**：连接与目录明确区分 402 余额不足、404 模型不存在、429 和 5xx；目录缓存写入失败返回 `cache_write` 并保留旧缓存；补测半截原子写临时文件、在用模型删除引用和 stale 目录重试入口。
- **键盘可访问性**：服务商与 OpenRouter 目录弹窗新增 Tab 焦点环和关闭后焦点恢复；对应 renderer 回归锁定 Shift+Tab/Tab 环回与 Escape 恢复触发按钮。
- **手动验收交付**：新增 `manual-acceptance-checklist.md`，把真实 provider、代理隔离、utility/Explore/Kairos、三态主题、键盘、日志脱敏与进程清理拆成可勾选步骤。
- **计划状态收口**：完成度审计发现 Plan 2–5 子计划顶部仍残留“待执行”，已统一同步为 `2026-07-25` 完成；Plan 6 保持等待真实手动验收。
- **最终运行时审计**：DeepSeek/Kimi 余额查询改为显式 ProviderRuntimeConfig 并遵守供应商级代理；Kairos 设置从 `purpose=kairos` 可用模型中保存 provider-qualified ModelKey，删除旧静态 allowlist/env 工厂；设置页移除重复的静态模型区块和 Explore 下拉。
- **焦点竞态修复**：通用 Sheet 延迟自动聚焦仅在面板内尚无焦点时执行，避免覆盖用户/调用方已设置的焦点并导致首个 Tab 跳位。
- **服务商卡片视觉重构**：参考紧凑服务卡的信息层级，服务商页只展示已连接项并按官方直连/第三方兼容分组；新增页头统一「添加服务」选择器，卡片内部改为纵向事实面板，同时保留测试、编辑、断开、代理状态与键盘焦点恢复。
- **设置页布局微调**：服务商卡片改为桌面端两列、窄窗单列的紧凑网格；联网搜索服务保持独立横向列表，不复用 LLM 服务商卡片。
- **真实桌面证据**：v1→v2 与 backup 成功，DeepSeek/Kimi 连接测试成功，DeepSeek 固定探针完成；主会话/轻量候选、目录空态、浅深主题通过。用户要求停止启动项目并在最后统一完成其余手动验收。

### 🧠 Design Intent (Why)

模型身份必须同时表达供应商和上游模型 ID，才能避免不同供应商同名模型冲突。迁移采用并行新字段和 v1/v2 设置契约，避免一次放宽旧有限联合后把不受控字符串扩散到所有运行时消费者。可用性判断集中为纯函数，使主会话、utility、Explore、Kairos 和 UI 共用相同规则与失败原因。

### 📁 Files Modified

- `packages/shared/src/provider-config.ts`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/model-resolver.ts`
- `packages/shared/src/settings.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/test/model-config.test.ts`
- `packages/shared/src/test/model-resolver.test.ts`
- `packages/shared/src/test/settings.test.ts`
- `packages/agent-core/src/llm/provider-adapter.ts`
- `packages/agent-core/src/llm/provider-transport.ts`
- `packages/agent-core/src/llm/services/openai-completions.ts`
- `packages/agent-core/src/llm/services/anthropic-messages.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/llm/test/provider-adapter.test.ts`
- `packages/agent-core/src/llm/test/provider-transport.test.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/model-runtime-service.ts`
- `packages/desktop/src/main/model-store-service.ts`
- `packages/desktop/src/main/openrouter-catalog-service.ts`
- `packages/desktop/src/main/provider-balance-service.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/model-selection.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `packages/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `packages/desktop/src/renderer/components/settings/OpenRouterModelCatalogDialog.tsx`
- `packages/desktop/src/renderer/components/settings/ModelPurposeSelect.tsx`
- `packages/desktop/src/renderer/components/ui/Sheet.tsx`
- `packages/desktop/src/main/test/` 与 `packages/desktop/src/renderer/test/` 的多供应商回归
- `docs/exec-plans/active/20260724-multi-provider-llm/`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/ARCHITECTURE.md`、`docs/SECURITY.md`、`docs/RELIABILITY.md`
- `docs/releases/feature-release-notes.md`

### 🚧 Progress

- [x] Plan 0：共享 Provider、ModelKey 与 purpose resolver 契约。
- [x] Plan 1：Agent Core provider runtime、代理 transport 与 OpenRouter 协议接入。
- [x] Plan 2：Settings v2、密钥、供应商连接与迁移。
- [x] Plan 3：OpenRouter 目录与 installed model 管理。
- [x] Plan 4：运行时消费方迁移。
- [x] Plan 5：设置页、Composer 与模型目录 UI。
- [ ] Plan 6：离线故障注入与 Electron 基础验收完成；OpenRouter 代理、跨任务模型、跟随系统和完整键盘路径待用户统一手动验收。

### ✅ Latest Offline Verification

- `pnpm --filter @actspace/desktop test`：58 files，459 tests 通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/agent-core test`：99 files，826 tests 通过；删除 6 项旧 Kairos 静态 allowlist 测试后，动态路径由 desktop runtime/Kairos 测试覆盖；沙箱内 Unix socket 用例会触发 `EPERM`，在允许本地 socket 的隔离边界外重跑通过。
- `pnpm --filter @actspace/shared test`：6 files，53 tests 通过。
- `pnpm --filter @actspace/agent-core exec vitest run src/llm/test/convert.test.ts`：24 tests 通过。
- 供应商、目录与 settings 定向故障注入：44 tests 通过。
- renderer 服务商/模型交互：7 tests 通过，包含两个 modal 的焦点环与关闭后焦点恢复。
