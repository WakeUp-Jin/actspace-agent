# Cordis 采用决定

ActSpace 采用 DSH 发布的 `@deepseek-ai/cordis` 族作为插件生命周期与事件基底。实际版本以依赖声明和 lockfile 为准；本文件不重复维护版本表。

选择理由是 Service 注入、依赖驱动激活、Effect 所有权和可等待释放，使替换 Harness 后能停止旧树拥有的监听器、定时器、连接及其他注册资源。通知直接使用 Cordis `emit`；需返回值或持久化屏障的业务操作使用约定的干预模式或显式 await 服务接口，不新增独立 EventHub。

释放资源不能撤回已经写入文件、发出请求或发送消息的外部影响。补偿、权限、审计和将来的自进化流程仍需要领域设计。Cordis Context/Scope 不提供不可信代码安全隔离。

Host 基底保持稳定；Harness 候选独立准备并验证，新 Run 使用新组合，旧 Run 的租约决定旧树何时释放。当前不复用新旧组合间的插件实例，不实现运行中换 Loop。完整边界见[重构决定](agent-harness-host-refactor-decisions.md)。

采用约束：精确固定同一发布族，拒绝上游命名空间混装、私有 deep import、修改 node_modules 和生产 HMR；用户配置保持 JSON-safe，凭据只传引用。Loader pending 不是启动成功，required 服务和 capability 必须通过装配检查。

Cordis 可能并行释放同树 Effect，不能依赖注册逆序保证跨服务 durability。Host 退出显式先 drain Run，再关闭 Session，最后释放树；插件自己的 Effect 保留局部/失败路径资源释放责任。

Node/Electron、fresh install、packaged runtime、单实例、异步释放和真实外部能力属于不同验收门禁。已有测试与本轮结果分别见 [测试策略](agent-testing.md)和[清理摘要](../../exec-runs/20261004-agent-storage-and-cleanup/execution-summary.md)；不把一次源码检查冒充全部发行门禁通过。

只有上游停更缺陷、供应链不可用或公共 API 无法实现必需语义等证据，才重新评审 fork；需同时明确维护、漏洞响应和退出路径。2026-08-22 原始决定：`git show 1bc434d:docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md`。
