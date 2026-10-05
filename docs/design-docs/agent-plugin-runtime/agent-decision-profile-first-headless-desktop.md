# Profile-first 决策与后续演进

历史决定：宿主先选择组合，再启动一棵有明确所有者的插件树。Desktop、Headless 与独立 Host 的产品操作通过应用服务提供，避免所有能力都堆进 Runtime facade。

当前生产入口为 `bootProfileRuntime`；返回组合事实、Context、状态、诊断与 shutdown。旧 BootedProfile wrapper 和 Runtime Session/Run/LLM aliases 已删除。当前源码路线见[启动追踪](agent-spec-dsh-plugin-assembly-and-agent-startup.md)。

Host 与 Harness 是组合关系。Host 拥有连接、存储、任务调度和退出；Harness 拥有可替换执行能力，Run 固定一次组合租约。Profile-first 不再意味着“一棵全局树涵盖全部 Agent 生命周期”，也不要求一个会话永远固定 Harness 版本。

HeadlessRunner 与 DesktopAppService 复用应用/任务服务，保持各自输入、展示及进程行为。未来新增客户端只接 Host 协议，不复制 Agent Loop。

当前范围与验证以[重构决定](agent-harness-host-refactor-decisions.md)、[Runtime 规范](agent-target-runtime-architecture.md)及对应执行摘要为准。旧迁移步骤原文：`git show 1bc434d:docs/design-docs/agent-plugin-runtime/agent-decision-profile-first-headless-desktop.md`。
