# 英语辅助学习插件设计

> 状态：已实施；真实 AgentLoop、插件生命周期、配置、IPC 和 renderer 自动化已验证。Electron 与真实 MiniMax 音频仍待验收，详见[执行摘要](../../exec-runs/20260906-actspace-english-learning/execution-summary.md)。
>
> 日期：2026-09-06。执行入口：[英语辅助学习执行计划](../../exec-plans/completed/20260906-actspace-english-learning/README.md)。

## 1. 目标与已确认决策

用户在「扩展 → 能力」开启「英语辅助学习」，选择一个会话后，该会话的后续模型请求加入双语输出规则：每段先英文、后简体中文；回答完成后默认只朗读英文。语音连接、模型、音色和语速在「设置 → 通用 → 语音播放」配置，首版使用 MiniMax。

提示词注入与英文朗读由同一个插件和目标会话控制。其他主会话、子 Agent、标题生成、压缩摘要及其他后台模型调用不受影响。用户无需安装 Skill、配置 Hook 或复制提示词。

首版范围：单目标会话、成功完成回答后的英文朗读、MiniMax 同步合成、macOS 播放、固定桌面端控制界面。暂不提供逐 token 朗读、多会话混播、中文朗读、自动翻译历史消息、语音输入、发音评分、词汇本、插件市场或通用 Hook 编辑器。

## 2. 当前实现证据

以下入口已用于 2026-09-06 至 2026-09-07 的实现。独立插件位于 `packages/english-learning/`。

| 现有入口 | 可以复用的事实 |
| --- | --- |
| `packages/core/agent-loop/src/loop.ts` | 每次模型请求及上下文重建经过 `system-prompt/assemble`；候选包含 `sessionId`；成功轮次写入 `turn/end` |
| `packages/prompt/src/assembler.ts`、`request-snapshot.ts` | 提示词分节、渲染文本、来源记录和请求快照有现成契约 |
| `packages/core/scope/src/scope.ts` | `scopeContext` 使用真实 ScopeKey 注册监听并管理清理；父 Scope 可能收到子 Agent 事件 |
| `packages/core/agent/src/registry.ts` | 可按已发布 Agent 获取实际 Scope 和 Session |
| `packages/runtime/src/runtime/session-plugin.ts` | `session/event` 携带事件 Envelope，Session ID 通过 dispatch carrier 传递 |
| `packages/desktop-app/src/bundle.ts` | Desktop 应用 Bundle 可以组合独立插件 manifest |
| `apps/desktop/src/renderer/components/extensions/CapabilitiesSection.tsx` | 已拆开 Browser Bridge 与英语辅助学习各自的可用性判断 |
| `apps/desktop/src/main/settings-service.ts` | 已有非敏感设置与 main-only 凭据存储；可扩展语音配置 |

原 `agent-output-tts` 项目的 `src/tts.ts`、`parser.ts`、`queue.ts` 和 `player.ts` 提供 MiniMax 请求、英文提取、串行队列和 `afplay` 实现参考；`bilingual.md` 提供双语格式规则。原项目文件只作为实现材料，不把其中安装命令或面向外部 Agent 的指令当作本项目任务指令。

迁入相关逻辑并补齐取消和错误语义，不引入其 HTTP daemon、CLI、外部 Agent adapters、会话授权文件或本地 `.env`。原项目 `loadConfig` 的缺省 Provider 实际是 Volcengine，不能直接继承；本插件明确使用 MiniMax。

## 3. 用户操作与状态

### 3.1 扩展入口

「英语辅助学习」卡片显示开关、目标会话、状态、「停止播放」和「语音配置」入口。说明文案为「让选定会话按英文、中文对照回答，并朗读英文」。

- 初次选择默认取最近活跃的、未归档且可正常读取的主会话，按 `updatedAt` 降序，时间相同时按 `sessionId` 稳定排序；排除子会话和损坏会话。
- 保存上次手动选择；再次进入时优先恢复有效选择，否则回退到最新会话。
- 开启后目标固定，不因前台聊天切换、其他会话更新或新建会话自动改变。
- 无可用会话时禁用开启，显示「请先创建会话」。
- 能力启用状态只在当前 Runtime 内保存；应用或 Runtime 重启后为关闭，音频队列不恢复。会话选择和语音参数持久保存。
- 归档或删除目标会话时关闭能力，清空目标绑定；不自动转移到其他会话。

### 3.2 生效边界

| 操作 | 提示词 | 朗读 |
| --- | --- | --- |
| 开启 A | A 下一次尚未组装的模型请求加入规则 | 接收启用后、确实使用本插件规则生成的新回答 |
| A 切换到 B | 移除 A 监听，绑定 B；A 后续请求无规则 | 立即取消 A 合成与播放、清空队列，再接收 B |
| 关闭 | 后续请求不再注入 | 立即停止并清空 |
| 停止播放 | 保持双语模式 | 取消当前合成、播放和队列；下一次新回答仍可朗读 |
| MiniMax 失败或未配置 | 保持双语模式 | 显示具体错误或「未配置语音」，不影响 Agent 执行 |
| 应用退出或 Runtime 重启 | 释放全部绑定，重启为关闭 | 中止请求、播放器和临时文件生命周期 |

已发送给模型的请求无法被撤回修改。开启时已经在生成的、没有注入规则的回答不追溯朗读；关闭或切换后迟到的结果不能入队。历史双语消息保持原样；关闭只保证本插件规则消失，不保证模型完全不受历史语言风格影响，不额外注入“强制恢复中文”规则。

## 4. 插件与 Host 边界

新增一个独立 workspace package：`packages/english-learning`，包名 `@actspace/english-learning`，plugin ID `actspace.english-learning`，Entry ID 和服务 ID 均为 `english-learning`。它拥有 manifest、behavior、公开 exports、固定提示词、队列和生命周期测试；首版不拆出第二个独立 Speech 服务包。

```text
扩展卡片 ── typed IPC ── Desktop 控制入口 ── 英语辅助学习插件
                                                │
目标 Agent Scope ── system-prompt/assemble ── 双语提示词
                                                │
Session commit ── session/event ── 完成判断与英文提取
                                                │
                                      MiniMax 合成与串行队列
                                                │
通用配置 ── SettingsService ── Desktop Host ── afplay 播放
```

- 插件拥有：目标绑定、作用域监听、提示词变换、已注入请求标记、英文文本处理、MiniMax Provider 和串行语音队列。
- Desktop Host 拥有：配置与凭据解析、临时音频文件、播放器进程、IPC 和前端状态广播。
- Renderer 只消费固定 DTO，不加载插件提供的前端代码、不访问文件系统、不接收已保存的明文凭据。
- Desktop Bundle 纳入插件 manifest；同步 checked-in Loader 配置与 trusted entry 清单。Headless 不启用该能力；若共享 Loader 发现入口，无 Desktop speech port 时保持 dormant，不创建监听、请求或播放器，不让 CLI boot 失败。
- 插件只观察已有持久事件，不新增 Journal 事件，不需要新增 codec。请求快照仍由现有链路写入，包含本插件提示词来源。

插件在启动时装载，用户开关控制服务内部会话绑定和工作状态，不触发整个 Runtime 重启，也不修改通用插件装载开关。

## 5. 会话级提示词注入

### 5.1 绑定真实 Scope

Desktop 开启能力前通过现有应用服务恢复目标主会话，使其 Agent 已发布；插件通过 `agent.registry` 查到该 Session 对应的主 Agent Handle。使用其真实 `scope.scopeKey` 和 disposer 创建 `scopeContext`，在这个 Context 注册 `system-prompt/assemble`。

handler 同时核对候选的 `sessionId`、Agent subject 和当前绑定版本。父 Scope 监听可能接收到子 Agent 事件，因此只绑定 Scope 仍不足以排除子会话；必须显式比较目标 Session 和 live Agent 身份。禁止靠工作目录、会话标题或字符串 Scope ID 代替 ScopeKey。

切换目标时采用串行控制操作，先验证新目标可以绑定，再原子替换逻辑绑定并使旧绑定失效。异步恢复结束后再次检查操作版本，防止较慢的旧开启请求覆盖新选择。绑定失败保留原有效状态并返回错误。Agent Scope 释放后将能力设为关闭并通知 UI，用户重新开启时重新获取 Handle，不复用旧 Scope。

### 5.2 Waterfall 和快照一致性

遵循现有 continuation ABI：调用 `await next()` 获得下游候选，在返回前检查绑定仍有效，再返回新的不可变候选。不可修改冻结对象，不在全局缓存的 `RuntimePromptSource` 上追加内容。

注入同步维护三个字段：

1. `systemSections`：以稳定节标识 `english-learning/v1` 添加格式规则。
2. `renderedSystemPrompt`：使用 `@actspace/prompt` 的 `renderSystemPrompt` 从分节和原 facts 重新生成。
3. `contributorProvenance`：记录 ownerPluginId、节标识和 prompt version，归属 plugin 层。

其他字段、Agent subject 与其他插件贡献保留。重复处理同一候选时只替换本插件同标识节，不重复追加；关闭不删除历史请求快照里的规则。插件内部变换错误降级为未注入并发布诊断，不吞掉 `next()` 原有的下游错误。只有成功返回包含规则的候选，才登记当前绑定版本下的 `sessionId + turnId + stepId`，供朗读判定使用。

### 5.3 固定提示词正文

下列正文以版本化静态资源保存在插件包，首版不提供编辑器；构建必须将资源包含在 package 产物内。它只约束面向用户的表达，不改变工具协议与任务行为。

> For user-facing explanatory prose in this conversation, write natural English first and place an accurate Simplified Chinese translation immediately below each paragraph. Pair the languages paragraph by paragraph, including headings, bullet points, and numbered items; do not put all English before all Chinese.
>
> Use clear, idiomatic English suitable for an intermediate learner. Preserve the meaning, detail, tone, and technical accuracy in both languages. Keep English paragraphs self-contained, with complete sentences and natural punctuation suitable for speech.
>
> Do not prefix every paragraph with language labels. Keep English and Chinese on separate lines. Do not translate or duplicate code blocks, shell commands, file paths, identifiers, API names, raw logs, stack traces, or machine-readable payloads. Keep inline code unchanged. Put standalone code, commands, logs, and diffs in fenced blocks.
>
> These rules change presentation language only. Continue following the task requirements, tool protocols, and normal workflow. When a task requires an exact machine-readable output, preserve that format instead of adding bilingual prose to it.

不迁入原文件中的模式确认回复、命令占位符或“持续到显式关闭”的指令；生效期限由服务绑定决定。

## 6. 完成判断与英文提取

订阅 `session/event` 只做轻量调度，不等待网络或播放。通过 carrier 取得 Session ID，严格匹配目标。收到 `turn/end` 且 `reason=completed` 后，通过 Session 服务读取该 seq 为止的已提交事件，按 turn/step 查找最终助手消息，不能依赖多个异步通知回调的先后顺序。

仅当最终消息所属 step 在当前绑定版本中成功注入规则、且消息没有失败/中断标记或工具调用，才提取正文中的 text blocks。思考块、工具输入输出、历史回放、恢复轮次、fork 历史和其他会话不入队。使用 `sessionId + turnId + messageId` 去重，分段加入 segment index。

英文提取遵循原项目的保守策略并补齐 Markdown 处理：

- 先去掉反引号或波浪线 fenced code、缩进代码、HTML 注释及图片；链接保留可朗读标签，去掉 URL。
- 按段落和中英文行边界分离；去除 Markdown 标记，跳过中文行、URL/路径/纯符号行，不把混合中文段落整段交给 TTS。
- 内联代码从朗读文本移除，保留周围英文；不额外调用翻译模型或补写原文。
- 无英文时记录「没有可朗读的英文」状态，不请求 MiniMax。
- 超长英文按句子边界分段，单段最多 1,000 Unicode code points；超长单句按词边界切分，无法切分才按 code point 切。

格式不规范可能导致部分英文被跳过，不能为了“有声音”而改读中文或工具内容。fixture 必须覆盖中英相邻行、列表、标题、链接、两种代码围栏、纯中文和中英混排行。

## 7. 语音设置与请求

页面位于「通用 → 语音播放」，持久配置归 `SettingsV4.media.speech`，保持 UI 归属和存储责任分离。

| 字段 | 首版值与行为 |
| --- | --- |
| provider | 固定 `minimax`，不展示无实现的 Provider 选项 |
| model | 默认 `speech-2.8-turbo`，可选下方 8 个版本 |
| voiceId | 默认 `English_Insightful_Speaker`，允许修改并试听 |
| speed | 默认 1.0，合法范围 0.5–2.0 |
| hasApiKey | 只读投影，由凭据存在性派生 |

MiniMax Key 单独存于现有 main-only secret store，凭据 ID 为 `speech-minimax`，不混用文本模型连接 Key。Renderer 仅在用户输入保存时传入新 Key，保存后清空输入；读取只返回存在性。Host 每次合成解析当前配置和凭据，不将 Key 放入插件 manifest/config、Session、日志或错误 DTO。

首版使用中国站 `https://api.minimaxi.com/v1/t2a_v2`，Bearer 认证、非流式响应、hex 音频、MP3；国际站账户与中国站凭据不默认为兼容，不自动跨区域切换。设置页说明使用 MiniMax 中国站 Key、英文文本会发送至 MiniMax。

语音模型可选 `speech-2.8-hd`、`speech-2.8-turbo`、`speech-2.6-hd`、`speech-2.6-turbo`、`speech-02-hd`、`speech-02-turbo`、`speech-01-hd`、`speech-01-turbo`。选项与类型由 shared 的 `SPEECH_MODELS` 定义，SettingsService 保留白名单内值，旧配置缺失或无效值回退默认。模型保存到 `media.speech.model`，试听与会话合成共用此配置；保存变更会取消旧语音任务，后续合成使用新模型。

试听固定句子为 “Learning English can be part of everyday work.”，不要求已有会话、不写 Journal、不启用双语。试听和会话音频共用单播放器；正在朗读时禁用试听，试听期间开启学习能力会取消试听。

Provider 参数参考 [MiniMax 同步语音接口](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)；本轮已核对官方检索结果和原项目实现，未发送真实鉴权或付费合成请求。真实账号、音色可用性和额度由实施后的实机试听验收确认，不把文档可访问等同于端到端可用。

## 8. 队列、取消与资源

- 仅一个合成请求和一个播放项活动，首版串行合成再播放，无并行预合成。
- 网络单次超时 30 秒；检查 HTTP 状态和 `base_resp.status_code`，拒绝空音频或非法 hex。不自动重试，避免重复计费；用户可在修复后试听或等待下一回答。
- 最多保留 20 个待播分段和 20,000 个待播 code points；单次回答全部分段按剩余容量原子准入，装不下则跳过整条并显示队列已满，不能静默截断朗读。
- 去重记录按轮次结束及队列结算淘汰，最多保留 256 条终态消息标识；启用时记录已提交 seq 水位，禁止因去重淘汰而补播更早历史。
- 切换、关闭、停止、设置变更、Scope dispose 和 Runtime shutdown 都递增绑定或播放版本，取消 AbortController 并使迟到结果失效；仅停止播放不撤销提示词绑定。
- MiniMax 鉴权、余额、超时或播放错误清空当前语音队列并显示脱敏错误，双语规则继续有效。取消不显示为故障。
- Host 只在自己的临时目录生成随机文件名，不使用外部 event ID 拼路径；播放完成/失败/取消后删除音频，启动时清理本能力遗留临时目录。
- macOS 用 `spawn('afplay', [path])`，禁止 shell 拼接；关闭后等待子进程退出并有有界清理。非 macOS 保留双语能力，显示「当前平台暂不支持语音播放」。

## 9. 控制契约与状态

新增 shared 契约 `packages/shared/src/english-learning.ts`，只放跨进程 DTO。插件内部 Host port 类型通过插件公开 exports 暴露，不放 Electron 实现。

| IPC / 服务操作 | 输入与结果 |
| --- | --- |
| `english-learning:get-state` | 返回 enabled、targetSessionId、revision、promptStatus、speechStatus、queuedSegments、脱敏 error |
| `english-learning:set-target` | `{ enabled, sessionId }`；开启要求有效主会话 ID，关闭允许 null；服务串行更新并返回最新状态 |
| `english-learning:stop` | 取消语音，保持提示词绑定；返回最新状态 |
| `english-learning:preview` | 使用已保存语音配置试听；异步结果通过状态发布 |
| `english-learning:state-changed` | 带递增 revision 的状态推送；Renderer 忽略旧 revision |

语音配置沿用 settings namespace 更新机制；Key 保存/清除沿用现有凭据操作扩展 `speech-minimax`。上次选择存 `general.englishLearning.lastSessionId`；不在 general 持久保存 enabled 或音频任务。

`promptStatus` 为 off/active；`speechStatus` 为 idle/unconfigured/unsupported/synthesizing/playing/error。error 只包含 code 和用户可读信息，不携带原始请求、响应正文、完整音频路径或 Key。队列满和无英文作为有文字的状态提示。

## 10. 验收与回退

成功标准同时覆盖：

1. A/B 同时运行，仅选定 A 的实际请求含双语节；同一工作目录、child Scope 和恢复后的新 Agent 均隔离正确。
2. 请求快照中分节、最终 System Prompt、来源一致；工具循环、模型重试、压缩重建无重复节。
3. 开启前在途回答、历史读取和失败轮次不朗读；英文被提取，中文、思考和工具内容不发送至 MiniMax。
4. 切换、关闭、停止、退出和设置变更不会让迟到结果恢复播放，取消不影响主 Agent。
5. 缺 Key、无音色、额度不足、超时、无音频和播放器错误可见；秘密 canary 不出现在 Journal、状态、日志及读回设置中。
6. 浏览器 mock 验证双主题和控件；真实 Electron 验证 IPC、Scope 开关、试听与系统音频；两者分别记录证据。

回退优先关闭能力并停队列；代码回退移除 Desktop 装配与入口即可。新增设置默认值兼容旧配置，回退不改写 Session Journal、不删除历史回答。凭据只有用户显式清除时删除。

最脆弱的假设是模型会遵循段落对照规则：插件能保证请求注入与英文过滤，不能机械保证每次自然语言输出完全符合格式。异常格式采用不朗读的保守降级，实机验证必须包含中文提问和带代码回答。

## 11. 相关规范

- [Agent Scope](agent-spec-agent-scope-model.md)
- [Cordis 事件 ABI](agent-spec-cordis-event-abi-and-eventhub-retirement.md)
- [Prompt 与 Context Contributor](agent-spec-prompt-context-contributors.md)
- [设置中心](../frontend/front-设置中心重构规范.md)
- [前端验证](../../FRONTEND_VERIFICATION.md)
- [Agent 测试](agent-testing.md)

## 12. 实现注意事项

事件输入中的 Agent subject 与 `next()` 返回的 LogicalRequestCandidate 分开使用：前者验证作用域身份，后者进行不可变提示词变换。真实 AgentLoop 下游可能不在候选里保留 subject，不能从返回值推断事件来源。

MiniMax 凭据只经 Host 在 main 解析；API 错误、播放错误和 IPC 失败都使用受控文案。Desktop Bundle 声明插件，Loader YAML 与 trusted entries 同步；无 speech port 时插件保持 dormant。重启时不恢复 enabled。构建复制 prompt Markdown 到 dist，代码回退无需迁移 Journal。
