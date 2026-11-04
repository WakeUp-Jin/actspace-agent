# Git-first Review Workbench 设计规范

## 范围

- 事实源：本文件定义 Review 的 scope、结构化 diff、工具栏、显示选项、刷新和安全边界。
- 性能事实源：本文「大 Diff 加载与渲染」一节定义 Standard/capped 双模式、批量请求、完整正文和虚拟渲染边界。
- 产品边界：Review 是只读的人工 Git 审阅工作台（标签名「改动」），不包含 AI Review、Review 专用模型、findings、独立审查任务或评论回注 Agent。
- 视觉关联：右侧对象系统见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`；布局见 `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`；颜色见 `docs/design-docs/frontend/front-视觉token规范.md`。

## 当前实现映射

- 共享契约：`packages/util/shared/src/review.ts`。
- 查询、缓存与失效：`apps/desktop/src/main/review-coordinator.ts`。
- Composer 顶部 Review 摘要：`apps/desktop/src/renderer/components/review/use-review-summary.ts`。
- Git 只读查询：`apps/desktop/src/main/review-git-engine.ts`（后台线程 `review-git-worker-client.ts` 保留，只承担用户触发的 diff 解析和 `cat-file`）。
- Renderer：`apps/desktop/src/renderer/components/review/`。

## 定位

Review 连续回答两个问题：

1. 当前选择的 Git 范围里改了什么？
2. 用户怎样快速定位、比较和阅读这些变化？

Review 只负责“看清改动”，不动手操作 git；提交、推送、新建分支在顶部工作区菜单。Review 保持为右侧对象 Tab。它不替换聊天区，不接管整个窗口，也不重复实现一套会话或模型运行时。

## Codex 参考与采用边界

采用可观察的交互模型：

- Scope：`Uncommitted`、`Unstaged`、`Staged`、`Committed`、`Branch`。
- 工具栏：Scope 与非零统计在左，Review options、折叠、跳转、Diff 模式、Files 在同一行右侧。
- Branch 关系单独显示为 `local → upstream`，例如 `main → origin/main`。
- Review options 包含 Refresh、word wrap、full-file loading、rich preview、word diff、white space。
- Review options 使用稳定的 Lucide 语义图标：word wrap=`ArrowRightFromLine`、full files=`File`、rich preview=`Image`、word diff=`FileDiff`、white space=`Eye`；Files 工具栏入口使用 `Folder`。Toggle 的语义图标固定留在左侧，启用勾选显示在右侧。

不复制 Codex 私有 bundle 代码、类名、颜色或不可验证的内部状态结构。具体 Git 命令由 ActSpace 自己的安全边界决定。

## 核心原则

### Git-first

Git repository state 是默认事实来源。“这一轮 Agent 改了什么”由回复尾部的本轮改动卡（`TurnReviewView`）提供，不在 Review 范围里。

### Main-owned Git

Renderer 只发送稳定 selection 和 snapshot id。Main 重新解析 registered workspace，使用固定 argv 调用 Git。Renderer 不运行 Git、不拼 shell、不解析 raw file header。

### 工作区注册与 Git 仓库的边界

工作区注册只把用户选用的目录加入应用数据目录中的 `workspaces.json`，不创建 `.git`、不运行 `git init`，也不提交文件。用户选择“添加工作区”或“使用现有文件夹”时，目录选择 IPC 显式传入 `registerWorkspace: true`；选父目录或能力配置目录时不注册。

Desktop Host 在创建会话前注册其工作区，在启动完成前从持久化会话摘要补齐旧工作区。恢复操作合并已有条目，保留稳定 ID 和隐藏偏好。Review 和环境只读查询允许已注册目录或持久化本地会话持有的执行目录，经 realpath 授权检查；不因收到路径就自动注册。非 Git 目录返回不可用状态（界面显示“当前目录不是 Git 仓库”），Review 不提供初始化 Git。

未注册工作树的 Review 身份由授权后的 canonical root 派生为 `session-root:<sha256>`，其 ID 与 root 必须成对传递，显式 ID/root 冲突必须拒绝。刷新、snapshot、diff 和内容查询沿用相同身份；刷新不得丢弃 root 后再将派生 ID 当 registry ID 解析。跨会话绑定的面板继续使用自身目标。

### 摘要先行、Diff 按需加载

打开 Review 先返回文件 summary 和 totals。Standard mode 批量读取当前 snapshot 的 patch，并虚拟渲染全部文件；大变更进入 capped mode，只请求和挂载当前选中文件。完整文件正文独立于 patch，按可见范围懒加载。详细规则见本文「大 Diff 加载与渲染」一节。

### 状态与能力显式化

Snapshot 返回 `capabilities: { canLoadFullFile }`。UI 不根据 scope 名字猜 load full file 是否可用。

### 查询绑定 generation

文件 diff 和完整正文请求携带 snapshot generation；`refreshSnapshot` 是唯一递增 generation 的路径，旧 generation 的请求返回 `stale_generation`，Renderer 自愈重载。

## 共享契约

### ReviewSelection

```ts
type ReviewSelection =
  | { kind: "uncommitted" }
  | { kind: "unstaged" }
  | { kind: "staged" }
  | { kind: "commit"; sha: string }
  | { kind: "branch"; branch: string };
```

### Scope 语义

| Selection | 内容 | 展示关系 |
| --- | --- | --- |
| `uncommitted` | HEAD 到 working tree，含 staged、unstaged、untracked | HEAD → Working tree |
| `unstaged` | index 到 working tree | Index → Working tree |
| `staged` | HEAD 到 index | HEAD → Index |
| `commit` | 指定 commit 引入的变化 | parent → commit |
| `branch` | 本地分支相对 upstream 的本地独有提交 | `local → upstream` |

所有 scope 都是只读。

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

只有 `canLoadFullFile`。不存在 `runAgentReview` capability，也没有 stage / revert / commit 等写操作 capability。

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

（`refreshSnapshot`）增加 generation、清空 snapshot/file-diff cache，并重新执行当前 selection，同时向 Renderer 广播 `reviewChanged`（`reason: "refresh"`）。Refresh 不 fetch remote。

### 刷新时机

没有实时文件监听，也没有 Git 忽略过滤。Review 的数据和输入框的 +N/−M 只在下面这些时机刷新，都走 `refreshSnapshot`（强制，丢弃缓存重新读 Git）：

- 每轮 Agent 结束（`agent_run_finished` / `aborted` / `failed`）后，输入框摘要强制刷新。
- 打开「改动」面板：面板挂载时 `loadSnapshot(selection, true)`，同时强制刷新输入框摘要。
- 手动刷新：Review options 里的「刷新」。
- 顶部工作区菜单提交、推送、新建分支之后（`onWorkspaceChanged`）。
- 切换工作区或会话。

在这些时机之外，用户在终端或外部编辑器改文件，不会自动反映；点刷新即可。

Renderer 只处理与自身 snapshot `workspaceId` 一致的通知，且 `notification.generation` 与当前 snapshot 相同时跳过（避免 diff 闪一下）；工作树可能使用 session-root 身份，不能由路径推算。Composer 摘要在首个快照返回前只为在途请求记一次补查，同一目标最多一个请求在途，排队的补查里只要有一次是强制就按强制，结果不变时不更新界面。

### Enable word wrap

只影响 renderer 长行布局，不重新查询 Git。关闭时整个 Diff Canvas 是唯一横向滚动容器，所有代码行同步横移；单个代码行不得创建自己的滚动条。文件标题、图片和状态提示使用 Canvas 的实际可视宽度，并在横向滚动时保持可见，不能按长代码内容宽度居中或把操作推到屏外。开启时 Canvas 收回到可视宽度，代码按行内宽度折行。

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

## 工具栏与布局

主工具栏固定为一行：

```text
[Scope⌄] [+N] [-N]    […] [Collapse] [Jump] [Diff mode] [Files]
```

- additions 为 0 时不显示 `+0`。
- deletions 为 0 时不显示 `-0`。
- 两者都为 0 时不渲染 totals 容器。
- Branch 的 `local → upstream` 放在主工具栏下方的轻量 metadata 行，不创建第二排 action toolbar。
- Changed Files 按 Review 容器宽度响应：宽度不小于 `560px` 时停靠在 Diff 右侧，不使用遮罩；更窄时切换为独占 Review 内容区的文件列表，选中文件后自动返回 Diff。
- split diff 只在 Review 容器宽度不小于 `640px` 时可用；判断依据是 Review 自身宽度，不是 `window.innerWidth`。
- Scope、Options 和 Jump 菜单通过顶层 portal 定位，不能作为横向滚动 toolbar 的子元素，否则会被 `overflow` 裁切成“点击无反应”。
- Diff Canvas 同时拥有纵向虚拟列表和横向滚动位置；虚拟行共享根据结构化 Diff 预估的稳定内容宽度，避免长行进入或离开挂载窗口时横向范围跳变。
- 非代码内容的可视宽度复用 Canvas 的尺寸观察，宽度单独变化时也必须更新；不能依赖纵向虚拟范围变化才重绘。横向粘附容器放在共享宽行内部，避免引入第二个滚动条或影响虚拟行纵向定位。
- Files、Jump、Expand 与 split 在当前 snapshot 不具备数据或宽度条件时显示明确 disabled 状态，不执行空操作。
- Review Tab 的关闭由右侧对象 Tab chrome 负责，不在 Review 工具栏重复增加关闭按钮。

## 大变更与失败状态

- 文件数超过 128、总增删超过 9,000 行或估算变更内容超过 12 MiB 时进入 capped mode。
- capped mode 保留完整文件树，但只请求、挂载和渲染当前选中的一个文件，并在 Diff 底部显示轻量说明。
- Standard mode 通过批量 patch 请求和虚拟 row renderer 展示全部文件 Diff，不使用逐文件 IPC fan-out。
- Git 命令与 patch 解析运行在专用 Review worker；tracked full content 使用最多 4 个 blob 的 `cat-file --batch`，不逐文件 `git show`。
- 单文件 patch 上限 1 MiB；untracked summary/full content 上限 2 MiB。
- 单文件请求支持 `idle`、`loading`、`ready`、`partial`、`failed` 与 Retry；generation 变化会取消或忽略旧结果。
- Snapshot 支持 `empty`、`partial`、`notAvailable`、`failed`、`stale`。
- Git 错误裁剪并脱敏；不向 renderer 暴露任意命令执行能力。

## 验证要求

自动化至少覆盖：

- 五种 scope、Branch upstream、ahead/behind、repo 子目录和复杂路径。
- full-file loading、word diff 数据、`refreshSnapshot` 递增 generation 并广播、stale guard。
- Review 不改动索引和工作区（引擎测试断言只读）。
- toolbar 单行结构、零值统计隐藏、portal 菜单、Files 停靠/窄宽独占布局、Review Tab 与聊天共存。
- shared build、desktop typecheck、targeted/full Vitest、主题检查和 `git diff --check`。

手动验收单独记录：

- 浅色/深色主题与 390–640px 右侧面板视觉；核心 Electron 验收已覆盖 620px 停靠 Files、菜单和按钮命中，390px 降级另有 renderer regression 覆盖。
- Branch 展示真实 `local → origin/*`。
- 每轮结束、打开面板、手动刷新、顶部菜单提交后 +N/−M 的刷新。

## 明确不做

- 不提供 AI Review、Review 模型、findings、Review activity 或 detached review task。
- 不提供暂存、还原、已查看、创建 PR、复制 apply 命令、初始化 Git 和「最近一轮」范围；不自动 fetch、pull、push、commit 或应用任何修改。
- 不同步远端 PR review comments。
- 不让 renderer 执行任意 Git、shell 或文件系统命令。

## 大 Diff 加载与渲染

适用范围：Review snapshot 生成后的 Diff 请求调度、完整文件内容加载、渲染模式、工具栏语义和性能验收。阈值参照本机 Codex Desktop 26.727.40816 的可验证行为与本地 bundle 调用链，作为当前对齐基线，不作为对未来 Codex 版本的兼容承诺。

### 问题定义

如果把文件展开状态直接映射成逐文件 IPC 和逐文件 Git 命令，文件较多时一次 Expand all 会同时放大为：

```text
N 个 expanded file
  -> N 次 renderer IPC
  -> N 次 workspace/repository/baseline 解析
  -> N 个 git diff 子进程
  -> N 份大 patch 解析
  -> 所有 diff line 同时进入 React DOM
```

只过滤中间区域实际显示的文件而不限制 store 中的请求集合，会变成“视觉单文件、后台全文件”。因此加载策略、请求策略和渲染策略必须同时切换。

### 术语

#### Snapshot summary

当前 scope 的文件索引、状态、统计、能力和比较关系，不包含文件 patch 或完整正文。

#### Patch

只包含变更 hunk 和有限上下文的结构化 Diff。Patch 是 Review 的基础数据，体积应远小于完整文件正文。

#### Full file content

某个文件在 baseline 与 target 两侧的完整文本内容，用于补齐未修改上下文。它不表示加载 Review 中所有文件，也不表示读取整个仓库。

#### Standard mode

小变更模式。文件树展示当前 scope 的全部变更文件，中间区域按顺序展示全部文件 Diff。

#### Capped mode

大变更保护模式，也称 single-file mode。文件树仍展示当前 scope 的全部变更文件，但中间区域任意时刻只挂载、请求和渲染当前选中的一个文件。

### 模式判定

Snapshot summary 满足任意条件时进入 capped mode：

```ts
fileCount > 128
|| totalChangedLines > 9_000
|| estimatedChangedBytes > 12 * 1024 * 1024
```

- `totalChangedLines = additions + deletions`。
- `estimatedChangedBytes` 由 summary 阶段批量得到的 tracked blob size 与受保护的 working-tree/untracked file size 估算，不读取全部文件正文。
- 判定只在 snapshot 生成时执行；滚动、展开和文件过滤不改变当前 snapshot 的模式。
- Refresh、scope 切换或 whitespace 查询语义变化会生成新 snapshot，并重新判定模式。

阈值必须集中定义为具名常量并有边界测试，不散落在 renderer 和 main。

### 共同界面规则

两种模式都遵守以下规则：

- 文件树展示当前 snapshot 中的全部变更文件；输入过滤只影响可见树节点，不改变 snapshot。
- 默认选择文件树中的第一个文件；用户选择文件后保持稳定 selection。
- 文件树、toolbar 和 Diff canvas 共享同一个 `selectedFileId`，不各自推导。
- 每个文件具有独立的 `idle | loading | ready | partial | failed` 状态，并提供显式 Retry。
- scope、Refresh 或 Git invalidation 产生新 generation 后，旧结果不得进入新 snapshot。
- totals 中为零的 additions/deletions 不渲染。

### Standard mode

Standard mode 的产品行为：

```text
文件树：展示全部变更文件
中间区域：展示全部文件 Diff section
Patch：一次批量请求当前 snapshot 的全部文本文件
DOM：只渲染可见范围附近的扁平 Diff rows
```

- tracked 文件合并为批量 Git diff，不允许每个文件各启动一个 Git 进程。
- untracked 文件允许独立读取，但并发上限为 8。
- 单文件失败不阻塞其他文件成功展示；批量响应按文件返回成功或错误。
- Expand all 展开当前 snapshot 的全部文件 section。因为 patch 已通过批量协议调度，它不能制造 N 次独立 IPC。
- Collapse all 只改变展示状态，不清空已成功的 patch cache。
- Jump to file 定位到虚拟列表中的目标文件，并更新 `selectedFileId`。

### Capped mode

Capped mode 的产品行为：

```text
文件树：展示全部变更文件
中间区域：只展示 selectedFileId 对应的一个 Diff
Patch：请求集合始终只有 selectedFileId
切换文件：取消或忽略上一文件的未完成请求，再请求新文件
```

- 不预取其他文件 patch，不因为 Expand all、Files 面板、Jump 菜单或搜索而扩大请求集合。
- Expand/Collapse 的作用域退化为当前选中的 Diff；tooltip 使用 `Expand current diff` / `Collapse current diff`，避免暗示会退出 capped mode。
- 文件树选中另一个文件时，中间内容直接替换，不在页面底部累积之前文件。
- Diff canvas 底部固定展示轻量说明：`This diff is large, showing one file at a time`。
- 说明只表达加载模式，不作为 warning banner，不遮挡 Diff，不提供“强制全部加载”入口。
- 当前文件请求失败时保留文件树可用，用户可以 Retry 或切换其他文件。

### 默认显示偏好

默认偏好：unified diff、word wrap 关闭、load full files 开启、rich preview 关闭、word diff 关闭、显示纯空白变更。偏好持久化，不改变 snapshot 的 workspace/scope 身份。各选项语义见上文「Review Options」，补充约束：

- Load full files 开启时，Standard mode 只为可见区域前后有限数量的文件预取正文；关闭时取消未开始的 full-content 工作，已缓存内容可留在当前 generation 的有界缓存中但不再渲染完整上下文。它不是纯 CSS 显示开关，也不是“是否显示所有变更文件”。
- Hide white space 在 capped mode 下只加载新 snapshot 的当前选中文件。

### 数据与进程边界

#### Shared contract

`ReviewSnapshot` 使用显式加载策略代替模糊 boolean：

```ts
type ReviewLoadPolicy = {
  mode: "all-files" | "single-file";
  reason?: "file-count" | "changed-lines" | "changed-bytes";
};
```

Snapshot totals 增加 `estimatedChangedBytes`。Whitespace 查询状态进入 snapshot query key，保证 summary、totals、文件树和 patch 使用同一语义。

Patch 改为批量契约：

```ts
type ReviewDiffRequest = {
  fileId: string;
  contextLines: number;
};

type ReviewFileDiffOutcome =
  | { fileId: string; status: "ready" | "partial"; diff: ReviewFileDiff }
  | { fileId: string; status: "failed"; code: ReviewErrorCode; message: string };
```

Full content 使用独立请求和缓存，不再通过 `git diff --unified=1000000` 伪装成 patch。

#### Coordinator

- 每个 generation 保存一次 prepared repository/baseline context，文件请求复用它。
- 同一 snapshot 同一参数的批量请求合并；重叠文件 ID 不重复执行。
- Refresh、scope 变化和 workspace invalidation 取消旧 generation 工作。
- pending promise 必须在 `finally` 中清理，失败结果不能永久占据请求缓存。
- batch response 允许 partial success，单文件失败不把整批变成永久 Loading。

#### Git data plane

- tracked 文件按相同 baseline、target、whitespace 和 context 参数分组，一组使用一个带 pathspec 数组的 Git diff。
- 输出按 `diff --git` 文件边界拆分并映射回 snapshot file ID。
- untracked 读取并发不超过 8，并保持 realpath、symlink、binary 和 size guard。
- repository root、HEAD、upstream、merge-base 和 divergence 在 snapshot prepare 阶段计算一次。
- 完整 tracked blob 通过经过验证的 object ID 和 `git cat-file --batch` 成批读取；working-tree/untracked 一侧通过受保护的文件读取。
- Git 命令执行、patch 拆分和大文本组装放在 Review worker/data-plane 边界，不阻塞 Electron main 的 UI 事件处理。

#### Renderer

- `review-store` 根据 `loadPolicy.mode` 计算唯一 request set，不再从历史累积的 `expandedFileIds` 推导后台加载范围。
- 请求状态按 file ID 单独保存，包含 request generation 和 retry count。
- Standard mode 将 file header、hunk header、line、collapsed context 和 state row 扁平化后交给 `@tanstack/react-virtual`。
- Capped mode 使用同一虚拟 row renderer，但输入只包含当前文件。
- wrap 或 split 模式改变时重新测量 row，不重取 patch。
- 虚拟化容器保留稳定高度和 overscan，hover、selection、loading 与 sticky header 不得引发布局跳动。

### 资源限制与可观测性

- tracked patch：每个批次最多一个 Git diff 子进程；命令 pathspec 过长时按明确字节上限拆批。
- untracked：最大并发 8。
- full-content：每批最多 4 个 object，单对象和总缓存都设硬上限。
- renderer：正常滚动时存活 Diff row DOM 目标不超过 600，测试上限为 1,000。
- 重试：worker 崩溃后最多重建一次；单文件读取失败进入 `failed` 并提供显式 Retry。通用 Git runner 不自动重放命令。
- 记录 snapshot 时间、Git command 数、patch bytes、full-content bytes、峰值并发、解析时间、渲染 row 数、取消数和失败数。
- 慢操作日志必须携带 snapshot id、scope 和阶段，不记录文件正文或完整 patch。

### 状态与失败恢复

```text
idle -> loading -> ready
                -> partial
                -> failed -> retrying -> ready | failed

任意状态 --new generation--> cancelled/ignored
```

- `Loading structured diff...` 必须对应真实 pending request。
- `failed` 显示精简原因和 Retry，不继续用 Loading 占位。
- `partial` 显示已加载内容和明确的截断说明。
- `stale_generation` 自动刷新 snapshot，但同一 generation 最多触发一次，避免刷新环。
- 离开 Review、切换 workspace 或销毁窗口时取消当前请求。

### 数据路径的实现约束

- Electron main 对 data-directory 初始化使用 single-flight，Review IPC 不再重复执行目录创建与启动日志。
- Coordinator 按 workspace generation 持有 AbortController；invalidation/dispose 会取消 Git child、清空 pending cache，并通知 engine 释放 prepared snapshot。
- tracked patch 按 context 参数分组，路径参数超过 96 KiB 时拆批；50 文件 fixture 验证同参数短路径只产生一次 patch Git 命令。
- Git child、patch 拆分与 hunk/word-diff 解析运行在 `review-git-worker`；worker crash 最多重建一次。
- tracked full content 在 worker 内先执行 `cat-file --batch-check`，再按最多 4 个 blob 执行 `cat-file --batch`；单 blob 超过 2 MiB 时只返回 partial 元数据。
- working-tree full content 只读取前 2 MiB，并保持 realpath、symlink 与 workspace containment 校验。
- renderer 使用 `@tanstack/react-virtual` 的 variable-height row virtualizer；9,000 行 fixture 的 live row DOM 保持低于 1,000 测试上限。
- Standard snapshot 一次 batch intent 请求全部文本 patch；capped snapshot 始终只请求 `selectedFileId`，Expand/Collapse 不改变请求集合。

### 验收矩阵

| 场景 | 文件树 | 中间 Diff | Patch 请求 | Full content |
| --- | --- | --- | --- | --- |
| 8 files / 500 lines | 全部 | 全部 | 批量全部 | 仅可见附近 |
| 129 files | 全部 | 当前文件 | 仅当前文件 | 仅当前文件 |
| 20 files / 9,001 lines | 全部 | 当前文件 | 仅当前文件 | 仅当前文件 |
| 1 large file / >12 MiB estimate | 全部 | 当前文件 | 仅当前文件并受 patch cap | 默认跳过或受限 |
| capped + Expand | 全部 | 当前文件展开 | 不新增其他文件请求 | 不新增其他文件请求 |
| capped + whitespace toggle | 新 snapshot 全部 | 当前文件 | 仅当前文件 | 遵循当前选项 |
| standard + full files off | 全部 | 全部 patch | 批量全部 | 0 次 |

### 明确排除

- 不提供绕过 capped mode 的“强制加载全部”按钮。
- 不把 full-file option 实现成只隐藏已经无条件加载的全部正文。
- 不通过简单 semaphore 保留逐文件重复 Git 架构。
- 不在 renderer 中启动 Git、解析任意路径或读取文件系统。
- 不把可见空白字符与忽略 whitespace-only changes 混成同一个选项。
