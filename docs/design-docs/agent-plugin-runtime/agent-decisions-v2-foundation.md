# v2 基础决策的历史理由

2026-08-22 的早期决定已由 [Host/Harness 重构决定](agent-harness-host-refactor-decisions.md)和[当前总览](agent-target-overall-architecture.md)演进。本文保留理由，不提供旧迁移步骤或当前 API 清单。

1. 采用 DSH 发布的 Cordis 族管理 Service、Effect 和插件树；Agent 语义、Session 格式及 Host 产品流程归 ActSpace，不直接引入 DSH 整套产品。
2. Journal 是会话事实源，Surface 表达有效上下文；通知和前端缓存不成为另一份真相。
3. Provider wire/catalog 放在 LLM Adapter 后；凭据、代理与终端/桌面能力留在 Host 边界。
4. 受信任后端插件同进程运行；固定前端不执行插件携带的任意代码。Cordis 隔离不是安全沙箱。
5. 保留工具 executor 与行为测试，替换旧注册/产品耦合；不保留 Kairos、旧 fs-watch 或旧产品内核的长期兼容层。
6. managed ESM runtime 支持插件装配；CLI 默认临时会话，持久化显式启用。

早期“全部配置 restart-only”“只有两个 Profile”“主用户 Inbox”及禁止多存储后端的描述已被后续决定替代：Host 基底受控重启，Harness 新组合供后续 Run 使用；用户输入走 TaskLedger；Session 业务依赖中性存储契约，生产暂用 JSONL。

依赖采用与制品门禁见[Cordis 决定](agent-decision-cordis-adoption.md)、[LLM 规范](agent-target-llm-adapter.md)和各次执行摘要。已安装依赖不证明 fresh install、签名或真实 Provider 验收完成。改变信任、数据格式或插件隔离等决定时，记录新的理由和验证，不静默改向。

早期全文：`git show 1bc434d:docs/design-docs/agent-plugin-runtime/agent-decisions-v2-foundation.md`。
