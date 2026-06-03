# Review 变更来源设计

## 定位

Review 是把「本次会话或工作区中可评审的改动」整理成一个稳定对象，供右侧面板浏览、后续 AI Review、Commit / Push / PR 等动作复用。

它不是 Git 面板的别名，也不是单纯把 `git diff` 原文展示出来。actspace 的主 Review 应优先学习 Codex App 的 Git-first 行为：Review 默认反映 Git repository state，而不是只反映 Agent 本轮改过什么。Session diff、snapshot 和 external diff 是后续 provider / scope，不应取代 Git 作为首版真实工作区变更来源。

本文只定义 Review 的数据来源、baseline、右侧视图边界和分阶段路线。具体右侧 UI 视觉规则仍见 `front-右侧面板与文件渲染规范.md`；工具 preview 契约仍见 `agent-tool-preview-design-guidelines.md`。

## 设计动机

Codex App 的 Review 方向值得优先学习：Review pane 只服务 Git repository；如果项目还不是 Git repository，就提示创建一个；展示范围是 repository state，包括 Codex 改动、用户手动改动和其它未提交变更。默认聚焦 uncommitted changes，并允许切换到 branch changes、last turn changes、staged / unstaged 等 scope。Codex CLI 的 `/review` 也围绕用户选择的 diff 运行，包括 base branch、uncommitted changes 和指定 commit。

Cursor 的 Review / BugBot 类能力也有一个值得借鉴的方向：模型消费的是结构化 changed files / chunks / context，而不是只能依赖一段 raw `git diff` 文本。这样做有三个好处：

- UI 可以稳定渲染文件列表、统计、chunk 和上下文，不受 diff 文本格式细节影响。
- AI Review 可以选择性注入上下文、规则和文件片段，避免把所有内容拼成一个超长提示词。
- Git 之外的来源也能接入，例如 Agent pending diff、会话内工具结果、远端 PR diff 或本地 snapshot diff。

actspace 的默认策略应是：优先把变更归一化成内部 `ReviewChangeSet`，再由 UI、AI Review 和提交动作各取所需。

## 核心概念

### Review Source

Review Source 是产生变更的来源。首版至少区分：

- `git`: Git repository 的 staged / working tree / untracked 变更。
- `session`: 当前会话事件流里的 Agent 文件改动，来自 `edit_file` / `write_file` 等工具 preview。
- `snapshot`: actspace 自己保存的 workspace baseline 与当前文件系统比较得到的变更。
- `external`: 未来远端 PR、patch 文件、issue 附件等外部 diff。

### Baseline

Baseline 是判断「改了什么」的参照物。没有 baseline 就不能诚实地计算 diff。

- Git 仓库的 baseline 通常是 `HEAD`、index、指定 base branch 或 merge base。
- Agent 会话改动的 baseline 是工具执行时记录的 before / after preview。
- Snapshot baseline 是 actspace 在某个时刻保存的文件内容摘要和必要文本内容。
- 如果没有 Git、没有 Agent preview、也没有 snapshot，就只能展示当前文件内容，不能声称有 changed files。

### ReviewChangeSet

内部建议使用一个结构化对象表示 Review 结果：

```ts
type ReviewChangeSet = {
  id: string;
  sessionId?: string;
  workspaceRoot?: string;
  source: "session" | "git" | "snapshot" | "external";
  baseline?: {
    kind: "session-preview" | "git-ref" | "snapshot";
    label: string;
  };
  files: ReviewFileChange[];
  totalAdditions: number;
  totalDeletions: number;
  generatedAt: string;
  warnings?: ReviewWarning[];
};

type ReviewFileChange = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  previousPath?: string;
  additions: number;
  deletions: number;
  chunks: ReviewChunk[];
  sourceEventIds?: string[];
};

type ReviewChunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  oldText?: string[];
  newText?: string[];
  unifiedText?: string;
};

type ReviewWarning = {
  kind: "truncated" | "binary_skipped" | "ignored_path" | "provider_failed";
  message: string;
  filePath?: string;
};
```

`SessionDiffSummary` 只能视作 `ReviewChangeSet` 的 `session` provider 投影，不能作为 Review 的完整模型。V1 即使先用最小 Git provider，也应尽早输出 `ReviewChangeSet`，避免 renderer 和后续 AI Review 直接依赖 raw `git diff`。

## 数据来源分层

### V1: Git Review

第一版先做 Codex-style Git Review，用 Git repository state 回答「当前工作区到底改了什么」。

数据来源：

- unstaged / working tree 变更。
- staged / index 变更。
- untracked 文件。
- 可选 base ref，例如当前分支相对 `main` / merge base 的 diff。

特点：

- 能发现 Codex / actspace Agent 改动、用户手动改动和其它未提交变更。
- baseline 语义成熟，默认以 Git 的 `HEAD`、index、merge base 等引用为参照。
- 适合后续 Commit / Push / PR 复用，因为 Git provider 是提交动作的事实来源。
- 需要当前 workspace 是 Git repository。

首版默认 scope：

- `Uncommitted`: staged + unstaged + untracked，作为 Review 主入口默认视图。
- `Staged`: 只看 index 中待提交内容。
- `Unstaged`: 只看 working tree 中未 staged 内容。
- `Since Base`: 可后置到同一阶段尾部或下一阶段，用 merge base 对比 base branch。

第一版按钮行为：

- 有 Git 且没有文件改动时，不显示按钮，或显示禁用空态。
- 有改动时显示真实 `+N -M`。
- 点击后打开右侧 `Review` tab。
- 右侧 tab 使用稳定 id，例如 `review:<workspaceRoot>:git`；重复点击只聚焦和刷新内容。
- 当前 workspace 不是 Git repository 时，显示创建 Git repository 的引导，不把它伪装成「没有改动」。

第一版右侧视图：

- 顶部采用 Codex-style 极简对象区：右侧 Tab 显示 `Review`，内容顶部只保留单行操作栏，左侧是 `Uncommitted` scope 和总 `+N -M`，右侧是必要图标操作。
- `N Uncommitted Changes` 作为可访问摘要、tooltip 或测试稳定读取字段保留；不再要求渲染成大 summary card。
- 文件列表按 status / path 稳定排序。
- 每个文件行显示 chevron、状态图标、path、`+N -M`；`New` / `Deleted` / `Renamed` / `Modified` 通过状态图标、颜色和文件行 `aria-label` / accessible name 表达，视觉上不额外显示状态文字列。
- V1 右侧展示采用文件级 accordion：文件行先展示摘要，点击后展开该文件具体 unified diff；默认展开第一个有 diff body 的文件。
- 空态要区分「Git provider 成功运行但没有改动」和「当前 workspace 还不是 Git repository」。
- 若 diff 被裁剪，只显示裁剪提示，不伪装成完整 diff。

实现约束：

- renderer 不直接运行 Git，也不读文件系统。
- main process 提供 IPC，内部可以通过受控子进程或专用库调用 Git。
- 所有路径必须回到 workspaceRoot 边界内。
- `.git` 目录内容不作为普通文件 diff 展示。
- Git provider 失败时返回结构化 `failed` / `notAvailable` 状态。

无 Git 时：

- Git provider 返回明确状态 `not_a_repository`。
- UI 提示创建 Git repository；初始化 Git 必须是显式用户动作。
- 如果当前 session 有 Agent diff，可提供 `Session changes only` 兜底入口，但必须说明它只包含 actspace / Agent 会话改动，不代表完整工作区状态。

### V2: Session Review

第二版接入 session provider，用于展示 Agent 本轮或当前会话产生的变更视角。

数据来源：

- `session.jsonl` 里的 `tool_result` / `diff_preview`。
- `ToolUiPreview.kind === "edit_diff"` 和 `ToolUiPreview.kind === "write"`。
- `createSessionDiffSummary(sessionId, events)` 聚合出的文件列表和总增删行。

特点：

- 不依赖 Git，可以作为无 Git workspace 的轻量兜底。
- 只展示 actspace / Agent 已经产生过 preview 的改动。
- 不能发现用户在外部编辑器手动改过但没有经过 actspace 工具链的文件。
- 更适合作为 `Last Turn` / `Current Session` scope，而不是 Review 主入口。

右侧视图：

- 顶部显示来源 `Session changes`、总文件数、总增删行。
- 文件列表按最近来源事件或路径稳定排序。
- 空态要说明「当前会话还没有可评审的 Agent 文件改动」。
- 若 diff 被裁剪，只显示裁剪提示，不伪装成完整 diff。

### V3: Snapshot Review

第三版可以为长期无 Git 工作区提供 actspace baseline，但它不应阻塞 V1 Git Review 或 V2 Session Review。

基本流程：

1. 用户首次在无 Git workspace 打开 Review 时，提示创建 baseline。
2. main process 扫描 workspace 中可文本化、未被忽略、未超限的文件。
3. 保存文件摘要、mtime/size 和必要文本内容到本地 userData，而不是写入项目目录。
4. 后续 Review 用当前文件系统与 snapshot baseline 计算 diff。
5. 用户可以刷新 baseline，此动作必须是显式的。

存储边界：

- snapshot 属于 actspace 本地应用数据，不提交到项目。
- snapshot 可能包含源码正文，必须只保存在本机。
- 不上传，不进入 `session.jsonl`，只在必要时记录轻量引用。

性能边界：

- 默认忽略 `node_modules`、`.git`、`dist`、`.next`、`.turbo`、`coverage` 等目录。
- 单文件大小和总扫描大小必须有限制。
- 二进制文件只记录状态和大小，不生成文本 diff。
- 大仓库应增量扫描，避免每次打开 Review 全量读取。

## Provider 选择策略

Review 入口应 Git-first，再按当前场景组合其它 provider：

1. 工作区是 Git 仓库：默认显示 `git` 的 `Uncommitted` scope，因为这是当前工作区真实变更。
2. 当前会话已有 Agent diff：允许切换到 `Last Turn` / `Session` scope，用于追踪 Agent 本轮行为。
3. 无 Git 但有 snapshot baseline：显示 `snapshot`。
4. 无 Git 且无 snapshot baseline：显示创建 Git repository 的引导；如果当前 session 有 diff，可提供 `Session changes only` 但必须标明不完整。
5. 无任何 baseline 且无 session diff：显示 `noBaseline`，不要说「没有改动」。

后续 UI 可以有 scope segmented control：

- `Uncommitted`
- `Unstaged`
- `Staged`
- `Since Base`
- `Last Turn`
- `Session`

V1 至少做 `Uncommitted`；`Staged` / `Unstaged` 可以在同一阶段内渐进实现。`Last Turn` / `Session` 属于 V2。

## AI Review 边界

AI Review 是 ReviewChangeSet 的消费者，不是 changed-file provider。

输入应包含：

- 结构化 diff chunks。
- 用户自定义 Review 指令。
- 相关 rules / AGENTS.md 摘要。
- 必要的文件上下文片段。
- 语言、测试、lint 信息等可选证据。

输出应是结构化 finding：

```ts
type ReviewFinding = {
  id: string;
  severity: "high" | "medium" | "low" | "note";
  filePath: string;
  line?: number;
  title: string;
  body: string;
  sourceChunkId?: string;
};
```

V1 右侧 Review 只做人工浏览，不启动模型审查。AI Review 按钮和 finding 渲染单独规划，避免把「查看变更」和「让模型审查」混成一个不可测行为。

## 与 Commit / Push / PR 的关系

Commit / Push / PR 可以复用 ReviewChangeSet，但不能反过来要求 Review 必须来自 Git。

- `session` provider 的改动可能已经写盘，也可能只是待应用 preview；提交前必须确认文件系统状态。
- `git` provider 是提交动作的事实来源。
- `snapshot` provider 可以辅助审查，但不能直接 commit；最终仍需要 Git 或其他 VCS provider。

因此第一版 Composer 上方可以保留「Review」和未来「Commit / push」两个概念：Review 是看变化，Commit / Push 是 VCS 动作。V1 即使已经展示 Git diff，也不要直接把「打开 Review」等同于「准备提交全部文件」。

## 错误与空态

必须区分以下状态：

- `empty`: provider 成功运行，但没有改动。
- `notAvailable`: provider 在当前 workspace 不适用，例如不是 Git 仓库。
- `noBaseline`: 没有可比较的 baseline。
- `partial`: 结果可用但存在裁剪、二进制跳过、忽略目录等警告。
- `failed`: provider 运行失败。

不要把 `noBaseline` 展示成 `empty`。这会误导用户以为工作区没有变化。

## 安全与隐私

- renderer 只消费结构化 Review 数据，不直接读文件。
- 所有 workspace 路径由 main process 做边界校验。
- Review 数据可能包含源码，默认只在本地持久化。
- AI Review 需要明确走模型调用时，才把必要 diff 和上下文发给 provider。
- 对超大 diff 必须裁剪，并在 UI 和模型输入中都保留裁剪标记。

## 实施路线

### Phase 1: Git Review Tab

- main process 增加 Git provider 和 `review:get-workspace-changes` IPC。
- 支持 Git repository 检测、uncommitted diff、staged / unstaged / untracked 汇总。
- Composer Review 按钮接入真实 Git 统计，替换硬编码 `+4253 -5`。
- 新增右侧 `Review` tab 类型和视图组件，默认展示 `Uncommitted` scope。
- 无 Git 时提示创建 Git repository，初始化动作必须由用户显式触发。
- 补 renderer / main 测试，覆盖按钮显示、Git 空态、not_a_repository、tab 打开和基础 diff 渲染。

### Phase 2: ReviewChangeSet 抽象

- 在 shared 中引入 `ReviewChangeSet` 类型。
- 把 Git provider 输出迁移或适配为 `ReviewChangeSet`。
- renderer 不自行解析 raw diff，而只消费结构化 Review 数据。

### Phase 3: Session Provider

- 把 `SessionDiffSummary` 适配为 `ReviewChangeSet` 的 `session` provider。
- main process 提供 `review:get-session` IPC，renderer 不自行拼复杂状态。
- UI 增加 `Last Turn` / `Session` scope，并明确该 scope 只代表 Agent 会话改动。

### Phase 4: Snapshot Provider

- 为无 Git workspace 提供显式 baseline 创建 / 刷新。
- 增量扫描和本地 snapshot 存储。
- UI 区分 `noBaseline`、`empty` 和 `partial`。

### Phase 5: AI Review

- 基于 ReviewChangeSet 触发模型审查。
- 输出结构化 findings。
- 右侧 Review tab 增加 findings 层和文件行定位。

## 非目标

- V1 不实现 Session Review 主入口。
- V1 不实现 snapshot baseline。
- V1 不自动运行 AI Review。
- V1 不把 Review 结果直接等同于可提交文件集合。
- V1 不要求实现 stage / unstage / revert 等 Git 写操作；这些动作可以在只读 Review 稳定后补齐。
- V1 不支持跨 workspace 聚合。
