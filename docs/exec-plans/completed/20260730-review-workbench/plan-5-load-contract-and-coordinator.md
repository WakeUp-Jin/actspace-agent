# Plan 5：加载契约与 Coordinator 调度纠偏

> 状态：已完成。

## 目标

把 Review 从“展开文件触发逐文件请求”改成“snapshot load policy 决定唯一请求集合”，建立批量 patch、独立 full-content、generation 取消和逐文件结果状态，为 Git data plane 与虚拟 renderer 提供稳定契约。

## 依赖与产物

- 必读：`AGENTS.md`、`docs/design-docs/core-review-change-sources.md`、`docs/design-docs/core-review-large-diff-loading.md`。
- 基于已完成的 Plan 0 contract/coordinator，不回退六种 scope、generation、viewed sidecar 或 mutation guard。
- 本计划先完成；Plan 6 和 Plan 7 共同消费本计划的类型与 provider interface。

## 文件范围

- `packages/shared/src/review.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/test/review-contracts.test.ts`
- `packages/desktop/src/main/review-coordinator.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/test/review-coordinator.test.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`

不修改 renderer 视觉组件和 Git 命令实现。

## Task 5.1：显式 load policy 与查询选项

- 为 snapshot 增加 `ReviewLoadPolicy`：`all-files | single-file`，并返回 `file-count | changed-lines | changed-bytes` reason。
- totals 增加 `estimatedChangedBytes`。
- snapshot 查询增加 `ignoreWhitespaceChanges`，并进入 selection/cache key。
- 完成 renderer 迁移前保留 `capped` 兼容读取；Plan 7 完成后删除 boolean，避免双事实源。
- 共享常量统一定义 128 files、9,000 lines、12 MiB 三个严格大于阈值。

测试必须覆盖三个阈值的等于边界与超过边界。

## Task 5.2：批量 patch 契约

- 新增 `ReviewGetFileDiffsInput/Result`，请求项只允许 snapshot 中已知 file ID 和有界 contextLines。
- 响应按 file ID 返回 `ready | partial | failed` outcome，允许一批部分成功。
- 保留旧单文件 IPC 作为迁移期 facade，并在 Plan 7 完成后删除。
- batch key 包含 snapshot、generation、whitespace 与 context 参数；重叠请求合并相同 file ID。

测试断言非法 ID、重复 ID、过期 generation 和 partial success 都有确定结果。

## Task 5.3：独立 full-content 契约

- 新增 `ReviewGetFileContentsInput/Result`，只接受当前 snapshot 已知 file ID。
- 返回 baseline/target 两侧的有界文本内容、availability、byte count 与 partial warning。
- full-content cache 与 patch cache 分离；关闭 full files 不清空 patch。
- 二进制、图片、超限和 unavailable side 返回显式状态，不回退成超大 unified patch。

## Task 5.4：Coordinator request scheduler

- 每个 workspace generation 持有 abort controller、batch pending map、full-content pending map 和有界完成缓存。
- invalidation、Refresh、scope/workspace 切换时先 abort 旧 generation，再清理 snapshot 与 request cache。
- 所有 pending map 使用 `finally` 清理；失败 Promise 不得留在缓存中。
- 同一 generation 的 stale 自动刷新由 renderer 只触发一次，Coordinator 不制造 notification loop。
- 暴露测试用 query metrics：requested IDs、deduped IDs、cancelled count；生产日志只记录数量和耗时。

## Task 5.5：IPC 迁移

- main handler 只执行一次 workspace/data-directory 前置准备，再把批量请求交给 Coordinator。
- preload 只暴露 typed intent，不暴露 repository path、Git argv 或 filesystem primitive。
- 更新 global declarations，并删除迁移完成后不再使用的单文件入口。

## 验证

```sh
pnpm --filter @actspace/shared build
pnpm --filter @actspace/shared exec vitest run src/test/review-contracts.test.ts
pnpm --filter @actspace/desktop exec vitest run src/main/test/review-coordinator.test.ts
pnpm --filter @actspace/desktop typecheck
git diff --check
```

## 完成条件

- load policy 和 whitespace 成为 snapshot/cache 的稳定输入。
- batch 同时返回成功、partial 和失败文件，不出现整批永久 pending。
- invalidation 后旧 batch 被取消或结果被 generation guard 丢弃。
- Plan 6/7 不需要发明第二套 request state。

## 回退

若后续 data plane 尚未接入，batch provider 可以在测试 adapter 中顺序调用旧 provider，但生产 UI 不切换到新入口；不允许以该兼容 adapter 作为最终性能实现。
