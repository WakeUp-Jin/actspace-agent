# Auto review

独立 Cordis 判断插件，提供 `approval.auto-review`。输入是 Runtime 提供的当前操作与有来源的上下文，输出 `{approved:boolean, reason?:string|null}`；无工具、无执行权、无新持久事件。

固定策略在 `src/prompt.ts`。Host 通过 `auto-review` LLM route 绑定已连接模型；Desktop 默认跟随当前会话模型。Runtime 负责 30 秒超时、取消、复验以及人工回退。历史上下文超过限制时回人工，不截掉原始授权。模型理由最多 500 字符，并由 Runtime 脱敏后进入既有 `tool/result` 两个可选字段。

实现契约见 [权限模型](../../docs/design-docs/execution-safety/agent-tool-permission-model.md)。
