# ActSpace 设置中心重构 - 执行摘要

## 当前结果

P0（v4 contract、v3→v4 migration、Settings Authority 和 typed IPC）、P1（Maka 式设置壳层和分组导航）、P2（统一模型页）、P3（通用、工具、子 Agent 和身份 Prompt）、P4（Maka 式 Usage 活动分析）与 P5（事件级活动投影和旧路由收口）已完成，P6 只剩真实 Electron、主题、重启和 Provider 的人工验收。

## 已完成交付

| 变更 | 影响文件 | 说明 |
| --- | --- | --- |
| Settings v4 shared contract | `packages/shared/src/settings.ts` | namespace、snapshot、局部 patch、revision 和冲突结果 |
| v4 fixed-renderer channels | `packages/shared/src/runtime-v2/fixed-renderer.ts` | get/update/change 三条新通道 |
| v3→v4 migration | `apps/desktop/src/main/settings-service.ts` | 保留旧输入、v3 backup/digest、幂等读取和 v4 写入 |
| typed Main IPC | `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts` | Main-only authority、revision conflict 和变更通知 |
| preload bridge | `apps/desktop/src/preload/index.ts`、`apps/desktop/src/global.d.ts` | renderer 可访问的 v4 API |
| migration tests | `apps/desktop/src/main/test/runtime-v2-settings-migration.test.ts` | 5 tests 覆盖迁移、备份、损坏、重启和 revision |
| Maka 式设置壳层 | `apps/desktop/src/renderer/components/settings/SettingsNav.tsx`、`SettingsPage.tsx` | 四组导航；Provider、Agent、快捷键改为内部 section；Usage 统一进入设置中心 |
| Usage 路由适配 | `apps/desktop/src/renderer/components/WorkbenchLayout.tsx` | Sidebar 的 Usage 入口进入 `settingsSection=usage`，Analysis 保持独立 |
| 统一模型页 | `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`、`ModelSettings.tsx`、`SettingsPage.tsx` | 连接、模型目录、任务绑定和媒体模型均在 Model route；联网搜索进入 Tools |
| 通用与 Agent 配置 | `apps/desktop/src/renderer/components/settings/SettingsPage.tsx` | 身份偏好、任务默认、Prompt 文件、Bash 审查、工具、搜索和子 Agent 路由按职责分散 |
| Maka 式 Usage 活动分析 | `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`、`apps/desktop/src/renderer/test/usage-statistics-page.test.tsx` | 汇总指标、Requests/Providers/Models/Tools/Pricing 五个 Tab；请求明细按需展开；页面偏好写入 localStorage，并在可用时同步 v4 activity namespace |
| Journal 事件级活动投影 | `packages/shared/src/ipc.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`apps/desktop/src/renderer/components/UsageStatisticsPage.tsx` | 以 request/tool invocation 为粒度重建活动行；保留 retry 独立记录、稳定 activity ID、状态筛选、延迟、Journal 水位和 costBasis；缺少 provider usage 时显示 unknown/unavailable |
| Usage 路由收口 | `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`、`apps/desktop/src/renderer/components/Sidebar.tsx`、`apps/desktop/src/renderer/components/settings/SettingsPage.tsx` | 独立 `view=usage` 入口收敛为 Settings → Usage；Analysis 路径保持独立；旧 `getUsageStatistics` IPC 作为显式兼容适配器保留 |

## 验证结果

- `pnpm --filter @actspace/shared build`：通过。
- `pnpm --filter @actspace/shared typecheck`：通过。
- `pnpm --filter @actspace/shared test`：通过，10 files / 62 tests。
- `pnpm --filter @actspace/desktop typecheck`：通过（renderer + Electron；离线刷新 workspace 依赖链接后复验）。
- `pnpm exec vitest run src/main/test/runtime-v2-settings-migration.test.ts`：通过，5 tests。
- `pnpm check:secrets`：通过。
- `pnpm check:docs`、`pnpm check:current-docs`：通过。
- `pnpm exec vitest run src/renderer/test/settings-page.test.tsx`：通过，22 tests。
- `pnpm check:frontend-theme`：通过。
- Provider/Model/OpenRouter 相关 renderer tests：14/14 通过。
- 设置、Provider/Model、模型选择和颜色语义 renderer tests：39/39 通过。
- 设置、Provider/Model、模型选择、颜色语义和 Usage renderer tests：44/44 通过。
- `pnpm exec tsc --noEmit -p apps/desktop/tsconfig.json`：通过（renderer typecheck）。
- `pnpm --filter @actspace/shared build`、`pnpm --filter @actspace/session-projection build`：通过，刷新 workspace 类型产物后完成 renderer 验证。
- fixed-renderer projection / projection IPC 定向测试：4/4 通过。
- `pnpm --filter @actspace/desktop build:renderer`：通过（Vite production bundle）。
- `pnpm --filter @actspace/desktop exec vitest run src/main/test/runtime-v2-fixed-renderer-projection.test.ts src/renderer/test/usage-statistics-page.test.tsx src/renderer/test/sidebar.test.tsx`：通过，3 files / 49 tests。
- `pnpm --filter @actspace/desktop exec vitest run`：通过，80 files / 529 tests。
- `pnpm typecheck`：通过（workspace contracts、packages、site、CLI、Desktop renderer/Electron）。
- `pnpm build`：通过（CLI、Desktop dependency closure、renderer、Electron/preload bundle）。
- `pnpm check:packages`：通过（33 workspace package manifests）。
- `git diff --check`：通过。

## 未完成门禁

- 本阶段没有启动真实 Electron 窗口，也没有做浅/深主题、重启窗口和真实 Provider 手工验收。
- 整份 Desktop Vitest 存在与本次 P0 无关的 Sidebar fixture 状态失败；P0 定向测试已单独通过。
- v4 IPC 已接入通用身份偏好、任务默认、工具和 Usage activity namespace；Provider/Model 专用组件仍通过兼容 IPC 运行，旧 `getUsageStatistics` IPC 作为明确兼容边界保留，后续可在确认外部消费者清零后删除。
