# P05：CLI run 与仓库清理验收

## 目标

证明删除 EventHub 后，单次无头 CLI run 仍能完成 boot、Agent turn、工具、通知、Session flush、replay 和稳定退出，并证明源码与制品没有残留重复事件层。

## 文件范围

- `apps/cli/src/runtime-v2/*`
- `packages/runtime/src/runtime/*`
- `packages/headless/src/*`
- `scripts/test/agent-cli-process.test.mjs`
- `scripts/check-v2-legacy-removal.mjs`
- `docs/design-docs/agent-plugin-runtime/README.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-08/20260829-1445-cordis-event-abi-and-eventhub-retirement.md`

## 具体动作

1. 运行 CLI no-tool、tool、retry、error、abort 五类 process smoke；确认 stdout JSONL、stderr diagnostics 和稳定 exit code。
2. 从 Session Journal replay 最终状态，证明通知丢失或 observer 失败不影响恢复。
3. 对源码、dist、package exports、CLI bundle 和 clean checkout 执行 EventHub/旧事件名称扫描。
4. 运行完整 typecheck、tests、docs/current-docs、legacy-removal、package-boundary 和 diff whitespace checks。
5. 更新设计索引、执行计划索引和 history；记录真实宿主、Provider、Chrome、Electron、签名/公证仍属于外部门禁的范围。

## 验收命令

```sh
pnpm -r typecheck
pnpm -r test
pnpm run check:docs
pnpm run check:current-docs
pnpm run check:v2-legacy-removal
pnpm run check:packages
git diff --check
```

CLI process smoke 使用仓库现有 CLI 测试入口，不通过第二套 Agent 内核或旧事件适配器。

## 通过条件

- 五类 CLI run 均完成 flush 和 deterministic shutdown；
- Journal 仍只包含新的 13 核心事件和声明的扩展事件；
- 所有 EventHub 相关搜索为空；
- 既有工具 parity、权限 fail-closed 和 artifact 行为保持通过；
- 文档、history 和执行记录对终态描述一致。

## 回退

验证失败时保留失败产物、日志和执行摘要，回滚实现提交但不删除设计与计划文档；不修改或删除用户 Session 数据。
