# Plan 6：Git 批处理与完整正文数据面

> 状态：已完成。

## 目标

消除逐文件 repository/baseline 解析和逐文件 Git 子进程，把 tracked patch 合并为批量 Git diff，把 untracked/full-content 限制在明确并发与大小预算内，并将大文本命令与解析移出 Electron main 热路径。

## 依赖与 ownership

- 依赖 Plan 5 的 load policy、batch provider 和 full-content contract。
- owns Review 查询数据面、Git worker、patch 拆分、完整正文读取和对应 main tests。
- mutation、Commit/Push/Create PR 继续沿用当前安全路径，不进入 query worker 自动重试。

## 文件范围

- `packages/desktop/src/main/review-git-engine.ts`
- `packages/desktop/src/main/review-git-worker-client.ts`（新增）
- `packages/desktop/src/main/review-git-worker.ts`（新增）
- `packages/desktop/src/main/review-git-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/test/review-git-engine.test.ts`
- `packages/desktop/src/main/test/review-git-worker.test.ts`（新增）
- `packages/desktop/tsconfig.electron.json`

## Task 6.1：一次性 prepared snapshot

- snapshot summary 阶段一次解析 canonical workspace、repoRoot、pathspec、HEAD 和 selection command。
- Branch 的 local ref、upstream、merge-base 与 divergence 只在 prepare 阶段计算一次。
- Engine 内部以 snapshot id + generation 保存 `PreparedReviewSnapshot`；不把可执行 argv 或任意路径暴露给 renderer。
- invalidation/dispose 删除 prepared state。

测试通过 runner 调用计数断言批量文件请求不会重复执行 `rev-parse`、upstream 或 merge-base。

## Task 6.2：规模统计与 load policy

- summary 使用现有 NUL-delimited name-status/numstat 得到 file count 和 changed lines。
- tracked sides 通过 raw full-index object ID + batch-check size 估算 changed bytes；working-tree/untracked 使用受保护的 `lstat` size。
- 按共享阈值计算 `all-files | single-file` 与第一命中 reason。
- summary 不读取正文，不为计算阈值启动逐文件 Git 命令。

## Task 6.3：tracked batch patch

- 按 snapshot、whitespace、context 参数分组文件。
- 每组使用一个 `git diff --full-index --find-renames [--ignore-all-space] -- <paths...>`。
- pathspec 达到明确 argv 字节预算时拆成少量批次；拆批按确定顺序执行并记录 batch count。
- Worker 按 `diff --git` 边界拆分输出，通过 snapshot path/rename identity 映射回 file ID。
- 单文件解析失败只返回该文件 failed；其余 outcome 保持成功。
- 同一路径新 generation 到达时终止旧 child process。

## Task 6.4：untracked 与 full-content

- untracked 文本读取并发上限为 8，继续执行 realpath、workspace containment、symlink、binary 和 size guard。
- baseline/index/commit/branch 的 tracked blob 先解析 object ID，再使用 `git cat-file --batch`，每批最多 4 个 object。
- working-tree 一侧通过受保护的文件读取；deleted/added side 返回 unavailable，不伪造空正文。
- patch 和 full content 分开缓存；单对象与 generation 总缓存都有硬上限和 LRU eviction。
- 完整正文只提供给 Coordinator 明确请求的 file ID，不根据 snapshot 文件数自行 fan-out。

## Task 6.5：Worker 生命周期与重试

- Electron main 通过 `review-git-worker-client.ts` 管理一个 Review query worker；构建产物使用 `dist-electron/main/review-git-worker.js` 的确定路径。
- worker crash 时使当前 query failed，并只重建一次 worker；mutation 不自动重放。
- 只读 patch/content 的可恢复失败最多重试 3 次，退避为 300/600/1200ms。
- worker dispose、窗口退出和 generation abort 必须终止 child process 并释放 listener。

## 验证

```sh
pnpm --filter @actspace/desktop exec vitest run src/main/test/review-git-worker.test.ts
pnpm --filter @actspace/desktop exec vitest run src/main/test/review-git-engine.test.ts
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop build:electron
git diff --check
```

## 完成条件

- 50 个 tracked 文件的同参数 patch 请求不再产生 50 个 Git diff。
- Branch batch 不重复计算 upstream/merge-base。
- untracked 峰值并发不超过 8，full-content object batch 不超过 4。
- `git diff --unified=1000000` 从 Review 查询路径消失。
- worker 失败、单文件失败、超限与取消都有可测试结果。

## 回退

Worker client 保留同接口的 in-process test adapter。生产 worker 无法启动时显示可重试的 Review unavailable，不静默退回逐文件无限并发。
