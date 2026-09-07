## [2026-08-30 19:33] | Task: 整理设置中心重构设计规范

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户确认参考 Maka 彻底重构 ActSpace 设置中心，并要求将确认后的设计整理为放入 `docs/design-docs/` 的正式规范。明确删除顶层“服务商”和“智能体”，合并模型配置流程，增加通用身份设置，重做 Usage，并保留分析观测。

### 🛠 Changes Overview

**Scope:** 前端设计文档和仓库文档索引，不修改业务代码。

**Key Actions:**

- **新增当前规范**：创建 `front-设置中心重构规范.md`，固定新的信息架构、页面职责、交互状态、模型对象边界、Usage 数据目标契约、安全边界、持久化存储所有权和验收标准。
- **标记旧基线**：在 `front-设置页规范.md` 顶部注明其仅用于迁移追溯，避免与新设计并列为当前事实。
- **更新入口**：在前端设计文档 README 中将重构规范列为当前设置中心事实来源。

### 🧠 Design Intent (Why)

把 Maka 中真正可迁移的机制固定下来，而不是复制表面样式：按心智模型分组导航，使用开放式设置行，使用列表到详情的模型连接路由，按风险区分保存方式，并将 Usage 组织为“汇总到明细到原始会话”的活动分析。存储上吸收 Maka 的所有权分层和 DeepSeek Harness 的 namespace、schema、revision 思路，但保留 ActSpace 的 main-only 凭据、Prompt 文件和 Journal 单一事实源，避免 UI 重构造成数据或安全回归。

### 📁 Files Modified

- `docs/design-docs/frontend/front-设置中心重构规范.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/frontend/README.md`
- `docs/histories/2026-08/20260830-1933-settings-center-redesign-spec.md`

## [2026-08-30] | Task: 收口设置中心持久化规范

### 📥 User Query

> 用户同意设置中心持久化方案，要求同步更新相应设计规范。

### 🛠 Changes Overview

- 将设置中心规范中的 v4 目标结构与当前 v3 / `AppSettingsV2` 兼容视图分开描述。
- 统一 `general`、`models`、`tools`、`media`、`skills`、`subagents`、`activity.usage` 的逻辑 namespace。
- 移除尚未有稳定运行时语义的 `permissionMode`、`thinkingLevel` 目标字段。
- 在核心存储和 Token Usage 专题中补充页面偏好、Journal 事实、凭据、Prompt、localStorage 和未来派生 read model 的边界。

### 🧠 Design Intent (Why)

避免设置页面重构后出现多个互相冲突的“事实来源”：当前实现继续兼容 v3，目标设计提前固定 v4 的所有权边界；Usage 的筛选偏好可以持久化，但模型请求事实仍只能从 Session Journal 重建。

### 📁 Files Modified

- `docs/design-docs/frontend/front-设置中心重构规范.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/collaboration/agent-members.md`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/histories/2026-08/20260830-1933-settings-center-redesign-spec.md`

## [2026-08-30] | Task: 生成设置中心重构执行计划

### 📥 User Query

> 用户确认设置中心与持久化设计，要求开始生成设置页面重构功能的执行计划。

### 🛠 Changes Overview

- 新增 `docs/exec-plans/active/20260830-actspace-settings-center-refactor/README.md`。
- 将执行计划登记到 `docs/exec-plans/README.md` 的当前进行中列表。
- 冻结 P0-P6 的阶段边界、数据契约、迁移与回退策略、测试矩阵以及 Electron 人工验收门禁。

### 🧠 Design Intent (Why)

把已经确认的 Maka 风格设置中心、统一模型页面、分散 Agent 配置、Usage 活动分析和 v4 持久化边界转换为可逐阶段执行的计划。P0 先建立可回退的 Settings Authority，P1-P4 分阶段迁移用户界面与行为，P5 才清理兼容路径，P6 明确自动化验证与真实宿主验收的边界，避免一次性重构造成数据或运行时回归。

### 📁 Files Modified

- `docs/exec-plans/active/20260830-actspace-settings-center-refactor/README.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-08/20260830-1933-settings-center-redesign-spec.md`

## [2026-08-30] | Task: 执行设置中心重构 P0

### 📥 User Query

> 用户要求开始执行已确认的设置页面重构执行计划。

### 🛠 Changes Overview

- 新增 `SettingsV4` shared contract、namespace patch、revision 和冲突结果类型。
- 将 SettingsService 的物理写入切换为 v4 namespace，保留 v1/v2/v3 迁移输入和 `settings.v3.backup.json` + digest。
- 新增 `settings:get-v4`、`settings:update-v4`、`settings:changed-v4` typed IPC 和 preload bridge。
- 增加 P0 迁移、重启恢复、revision 冲突与脱敏测试，并创建执行过程/摘要文档。

### 🧠 Design Intent (Why)

先建立一个可回退的 Settings Authority，再迁移页面。v4 的逻辑 namespace 让新 UI 可以局部提交；单文件原子写入、Main-only secrets、Prompt 独立文件和旧兼容投影仍然保留，避免 P1-P5 的界面变化直接影响 Agent 运行和用户历史数据。

### 📁 Files Modified

- `packages/shared/src/settings.ts`
- `packages/shared/src/runtime-v2/fixed-renderer.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- `apps/desktop/src/main/test/runtime-v2-settings-migration.test.ts`
- `docs/design-docs/frontend/front-设置中心重构规范.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/exec-runs/20260830-actspace-settings-center-refactor/execution-process.md`
- `docs/exec-runs/20260830-actspace-settings-center-refactor/execution-summary.md`

## [2026-08-30] | Task: 执行设置中心重构 P1

### 🛠 Changes Overview

- 将设置导航重构为“偏好 / 能力 / 活动 / 系统”四组，移除“服务商”“智能体”“快捷键”顶层入口。
- 将旧 Provider、快捷键、Usage 和 Agent 内容挂入新的 Model、General、Usage、子 Agent section，保留兼容适配，避免功能入口在过渡期消失。
- 将 Workbench 的 Usage 入口统一路由到设置中心，Analysis 仍保留独立页面和状态。
- 为分组导航、合并路由和过渡边界补充测试与执行记录。

### ✅ Verification

- `pnpm exec vitest run src/renderer/test/settings-page.test.tsx`：22/22 通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:current-docs`、`git diff --check`：通过。

### ⚠️ Remaining Boundary

P1 只完成设置壳层和路由迁移；统一模型详情流、身份 Prompt、工具/子 Agent 数据接线、Usage 活动分析和 v4 renderer 读写仍由 P2-P5 完成。整份 Desktop Vitest 的既有 Sidebar fixture 失败未纳入本阶段范围。

## [2026-08-30] | Task: 执行设置中心重构 P2

### 🛠 Changes Overview

- 在同一个“模型”路由中串联“模型连接”和“模型目录与任务绑定”，Provider 不再作为用户可见的顶层分类。
- 图片生成、图片分析继续归入模型能力；联网搜索服务移入工具页面，避免把搜索凭据与 LLM 连接混在一起。
- 保留现有 Provider 连接测试、余额、代理、额外凭据和 OpenRouter 目录流程，并使用稳定的 provider-qualified `ModelKey`。

### ✅ Verification

- `pnpm exec vitest run src/renderer/test/settings-page.test.tsx`：22/22 通过。
- Provider/Model/OpenRouter renderer tests：14/14 通过。
- `pnpm --filter @actspace/desktop typecheck`、`pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:current-docs`、`git diff --check`：通过。

### ⚠️ Remaining Boundary

P2 沿用旧兼容 `AppSettings` 读写；身份设置、Agent 参数按页面职责分散、v4 renderer 局部 patch 和 Usage 活动分析仍待 P3-P5。连接删除的历史保留语义由既有 ModelStoreService 继续负责。

## [2026-08-30] | Task: 执行设置中心重构 P3

### 🛠 Changes Overview

- 通用页新增显示名称、回复风格偏好、温度和最大输出 Token，并通过 v4 `general` namespace 局部提交。
- 系统提示词编辑归入通用页；工具页承载 Bash 自动审查、工具开关和联网搜索；子 Agent 页改为 Explore 路由摘要。
- 旧兼容环境继续可运行，拥有 v4 bridge 时优先使用 revision-aware 局部 patch；Prompt 正文和凭据安全边界保持不变。

### ✅ Verification

- 设置、Provider/Model、模型选择和颜色语义 renderer tests：39/39 通过。
- `pnpm --filter @actspace/client build`、`pnpm --filter @actspace/desktop typecheck`、`pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:current-docs`、`git diff --check`：通过。

### ⚠️ Remaining Boundary

P3 尚未重做 Usage 活动分析，也未将所有 Provider/Model 专用 mutation 切换为 v4 namespace；这些由 P4/P5 继续完成。Electron packaged、浅深主题人工截图和真实 Provider 验收仍未执行。

## [2026-08-30] | Task: 执行设置中心重构 P4

### 🛠 Changes Overview

- 将 Usage 首屏重做为 Maka 风格的活动分析：汇总指标、Requests、Providers、Models、Tools、Pricing 五个 Tab。
- 移除热力图、2D、3D、Share 和日报堆叠；请求明细改为按需展开，并明确当前数据按 Agent Run 聚合，不等同于单次 LLM call。
- 将 Usage 查看偏好（时间范围、活动 Tab、模型筛选、明细展开）写入 renderer `localStorage`，在 v4 bridge 可用时同步到 `activity.usage` namespace；不写 Usage sidecar，不改变 Journal 事实。
- SettingsPage 将 v4 activity snapshot 和局部更新桥传入 Usage；保留旧 Usage snapshot / range IPC 作为兼容取数入口。

### ✅ Verification

- Shared 与 Session Projection 依赖包 build 通过。
- renderer typecheck 通过。
- 设置、Provider/Model、模型选择、颜色语义和 Usage renderer tests：44/44 通过。
- `git diff --check`、主题与文档门禁在本轮文档更新后继续执行。

### ⚠️ Remaining Boundary

P5 仍需补齐事件级 request/tool activity projection，并清理无消费者的旧 route / IPC。Electron 真实窗口、浅深主题人工截图、重启恢复和真实 Provider 验收仍未执行；本轮 Electron 子 typecheck 受工作树既有未声明的 `@actspace/session-projection` 依赖阻断，未扩大范围修改该边界。

## [2026-08-31] | Task: 执行设置中心重构 P5

### 🛠 Changes Overview

- 新增 `UsageActivitySnapshot`、`UsageActivityRow`、状态/成本依据/Token 明细和 Session Journal 水位契约。
- fixed-renderer 从 `request/header`、`request/context`、`assistant/message`、`step/end`、`llm/retry`、`llm/retry-started`、`tool/call` 和 Tool terminal 事件重建真实 request / tool invocation 活动；每次 retry 保留独立记录并建立 successor 链。
- Usage 页面优先使用事件级活动表格，成本缺失或来源不完整时显示 unknown / unavailable；旧 `UsageStatisticsSnapshot` 与 `getUsageStatistics` IPC 继续作为显式兼容适配器。
- Sidebar 的 Usage 入口完成从独立 `view=usage` 到 Settings → Usage 的统一路由收口；Analysis 页面保持独立。
- 同步设置中心、存储与可观测性、Token Usage、多供应商 LLM、执行计划和执行摘要文档。

### ✅ Verification

- `pnpm --filter @actspace/shared build`、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop build:renderer`：通过。
- P5 定向 projection / Usage / Sidebar 测试：3 files / 49 tests 通过；覆盖 retry 独立行、工具调用、未知成本、状态映射、状态筛选和冷启动重建一致性。
- 完整 Desktop Vitest：80 files / 529 tests 通过。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:current-docs`、`pnpm check:secrets`、`git diff --check`：通过。

### ⚠️ Remaining Boundary

P6 仍需在真实 Electron 窗口中验收 preload、v4 持久化、重启恢复、浅/深主题、窄窗布局、Analysis 独立入口和可选真实 Provider。根目录 `pnpm typecheck` / `pnpm build`、`check:packages` 与完整 Desktop Vitest 已通过；本轮未提交或清理工作区中与本计划无关的 dirty changes。
