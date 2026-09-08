# ActSpace 设置中心重构 - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260830-actspace-settings-center-refactor/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-30
- **当前状态**：P0、P1、P2、P3、P4、P5 已完成；P6 待人工验收与交付收口

## 执行时间线

### 步骤 1：冻结并实现 v4 shared contract

- **操作**：新增 `SettingsV4`、namespace、局部 patch、revision、snapshot、变更通知和 revision conflict result 类型。
- **决定**：`AppSettingsV2` 继续作为旧 Renderer 兼容视图；新设置页面只能使用 v4 typed IPC，不直接写完整设置文件。
- **验证**：Shared typecheck、build 和 62 项 shared tests 通过。

### 步骤 2：切换 SettingsService 到 v4 物理写入

- **操作**：实现 v3→v4 逻辑 namespace 映射；保留 v1/v2/v3 读取兼容；增加 `settings.v3.backup.json` 与 sha256 digest；v4 读取时恢复 v4 metadata。
- **决定**：继续使用单个 `settings.json`、Main mutation queue 和 temp file + rename；namespace 是逻辑所有权边界，不拆分物理文件。
- **安全边界**：凭据仍只在 Main / `secrets.json`，v4 snapshot 只携带连接状态、credentialId 和非敏感配置；Prompt 正文仍单独存储。
- **验证**：v2/v3 migration、备份冲突、损坏文件、重启恢复、revision 冲突和脱敏断言通过。

### 步骤 3：贯通 fixed-renderer typed IPC

- **操作**：新增 `settings:get-v4`、`settings:update-v4` 和 `settings:changed-v4`；preload 与 `global.d.ts` 暴露 v4 API；Main 成功提交后推送 namespace change notification。
- **决定**：revision 冲突通过结构化 `{ ok: false, code: "revision_conflict", latest }` 返回，不让 Electron 序列化错误对象时丢失最新快照。
- **验证**：Desktop Electron/Main typecheck 通过；固定迁移测试通过。

### 步骤 4：切换 Maka 式设置壳层与分组导航

- **操作**：将设置导航收敛为“偏好 / 能力 / 活动 / 系统”四组；删除 Provider、Agent、Shortcut 顶层入口；把旧 Provider、快捷键、Usage 和 Agent 内容挂入新的 Model、General、Usage、Sub Agent section；Sidebar 的 Usage 动作统一进入 `view=settings` + `settingsSection=usage`。
- **决定**：P1 只改变用户可见的信息架构和路由，不在适配阶段重写模型、身份或 Usage 业务逻辑；Analysis 继续使用原有独立工作区和状态。
- **兼容边界**：旧 `AppSettings` 兼容桥仍供 P1 组件使用；P2-P4 完成后再切换新页面到 v4 namespace IPC。
- **验证**：设置页定向测试 22/22 通过；Desktop typecheck、`check:frontend-theme`、`check:docs`、`check:current-docs` 和 `git diff --check` 通过。

### 步骤 5：统一模型页并移动搜索能力

- **操作**：将 Provider 内部区域命名为“模型连接”，将模型目录和任务绑定命名为“模型目录与任务绑定”，保持两者在同一个“模型”路由；图片生成/图片分析留在模型页，联网搜索凭据移动到“工具”路由。
- **决定**：继续复用现有 Provider / Model / OpenRouter 组件和 provider-qualified `ModelKey`，不在 P2 重写真实凭据与目录协议；连接 ID 的 v4 归属由 SettingsService 统一生成。
- **验证**：`settings-page.test.tsx` 22/22、Provider/Model/OpenRouter 相关测试 14/14、`model-selection.test.ts` 2/2 通过；Desktop typecheck 通过。

### 步骤 6：分散 Agent 配置并接入身份偏好

- **操作**：通用页加入显示名称、回复风格偏好、温度和最大输出 Token；系统提示词文件归入通用；工具页承载 Bash 自动审查、工具开关和联网搜索；子 Agent 页只展示 Explore 路由摘要，模型绑定回到模型页。
- **决定**：身份与任务默认值通过 `settings:update-v4` 的 `general` namespace 局部提交，工具开关与 Bash 审查通过 `tools` namespace 提交；缺少 v4 bridge 的旧测试/预览环境继续走兼容 `AppSettings` 更新。
- **安全边界**：身份偏好只作为非敏感 settings metadata；系统提示词正文仍由 main 进程单独读写，不进入 renderer snapshot 或 Journal。
- **验证**：设置页 23/23、Provider/Model/OpenRouter/Model selection/颜色语义相关 renderer tests 合计 39/39 通过；Desktop typecheck、主题和文档门禁通过。

### 步骤 7：重做 Maka 式 Usage 活动分析

- **操作**：将 Usage 首屏替换为“汇总指标 + 请求 / 服务商 / 模型 / 工具 / 定价”五个 Tab；移除热力图、2D、3D、Share 和日报堆叠；请求明细改为按需展开，并保留 Session 回链信息。
- **决定**：当前数据源仍是 Session Journal 的 Agent Run 聚合投影，因此页面明确标注“当前投影按 Agent Run 聚合，不等同于单次 LLM call”；事件级 request/tool row 留给 P5。
- **持久化**：`activity.usage` 只保存时间范围、Tab、模型筛选和明细展开偏好；优先通过 v4 `activity` namespace 局部提交，同时保留 renderer `localStorage` 作为页面偏好缓存。Usage 事实、Session 和 Journal 不因筛选变化而写入副本。
- **验证**：Desktop renderer + Electron typecheck 通过，Vite production renderer build 通过；设置、模型、颜色语义和 Usage 定向测试合计 44/44 通过；fixed-renderer projection / projection IPC 定向测试 4/4 通过；shared 与 session-projection 依赖包重新 build 通过。

### 步骤 8：接入事件级 Usage 活动投影并收口旧路由

- **操作**：新增 `UsageActivitySnapshot`、request/tool activity row、稳定 activity ID、retry 链、Journal 水位和成本依据；fixed-renderer 从 `request/header`、`request/context`、`assistant/message`、`step/end`、retry 与 Tool terminal 事件重建活动明细。Usage 页面优先展示事件级表格，旧 `UsageStatisticsSnapshot` 继续作为兼容回退。
- **决定**：`assistant/message` 优先作为 LLM 终态，`step/end` 仅在缺少 assistant terminal 时回退；每次 retry 保持独立 request 行。Provider usage、currency 或价格来源不完整时显示 `unknown` / `unavailable`，不按默认值生成账单。
- **路由收口**：Sidebar 不再暴露独立 `view=usage`，Usage 入口统一进入 Settings → Usage；顶层 `providers`、`agent`、`shortcuts` section 仍只保留历史兼容字段，不再作为用户导航。`getUsageStatistics` IPC 暂保留为显式兼容适配器。
- **验证**：新增 projection、Usage renderer、Sidebar 定向测试覆盖 retry 独立行、工具调用、未知成本、状态映射、状态筛选和冷启动重建一致性；最新定向测试 3 files / 49 tests、完整 Desktop Vitest 80 files / 529 tests 通过。`pnpm typecheck`、`pnpm build`、`pnpm check:packages`、主题/文档/安全检查和 `git diff --check` 均通过。

## 遇到的问题

- **问题**：共享包的 `dist` 先于源码被 Desktop typecheck 解析。
  - **原因**：Desktop 的类型配置通过 workspace package exports 读取 `@actspace/shared/dist`。
  - **应对**：先执行 `pnpm --filter @actspace/shared build`，再运行 Desktop typecheck；未修改构建配置。
- **问题**：整份 Desktop Vitest 会触发一个工作区已有的 Sidebar fixture 状态失败。
  - **原因**：无关的既有测试将 `s-harness-1` 与 `s-actspace-1` 的顺序假设混在同一文件状态中。
  - **应对**：P0 使用 `pnpm exec vitest run src/main/test/runtime-v2-settings-migration.test.ts` 单独验证；未扩大范围修改 Sidebar 或其 fixture。

## 尚未执行

- P6 Electron 真实窗口、主题、重启和真实 Provider 人工验收。
- 已通过离线刷新 workspace 依赖链接重新验证 Electron 主进程 typecheck；未修改该依赖边界。
