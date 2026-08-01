# Plan 6：端到端迁移、代理、安全与真实 Electron 验收

状态：执行中（离线自动化与真实 Electron 基础路径完成，用户统一手动验收待办）

依赖：Plan 0-5

产物消费方：发布与后续 provider 扩展

## 目标

用自动化回归、故障注入和真实 Electron/provider 操作证明多供应商能力完整贯通，并同步现状文档、history、发布记录和可迁移学习文档。只有本计划通过后，设计文档状态才能从“待实现”改为“已落地”。

## 附加必读

- `docs/FRONTEND_VERIFICATION.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/HISTORY_GUIDE.md`
- `docs/releases/README.md`
- `docs/learnings/WRITING_GUIDE.md`
- `docs/design-docs/agent-runtime/agent-testing.md`

## 允许修改的文件

- Plan 0-5 涉及模块的测试文件
- `packages/desktop/src/main/test/` 下跨 service 集成测试
- `packages/desktop/src/renderer/test/` 下跨页面交互测试
- `scripts/` 下与本功能直接相关的可重复 smoke 脚本（只有命令无法表达时新增）
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `docs/histories/2026-07/` 对应 history
- `docs/releases/` 对应用户可见发布记录
- 满足学习沉淀条件时的 `docs/learnings/2026-07/` 文档
- 本 execution plan 的进度和决策记录

不得在验收阶段顺手增加第四家 provider 或新的 provider-native 能力。

## 自动化验收矩阵

### Shared

- v1/v2 settings types、ModelKey legacy mapping、purpose resolver。
- provider-qualified identity 和动态模型 serialization。
- capability mismatch 与不可用原因稳定。

### Agent Core

- 三家 provider 协议选择、request adapter、usage。
- direct/proxy fetch、dispatcher cache/close、proxy error。
- utility/Explore fallback 和 Kairos blocked。
- DeepSeek/Kimi 既有 tool call、thinking、DSML guard 回归。

### Desktop main

- v1 → v2 迁移、backup、坏 JSON、原子写、并发更新。
- key 加密/断开、provider connection 状态。
- OpenRouter catalog cache、model add/enable/remove。
- settings/model change 后 main turn、compact、Kairos 重建。
- UI 已断开时系统 env 中的旧 key 不得生效。

### Renderer

- 服务商/模型页面完整交互。
- catalog 大列表、搜索、错误与 stale cache。
- Composer/task/Kairos 候选同步。
- keyboard、focus、aria 和三态主题。

## 故障注入

必须覆盖以下可恢复失败：

1. `settings.json` 为 version 1、坏 JSON、未知 version、只写了一半的临时文件。
2. `models-cache.json` 坏 JSON、过期、无权限写入、reload 网络失败。
3. OpenRouter key 无效、余额/权限不足、模型不存在、429、5xx。
4. 代理 URL 非法、代理端口不可达、代理在请求中途关闭。
5. provider 在 utility summarization 中途断开。
6. Kairos 选中 provider 断开并在随后重新连接。
7. 当前 Composer 模型被停用或删除引用失败。

每个场景必须证明：没有明文 key 泄漏、没有破坏旧配置/缓存、UI 有明确恢复入口。

## 真实 provider 验收准备

统一执行与结果记录使用 [`manual-acceptance-checklist.md`](manual-acceptance-checklist.md)，本节保留验收设计与完成标准。

- API Key 只通过设置页输入，不写 `.env`、命令行、fixture、截图或仓库文件。
- 使用无隐私固定探针，例如“只回复 ACTSPACE_PROVIDER_OK”，不携带 workspace/session/tool 内容。
- 使用 `pnpm dev:log` 启动，验收后检查 `logs/latest-dev.log` 和相关 agent-run JSONL 的字段是否脱敏；日志不提交。
- OpenRouter 代理使用用户本机已存在的 HTTP(S) 代理地址，计划不修改系统全局代理。

## 真实 Electron 验收步骤

### 6.1 迁移与启动

1. 准备一份脱敏 settings v1 fixture 到临时 userData。
2. 启动 Electron，确认自动迁移 v2、backup 存在且原其他设置保持。
3. 重启应用，确认迁移不重复、addedAt 和连接状态稳定。

### 6.2 DeepSeek / Kimi

1. 分别连接并测试 DeepSeek、Kimi，保持代理关闭。
2. Composer 选择各自 chat 可用模型完成固定探针 turn。
3. 检查 session/usage 中 provider-qualified ModelKey 和价格快照。

### 6.3 OpenRouter + 代理

1. 连接 OpenRouter，代理关闭；在用户当前网络需要代理的前提下确认连接测试失败且分类为 network。
2. 开启仅 OpenRouter 的代理，测试连接成功。
3. 刷新目录、添加一个 utility 模型和一个通过工具能力过滤的 chat 模型。
4. 使用 chat 模型完成普通 turn 和一个只读工具调用。
5. 关闭 OpenRouter 代理，确认 DeepSeek/Kimi 测试和 turn 不受影响。

如果用户网络直连 OpenRouter 本来可用，则第 1 步改为使用不可达的临时代理地址证明 provider-scoped failure，再恢复真实代理完成成功路径；不得为了制造失败修改系统代理。

### 6.4 utility / Explore / Kairos

1. utility 选择 OpenRouter 模型，触发首轮标题、长工具输出摘要和手动 `/compact`。
2. 检查三类调用 usage provider 均为 OpenRouter。
3. 断开 OpenRouter，重复 compact，确认回退当前主模型且配置值保留。
4. Explore 选择 OpenRouter chat 模型后运行只读 Explore；断开后确认回退主模型。
5. Kairos 选择 OpenRouter chat 模型；断开后确认暂停/blocked，重新连接后恢复。

### 6.5 UI 与恢复

1. 添加、停用、重新启用、尝试删除在用模型。
2. 重启 Electron，确认 provider/model/task model 状态恢复。
3. 检查旧 session 和新 session 的 hover preview、Usage 和 Composer。
4. 浅色、深色、跟随系统分别检查服务商页、模型页、目录弹窗和 Composer。
5. 仅键盘完成添加服务、测试连接、打开目录、搜索、添加模型和选择任务模型的主路径。

## 工程验证命令

```bash
git diff --check
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
pnpm check:docs
pnpm check:secrets
pnpm check:repo
```

## 可观测性检查

日志允许出现：

- provider、ModelKey、api、base URL host。
- proxy enabled 和脱敏 host/port。
- errorKind、status code、耗时、重试次数。
- catalog fetchedAt、条目数、skippedCount。
- utility/Explore fallback reason。

日志禁止出现：

- API Key、Authorization、完整含凭据 URL。
- 未裁剪 provider response body。
- 真实用户 prompt、workspace 内容或完整工具输出作为连接测试证据。

## 文档与交付收口

- 把 `agent-multi-provider-llm.md` 状态更新为已落地，并记录真实实现偏差。
- 更新 `agent-current-module-map.md` 的 provider/model/settings/runtime/UI 模块路径。
- 旧 DeepSeek/Kimi 文档保留历史价值，但链接到新事实来源并删除已失效“只有两个 provider”现状表述。
- 更新设置页、安全、可靠性和架构导航。
- 生成一份完整 history，记录迁移、主要文件、验证命令和真实验收范围，不记录 key/代理地址。
- 维护面向用户的发布说明：新增多供应商、模型管理、轻量任务模型和按 provider 代理。
- 本变更命中新概念、可迁移、有深度、有陷阱和有模式多项条件；按学习指南沉淀“桌面 Agent 的 provider-scoped transport 与动态模型注册”学习文档。
- 完成后把本目录移动到 `docs/exec-plans/completed/20260724-multi-provider-llm/`。

## 完成标准

- 所有工程命令通过。
- DeepSeek/Kimi 直连和 OpenRouter 代理真实请求通过。
- utility/Explore/Kairos 的正常和失效行为与计划一致。
- settings v1 迁移、重启恢复、坏缓存和代理故障可恢复。
- renderer/main/日志/session 不泄漏密钥。
- 三态主题、键盘操作和真实 Electron IPC 验收完成。
- 设计、现状、history、release、learning 和 execution plan 状态全部同步。

## 当前验收记录

- 自动化：shared、agent-core、desktop 的新增与既有回归覆盖 provider identity、settings v2、代理 transport、目录缓存、动态 runtime、IPC 和 renderer 交互；2026-07-25 最新全量结果为 desktop `459/459`、agent-core `826/826`、shared `53/53`。Agent Core 数量减少来自删除 6 项旧 Kairos 静态 allowlist 测试，动态路径由 desktop runtime/Kairos 测试接管。
- 真实 Electron：确认 v1 设置升级为 v2 且生成 `settings.v1.backup.json`；DeepSeek/Kimi 已配置 Key 在 `untested` 状态即可进入主会话与轻量任务候选；两家连接测试成功；服务商页、模型页、目录空态及浅色/深色模型页可读。
- 发现并修复：`untested` 被误判不可用；旧 `ModelId` 在 Composer 显示原始字符串；新版“空候选”与旧桥接“无模型接口”语义混淆。
- 离线故障注入补齐：402 余额不足、404 模型不存在、429/5xx、坏 settings/cache、半截原子写临时文件、缓存无权限写入保留旧缓存、非法/失效代理、utility 摘要失败降级、Kairos 断连/重连、在用模型删除阻断和 stale 目录重试入口。
- 键盘基础回归：服务商与目录 modal 的 Tab/Shift+Tab 焦点环、Escape 关闭和触发按钮焦点恢复已由 renderer 测试覆盖；完整键盘业务路径及真实 Electron 焦点外观仍由用户手动验收。
- 运行时收口：余额查询改为显式 ProviderRuntimeConfig，OpenRouter/DeepSeek/Kimi 都遵守供应商级 transport；Kairos 设置直接发现 `purpose=kairos` 可用 ModelKey，旧静态 allowlist、env 装配和设置页重复模型区块已删除。
- 通用 Sheet 焦点竞态已修复：延迟首焦点不会覆盖用户或调用方已经放入面板的焦点，完整桌面回归锁定 Tab 环回。
- 服务商页紧凑卡片回归：只展示已连接服务商、官方/兼容分组、统一添加选择器，以及选择服务商后凭据弹窗的代理保存与焦点恢复均由 renderer 测试覆盖。
- 待用户统一手动验收：OpenRouter Key + provider-scoped 代理、目录在线刷新与真实 turn、utility/Explore/Kairos 跨供应商正常/失效路径、跟随系统主题和完整键盘操作。
- 依用户要求，验收用 `pnpm dev:log` 与 Electron 已关闭；本计划在手动验收完成前保留在 `active/`。

## 离线故障注入证据

| 场景 | 自动化证据 | 恢复语义 |
| --- | --- | --- |
| settings v1、坏 JSON、未知 version、不完整 v2 | `settings-service.test.ts` | v1 幂等迁移并备份；无效主文件不覆盖，使用安全默认内存配置并暴露 load error |
| 半截 `settings.json.tmp`、并发更新、写入失败 | `settings-service.test.ts` | 忽略临时文件；mutation 串行；持久化失败回滚内存 |
| catalog 坏 JSON、过期、reload 离线 | `openrouter-catalog-service.test.ts` | 坏缓存隔离；stale 数据继续可搜索；失败保留最近成功缓存 |
| catalog 无权限写入 | `openrouter-catalog-service.test.ts` | 返回 `cache_write`，不把磁盘错误伪装成网络错误，不替换旧缓存，UI 保留“重新加载”入口 |
| 401/403、402、404、429、5xx | `provider-connection-service.test.ts`、`openrouter-catalog-service.test.ts`、`convert.test.ts` | 稳定映射为 auth、insufficient_balance、invalid_request、rate_limit、server/server_error，不读取或回显上游正文 |
| 非法代理 URL、不同 provider 隔离、请求期代理失败 | `provider-transport.test.ts`、`provider-connection-service.test.ts` | 非 HTTP(S)/含凭据 URL 拒绝；fetch 只注入目标 runtime；错误统一裁剪为 proxy |
| utility 配置不可用或摘要调用失败 | `model-runtime-service.test.ts`、`conversation-compress.test.ts`、`summarizer.test.ts` | 调用前回退当前主模型且不改写配置；调用中失败走确定性丢弃/指针摘要，不阻塞主流程 |
| Kairos provider 断开/重连 | `model-runtime-service.test.ts` | 断开时 blocked/unavailable，不静默换 provider；重新连接后恢复解析 |
| Composer 模型停用、目录模型在用删除 | `model-store-service.test.ts`、`provider-model-settings.test.tsx`、`model-selection.test.ts` | 停用后从候选移除；删除返回引用位置；UI 显示恢复提示并保留模型 |
| Key、代理地址、上游错误泄漏 | settings/provider/catalog/transport/renderer 对应测试与 `pnpm check:secrets` | renderer view、错误结果和普通 settings 不含明文 Key；代理端口和内部错误被裁剪 |

离线证据不能替代真实网络链路：不可达代理端口、代理中途关闭、OpenRouter 在线目录及真实跨任务调用仍保留在用户统一手动验收清单中。

## 决策记录

- 2026-07-24：真实验收密钥只经 UI 输入，不通过命令行 env 传递。
- 2026-07-24：OpenRouter 直连本来可用时用不可达 provider proxy 验证隔离，不修改系统全局代理。
- 2026-07-24：本功能完成后必须生成学习文档，因为 provider-scoped transport 和动态模型 registry 具有明确迁移价值与陷阱。
- 2026-07-25：按用户要求停止 Electron/开发服务，不再发送真实 provider 请求；Plan 6 先完成全部可重复离线故障注入，真实网络、跟随系统主题和完整键盘路径最后统一手动验收。
