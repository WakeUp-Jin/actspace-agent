# DSH Runtime 的插件所有权迁移模式

## 是什么

“Runtime 本身就是插件组装结果”并不意味着把 Bootstrap 和 Host 也塞进插件。可复用的边界是：Bootstrap 只创建 Cordis root、注入 Host facts、挂载 `cordis.yml`、等待 Loader settlement；Session、LLM、Tools、Agent、AgentLoop、Subagent 和 Headless runner 则在 `apply(ctx, config)` 中创建真实实例，并由 Context effect 回收。

## 为什么需要

如果 Boot 先 `new` 出领域对象，再把它们塞进 Context，插件只是观察者，依赖关系仍隐藏在启动函数里，CLI/Desktop 也会形成两套装配路径。把构造迁入 Behavior 后，依赖通过 `inject` 可见，Loader settlement 成为唯一启动屏障，RuntimeHandle 只做 facade lookup。

## 核心模式

```text
Host facts
   ↓ prepare before Include
cordis.yml + Include + Loader
   ↓ settlement
Session → LLM/Tools/Prompt → Agent factory → AgentLoop → Subagent/RunController
   ↓
Headless runner: create/resume → agent.followup → durable inbox → flush
```

- Host port 只包含 credential、approval、IO、workspace、capability 和 signal 等外部事实。
- 每个领域 Behavior 只从 `ctx.get()` 读取上游服务，并用 `ctx.provide()` 发布自己的服务。
- 长生命周期资源用 `ctx.effect()` 注册 disposer；销毁顺序由插件依赖反向结算。
- `agent.followup()` 仍然先写 durable inbox，再 claim 并进入 AgentLoop，避免调用方绕过恢复边界。
- 旧构造器可以保留用于诊断，但必须由显式 flag 选择，不能成为默认 fallback。

## 常见陷阱

1. 新增插件包后没有重新生成 workspace link，Loader 会报 “Cannot find package”；先执行离线 `pnpm install`。
2. 插件向 Context 提供同一个 service id 两次，会在 Include 阶段失败；bridge service 应只由一个 Behavior 或 Bootstrap 发布。
3. Host fallback 与 plugin-owned service 同时存在时，RuntimeHandle 可能悄悄使用旧对象；默认路径应验证 required service 并优先 Context lookup。
4. Session metadata/title 事件仍需使用核心 owner，不能因为事件由 headless runner 触发就改 owner。

## 自检问题

- 如果没有 Host port，Agent Behavior 能否自行创建 credential、workspace 或 approval？如果能，边界泄漏了。
- Loader settlement 前是否可能创建主 Agent？如果能，Agent 可能看到半组装的 Tools/LLM。
- CLI 是否仍然需要知道 `RunController` 或 `AgentLoop` 的具体类？默认 headless path 中不应该需要。
