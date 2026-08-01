# Plan 1：Git Review Engine 与 Actions

> 状态：已完成（2026-07-30）。

## 目标

实现六种 scope 的可靠 Git 查询、summary-first/按文件加载、路径与大 diff 安全边界，以及 section/file/hunk mutation、Commit/Push/Create PR。向 plan-0 Coordinator 提供真实 Git provider。

## 依赖与 ownership

- 依赖 plan-0 的 shared contract 和 provider interfaces。
- owns desktop main Git query、mutation、PR capability 与对应测试。
- 不修改 renderer 组件。

## 文件范围

- `packages/desktop/src/main/review-git-engine.ts`（新增）
- `packages/desktop/src/main/review-git-service.ts`（改为兼容 facade）
- `packages/desktop/src/main/review-pr-service.ts`（新增）
- `packages/desktop/src/main/workspace-environment-service.ts`
- `packages/desktop/src/main/workspace-fs-service.ts`
- `packages/desktop/src/main/test/review-git-engine.test.ts`（新增）
- `packages/desktop/src/main/test/review-pr-service.test.ts`（新增）
- `packages/desktop/src/main/test/workspace-environment-service.test.ts`

## Task 1.1：统一 Git runner 与 workspace guard

- 抽出 timeout、stdout/stderr cap、error sanitization、NUL output helpers。
- 每次入口调用 `resolveRegisteredWorkspaceSelection` 或 session workspace resolver。
- 同时解析 `workspaceRoot`、`repoRoot`、`gitCommonDir` 和 workspace-relative pathspec。
- path 字段不 `.trim()`；untracked 内容读取前使用 `realpath`，symlink 不跟随到 workspace 外。

测试覆盖：不存在目录、未注册路径、repo 子目录、worktree、中文/空格/双引号文件名、symlink escape、Git missing/timeout。

## Task 1.2：summary-first 六种 scope

实现：

- `lastTurn`：消费 plan-0 selector/provider adapter，只表示指定 turn 的工具 diff。
- `uncommitted`：HEAD/empty-tree 到 working tree，包含 staged、unstaged、untracked。
- `unstaged`：index 到 working tree。
- `staged`：HEAD/empty-tree 到 index。
- `commit`：校验 commit object 后比较 parent/root empty tree。
- `branch`：列出带 upstream 的本地分支，重新解析 `<branch>@{upstream}`，比较 merge-base(upstream, local)..local，并返回 `local → upstream` metadata。

打开 Review 或 Refresh 不自动 fetch；remote-tracking ref 使用本机已有状态。behind/diverged 通过 warning 表达，不把 upstream 独有提交混入本地 Diff。

文件 identity/status/numstat 使用 NUL-delimited Git 输出，不从 patch header 推断 path。summary 返回 capability matrix、baseline/target 和 warnings，不返回全仓 raw patch。

测试覆盖同一文件 staged+unstaged、root commit、rename/delete/copy/type change、binary/image、invalid commit、invalid branch、detached HEAD、no HEAD。

## Task 1.3：单文件结构化 diff

- 以 snapshot 中已知 file id/path 作为 pathspec 查询单文件 patch。
- parser 输出 `ReviewHunk[] / ReviewLine[]`，计算 old/new line 和 stable hunk id。
- 实现 word diff；行内高亮只比较相邻 deletion/addition block，设长度/复杂度上限。
- 支持 context expansion 和 load full file；full/patch 模式进入 Coordinator cache key，文件已变化时返回 stale。
- 支持为已加载 snapshot 生成 binary/full-index patch；包含 untracked、空 patch、Last Turn 或超限时拒绝 Copy git apply command。
- 1 MiB patch、2 MiB 单侧 full file、80 files/20k changed lines capped mode 全部返回显式状态。

测试覆盖 no-newline marker、CRLF、超长行、partial patch、binary、rename 和 invalid path。

## Task 1.4：stage / unstage / revert

- 实现 section/file/hunk patch extraction 和 fingerprint。
- unstaged → stage；staged → unstage；tracked working tree → revert。
- untracked file stage 使用 `git add -- path`。
- untracked revert 走 Electron trash adapter；测试中注入 fake trash，不永久删除 fixture。
- staged revert 的 index/working-tree 两步分别记录，第二步失败返回 `partialSuccess`。
- generation/fingerprint/capability 任一不匹配时拒绝执行。

测试在临时真实 repo 中断言 index、working tree、文件内容和 result steps，而不只检查返回字符串。

## Task 1.5：复用 Commit / Push 状态机

- Review toolbar 调用现有 `workspace-environment-service.ts`，不复制 Commit/Push 实现。
- 提交前重新读取 Git status；snapshot totals 只用于展示。
- mutation 完成后通知 Coordinator invalidation。
- 保持 commit succeeded / push failed 两阶段结果，不合并成通用失败。

## Task 1.6：Create PR

新增 main-owned PR service：

- 检测 `gh` CLI、GitHub remote、认证、head/base branch、ahead commits、已有 PR。
- 返回结构化 capability/disabled reason。
- 支持 title、body、draft、baseBranch 和 open-in-browser。
- 使用参数数组运行 `gh`，不拼 shell；自动化注入 runner，不访问网络。
- 创建前确认本地变更处理策略；如选择 include local changes，显式复用 Commit/Push workflow。

## 验证命令

```sh
pnpm --filter @actspace/desktop exec vitest run src/main/test/review-git-engine.test.ts
pnpm --filter @actspace/desktop test -- review-pr-service
pnpm --filter @actspace/desktop test -- workspace-environment-service
pnpm --filter @actspace/desktop typecheck
```

## 完成条件

- 六种 scope、按文件 diff 和 capability matrix 通过真实临时 Git repo 测试。
- 旧 quoted path `unknown`、repo 子目录、maxBuffer 失败和 symlink escape 有回归用例。
- stage/unstage/revert 验证真实 index/working tree 状态。
- Commit/Push/Create PR 具备真实 main service 和 mockable runner；无真实远端自动化调用。
