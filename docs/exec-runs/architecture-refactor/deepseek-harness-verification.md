# DeepSeek Harness 组合生命周期验证

日期：2026-10-03。参考仓库：`tmp/deepseek-harness`，commit `da00f7f535`；Node v24.14.1，pnpm 11.7.0。

## 范围

验证参考实现的 Preset 代际、scope、服务隔离、回收和替换失败行为，不代表 ActSpace 第一阶段实现完成。未改正式运行代码。未调用真实模型，未验证 Desktop、远端 Host 或完整 Run 切换。

## 执行与结果

首次运行已有测试时，4 个文件通过、25 项测试通过，另外4个文件因缺少 zod/semver 无法加载。按锁文件补齐测试依赖，禁止安装脚本，未改锁文件：

```sh
cd tmp/deepseek-harness
pnpm --filter @deepseek-ai/dsh-agent-preset-registry... --filter @deepseek-ai/dsh-hmr... install --frozen-lockfile --ignore-scripts
./node_modules/.bin/vitest run packages/preset/agent-preset-registry/tests packages/core/scope/tests packages/core/agent-loop/tests/scope-lifecycle.spec.ts --maxWorkers=2
```

结果：8 个文件、105 项测试通过。

另运行 `packages/boot/hmr/tests/modules.spec.ts`：24 项测试通过。该文件使用真实 Loader 和受控 Node 模块缓存适配器；不能据此声称真实文件监听和 Node 内部缓存端到端路径均已通过。

新增三个探索实验，最终3项全部通过。实验源保留于本机 `tmp/harness-verification/actspace-composition-probe.spec.ts`，临时复制到参考仓库 Preset 测试目录运行，结束后删除该副本，参考仓库 Git 工作区恢复干净。探针不属于正式回归套件。

```sh
# 在 ActSpace 根目录执行；目标文件不存在时复制
cp -n tmp/harness-verification/actspace-composition-probe.spec.ts tmp/deepseek-harness/packages/preset/agent-preset-registry/tests/actspace-composition-probe.spec.ts
cd tmp/deepseek-harness
./node_modules/.bin/vitest run packages/preset/agent-preset-registry/tests/actspace-composition-probe.spec.ts --maxWorkers=2 --reporter=verbose
```

实验最初错误地比较 Cordis 服务代理对象身份，触发代理属性访问错误，改为直接身份比较后也不成立。最终改为验证 Host 已有会话仍可读取、还能创建新会话；不把代理对象身份当作资源生命周期证据。

## 验收点

| 验收点 | 实测结果 | 对我们设计的意义 |
| --- | --- | --- |
| 新旧组合及子 scope 保留、引用归零回收 | 已有测试通过 | 引用持有和退役回收机制可借鉴 |
| 同名服务的 provider 与 consumer 隔离 | 探针通过：旧消费者返回 old，新消费者返回 new | 必须同时隔离服务解析，不能只隔离注册可见性 |
| 回收旧组合不破坏新组合和 Host 能力 | 探针通过：旧 provider 释放一次，新消费者仍返回 new，Host 会话可读写 | 支持分开管理组合独占资源与共享能力；未穷尽所有 Host 服务 |
| 同名组合替换失败后，新使用者继续绑定旧组合 | 目标不满足：旧绑定仍保留，新绑定被拒绝 | 需要候选准备成功后才切换当前选择 |
| 旧组合不受外部资源文件修改影响 | 目标不满足：退役但仍被持有的组合读到了修改后的资源 | 保留插件实例不等于固定实现资源；需要固定产物边界 |
| HMR 激活失败的恢复 | 已有测试通过，行为是重新创建原插件 | 不等于原运行实例和内存状态继续存在 |
| 同会话下一 Run 使用新组合、子 Run 独立选择最新组合 | 未覆盖 | 参考实现按 Agent 绑定；需在 ActSpace 运行管理中验证 |
| 可替换 Loop 的新旧 Run 共存 | 未覆盖 | Loop 生命周期测试通过不能替代不同 Loop 并存验收 |
| 固定代码、动态依赖与资源加载的完整方案 | 未覆盖 | 资源反例只证明现有机制不足，未证明我们的产物方案已可行 |

## 判断

借鉴 Preset 的独立组合树、服务 realm、引用持有与退役回收；不直接用 HMR 作为正式自进化替换路径。Profile/Bundle/Patch 保留为组合描述，运行中实例的持有与回收单独管理。

下一步最小实现验证应补齐候选准备与选择切换，并在 ActSpace 实际 Cordis/Loader 版本上验证 Run 绑定及固定产物。本文是验证证据，不是完整架构实施授权。
