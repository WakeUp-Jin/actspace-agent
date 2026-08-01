## [2026-08-01 21:17] | Task: Make Committed show Git history

### Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop workspace

### User Query

> Review 的 `Committed` 应显示提交日志，而不是呈现为提交或手工输入 commit ref 的操作。

### Changes Overview

**Scope:** `@actspace/shared`, Desktop main / preload / renderer, Review tests and design docs.

**Key Actions:**

- 新增结构化 recent-commit 契约与 `review:list-commits` IPC，由 main 进程读取当前 `HEAD` 最近 50 条提交。
- workspace 是仓库子目录时，commit log 使用同一 workspace pathspec，避免显示只影响 sibling 目录的提交。
- `Committed` 子视图改为 subject + 相对时间的历史列表，移除自由输入 SHA/ref 的表单。
- 点击日志项继续复用既有只读 parent → commit diff，不改变右上角 `Commit or push` mutation。
- 增加 main 与 renderer 回归，覆盖子目录过滤、日志展示和选择 commit diff。

### Design Intent

`Committed` 属于 Review scope，负责浏览已经发生的提交；`Commit or push` 才负责改变仓库状态。把查询与 mutation 在信息架构和 IPC 上分开，可以避免用户把历史入口误解为提交按钮，同时维持 main-owned Git 边界。

### Verification

- `@actspace/shared` build 与 Review Git Engine / renderer 定向测试通过，共 16 个定向测试。
- Desktop 完整测试通过：90 个测试文件、718 个测试。
- `pnpm typecheck`、`pnpm build`、`pnpm check:frontend-theme`、`pnpm check:docs` 和 `git diff --check` 通过。
- 当前 workspace 的 Electron dev runtime 已确认正常运行；Computer Use 打开 Review 后读取大 diff 的可访问性树持续超时，因此 `Committed` 实机菜单视觉与点击验收仍由用户确认，不把自动化测试冒充实机验收。

本次改动范围窄，主要是补全既有 Review scope 的查询 UI，没有同时命中学习文档所需的多项标准，因此不新增 learning。
