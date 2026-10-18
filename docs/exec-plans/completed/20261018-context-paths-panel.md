# Context 面板「路径」卡片

## 目标

在右侧 Context 面板「会话统计」下方加一张「路径」卡片：始终显示当前压缩周期、活跃路径数 / 上限 100、睡眠路径数；两格统计兼当切换，下方路径列表默认收起，点小开关后才按版本分页读取。每条路径带「下次压缩」预判（待唤醒 / 将睡眠），预判由后端按引擎同一套选择规则算出，前端不复刻策略。

## 范围

- 包含：
  - `packages/shared`：`ContextPathEntry.nextCompaction`，以及路径排序 / 下次活跃集合的唯一实现（引擎与 Desktop 共用）。
  - `packages/context/engine`、`packages/context/disclosure`：改为调用 shared 的同一实现，行为不变。
  - `apps/desktop` main：`context-paths.ts` 填 `nextCompaction`。
  - renderer：`ContextPaths.tsx`、`context-paths-model.ts`、`use-context-paths.ts`，接入 `ContextPanel`；mock 路径数据与多页 / 延迟 / 失败场景。
  - 测试与文档（交接文档、右侧面板规范、前端验证场景表、history）。
- 不包含：搜索 / 筛选、手动唤醒或睡眠、Web / 远端接口、存储重构、Electron / Computer Use 验收（按交接文档 P1–P8 另行执行）。

## 背景

- 相关文档：[交接文档](../../design-docs/frontend/front-Context面板Step刷新与路径展示交接.md)、[07 决策记录](../../design-docs/上下文管理引擎设计/上下文管理引擎V2/07-Step增量更新与披露面板决策记录.md)、Demo `docs/design-docs/frontend/context-paths-demo.html`（2026-10-18 用户确认：方案 A、两格统计常显、仅列表默认收起、保留预判标签、标题「路径」）。
- 相关代码路径：`apps/desktop/src/main/runtime-v2/context-paths.ts`、`packages/context/disclosure/src/policy.ts`、`packages/context/engine/src/disclosure-contract.ts`、`apps/desktop/src/renderer/components/right-panel/context/`。
- 已知约束：路径列表不计入 Token；`revision` 只用 `view.disclosure.revision`；stale / cursor 错误先刷新面板再从首屏读取，不无界自动重试；查看 / 复制不触发读文件。

## 风险

- 风险：预判规则在两处实现会漂移。缓解：规则只在 shared 写一份，`selectActive` / `comparePaths` 改为调用它，并保留原有引擎测试。
- 风险：版本切换、乱序响应把旧页混进新版本。缓解：分页状态按 `(sessionId, revision, visibility)` 建键，响应核对 revision / visibility，按 id 去重，单测覆盖。

## 里程碑

1. shared 规则与 `nextCompaction` 字段；引擎、disclosure、Desktop main 接入；main 测试。
2. renderer 卡片、模型函数、分页 hook、mock；renderer 测试。
3. 文档、检查命令、浏览器 mock 截图核对；Electron 验收留给 P1–P8。

## 验证方式

- 命令：`pnpm --filter @actspace/shared build`、相关 package 测试、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm check:renderer-bridge`、`pnpm check:current-docs`。
- 手工检查：浏览器 mock 默认场景与 `?mock=context-pagination`，浅 / 深主题与窄面板。

## 进度记录

- [x] 里程碑 1：shared 规则、引擎 / disclosure 接入、main 预判与测试。
- [x] 里程碑 2：renderer 卡片、hook、mock 与测试。
- [x] 里程碑 3：检查命令、文档、浏览器 mock 截图；Electron 验收（交接文档 P1–P8）未执行。

结果见[执行摘要](../../exec-runs/20261018-context-paths-panel/execution-summary.md)。

## 决策记录

- 2026-10-18：预判字段放在后端响应里（`nextCompaction: "wake" | "sleep"`，不变时省略），表示「按当前读取记录，若现在压缩」的结果，不是承诺；规则来源与引擎 `selectActive` 同一函数。

## 执行模式

- **交互模式**。
