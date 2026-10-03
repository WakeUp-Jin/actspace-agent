# P1 执行过程

2026-10-03 用户授权执行 P1 T1–T5。工作区已有设计、计划和参考验证文档改动，保留，不提交或推送。

## T1

复核确认现有 integrity 仅覆盖入口；新增独立产物清单，不修改原算法。复用仓库已有 TypeScript AST 解析器，移入 adapter 运行依赖，用于检查构建后 ESM 导入及字面量动态导入；不编译用户源码、不新增打包器。显式共享模块解析为批准的文件 URL，并校验身份；普通依赖保持相对导入。

## T2

在当前 Cordis 4.0.1 / Loader 1.0.2 上实现 MemoryTree + group realm。两组同名 provider/consumer 通过普通 ctx.get 注入得到各自服务；复用 core-scope 的事件过滤，不改其实现。Host baseUrl 和共享服务保持可用。普通未声明 provide 在写入前拒绝，激活后审计树归属和 realm；内部 group ID 保留。

## T3

实现 prepare/activate/acquire/discard/close。activate 与 acquire 都为同步提交点；候选归属用 WeakMap，已回收记录从管理器集合删除。旧组合最后一个持有者释放后才销毁；重复 release/close 等待同一结果。使用 gate 验证 prepare 与 close 竞争，不用固定 sleep。

遇到的问题：Cordis Fiber.dispose 可能只记录异常、仍正常返回，最初清理失败测试因此失败。改为在清理期间按树专用 ownership 标记收集 logger error，并和 Promise 拒绝一起报告；测试确认新选择仍有效、旧记录标记 cleanup-failed、close 汇总失败。没有通过修改 Cordis 依赖来改变行为。

## T4

真实磁盘产物通过真实 Loader 装配。验证源码变化不影响旧使用者、新产物使用新代码；候选导入/激活/codec/产物/Host 能力失败不替换当前选择；同基线竞争、A→B→A、多个引用及幂等释放均有用例。

模块全局计数器负向用例确认相同产物在不同实例中共享 ESM 模块状态。明确禁止用它承载隔离状态，而非声称 Cordis 可隔离 JS 全局变量。同名工具注册使用真实 AgentScope 注册表验证；没有把这些持有者称作真实 Run。

## T5

构建与类型检查覆盖 Runtime 的 36 包依赖闭包；adapter、scope、composition、boot、runtime 测试及包边界/契约矩阵通过。adapter 默认跳过的 real Cordis Loader 用例额外用 ACTSPACE_REAL_CORDIS=1 启用并通过。最终命令和数量见 execution-summary.md。

新增两包公开模块说明，同步 P1/总计划及设计状态，记录 history 与选择/退役学习速记。原 runtime/boot、profiles/composition、DesktopAppService、HeadlessRunner、RunController 和 Loop 生产代码没有改动。未进行 Electron、真实模型或远端连接验收；这些不属于 P1。未提交、推送或删除既有目录。
