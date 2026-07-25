# 多供应商 LLM、模型管理与任务模型执行计划

状态：实现完成，待用户统一手动验收（Plan 0-5 完成，Plan 6 离线自动化与桌面基础验收完成）

设计来源：

- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/design-docs/model-context/agent-context-compression.md`
- `docs/design-docs/collaboration/agent-explore-subagent.md`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `docs/design-docs/frontend/front-设置页规范.md`

最终统一手动验收使用：[多供应商 LLM 最终手动验收清单](manual-acceptance-checklist.md)。

## 目标

把 actspace 当前以 DeepSeek / Kimi 静态注册表和 env 装配为主的 LLM 模块，升级为支持 DeepSeek、Kimi、OpenRouter 的多供应商体系。用户可以分别配置供应商密钥、Base URL 和服务商级代理，从 OpenRouter 目录添加模型，控制模型是否出现在主会话中，并为主会话、轻量任务、Explore 和 Kairos 选择能力匹配的可用模型。

本计划按生产可用的 V1 路线推进，不先做只在设置页展示、无法贯通真实 turn 的 UI Demo。完成态必须包含持久化迁移、密钥隔离、代理 transport、动态模型目录、purpose-aware 模型解析、运行时消费方迁移、浅深主题 UI 和真实 Electron/provider 验收。

## 当前基线

- `packages/shared/src/model-config.ts` 使用有限 `ModelId` 联合类型和静态 `MODEL_REGISTRY`。
- `packages/shared/src/settings.ts` 的 `ProviderId` 只包含 DeepSeek / Kimi，`AppSettings.version` 为 1。
- `packages/agent-core/src/engine/create-agent-deps.ts` 通过手写 key/base URL Map 构造 LLM 配置。
- `createSummarizerForAgent()`、`createTitlerLLMService()` 固定使用 DeepSeek Flash。
- Explore 和 Kairos 分别维护默认模型或允许列表。
- `SettingsService` 已经具备 `safeStorage` 注入、原子写 settings/secrets 和 provider key 脱敏视图，可在此基础上迁移。
- 设置页当前把供应商连接、搜索供应商和默认模型放在同一个“模型”分区。
- Composer、Settings、Kairos、Usage 和 Session Preview 仍直接消费静态 `MODEL_LIST` / `MODEL_REGISTRY`。

## 核心约束

- 首批只支持 DeepSeek、Kimi、OpenRouter，不开放任意自定义供应商。
- Provider、API protocol、Model 和 Transport 必须分层；OpenRouter 复用 OpenAI-compatible 协议服务。
- 模型稳定身份使用 provider-qualified `ModelKey`，旧 `ModelId` 只在读取兼容边界存在。
- API Key 明文只在 Electron main / agent-core 调用边界短暂存在，不进入 renderer、session、日志或 `settings.json`。
- 代理按供应商生效，不写全局 `HTTP_PROXY` / `HTTPS_PROXY`，不影响工具、更新器和其他供应商。
- OpenRouter 采用“精选默认模型 + 远端目录手动添加”；远端目录不会自动灌入 Composer。
- 所有模型选择入口消费同一个 `listUsableModels(purpose)` 解析器，不保留独立 allowlist。
- utility 不可用时只回退当前主模型；不得偷偷选择另一家供应商的便宜模型。
- Explore 选中模型不可用时回退当前主模型，并输出脱敏诊断。
- Kairos 选中模型不可用时进入明确的 unavailable/blocked 状态，不静默换模型继续自主运行。
- 已断开的供应商保留模型定义、历史 session 和 usage，只让新请求变为不可用。
- 设计文档表达目标态，`agent-current-module-map.md` 只在对应代码落地后更新现状。

## 分阶段路线

```text
Plan 0：共享 Provider / ModelKey / purpose resolver 契约
    ↓
Plan 1：Agent Core provider runtime、代理 transport 与 OpenRouter 协议接入
    ↓
Plan 2：Settings v2、密钥、供应商连接与幂等迁移
    ↓
Plan 3：OpenRouter 目录缓存、精选模型与 installed model 管理
    ↓
Plan 4：主会话 / utility / Explore / Kairos 运行时消费方迁移
    ↓
Plan 5：类型化 IPC、设置页、Composer 与模型目录 UI
    ↓
Plan 6：跨层回归、迁移、代理、安全和真实 Electron 验收
```

Plan 5 的纯展示组件可以在 Plan 0 契约稳定后准备，但不能在 Plan 2/3 IPC 完成前接入私有 mock 存储或直接请求 OpenRouter。最终集成仍按 Plan 0 → 6 顺序验收。

## 子计划清单

| Plan | 目标 | 主要产物 | 依赖 |
| --- | --- | --- | --- |
| [Plan 0](plan-0-shared-model-contracts.md) | 锁定 Provider、ModelKey、模型定义、purpose resolver 和共享设置/IPC 契约 | `packages/shared/src/model-config.ts`、`settings.ts`、`ipc.ts` | 无 |
| [Plan 1](plan-1-agent-core-provider-runtime.md) | 建立显式 provider runtime、请求 adapter、代理 fetch 和 OpenRouter 请求路径 | `packages/agent-core/src/llm/`、`engine/create-agent-deps.ts` | Plan 0 |
| [Plan 2](plan-2-settings-v2-providers.md) | 完成 settings v1 → v2、OpenRouter secret、供应商配置和连接测试 | `packages/desktop/src/main/settings-service.ts`、provider connection service | Plan 0、1 |
| [Plan 3](plan-3-openrouter-model-catalog.md) | 完成精选模型、远端目录缓存、添加/启用/删除模型 | model catalog/store services、cache contract | Plan 0-2 |
| [Plan 4](plan-4-task-model-runtime.md) | 迁移 main/utility/Explore/Kairos 及其他静态模型消费方 | Agent turn、compact、title、Kairos、usage/display | Plan 0-3 |
| [Plan 5](plan-5-renderer-provider-model-ui.md) | 接入 IPC/preload，拆分服务商/模型设置页并联动 Composer | provider/model components、catalog dialog、renderer state | Plan 0-4 |
| [Plan 6](plan-6-e2e-acceptance.md) | 完成自动化、故障注入、安全和真实 provider/Electron 验收 | acceptance evidence、docs/history/release 收口 | Plan 0-5 |

## 全局数据流

```text
settings.json v2 + secrets.json
        ↓ main 解析/解密
ProviderRuntimeConfig + ModelDefinition
        ↓ purpose resolver
ResolvedRuntimeModel
        ↓ buildLLMConfigFromRuntime
OpenAI / Anthropic protocol service
        ↓ provider-scoped fetch/dispatcher
DeepSeek / Kimi / OpenRouter
```

Renderer 只接收：

- 供应商是否配置密钥、连接状态、Base URL 和代理是否开启。
- 已添加模型、能力、价格摘要、启用状态和不可用原因。
- 按 purpose 过滤后的候选模型。
- 目录缓存时间、加载状态和裁剪后的错误。

Renderer 不接收：

- API Key 明文或 Authorization header。
- 代理认证信息。
- OpenRouter 原始错误正文。
- main 内部 transport / SDK client 实例。

## 任务模型失效矩阵

| 配置 | 选中模型不可用时 | 是否改写用户配置 |
| --- | --- | --- |
| 默认会话模型 | Composer 要求用户选择可用模型；已有会话保留历史模型标识 | 否 |
| utility | 本次调用回退当前主模型；主模型也不可用时走确定性 fallback | 否 |
| Explore | 本次调用回退当前主模型并记录脱敏原因 | 否 |
| Kairos | 阻止启动或暂停 tick，UI 显示模型不可用 | 否 |

## 并行边界

- Plan 0 完成后，Plan 1 的 Agent Core transport 与 Plan 5 的纯 UI 组件骨架可以并行。
- Plan 2 和 Plan 3 都修改 `SettingsService` 周边，默认串行，避免迁移与模型存储冲突。
- Plan 4 必须在 Plan 3 的 model snapshot / resolver API 稳定后执行。
- Plan 5 不得绕过 main 直接读写 `<userData>` 或请求 provider。
- Plan 6 是唯一允许宣告整体功能完成的阶段。

## 全局风险与缓解

| 风险 | 缓解方式 |
| --- | --- |
| 动态 ModelKey 一次性破坏大量静态类型 | 保留 `LegacyModelId` 和单向映射；按 shared → runtime → UI 顺序迁移 |
| settings 迁移覆盖用户配置 | 解析成功后才原子写 v2；首次成功迁移前生成一次 `settings.v1.backup.json` |
| API Key 泄漏到 renderer 或日志 | 所有 IPC 返回脱敏 view；测试扫描序列化结果和日志字段 |
| ProxyAgent/连接池泄漏 | 按标准化代理 URL 缓存复用，应用退出统一 close，测试锁定关闭行为 |
| OpenRouter 目录字段漂移 | main 进程做容错归一；坏条目跳过并计数，不让单条数据拖垮整个目录 |
| provider 声明 tools 但真实不兼容 | catalog 模型记为 `declared`/`unknown`；主 Agent 只接受 verified/declared，精选模型必须真实验证 |
| 供应商断开后后台任务继续调用 | 每次创建 runtime 前重新解析 usability；Kairos provider/model 变更触发重建或暂停 |
| UI 一次展示数百模型卡顿 | 搜索防抖 + 固定行高虚拟列表；Composer 只展示 installed + enabled + usable |
| 旧 session / usage 无法显示模型名 | 读取层使用 legacy map，再回退保存的 api model/string，不批量重写历史 JSONL |
| UI key 更新与 env 兼容路径产生双真源 | Desktop 完成显式 runtime 迁移后停止依赖 LLM key 的 `process.env` 注入；CLI/CI 继续走 env |

## 总体验证命令

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
pnpm check:docs
pnpm check:secrets
```

真实桌面验收至少覆盖：

1. 从 settings v1 启动后迁移到 v2，原默认模型、Explore、Kairos、插件和 Skill 设置保持。
2. 分别连接 DeepSeek、Kimi、OpenRouter；renderer 和日志均看不到明文 Key。
3. DeepSeek / Kimi 直连成功；OpenRouter 在用户环境中关闭代理失败、开启代理成功。
4. OpenRouter 代理开关不影响 DeepSeek、Kimi、`web_search`、Browser Use 和应用更新。
5. OpenRouter 目录可以刷新、缓存、离线回看、搜索和添加模型。
6. 停用模型后 Composer、utility、Explore、Kairos 候选同步变化，不需要重启。
7. utility 指向 OpenRouter 后，标题、工具摘要和手动 `/compact` 使用该模型；断开 OpenRouter 后回退当前主模型。
8. Kairos 选中模型断开后停止使用该模型并显示不可用，不静默切换供应商。
9. 历史 session、Usage 和 Session Preview 对旧 ModelId 与新 ModelKey 都能显示稳定名称。
10. 服务商页、模型页、目录弹窗和 Composer 在浅色、深色、跟随系统三态下可读且键盘可操作。

## 回滚策略

- 每个 Plan 独立完成测试后再进入下一阶段，避免未贯通的跨层半成品长期留在主分支。
- settings v2 迁移失败时继续使用内存中的 v1 解析结果，不覆盖原文件。
- OpenRouter 目录失败时保留最后一次成功缓存；没有缓存时只保留精选模型。
- 新 runtime 装配在完成 Plan 4 前保留旧 env builder 测试入口；Plan 4 全量消费方通过后再删除 desktop 旧路径。
- 若真实 OpenRouter turn 失败，可停用 OpenRouter provider，不影响 DeepSeek / Kimi 现有运行路径。

## 必读文档

执行任一子计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- 当前子计划列出的附加文档

涉及 renderer 的计划还必须读：

- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/coding-standards/team/frontend-style-scope-conventions.md`

## 进度记录

- [x] 多供应商设计规范完成。
- [x] execution plan 拆分完成。
- [x] Plan 0：共享模型契约。
- [x] Plan 1：Agent Core provider runtime 与代理。
- [x] Plan 2：Settings v2 与供应商连接。
- [x] Plan 3：OpenRouter 模型目录与 installed models。
- [x] Plan 4：任务模型和运行时消费方迁移。
- [x] Plan 5：IPC / preload / renderer UI。
- [ ] Plan 6：离线故障注入、迁移与真实 Electron 基础 UI 已验；OpenRouter 代理、跨任务模型、跟随系统主题和完整键盘路径由用户统一手动验收。

## 决策记录

- 2026-07-24：采用总控 README + 7 个子计划，共享契约先行。
- 2026-07-24：不做只展示 OpenRouter 的 UI Demo，首轮实现必须贯通真实 turn。
- 2026-07-24：保留旧 ModelId 读取兼容，但所有新配置和事件使用 provider-qualified ModelKey。
- 2026-07-24：代理 transport 放在 agent-core 的 provider runtime 层，并复用于 main 的连接测试与 catalog 请求。
- 2026-07-24：Desktop 完成显式 runtime 配置后不再依赖把 LLM Key 回写 `process.env`；CLI/CI env 入口保留。
- 2026-07-24：Kairos 模型不可用时暂停并提示，不做自主场景下的静默 provider fallback。
- 2026-07-25：连接测试改为可选诊断；只要已安全保存 Key 且未明确测试失败，模型即可进入候选，满足“配置后直接使用”。
- 2026-07-25：真实 Electron 已确认 v1→v2 备份迁移、DeepSeek/Kimi 连接测试、主会话与轻量模型候选、OpenRouter 目录空态及浅深主题；用户要求停止开发进程并在最后统一完成剩余手动验收。
- 2026-07-25：补齐 402/404、缓存写权限、半截临时文件、在用模型删除和 stale 目录恢复等离线故障注入；所有启动项目保持关闭，Plan 6 只剩用户统一手动验收项。
- 2026-07-25：完成最终运行时审计：余额查询不再读取 env，Kairos 改用动态 ModelKey 并删除静态 allowlist/env 路径，设置页移除重复静态模型控件；离线全量回归为 shared 53、agent-core 826、desktop 458 项全部通过。
