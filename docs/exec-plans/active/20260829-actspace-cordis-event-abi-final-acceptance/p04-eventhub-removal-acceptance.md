# P04：EventHub 删除验收单

关联总计划：[README.md](./README.md)

状态：PASS（源码、构建产物与 CLI 运行时扫描无旧 EventHub 路径）

## 验收目标

证明 EventHub 已经从 ActSpace 终态代码库中物理删除，而不是仅停止使用。源码、公共 export、测试 helper、Runtime boot、Headless、ToolRuntime 和构建产物都不能保留旧事件总线可达路径。

## 必须删除或检查的路径

- 删除：`packages/cordis-adapter/src/events.ts`
- 删除：`packages/cordis-adapter/tests/events.spec.ts`
- `packages/cordis-adapter/src/index.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/headless/src/runner.ts`
- `packages/headless/src/plugin.ts`
- `apps/`、`packages/`、`scripts/` 的运行时源码与 package exports

## 必须检查

1. 运行时路径不再出现 `EventHub`、`createEventHub`、`createCordisEventHub`、`eventEmitter`、`EventContext`。
2. 不存在旧 `activate()` 事件适配器、字符串 payload bridge 或第二套 listener registry。
3. `dist/`、package export 和 CLI bundle 不包含旧事件总线路径。
4. 历史设计文档或负向 fixture 的命中必须被单独分类，不能混入运行时命中数量。
5. 不删除用户 Session 数据，不改写具体工具 executor，不处理无关 dirty-worktree 文件。

## 验证命令

```sh
rg -n 'EventHub|createEventHub|createCordisEventHub|eventEmitter|EventContext' apps packages scripts
pnpm run check:package-cutover -- --strict
pnpm run check:v2-legacy-removal -- --strict
pnpm run check:packages
```

构建完成后，还要对 `packages/cordis-adapter/dist`、`packages/core/agent-loop/dist`、`packages/tools/runtime/dist`、`packages/headless/dist`、`packages/runtime/dist`、`apps/cli/dist` 重复执行同样扫描。

## 通过证据

执行摘要必须列出每个命中所属文件、文件类别和是否运行时可达。只说“rg 没有结果”但未扫描 dist 或 package export 时，P04 不通过。
