# Review 大 Diff 加载与渲染规范

## 文档状态

- 状态：已实现，等待真实 Electron 最终验收。
- 上位规范：`docs/design-docs/core-review-change-sources.md`。
- 适用范围：Review snapshot 生成后的 Diff 请求调度、完整文件内容加载、渲染模式、工具栏语义和性能验收。
- 参考基线：本机 Codex Desktop `26.727.40816` 的可验证行为与本地 bundle 调用链；阈值作为当前对齐基线，不作为对未来 Codex 版本的兼容承诺。

## 问题定义

当前实现已经具备 Review 的功能表面，但把文件展开状态直接映射成逐文件 IPC 和逐文件 Git 命令。文件较多时，一次 Expand all 会同时放大为：

```text
N 个 expanded file
  -> N 次 renderer IPC
  -> N 次 workspace/repository/baseline 解析
  -> N 个 git diff 子进程
  -> N 份大 patch 解析
  -> 所有 diff line 同时进入 React DOM
```

现有 capped mode 只过滤了中间区域实际显示的文件，没有限制 store 中的请求集合，因此属于“视觉单文件、后台全文件”。本规范要求加载策略、请求策略和渲染策略同时切换。

## 术语

### Snapshot summary

当前 scope 的文件索引、状态、统计、能力和比较关系，不包含文件 patch 或完整正文。

### Patch

只包含变更 hunk 和有限上下文的结构化 Diff。Patch 是 Review 的基础数据，体积应远小于完整文件正文。

### Full file content

某个文件在 baseline 与 target 两侧的完整文本内容，用于补齐未修改上下文。它不表示加载 Review 中所有文件，也不表示读取整个仓库。

### Standard mode

小变更模式。文件树展示当前 scope 的全部变更文件，中间区域按顺序展示全部文件 Diff。

### Capped mode

大变更保护模式，也称 single-file mode。文件树仍展示当前 scope 的全部变更文件，但中间区域任意时刻只挂载、请求和渲染当前选中的一个文件。

## 模式判定

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

## 共同界面规则

两种模式都遵守以下规则：

- 文件树展示当前 snapshot 中的全部变更文件；输入过滤只影响可见树节点，不改变 snapshot。
- 默认选择文件树中的第一个文件；用户选择文件后保持稳定 selection。
- 文件树、toolbar 和 Diff canvas 共享同一个 `selectedFileId`，不各自推导。
- 每个文件具有独立的 `idle | loading | ready | partial | failed` 状态，并提供显式 Retry。
- scope、Refresh 或 Git invalidation 产生新 generation 后，旧结果不得进入新 snapshot。
- totals 中为零的 additions/deletions 不渲染。

## Standard mode

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

## Capped mode

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

## Review Options 的最终语义

默认偏好与 Codex 当前本地基线对齐：unified diff、word wrap 关闭、load full files 开启、rich preview 关闭、word diff 关闭、显示纯空白变更。偏好持久化，但不会改变 snapshot 的 workspace/scope 身份。

### Refresh

失效当前 snapshot、取消旧 generation 的未完成请求并重新读取当前 scope。Refresh 不执行 fetch。

### Enable word wrap

只改变行布局和虚拟行高度估算，不重新执行 Git。

### Load full files / Don't load full files

该选项控制是否为正在展示或接近视口的文件补充完整 baseline/target 文本：

- 开启：先展示 patch；文件进入预取范围后，再异步读取该文件两侧的完整内容并补齐未修改上下文。
- 关闭：只保留 patch 与显式 context expansion，不发起 full-content 请求。
- Standard mode 不得因为该选项开启而立即读取全部文件正文；只为可见区域前后有限数量的文件预取。
- Capped mode 最多读取当前选中文件的完整正文。
- 切换为关闭时取消未开始的 full-content 工作；已缓存内容可以保留在当前 generation 的有界缓存中，但不再渲染完整上下文。

因此该选项不是纯 CSS 显示开关，也不是“是否显示所有变更文件”。

### Enable rich preview

只影响支持的图片或富媒体文件呈现。关闭后回退为结构化文件变化提示，不影响文本 patch 调度。

### Enable word diffs

控制相邻 deletion/addition block 内的词级高亮。关闭后保留行级 Diff；超长行和高复杂度 block 自动回退为行级 Diff。

### Hide white space / Show white space

该选项控制是否忽略纯空白变更，语义对应 Git 查询的 whitespace 参数：

- `Hide white space`：生成忽略纯空白变化的新 snapshot。
- `Show white space`：恢复包含纯空白变化的新 snapshot。
- 它在 Standard 和 capped mode 都有效。
- 在 capped mode 中只会加载新 snapshot 的当前选中文件，不会展示全部文件。
- 它不负责把空格渲染成圆点、把 Tab 渲染成箭头；可见空白字符不属于本轮产品范围。

### Copy git apply command

继续基于 generation 匹配的完整 scope patch 生成安全命令，与当前是否挂载全部 Diff 无关。Capped mode 不是只导出当前文件。

## 数据与进程边界

### Shared contract

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

### Coordinator

- 每个 generation 保存一次 prepared repository/baseline context，文件请求复用它。
- 同一 snapshot 同一参数的批量请求合并；重叠文件 ID 不重复执行。
- Refresh、scope 变化和 workspace invalidation 取消旧 generation 工作。
- pending promise 必须在 `finally` 中清理，失败结果不能永久占据请求缓存。
- batch response 允许 partial success，单文件失败不把整批变成永久 Loading。

### Git data plane

- tracked 文件按相同 baseline、target、whitespace 和 context 参数分组，一组使用一个带 pathspec 数组的 Git diff。
- 输出按 `diff --git` 文件边界拆分并映射回 snapshot file ID。
- untracked 读取并发不超过 8，并保持 realpath、symlink、binary 和 size guard。
- repository root、HEAD、upstream、merge-base 和 divergence 在 snapshot prepare 阶段计算一次。
- 完整 tracked blob 通过经过验证的 object ID 和 `git cat-file --batch` 成批读取；working-tree/untracked 一侧通过受保护的文件读取。
- Git 命令执行、patch 拆分和大文本组装放在 Review worker/data-plane 边界，不阻塞 Electron main 的 UI 事件处理。

### Renderer

- `review-store` 根据 `loadPolicy.mode` 计算唯一 request set，不再从历史累积的 `expandedFileIds` 推导后台加载范围。
- 请求状态按 file ID 单独保存，包含 request generation 和 retry count。
- Standard mode 将 file header、hunk header、line、collapsed context 和 state row 扁平化后交给 `@tanstack/react-virtual`。
- Capped mode 使用同一虚拟 row renderer，但输入只包含当前文件。
- wrap 或 split 模式改变时重新测量 row，不重取 patch。
- 虚拟化容器保留稳定高度和 overscan，hover、selection、loading 与 sticky header 不得引发布局跳动。

## 资源限制与可观测性

- tracked patch：每个批次最多一个 Git diff 子进程；命令 pathspec 过长时按明确字节上限拆批。
- untracked：最大并发 8。
- full-content：每批最多 4 个 object，单对象和总缓存都设硬上限。
- renderer：正常滚动时存活 Diff row DOM 目标不超过 600，测试上限为 1,000。
- 重试：worker 崩溃后最多重建一次；单文件读取失败进入 `failed` 并提供显式 Retry。通用 Git runner 不自动重放命令，避免 mutation 在 transport 失败时发生重复副作用。
- 记录 snapshot 时间、Git command 数、patch bytes、full-content bytes、峰值并发、解析时间、渲染 row 数、取消数和失败数。
- 慢操作日志必须携带 snapshot id、scope 和阶段，不记录文件正文或完整 patch。

## 状态与失败恢复

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

## 已实现的数据路径

- Electron main 对 data-directory 初始化使用 single-flight，Review IPC 不再重复执行目录创建与启动日志。
- Coordinator 按 workspace generation 持有 AbortController；invalidation/dispose 会取消 Git child、清空 pending cache，并通知 engine 释放 prepared snapshot。
- tracked patch 按 context 参数分组，路径参数超过 96 KiB 时拆批；50 文件 fixture 验证同参数短路径只产生一次 patch Git 命令。
- Git child、patch 拆分与 hunk/word-diff 解析运行在 `review-git-worker`；worker crash 最多重建一次。
- tracked full content 在 worker 内先执行 `cat-file --batch-check`，再按最多 4 个 blob 执行 `cat-file --batch`；单 blob 超过 2 MiB 时只返回 partial 元数据。
- working-tree full content 只读取前 2 MiB，并保持 realpath、symlink 与 workspace containment 校验。
- renderer 使用 `@tanstack/react-virtual` 的 variable-height row virtualizer；9,000 行 fixture 的 live row DOM 保持低于 1,000 测试上限。
- Standard snapshot 一次 batch intent 请求全部文本 patch；capped snapshot 始终只请求 `selectedFileId`，Expand/Collapse 不改变请求集合。

## 验收矩阵

| 场景 | 文件树 | 中间 Diff | Patch 请求 | Full content |
| --- | --- | --- | --- | --- |
| 8 files / 500 lines | 全部 | 全部 | 批量全部 | 仅可见附近 |
| 129 files | 全部 | 当前文件 | 仅当前文件 | 仅当前文件 |
| 20 files / 9,001 lines | 全部 | 当前文件 | 仅当前文件 | 仅当前文件 |
| 1 large file / >12 MiB estimate | 全部 | 当前文件 | 仅当前文件并受 patch cap | 默认跳过或受限 |
| capped + Expand | 全部 | 当前文件展开 | 不新增其他文件请求 | 不新增其他文件请求 |
| capped + whitespace toggle | 新 snapshot 全部 | 当前文件 | 仅当前文件 | 遵循当前选项 |
| standard + full files off | 全部 | 全部 patch | 批量全部 | 0 次 |

## 明确排除

- 不提供绕过 capped mode 的“强制加载全部”按钮。
- 不把 full-file option 实现成只隐藏已经无条件加载的全部正文。
- 不通过简单 semaphore 保留逐文件重复 Git 架构。
- 不在 renderer 中启动 Git、解析任意路径或读取文件系统。
- 不把可见空白字符与忽略 whitespace-only changes 混成同一个选项。
