# P1 执行摘要：固定产物与组合生命周期

2026-10-03，交互模式。P1 T1–T5 完成，整个 Host 分离重构仍在进行中。[计划](../../exec-plans/active/20261003-agent-harness-host-refactor/phase-1.md) · [过程](execution-process.md)。

## 交付

| 模块 | 能力 |
| --- | --- |
| adapter/plugin-artifact | 显式 ESM 闭包固定、内容身份、竞争发布、重复核验、批准的 Host 模块固定引用 |
| adapter/cordis-tree | 同 Host 下独立 Loader 子树、服务 realm、声明检查、独占清理与错误报告 |
| boot/harness-mount | 请求快照、产物/manifest/Host 能力/codec 准入，再激活行为、绑定 scope |
| boot/harness-generations | 候选、同步条件启用、租约、退役回收、关闭竞争及诊断 |

新增 19 个测试（artifact 6、mount 4、generations 9）。复用现有 composition 和 core-scope，不新增描述格式、事件总线或任务队列。TypeScript 从 adapter 开发依赖移到运行依赖用于 AST 分析；boot 增加 core-scope workspace 依赖。未升级 Cordis。

## 自动化证据

以下命令退出状态均为 0。测试统计按最后通过结果计，不重复相加重跑次数。

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @actspace/runtime... build` | 36 包依赖闭包通过；末次 ESM 入口限制修改另重跑 adapter build 通过 |
| `ACTSPACE_REAL_CORDIS=1 pnpm --filter @actspace/cordis-adapter test` | 6 文件、27 测试通过；含默认开关关闭时跳过的真实 Loader 用例 |
| `pnpm --filter @actspace/core-scope test` | 3 文件、18 测试通过 |
| `pnpm --filter @actspace/composition test` | 1 文件、6 测试通过 |
| `pnpm --filter @actspace/boot test` | 4 文件、22 测试通过 |
| `pnpm --filter @actspace/runtime test` | 13 文件、37 测试通过 |
| `pnpm --filter @actspace/runtime... typecheck` | 36 包通过；末次 adapter 修改已由 build 检查类型 |
| `pnpm test:package-boundaries` | 2 测试通过，依赖无环、公开导出检查通过 |
| `pnpm test:contract-matrix` | 2 测试通过，既有事件契约面保持一致 |
| `pnpm check:docs` | 当前文档与骨架检查通过 |
| `git diff --check` | 通过 |

包级共 110 个测试通过，加上两项仓库门禁共 4 个测试。不以测试总数代表界面或真实运行验收。

## A1–A12 验收

所有“通过”均指 P1 自动化覆盖范围。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| A1 固定入口/依赖/资源 | 通过 | plugin-artifact.spec：改写源入口、依赖与资源，旧产物仍读取旧结果，新入口走独立真实路径 |
| A2 非法输入 | 通过 | 同文件：缺失、越界、symlink、摘要损坏、额外文件、动态/外部导入拒绝 |
| A3 复用/竞争发布 | 通过 | 同文件：并发相同内容复用，损坏已存在目录拒绝而不覆盖 |
| A4 准入顺序 | 通过 | harness-generations.spec：缺 codec 报明确原因；behavior 顶层设置抛错哨兵，证明未先导入 |
| A5 服务注入隔离 | 通过 | harness-mount.spec：同名 provider/consumer 普通注入返回不同结果，旧树释放不影响新树/Host |
| A6 事件/注册 | 通过 | harness-mount.spec：scoped emit、parallel、serial、waterfall 保留语义；全局观察者仅计数；generations 同名 search 注册独立释放；scope 原测试覆盖父链 |
| A7 失败候选 | 通过 | mount/generations：缺 provider、未声明 service、导入/激活/Host 能力/产物失败，当前选择和 Host 保留 |
| A8 选择竞态 | 通过 | generations：同步 acquire 前后绑定、同基线候选冲突、ABA、异管理器和重复候选拒绝 |
| A9 引用回收 | 通过 | generations：多个旧持有者，最后 release 清理一次，当前零引用保留 |
| A10 清理/关闭 | 通过 | generations：旧清理失败不否定新启用；inspect/close 报错；gate 控制 prepare-close 竞争、close 等待租约；重复释放/关闭幂等 |
| A11 联合链路 | 通过 | generations：真实产物→真实 Loader→读取实现资源→失败/成功切换→旧引用释放 |
| A12 默认兼容 | 通过 | adapter 旧 source-loader、boot config/startup、runtime 原测试通过；默认生产入口未改 |

## 下一阶段交接与人工验证

先审阅 [adapter API](../../../packages/cordis-adapter/README.md) 和 [boot API](../../../packages/boot/README.md)。需要复核时在根目录执行上表命令；测试会自动创建并清理临时产物，不需要操作用户会话或调用模型。

P2 先写独立详细计划，再把真实任务实际开始/结束接到 acquire/release，并统一 Desktop/Headless 的任务管理。P3 负责 Patch 显式启用与审批接入。P1 不代表真实 Loop 已可替换、不代表旧新真实 Run 共存已经验收。

未覆盖：真实 Electron UI、真实模型、远端协议/连接、客户端、手机前端、真实 Run 迁移。也不提供选择持久化、崩溃恢复、磁盘 GC 或通用插件打包。未修改产品默认启动路径；没有实机启动验收声明。

实现边界：显式构建闭包不证明任意 JS 隐藏依赖完整；Host 共享模块的传递固定由 Host 负责；插件必须把可变状态放在 apply/fiber。Node ESM 缓存不会随实例释放卸载，进程内 Cordis 不是安全沙箱。调用方必须结束持有者、释放租约、等待 manager.close，再关闭 Host。

工作区保留原有文档改动和本次代码/文档变更，未提交或推送。
