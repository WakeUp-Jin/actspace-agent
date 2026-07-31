# Plan 7：双模式与虚拟 Diff Renderer

> 状态：已完成。

## 目标

让 renderer 严格按 snapshot load policy 计算请求集合，并用同一套虚拟 row renderer 支持 Standard 全文件 Diff 与 capped 单文件 Diff，补齐真实 loading/error/retry 和 Review Options 语义。

## 文件范围

- `packages/desktop/package.json`
- `pnpm-lock.yaml`
- `packages/desktop/src/renderer/components/review/review-store.ts`
- `packages/desktop/src/renderer/components/review/ReviewWorkspace.tsx`
- `packages/desktop/src/renderer/components/review/ReviewDiffCanvas.tsx`
- `packages/desktop/src/renderer/components/review/ReviewToolbar.tsx`
- `packages/desktop/src/renderer/components/review/ReviewFileTree.tsx`
- `packages/desktop/src/renderer/test/right-panel-review.test.tsx`
- `packages/desktop/src/renderer/test/review-diff-virtualization.test.tsx`（新增）

新增 `@tanstack/react-virtual` 作为 variable-height Diff row virtualizer；不手写通用虚拟列表算法。

## Task 7.1：Store 请求状态重构

- 将 `diffs + expandedFileIds` 驱动加载改为 `fileRequests: Map<fileId, status/result/error>`。
- `all-files` request set 是当前 snapshot 的全部可加载文本文件；`single-file` request set 永远只包含 `selectedFileId`。
- 选择文件不再把 ID 永久累积到后台加载集合。
- 每次 batch 携带 renderer request generation；旧响应不写入新 state。
- failed 提供单文件 Retry；同一 stale generation 只触发一次 snapshot Refresh。

## Task 7.2：Standard 与 capped 行为

- Standard：文件树展示全部，canvas 输入全部文件 section，初始通过一个 batch intent 加载 patch。
- Capped：文件树展示全部，canvas 输入仅当前文件，切换 selection 时取消/忽略上一文件请求。
- capped footer 固定使用 `This diff is large, showing one file at a time`，位于 canvas 内容尾部，不使用顶部 warning banner。
- Standard 的 Expand all 改变全部 section；capped 的按钮只改变当前 section，tooltip 明确为 current diff。
- `allExpanded` 只按当前展示集合计算，不能再按整个 snapshot 误判 capped 状态。

## Task 7.3：扁平 row model 与虚拟化

- 把 file header、hunk header、unified/split line、collapsed context、loading/error/partial state 扁平化为稳定 row key。
- 使用 `useVirtualizer`、动态 measure 和 overscan；wrap/split 切换后重新测量，不重取 patch。
- live Diff row DOM 测试上限为 1,000，目标滚动窗口不超过 600。
- Jump to file 使用 virtualizer index 定位，不调用未挂载 DOM 的 `getElementById().scrollIntoView()`。
- sticky 当前文件 header、hover action、selection ring 和 Viewed 不改变固定工具栏尺寸。

## Task 7.4：Full-content 可见范围调度

- load full files 开启时，使用 virtualizer 可见范围为当前文件及前后有限文件发起 full-content intent。
- capped mode 最多请求当前文件。
- 关闭时不发 full-content intent；已有 patch 立即保持可读。
- 完整正文返回后只扩展该文件的 context rows，不重新加载其他文件 patch。
- 超限/不可用时显示 patch 与 partial 说明，不让整个文件失败。

## Task 7.5：Review Options 纠偏

- `showWhitespace` 改名为 `ignoreWhitespaceChanges`，菜单显示动态动作 `Hide white space` / `Show white space`，说明文本明确其作用是 whitespace-only changes。
- whitespace toggle 重新加载 snapshot，在两种模式中都生效；不再渲染空格圆点或 Tab 箭头。
- word wrap、word diff、rich preview 保持 renderer 行为；word diff 对超长行自动回退。
- full files toggle 使用 Plan 5 独立 content contract，不再清空并重取所有 patch。
- Display preferences 使用现有本地设置边界持久化；默认值为 unified、wrap off、full files on、rich preview off、word diff off、ignore whitespace off，workspace/snapshot identity 不写入偏好。

## 验证

```sh
pnpm --filter @actspace/desktop exec vitest run src/renderer/test/right-panel-review.test.tsx
pnpm --filter @actspace/desktop exec vitest run src/renderer/test/review-diff-virtualization.test.tsx
pnpm --filter @actspace/desktop typecheck
pnpm check:frontend-theme
git diff --check
```

## 完成条件

- capped + Expand 不请求第二个文件。
- Standard 一次 batch intent 覆盖当前 snapshot 文件，不产生逐文件 IPC。
- 9,000 行 fixture 的 live row DOM 不超过测试上限，Jump/scroll 仍可定位。
- full files off 时 full-content 调用次数为 0。
- failed 文件显示 Retry，不再永久显示 `Loading structured diff...`。
- shallow/dark 和 390/620px 容器不出现文字、菜单或文件树遮挡。

## 回退

虚拟 renderer 按单一 row model 切换；若某个富预览类型不能进入虚拟行，可保留该文件一个稳定高度的专用 row，不回退整个 Review 到全量 DOM。
