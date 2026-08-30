# P02：Tool Runtime Shell

状态：完成候选（P02 已实施，待计划归档）

## 目标与依赖

保留 ActSpace 当前工具 kernel，重写 DSH 风格 Tool shell：权限、审批、三段 hooks、Journal adapter、progress、diagnostics、lease/dispose 和 stdout 隔离。依赖 P00 的 `tool/call`/`tool/result` schema，可与 P01 并行。

## 文件范围

- `packages/tools/runtime/src/runtime.ts`
- `packages/tools/runtime/src/scheduler.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/tools/runtime/src/policy.ts`
- `packages/tools/runtime/src/approval-port.ts`
- `packages/tools/runtime/src/result.ts`
- `packages/tools/runtime/src/activation-lease.ts`
- `packages/tools/runtime/src/test/`（如需新建）
- 仅在适配所需时修改工具 plugin adapter；不改具体 read/list/edit/bash/Browser executor body。

## 步骤与验证

1. 保留 definition/schema/argument materialization/validation/checkpoint/executor/finalizer/artifact/redaction/ordered commit kernel。
2. 接通 `tools/pre-execute`、`tools/execute`、`tools/post-execute`，改写参数后重新校验并记录 provenance。
3. 按 captured registration → policy → approval → checkpoint → execute → normalize → result 的顺序执行；policy/approval 失败 fail closed。
4. Shell 负责唯一 `tool/call`/`tool/result` Journal adapter 和 `tools/result` notification；executor 只能返回结构化结果，不能写 CLI stdout。
5. 对 read/list/edit/bash/Browser Bridge 运行 parity fixtures，并覆盖取消、超时、approval reject、plugin dispose、crash recovery。

验证命令：

```bash
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/tools-runtime typecheck
```

通过标准：工具业务输出/副作用与当前行为一致；每次调用只有一个最终 result；hook、权限、审批均可观测且不可绕过。

## 回退

若某个 parity 失败，只回退 shell 适配并保留 kernel；不得为通过测试而修改工具实现的路径、排序、截断或错误语义。
