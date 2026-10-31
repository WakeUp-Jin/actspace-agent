# ActSpace packages

产品入口位于 `apps/{desktop,cli,site}`，这里按独立职责组织 workspace package。包数量不是优化目标；能独立替换的执行能力、存储方式与客户端连接不能为精简而耦合。

| 目录 | 职责和依赖方向 |
| --- | --- |
| `runtime/` | Host 装配；`startup/` 启动退出，`session/` 会话接线，`harness/` 执行组合，`profiles/` 默认声明，`projection/` Host 读模型 |
| `agent-service/` | Task 接纳、队列、Run 调度；应用入口共同消费 |
| `agent-host/`、`client/` | 独立 Host 协议/认证/文件访问与客户端连接/订阅/展示投影 |
| `desktop-app/`、`headless/` | 桌面交互策略与 CLI 一次提交等待；复用 AgentApplication |
| `boot/`、`bundle/`、`composition/`、`harness-control/` | 插件准入、组合定义、解析与 Host 授权启用；Run 获取固定租约 |
| `cordis-adapter/`、`core/` | Cordis 服务/事件/生命周期、Agent 身份/后台通知、可替换 Loop 与 Scope |
| `session/` | journal 语义、storage 中立端口、jsonl 物理实现、persistence 业务协调、checkpoint-policy 屏障与 projection/cache 派生读取 |
| `llm/`、`context/`、`prompt/`、`compaction/` | 模型适配、上下文、提示词贡献与压缩策略 |
| `sandbox/` | 可替换的沙箱 Harness 插件：`manager` 提供 `sandbox` 服务（策略合并、按能力选后端、执行生命周期），`nono`、`seatbelt` 注册后端 |
| `harness-evaluation/` | 可选插件，提供 `harness.evaluation` 服务：在评估沙箱里用 CLI 跑候选 Harness 选择，返回结果文件；依赖 `sandbox` 服务与 Host 评估端口，不在默认组合里 |
| `tools/`、`subagent/`、`english-learning/` | 独立执行能力和可选扩展；通过 manifest、Service 与 Scope 组合 |
| `shared/`、`util/`、`diagnostics/`、`test-support/` | 跨进程契约、通用工具、诊断和测试支持；生产代码不反向依赖测试支持 |

依赖通过公开 exports，不能跨包深导入 `src`。Session 业务依赖 storage port，JSONL 实现依赖该契约而不反向依赖 SessionStore。Browser Bridge 位于根目录，是 Host capability，不属于 TS 插件装载树。

实际包、插件与服务清单见[生成矩阵](../docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md)；全仓目录入口见[架构总览](../docs/ARCHITECTURE.md)。
