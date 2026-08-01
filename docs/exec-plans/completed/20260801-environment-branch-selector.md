# 2026-08-01 Environment 分支选择与创建（已完成）

## 目标

让用户从顶部 Environment 的当前分支行查看、搜索和切换本地分支，并从同一入口创建并 checkout 新分支；所有 Git 写操作继续由 Electron main 在已登记 workspace 内安全执行。

## 范围

- 包含：本地分支列表、名称搜索、当前分支标识、其他 worktree 占用状态、安全 `git switch`、创建并 checkout、状态刷新、键盘与窄窗口交互。
- 不包含：远端分支、fetch、pull、merge、rebase、删除或重命名分支、自动 stash、force switch。

## 背景

- 相关文档：`docs/design-docs/frontend/front-environment-and-git-actions.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-主题与配色规范.md`。
- 相关代码路径：`packages/shared/src/ipc.ts`、`packages/desktop/src/main/workspace-environment-service.ts`、`packages/desktop/src/renderer/components/workspace/WorkspaceChromeControls.tsx`。
- 已知约束：renderer 只发送 workspace intent；main 每次重新校验 workspace；使用固定 Git argv；现有工作区有无关未提交改动，必须原样保留。

## 风险

- 风险：未提交改动与目标分支冲突，或目标分支已被其他 worktree checkout。
- 缓解方式：不使用强制参数或自动 stash；main 校验本地分支与 worktree 占用状态，失败时保留当前 checkout 并返回脱敏 Git 错误。
- 风险：二级分支面板在窄窗口越界或与 Environment 争抢空间。
- 缓解方式：使用 portal + viewport collision positioning；列表限定高度并滚动，保持 focus restore 与 Escape 关闭。

## 里程碑

1. 扩展共享契约、Environment snapshot 和主进程分支切换 mutation。
2. 实现分支搜索面板与 Create and checkout branch 弹窗。
3. 补充自动化测试、文档、history，并完成浏览器与 Electron 验证。

## 验证方式

- 命令：`pnpm --filter @actspace/shared build`、desktop 定向 Vitest、desktop typecheck、`pnpm build`、`pnpm check:frontend-theme`、`pnpm check:docs`、`git diff --check`。
- 手工检查：浅色和深色下打开 Environment，搜索/切换分支，创建新分支，检查 480px 与桌面宽度定位。
- 观测检查：mutation 成功后 Environment、Composer Review summary 和已打开 Review 使用刷新后的真实状态。

## 进度记录

- [x] 2026-08-01：确认本地分支范围、ActSpace 前缀和安全失败策略。
- [x] 2026-08-01：完成共享契约与 main/preload 实现。
- [x] 2026-08-01：完成 renderer 交互和 27 条定向自动化测试。
- [x] 2026-08-01：完成设计文档、history、desktop 全测试、全仓 build、主题/文档/仓库检查与 Electron 部分验收。

## 完成状态

- `@actspace/desktop` 全量测试通过：90 个测试文件、710 条用例。
- `pnpm build`、根级 `pnpm typecheck`、`pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:repo` 和 `git diff --check` 在本功能完成快照通过。
- 真实 Electron 发现开发态 renderer/main snapshot 版本错配会使分支列表白屏；已增加当前分支回退并用第 27 条定向测试锁定。
- 最新 main/preload runtime 已在 5174 加载；后续完整浅/深主题视觉操作被并发的 Composer 图片附件代码 `imagesUnsupported is not defined` 中断。该错误不属于本计划，保留给对应 active plan 处理。

## 决策记录

- 2026-08-01：只展示本地分支；远端分支不自动 fetch，也不混入列表。
- 2026-08-01：其他 worktree 已 checkout 的分支显示但禁用；当前 workspace 分支保持可选中状态。
- 2026-08-01：切换失败不自动 stash、不 force、不丢弃改动，直接反馈可恢复错误。
- 2026-08-01：视觉结构参考 Codex 截图，但继续使用 ActSpace Ink & Emerald 语义 token，默认创建前缀保留 `actspace/`。
