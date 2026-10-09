## [2026-10-08 23:37] | Task: Review 自动更新的 CPU 优化

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: Claude Opus 5.5（Claude Code 主会话，未使用子智能体）。
- **Runtime**: Claude Code CLI，本地 main 工作区。

### 📥 User Query

> 资源测试确认 Review 文件监听没有大量内存问题，但有明显 CPU 开销。讨论后批准修订方案：摘要只响应自己的工作区、按 Git 语义过滤 ignored 变化、合并窗口改为 500ms。

### 🛠 Changes Overview

**Scope:** desktop（main + renderer）、docs。

- Renderer：Composer 顶部 Review 摘要从 `App.tsx` 拆到 `use-review-summary.ts`。只响应与自身快照 `workspaceId` 相同的通知，同一目标最多一个请求在途，刷新时保留已有摘要，内容不变时不更新界面。
- Main：watcher 把工作区文件的相对路径交给 coordinator；窗口结束时用 `git check-ignore -z --stdin` 核对，全部被忽略就不失效。Git 元数据、`.gitignore`、无文件名、超过 2,000 条路径或 Git 失败一律刷新。
- Coordinator 默认合并窗口从 150ms 改为 500ms（固定窗口，不顺延）；dispose 后过滤结果不再通知。
- 文档：`core-review-change-sources.md` 新增「外部变更自动刷新」；资源测试目录补修订方案、实施结果和对照数据。

### 🧠 Design Intent (Why)

资源测试确认，前台开销来自 ignored 构建产物触发的完整 Git 查询，后台开销来自摘要订阅不看工作区。两者都在事件源头或消费端拦截，不改监听生命周期和 IPC 契约。过滤按 Git 自己的规则判断，不写死目录名，以免漏掉 ignored 目录里被跟踪的文件；拿不准一律刷新，宁可多查一次也不显示过期内容。

方案中的 1b（Review 面板复用未变文件的 diff）没有实施：文件 fingerprint 不含内容，同样 +1/-1 的两次修改无法区分，复用会显示旧 diff。

### 📁 Files Modified

- `apps/desktop/src/main/{review-coordinator,review-workspace-watcher,review-ignore-filter}.ts`
- `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`、`apps/desktop/src/renderer/components/review/use-review-summary.ts`
- 测试：`src/main/test/{review-coordinator,review-workspace-watcher,review-ignore-filter}.test.ts`、`src/renderer/test/use-review-summary.test.tsx`
- `docs/design-docs/core-review-change-sources.md`、`docs/exec-runs/20261008-review-resource-test/`

### 验证与剩余门禁

- 组件对照（3 轮中位数，含 Git 子进程 CPU）：ignored 写入 20.18 → 3.68 CPU 秒，通知 124 → 0；已跟踪高频写入 19.89 → 9.98；普通保存持平，保存到快照中位数约 240ms → 590ms。详见 [实施结果](../../exec-runs/20261008-review-resource-test/optimization-results.md)。
- 完整 Desktop vitest 1694 通过、2 跳过；`session-ipc-budget` 一个用例在全量并行时超时一次，单独运行通过。typecheck、IPC channel、renderer bridge、前端 token/主题、构建依赖图检查通过。
- **未完成**：真实 Electron 复测。dev 应用 main 进程仍运行旧代码，需重启后复测后台切走场景和前台 ignored 写入，并复验 B03 外部改文件自动刷新。
- 命中「可迁移、陷阱、模式」，补充 [文件监听降噪：fail-open 的 Git 语义过滤](../../learnings/2026-10/20261008-fail-open-watch-filter.md)。
