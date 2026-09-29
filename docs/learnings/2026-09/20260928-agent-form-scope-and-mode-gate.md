# Agent 形态要有实例边界，模式要有执行边界

## 核心问题

同一组 Host 插件可以同时服务多个 Agent，但「插件已经装载」不表示「每个 Agent 都应该使用它」。若把形态只做成 prompt 名称或模型工具列表，Agent 释放时无法清理它自己的贡献，直接调用 Tool Runtime 也可能绕过模型 schema。

## 两层组合

Host 负责装载共享服务和 executor；Agent 形态负责从 Host 已准入成员中给一个 AgentScope 激活贡献。形态记录成员 ID、版本及独立摘要，而 Session 的 Host manifest digest 仍说明 Host 的整体装载状态。这两个摘要不能互相冒充：增加无关 Host 插件不应该改变某个 Agent 的成员组合。

AgentScope 拥有工具贡献、prompt contributor、订阅及 disposer。多个 Agent 可共享同一个 executor，但释放其中一个 scope 只撤销它自己的绑定。成员激活出错时，释放该 scope 即可逆序清理已注册贡献。可选成员缺失只改变组合记录，不允许自动换成未选择的能力。

## 模式门禁为什么要深入 Tool Runtime

模型可见 schema 是第一道边界。模型或内部调用仍可能直接向 Tool Runtime 递交工具名；因此生产 Runtime 需要由 Agent 工厂颁发不透明绑定，核对 Session/Agent 身份，再取当前形态贡献与模式允许集合的交集。

工具调用会排队，也可能在审批处等待。只在批次准入时复制一个 `Set` 不够：模式可能在等待期间发生变化。应在准备阶段、审批后、dispatch durability checkpoint 后以及 executor body 前回查可信绑定。权限模式和 Session Grant 在模式门禁之后判断，不能替一个被模式禁止的工具开门。

## 使用时的自检

- 新插件装载后，是否还需要明确加入形态，才能对该 Agent 可见？
- 新工具注册后，是否还需要明确加入模式策略？
- 释放一个 Agent，其他 Agent 的共享 executor 和贡献是否仍可使用？
- 排队或审批恢复时，是否重新校验当前策略，并证明被拒绝调用没有进入 executor body？

对应实现见 `packages/core/agent/src/agent-form.ts`、`packages/core/agent/src/agent-mode-policy.ts` 和 `packages/tools/runtime/src/`；变更记录见 `docs/histories/2026-09/20260928-forms-and-modes-design.md`。
