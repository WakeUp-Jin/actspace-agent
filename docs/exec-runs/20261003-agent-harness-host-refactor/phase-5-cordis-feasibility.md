# P5：Cordis 增量组合与生命周期可行性验证

日期：2026-10-04。状态：机制验证完成；生产增量装配方案尚待讨论，不代表 P5 已实施。

> 后续决策：用户已明确暂不做跨组合实例复用，采用 Patch → 完整新组合 → 独立装配。本文保留实验事实，文末复用建议不再是当前待实施项；以 [P5 计划](../../exec-plans/completed/20261003-agent-harness-host-refactor/phase-5.md) 和设计决策第 42 节为准。

## 问题与范围

用户批准验证：稳定 Host 上通过 Patch 构建新 Harness，复用未受影响实例，旧 Run 保留旧依赖，最后一个使用者退出后清理旧资源。Cordis 是统一插件事件机制，不新增平行事件总线。

本轮只新增可复现测试和文档，不改产品实现，不操作用户会话、真实工具或云端 Host。现有前端设计改动原样保留。没有进行 Computer Use 或真实性能压测。

## 结论

**有条件可行，但不能直接将 Cordis Loader 原地更新用于仍被 Run 使用的组合。**

Cordis 提供插件实例、服务隔离、依赖响应、事件过滤和副作用释放机制。应用必须继续负责组合选择与 Run 租约，并在复用实例前明确跨组合归属。共享实例原型使用显式释放顺序，未实现自动引用管理，也未接入生产 HarnessGenerations。

## 可复现验证

依赖为本仓库实际安装版本：`@deepseek-ai/cordis` 4.0.1、Loader 1.0.2、Include 1.0.6、Group 1.0.1、Timer 1.1.3。测试直接运行真实 Context / Loader，不 mock 其生命周期。

新增文件：[incremental-harness-probe.spec.ts](../../../packages/cordis-adapter/tests/incremental-harness-probe.spec.ts)。

| 编号 | 场景 | 实测结果 | 设计含义 |
| --- | --- | --- | --- |
| V1 | 同一 Loader 树替换服务提供者，保留无关节点 | 无关实例及 Fiber 不变；依赖者重新激活；旧调用者持有的资源已关闭 | 原地增量生效，但不保留旧 Run 的依赖快照 |
| V2 | 插件接管 `internal/update` 原地更新配置 | 只初始化一次，旧持有者也立即看到新值 | 不重启不等于版本固定 |
| V3 | 两个消费者通过命名 realm 共享提供者 | 实例相同；删除一个消费者不关闭提供者；显式删除提供者则另一个消费者失活 | realm 是服务寻址机制，不是 Run 引用计数 |
| V4 | 两个服务隔离域监听同一通知 | 无 carrier 时都收到；显式 `Context.filter` 只投递目标；卸载后监听移除 | 服务隔离不自动提供事件隔离；沿用 Cordis filter |
| V5 | 新旧工具独立命名域，共用未变化能力 | 公共能力初始化一次；新旧消费者同时读取各自工具；按显式顺序释放旧节点不影响新节点 | 存在安全复用的基础机制，但实例归属由调用者负责 |
| V6 | 原地替换的新插件启动失败 | Loader 恢复旧实现，但它是重新创建的实例；原先持有的旧资源仍已关闭 | 配置回滚不能恢复执行中的旧对象与状态 |
| V7 | 当前 `mountIsolatedCordisTree` 挂载两个组合 | 新旧工具隔离；释放 A 不影响 B；未变化插件仍初始化两次 | 当前产品保护隔离，但还没有跨组合实例复用 |
| V8 | 插件注册异步清理和通知监听 | dispose 等待清理门闩；完成后监听不再触发 | 受管异步清理可等待；不代表自动终止任意异步工作 |

执行命令及结果：

```sh
pnpm --filter @actspace/cordis-adapter build
ACTSPACE_REAL_CORDIS=1 pnpm --filter @actspace/cordis-adapter exec vitest run tests/incremental-harness-probe.spec.ts tests/cordis-lifecycle.spec.ts
pnpm --filter @actspace/boot exec vitest run tests/harness-mount.spec.ts tests/harness-generations.spec.ts
```

- Adapter 构建通过；新增 8 项和既有真实 Cordis 生命周期 8 项，共 16 项通过，无跳过。
- Boot 定向回归 14 项通过：独立树、事件过滤、租约保留、最后释放、候选失败、清理失败等既有行为保持通过。
- 共 30 项通过。负向用例通过表示成功观察到限制，不表示该限制已被修复。
- 新测试直接消费 adapter 源码；Boot 消费 adapter dist，本轮先重建 adapter 后运行。
- `pnpm check:docs` 与 `git diff --check` 通过。文档检查首次将单行状态中的“已完成机制验证”误判为整个 active 计划完成，改为明确“P5 正在讨论、机制已有实测结果”后通过。

## 源码检查补充（不冒充运行验证）

1. `cordis-plugin-loader/src/config/entry.ts`：替换 name/inject/group 时释放旧 Fiber；启动失败后重新启动旧插件。`group.ts` 对未变化条目保留实例。
2. `cordis-plugin-loader/src/config/isolate.ts`：命名 realm 映射服务 symbol；它没有本项目 Run/lease 的业务概念。
3. [harness-mount.ts](../../../packages/boot/src/harness-mount.ts) 每次准备均调用独立树装载；[harness-generations.ts](../../../packages/boot/src/harness-generations.ts) 当前按完整组合记录 users 并回收。
4. [scope.ts](../../../packages/core/scope/src/scope.ts) 用 Cordis `Context.filter` 做祖先链投递。跨组合共享插件的事件归属不能仅靠共享服务地址解决；需要复核作用域结构，而非另建事件系统。
5. [filesystem-read/plugin.ts](../../../packages/tools/filesystem-read/src/plugin.ts) 在 apply 中向注入的 `tools.runtime` 注册工具，清理时撤销注册。因此实例可受其他插件写入影响；仅比较模块、配置及直接注入声明不足以证明共享安全。
6. 默认 Harness 已包含多个 behavior entry；多个入口属于同一固定产物，并不等于只有一个运行实例。后续复用身份还需考虑固定产物及其导入闭包，不能只比较入口名称。

## 后续设计建议（尚未实施）

- 保留现有 Run 固定组合和失败候选不影响当前选择的约束。
- 复用需同时考虑固定实现、配置、依赖绑定、注册写入目标和事件作用域；变化影响面可能大于一个源码文件。
- 对满足条件的稳定实例探索独立所有者；组合引用所有者，实际初始化和清理由 Cordis 执行。不将单个 Fiber 同时移动到两棵树，也不另建事件/插件框架。
- 工具注册、Loop 与作用域强相关的插件，先梳理依赖和状态归属，再决定复用粒度。不能承诺只换一个工具就只重建一个实例。
- 保留隔离装配作为未满足共享条件时的正确性基线；不能把所有 Harness 能力提升到 Host 来规避问题。
- 下一步讨论实例复用契约和受影响范围，再形成 P5 执行计划。未验证生产 Patch 的实例增量复用、吞吐、内存收益、网络资源或子进程终止。
