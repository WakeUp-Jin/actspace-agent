# 安全默认约束

这份文档用于把安全默认值讲清楚，避免实现逐步演进时越走越散。

## 密钥与环境变量管理

- **不提交密钥**：`.env` 已在 `.gitignore` 中，API Key 等敏感值只存在本地 `.env` 文件或系统环境变量中。
- **模板文件**：`.env.example` 列出全部可配置项和说明，新开发者克隆仓库后复制为 `.env` 即可。
- **集中管理**：所有环境变量通过 `packages/agent-core/src/env.ts` 统一读取和验证，禁止在业务代码中散落 `process.env.XXX` 直接读取。
- **Kimi key 边界**：`KIMI_API_KEY` 可作为 Kimi 主模型密钥，也可作为 DeepSeek 主模型的联网搜索、网页读取和多模态辅助密钥。该 key 只在 main/agent-core 运行时读取，不进入 renderer、session 事件、前端状态或测试快照。
- **优先级**：`process.env` 已有值 > `.env` 文件值 > schema 默认值。这保证 CI/Docker 场景可通过系统变量覆盖。
- **验证前置**：`loadEnv()` 在应用启动时尽早调用，缺失 required 字段或值不合法时立即抛 `EnvValidationError`，不让无效配置流入运行时。
- **冻结对象**：解析后的 `env` 对象通过 `Object.freeze()` 冻结，运行时不可篡改。

## Electron 进程隔离

- 使用 `contextIsolation: true` + `nodeIntegration: false`，renderer 不能直接访问 Node.js API。
- preload 通过 `contextBridge` 只暴露最小、类型化的 bridge API。
- 环境变量（含 API Key）只在 main 进程中可见，不会泄露到 renderer。

## 文件系统访问控制

- 工具系统通过 `workspace-guard.ts` 做路径边界守卫，防止工具访问工作区外文件。
- session 数据存储在 Electron `userData` 目录下，路径固定、可预测。
- Agent 文件工具的工作区由 `ACTSPACE_WORKSPACE_ROOT` 或当前仓库根目录确定，不使用 `userData` 作为代码文件读取目录，避免把应用数据目录和用户工作区混淆。

## 真实模型调用

- 真实 DeepSeek 与 Kimi 请求仅从 main 进程内的 Agent runtime 发起，renderer 只接收结构化事件与最终结果。
- 普通会话默认使用真实 DeepSeek provider；`LLM_PROVIDER=kimi` 可切换 Kimi 主模型，只有显式设置 `MOCK_MODE=true` 时才使用 mock provider。
- DeepSeek 主模型的 `web_search`、`web_fetch`、`analyze_media` 工具由 Kimi 辅助调用实现；只有配置 Kimi key 时才注册，工具结果会被裁剪后回填给主模型。
- 验收真实 provider 时应先发送不含仓库内容和隐私的固定探针，确认连接后再决定是否允许工具结果进入外部模型上下文。
- API 错误仅暴露必要的结构化诊断信息，不把鉴权请求头或密钥写入日志、session 或界面。

## 待补强

- 认证与授权约束。
- 依赖治理与供应链安全要求（见 `docs/SUPPLY_CHAIN_SECURITY.md`）。
- 数据分级、脱敏与保留策略。
- 对外 API、Webhook、文件上传和沙箱执行的规则。
- API Key 轮换与更完整的错误脱敏策略。
