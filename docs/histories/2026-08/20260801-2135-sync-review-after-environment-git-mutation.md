## [2026-08-01 21:35] | Task: Sync Review after Environment Git mutations

### Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop workspace

### User Query

> Environment 提交成功并显示工作区已 clean 后，右侧 Review 的 `Uncommitted` 仍保留提交前的新增行统计。

### Changes Overview

**Scope:** Desktop main Git mutation orchestration, renderer Review summary subscription, Review regression test.

**Key Actions:**

- Environment 的 create branch、switch branch、commit 和 commit-and-push 完成后，由 main 进程统一失效对应 workspace 的 Review Coordinator generation。
- 复用既有 `review:changed` IPC 通知，让已打开的 Review Workbench 自动读取新 snapshot。
- App 订阅同一通知并刷新 Composer / Environment 共用的 Review summary，避免顶部 `Changes` 与真实 Git 状态不一致。
- commit 已创建但 push 失败、commit hook 失败并可能改变 index 等部分 mutation 也会触发失效；纯 Push 不刷新工作树 Review。
- 增加从 dirty snapshot 更新到 clean snapshot 的 renderer 回归测试。

### Design Intent

Git mutation 的事实发生在 main 进程，因此 Review 缓存失效也由 main 统一发布。Renderer 只消费 generation 变化，不再依赖某个按钮局部刷新或未被监听的 DOM 事件。

### Verification

- 新增 Review mutation invalidation 回归测试通过。
- Review Coordinator 定向测试 7/7 通过。
- Electron main TypeScript 检查通过。
- `git diff --check` 通过。
- 完整 renderer 类型检查及同文件完整测试被并行中的图片附件改动阻断：`Composer.tsx` 当前存在两处未定义的 `imagesUnsupported`，与本次修复无关。
- 未执行真实 Electron commit；用户可在 disposable workspace 中手动确认提交后 `+N/-N` 自动清零。
