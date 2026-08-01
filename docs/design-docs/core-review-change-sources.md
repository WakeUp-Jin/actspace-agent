# Git-first Review Workbench 设计规范

## 文档状态

- 状态：功能基线已完成；大 Diff 的加载调度、批量 Git、完整正文和虚拟渲染仍待按性能纠偏计划实施。disposable Git mutation 和真实远端操作仍由用户手动验收。
- 事实源：本文件定义 Review 的 scope、结构化 diff、工具栏、显示选项、Git actions、刷新和安全边界。
- 性能事实源：`docs/design-docs/core-review-large-diff-loading.md` 定义 Standard/capped 双模式、批量请求、完整正文和虚拟渲染边界。
- 产品边界：Review 是人工 Git 审阅工作台，不包含 AI Review、Review 专用模型、findings、独立审查任务或评论回注 Agent。
- 视觉关联：右侧对象系统见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`；布局见 `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`；颜色见 `docs/design-docs/frontend/front-主题与配色规范.md`。

## 当前实现映射（2026-07-30）

- 共享契约：`packages/shared/src/review.ts`。
- 查询、缓存与失效：`packages/desktop/src/main/review-coordinator.ts`。
- Git 查询与 mutation：`packages/desktop/src/main/review-git-engine.ts`。
- Last Turn：`packages/desktop/src/main/review-last-turn-service.ts`。
- PR capability：`packages/desktop/src/main/review-pr-service.ts`。
- Renderer：`packages/desktop/src/renderer/components/review/`。

## 定位

Review 连续回答三个问题：

1. 当前选择的 Git 范围里改了什么？
2. 用户怎样快速定位、比较和阅读这些变化？
3. 用户怎样在明确 capability 与 stale guard 下执行 stage、unstage、revert、commit、push 或 Create PR？

Review 保持为右侧对象 Tab。它不替换聊天区，不接管整个窗口，也不重复实现一套会话或模型运行时。

## Codex 参考与采用边界

采用可观察的交互模型：

- Scope：`Last Turn`、`Uncommitted`、`Unstaged`、`Staged`、`Committed`、`Branch`。
- 工具栏：Scope 与非零统计在左，Review options、折叠、跳转、Diff 模式、Files、Commit or push 在同一行右侧。
- Branch 关系单独显示为 `local → upstream`，例如 `main → origin/main`。
- Review options 包含 Refresh、word wrap、full-file loading、rich preview、word diff、white space 和 Copy git apply command。
- Review options 使用稳定的 Lucide 语义图标：word wrap=`ArrowRightFromLine`、full files=`File`、rich preview=`Image`、word diff=`FileDiff`、white space=`Eye`、copy apply=`Clipboard`；Files 工具栏入口使用 `Folder`。Toggle 的语义图标固定留在左侧，启用勾选显示在右侧。

不复制 Codex 私有 bundle 代码、类名、颜色或不可验证的内部状态结构。具体 Git 命令由 ActSpace 自己的安全边界决定。

## 核心原则

### Git-first

Git repository state 是默认事实来源。`Last Turn` 是 Agent 行为视角，只覆盖最近 turn 能证明的文件变化，不能伪装成完整 workspace 状态。

### Main-owned Git

Renderer 只发送稳定 selection、snapshot id 和用户意图。Main 重新解析 registered workspace，使用固定 argv 调用 Git。Renderer 不运行 Git、不拼 shell、不解析 raw file header。

### 摘要先行、Diff 按需加载

打开 Review 先返回文件 summary 和 totals。Standard mode 批量读取当前 snapshot 的 patch，并虚拟渲染全部文件；大变更进入 capped mode，只请求和挂载当前选中文件。完整文件正文独立于 patch，按可见范围懒加载。详细规则见 `core-review-large-diff-loading.md`。

### 状态与能力显式化

Snapshot 返回 capability matrix。UI 不根据 scope 名字猜 stage、revert、commit 或 load full file 是否可用。

### Mutation 绑定 generation

写操作携带 snapshot generation；hunk 写操作额外携带 patch fingerprint。工作区变化后拒绝旧动作并要求刷新。

## 共享契约

### ReviewSelection

```ts
type ReviewSelection =
  | { kind: "lastTurn"; sessionId: string; turnId?: string }
  | { kind: "uncommitted" }
  | { kind: "unstaged" }
  | { kind: "staged" }
  | { kind: "commit"; sha: string }
  | { kind: "branch"; branch: string };
```

### Scope 语义

| Selection | 内容 | 展示关系 | Mutation |
| --- | --- | --- | --- |
| `lastTurn` | 最近完成 turn 的文件工具变化 | turn baseline → turn result | 只读 |
| `uncommitted` | HEAD 到 working tree，含 staged、unstaged、untracked | HEAD → Working tree | 文件级 stage/revert |
| `unstaged` | index 到 working tree | Index → Working tree | stage/revert |
| `staged` | HEAD 到 index | HEAD → Index | unstage/revert |
| `commit` | 指定 commit 引入的变化 | parent → commit | 只读 |
| `branch` | 本地分支相对 upstream 的本地独有提交 | `local → upstream` | 只读 |

`Committed` 和 `Branch` 是带子视图的菜单项。Committed 子视图通过 main 查询当前 `HEAD` 的最近提交日志，展示 commit subject 和相对时间；选择一项后 Renderer 只回传 main 已提供的 SHA，不提供自由输入 ref 的提交表单。Branch 只能选择 main 返回的、已经配置 upstream 的本地分支。

### Branch 与远程跟踪语义

Branch 不是自由输入“基准分支”。Main 必须：

1. 列出 `refs/heads/*` 及其 upstream。
2. Renderer 只回传本地 branch 名称。
3. Main 重新验证 `refs/heads/<branch>`，再解析 `<branch>@{upstream}`。
4. 计算 `merge-base(upstream, local)` 到 `local` 的 Diff，表示本地尚未进入 upstream 的提交。
5. Snapshot 额外返回 `comparison: { from: local, to: upstream }`，用于展示 `main → origin/main`。
6. 分支落后 upstream 时显示 warning；Diff 仍只显示本地独有提交，不把远程独有提交伪装成本地改动。

打开或刷新 Review 不自动执行 `git fetch`。`origin/main` 表示本机已有的 remote-tracking ref；联网更新 remote 状态必须由显式 Git 操作完成。

### ReviewSnapshot

```ts
type ReviewSnapshot = {
  id: string;
  generation: number;
  workspaceId: string;
  workspaceRoot: string;
  repoRoot?: string;
  selection: ReviewSelection;
  baseline?: ReviewBaseline;
  target?: ReviewTargetLabel;
  comparison?: { from: string; to: string };
  status: "ready" | "empty" | "partial" | "notAvailable" | "noBaseline" | "failed";
  files: ReviewFileSummary[];
  totals: ReviewMetrics;
  capabilities: ReviewCapabilities;
  loadPolicy: {
    mode: "all-files" | "single-file";
    reason?: "file-count" | "changed-lines" | "changed-bytes";
  };
  queryOptions: { ignoreWhitespaceChanges: boolean };
  generatedAt: string;
  warnings?: ReviewWarning[];
};
```

### ReviewFileDiff

文件 Diff 使用结构化 hunk 和 line，不把 raw unified text 作为主渲染契约。`ReviewLine.wordDiffs` 可由显示选项决定是否渲染；关闭 word diff 不重新查询 Git。

### ReviewCapabilities

包含 file/hunk stage、unstage、revert、load full file、open file、commit、push、Create PR 与 disabled reasons。不存在 `runAgentReview` capability。

## Git 查询规则

- repository：`git rev-parse --show-toplevel`。
- 文件身份：NUL-delimited `--name-status -z`。
- 统计：`--numstat -z`。
- rename：启用 `--find-renames`。
- commit log：从当前 `HEAD` 最多读取最近 50 条；workspace 是 repo 子目录时携带 pathspec，只返回影响该 workspace 的提交。Main 返回结构化 `sha / subject / authoredAt`，Renderer 不解析 Git 输出。
- commit diff：选择日志项后仍先执行 `git cat-file -e <sha>^{commit}`，再读取其 parent → commit diff；根提交使用 empty tree。
- branch：只接受已验证的本地 ref，再解析 upstream。
- workspace 是 repo 子目录时，所有查询强制携带相对 repoRoot 的 pathspec。
- 无 HEAD 时 staged/uncommitted 使用 empty tree。
- 所有 Git 调用使用参数数组，不通过 shell。

## Review Options

### Refresh

增加 generation、清空 snapshot/file-diff cache，并重新执行当前 selection。Refresh 不 fetch remote。

### Enable word wrap

只影响 renderer 长行布局，不重新查询 Git。关闭时整个 Diff Canvas 是唯一横向滚动容器，所有行同步横移；单个代码行不得创建自己的滚动条。开启时 Canvas 收回到可视宽度，代码按行内宽度折行。

### Load full files / Don't load full files

- 开启时先展示 patch，再为正在展示或接近视口的文件异步读取完整 baseline/target 文本并补齐未修改上下文。
- 关闭时只加载 patch 默认上下文；用户可以逐步扩展 context。
- Standard mode 不立即读取全部文件正文；capped mode 最多读取当前选中文件正文。
- Full content 使用独立、安全且有界的 object/file 读取，不使用超大 unified context 模拟完整文件。
- 单文件 patch 和 full content 分别受硬上限保护，超限返回 partial warning，不能静默截断。

### Enable rich preview

支持的图片展示当前工作区图片预览；关闭后回退为“图片已变化”的结构化提示。未知二进制文件始终不注入文本 renderer。

### Enable word diffs

控制增删行内部的 token/word 高亮。关闭后仍保留普通行级 Diff。

### Hide white space / Show white space

- 控制当前 Review 查询是否忽略纯空白变化，并生成语义一致的新 snapshot。
- Standard 和 capped mode 都有效；capped mode 仍只加载当前选中文件。
- 该选项不负责把空格或 Tab 渲染成可见符号；可见空白字符不属于当前 Review Options。

### Copy git apply command

Main 基于已加载、generation 匹配的 snapshot 生成 binary/full-index patch，写入应用临时目录，并只返回：

```sh
git apply -- '<validated temporary patch path>'
```

包含 untracked 文件、Last Turn、空 patch 或超出上限时拒绝生成，并给出明确原因。Renderer 只负责把 main 返回的命令复制到剪贴板。

## 工具栏与布局

主工具栏固定为一行：

```text
[Scope⌄] [+N] [-N]    […] [Collapse] [Jump] [Diff mode] [Files] [Commit or push⌄]
```

- additions 为 0 时不显示 `+0`。
- deletions 为 0 时不显示 `-0`。
- 两者都为 0 时不渲染 totals 容器。
- Branch 的 `local → upstream` 放在主工具栏下方的轻量 metadata 行，不创建第二排 action toolbar。
- Changed Files 按 Review 容器宽度响应：宽度不小于 `560px` 时停靠在 Diff 右侧，不使用遮罩；更窄时切换为独占 Review 内容区的文件列表，选中文件后自动返回 Diff。
- split diff 只在 Review 容器宽度不小于 `640px` 时可用；判断依据是 Review 自身宽度，不是 `window.innerWidth`。
- Scope、Options、Jump 和 Commit 菜单通过顶层 portal 定位，不能作为横向滚动 toolbar 的子元素，否则会被 `overflow` 裁切成“点击无反应”。
- Diff Canvas 同时拥有纵向虚拟列表和横向滚动位置；虚拟行共享根据结构化 Diff 预估的稳定内容宽度，避免长行进入或离开挂载窗口时横向范围跳变。
- Files、Jump、Expand 与 split 在当前 snapshot 不具备数据或宽度条件时显示明确 disabled 状态，不执行空操作。
- Review Tab 的关闭由右侧对象 Tab chrome 负责，不在 Review 工具栏重复增加关闭按钮。

## Git Mutation

- `unstaged` file/hunk 可以 stage。
- `staged` file/hunk 可以 unstage。
- revert 前必须明确确认；untracked 文件优先进入系统废纸篓。
- mutation 成功或部分成功后增加 generation 并刷新。
- Commit/Push 复用 workspace environment 的既有状态机。
- Create PR 由 main 检查 `gh`、GitHub remote、认证、当前分支、upstream 和已有 PR。

## Viewed 状态

Viewed 是本机 UI 偏好，保存在 app data 下有上限的 sidecar：

- key 包含 workspace、selection、path 和 file fingerprint。
- 不写入 Git、不写入 session JSONL。
- 不保存 Diff、文件正文或密钥。
- 文件 fingerprint 改变后默认回到未阅。

## 大变更与失败状态

- 文件数超过 128、总增删超过 9,000 行或估算变更内容超过 12 MiB 时进入 capped mode。
- capped mode 保留完整文件树，但只请求、挂载和渲染当前选中的一个文件，并在 Diff 底部显示轻量说明。
- Standard mode 通过批量 patch 请求和虚拟 row renderer 展示全部文件 Diff，不使用逐文件 IPC fan-out。
- Git 命令与 patch 解析运行在专用 Review worker；tracked full content 使用最多 4 个 blob 的 `cat-file --batch`，不逐文件 `git show`。
- 单文件 patch 上限 1 MiB；untracked summary/full content 上限 2 MiB。
- 单文件请求支持 `idle`、`loading`、`ready`、`partial`、`failed` 与 Retry；generation 变化会取消或忽略旧结果。
- Snapshot 支持 `empty`、`partial`、`notAvailable`、`failed`、`stale` 和 mutation `partialSuccess`。
- Git 错误裁剪并脱敏；不向 renderer 暴露任意命令执行能力。

## 验证要求

自动化至少覆盖：

- 六种 scope、Branch upstream、ahead/behind、repo 子目录和复杂路径。
- full-file loading、word diff 数据、copy apply patch、stage/unstage/revert stale guard。
- toolbar 单行结构、零值统计隐藏、portal 菜单、Files 停靠/窄宽独占布局、Review Tab 与聊天共存。
- shared build、desktop typecheck、targeted/full Vitest、主题检查和 `git diff --check`。

手动验收单独记录：

- 浅色/深色主题与 390–640px 右侧面板视觉；核心 Electron 验收已覆盖 620px 停靠 Files、菜单和按钮命中，390px 降级另有 renderer regression 覆盖。
- Branch 展示真实 `local → origin/*`。
- disposable repo 的 stage/revert/commit。
- 真实 Push/Create PR；自动化通过不等于真实远端验收通过。

## 明确不做

- 不提供 AI Review、Review 模型、findings、Review activity 或 detached review task。
- 不自动 fetch、pull、push、commit 或应用任何修改。
- 不同步远端 PR review comments。
- 不让 renderer 执行任意 Git、shell 或文件系统命令。
