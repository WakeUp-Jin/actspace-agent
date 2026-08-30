# P04：删除 EventHub 与旧事件桥

## 目标

在 P01–P03 的 typed Cordis 路径稳定后，物理删除 ActSpace 自己的 EventHub 实现、桥接函数、公共导出、测试和所有运行时依赖。

## 文件范围

- 删除 `packages/cordis-adapter/src/events.ts`
- 修改 `packages/cordis-adapter/src/index.ts`
- 修改 `packages/cordis-adapter/src/cordis-types.ts`
- 修改 `packages/cordis-adapter/src/cordis-root.ts`
- 修改 `packages/core/agent-loop/src/loop.ts`
- 修改 `packages/core/agent-loop/src/service.ts`
- 修改 `packages/runtime/src/runtime/agent-factory-plugin.ts`
- 修改 `packages/runtime/src/runtime/boot.ts`
- 修改 `packages/tools/runtime/src/prepared-execution.ts`
- 修改 `packages/headless/src/runner.ts`
- 修改 `packages/headless/src/plugin.ts`
- 删除 `packages/cordis-adapter/tests/events.spec.ts`
- 修改 `packages/cordis-adapter/tests/cordis-lifecycle.spec.ts`
- 修改受影响 package 的 import/export tests

## 具体动作

1. 先执行源码、package exports、构建产物和 CLI bundle 的引用扫描，形成删除前清单。
2. 删除 `EventHub`、`EventContext`、`WaterfallHandler`、`createEventHub`、`createCordisEventHub` 和 `CordisActivationScope.events`。
3. 删除 boot/agent-factory/headless/tool runtime 中的 bridge 变量和事件 emitter wrapper。
4. 将旧 EventHub 测试改写为真实 Cordis contract tests；不保留新测试对已删除文件的间接依赖。
5. 对所有 package exports、declaration output 和 managed ESM loader 做 clean build。

## 验收

- `rg -n "EventHub|createEventHub|createCordisEventHub|EventContext|WaterfallHandler" packages apps` 无运行时结果；
- `packages/cordis-adapter/src/events.ts` 和 `tests/events.spec.ts` 不存在；
- `pnpm -r typecheck` 通过；
- package boundary 和 current-docs checks 通过；
- 代码中没有 `activate()` 事件兼容回退。

## 回退

只有在 P05 未通过且根因明确为遗漏依赖时，才恢复单个已删除文件到同一提交的临时工作区进行诊断；不得把它重新导出或接回默认 Runtime。
