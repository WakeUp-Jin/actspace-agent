# 英语辅助学习插件执行计划

> 状态：代码实施完成并归档；自动化结果、浏览器验证及未完成的 Electron / MiniMax 实机门禁见执行摘要。
>
> 日期：2026-09-06。执行模式：交互模式。设计事实源：[英语辅助学习插件设计](../../../design-docs/agent-plugin-runtime/agent-english-learning.md)。

## 1. 目标与交付单位

交付一个 Desktop 内置的「英语辅助学习」插件：用户开启并选择会话，只有该会话注入逐段英文/简体中文提示词，成功回答后只朗读英文。扩展页负责开关与目标，通用设置负责 MiniMax Key、音色、语速和试听。

本计划作为一个完整功能切片执行。S1–S6 是顺序实施步骤，不是各自可发布的阶段；只有后端、Host、UI 和验证闭环后才交付。预计修改超过 8 个文件，新增一个领域插件服务；不另建 Speech 服务、HTTP daemon、Hook 平台或第二套 Agent 内核。

执行结果：[执行摘要](../../../exec-runs/20260906-actspace-english-learning/execution-summary.md)。用户在设计确认后授权实施；2026-09-06 至 2026-09-07 完成代码与自动化验证，未提交或发布。

## 2. 开始前必读

按顺序阅读：

1. 根 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md`。
2. 本计划及配套设计文档，重点看会话隔离、提示词正文和停止语义。
3. `docs/CODING_BEHAVIOR.md`、`docs/SECURITY.md`、`docs/PLANS_GUIDE.md`。
4. `docs/design-docs/agent-plugin-runtime/agent-spec-agent-scope-model.md`、`agent-spec-cordis-event-abi-and-eventhub-retirement.md`、`agent-spec-prompt-context-contributors.md`、`agent-testing.md`。
5. `docs/design-docs/frontend/front-设置中心重构规范.md`、`front-主题与配色规范.md`，以及 `docs/FRONTEND_VERIFICATION.md`。
6. 收尾前读 `docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`；代码实施后按条件读 `docs/learnings/WRITING_GUIDE.md`。

本工作区已有其他任务未提交的 Runtime、Session、设置和扩展页修改；必须沿用当前内容，禁止还原、覆盖、批量格式化或顺手收口其他计划。执行前检查差异，遇到实际语义冲突再说明，不把“目录很脏”当作自动阻塞。

## 3. 冻结契约

| 项 | 本计划采用的值 |
| --- | --- |
| package / plugin / entry / service | `@actspace/english-learning` / `actspace.english-learning` / `english-learning` / `english-learning` |
| Host port | `actspace.host.speech`，由 Desktop 注入；提供当前配置、凭据解析、可取消播放和临时资源清理 |
| prompt section | `english-learning/v1`，正文由设计文档第 5.3 节固定 |
| 动态状态 | 单个目标 Session、enabled、递增 revision、绑定版本、promptStatus、speechStatus、队列数、脱敏错误 |
| 配置 | `media.speech`；最近选择为 `general.englishLearning.lastSessionId`；enabled 不持久保存 |
| 凭据 | `speech-minimax`，复用 SettingsService 的 main-only secret store |
| 默认语音 | MiniMax 中国站、`speech-2.8-turbo`、`English_Insightful_Speaker`、speed 1.0 |
| prompt 控制面 | 目标 live Agent 的 scoped `system-prompt/assemble`，额外核对 Session 与 Agent subject |
| 朗读观察面 | `session/event` 的成功 `turn/end`，从已提交事件读取最终消息 |
| IPC | `english-learning:get-state`、`set-target`、`stop`、`preview`、`state-changed`，完整前缀与 DTO 以设计第 9 节为准 |
| 资源限制 | 单次合成 30 秒、分段 1,000 code points、待播 20 段且 20,000 code points、终态去重 256 条 |

服务目标切换由 Host 先恢复主会话，再由插件解析已发布 Agent Handle 绑定 Scope。所有开关操作串行化；旧异步结果必须校验操作版本。状态快照中的 revision 由服务统一递增；前端不得根据本地猜测冒充成功开启。

语音未配置或平台不支持不阻止双语提示词生效。成功启用后仅收集该绑定版本真正注入过的 step；无对应标记的在途回答和恢复历史不朗读。停止播放不关闭双语模式。

## 4. 允许修改范围与实现顺序

### S1. 建立插件、共享契约和纯逻辑

新增：

- `packages/english-learning/package.json`、`tsconfig.json`：ESM workspace 包，公开 `.`、`./manifest`、`./plugin`；构建包含提示词资源。
- `packages/english-learning/src/index.ts`、`manifest.ts`、`plugin.ts`、`service.ts`、`host-port.ts`。
- `packages/english-learning/src/prompts/english-learning.md`、`prompt.ts`、`english-text.ts`、`queue.ts`、`minimax.ts`。
- `packages/shared/src/english-learning.ts`；在 `packages/shared/src/index.ts`、`settings.ts` 中导出 DTO 并扩展配置/凭据类型。

依赖只通过 workspace 公共 exports 使用 `@actspace/cordis-adapter`、`@actspace/core-agent`、`@actspace/core-scope`、`@actspace/prompt`、`@actspace/session-journal`、`@actspace/shared`。不从其他包 `src/` 深导入，不在共享类型引入 Electron。

核心纯逻辑包括：不可变提示词节变换与去重、英文提取及句子切分、有界队列和取消版本检查。提示词变换保留其他插件贡献和 Agent subject；`next()` 下游失败沿原语义传播。

新增 `src/test/prompt.test.ts`、`english-text.test.ts`、`queue.test.ts`、`minimax.test.ts`。通过 fake Provider/player、deferred promise 和 fake clock 验证真实失败场景；不访问用户目录或真实网络。

### S2. 接入 Scope、完成事件与装配生命周期

完成 `plugin.ts`、`service.ts`；新增 `src/test/lifecycle.test.ts`、`session-binding.test.ts`、`completion.test.ts`。

1. 插件声明服务与依赖，在缺少 Desktop speech port 时 dormant；关闭状态不创建目标监听或音频任务。
2. 开启时解析主 Agent Handle，以 `scopeContext` 绑定其真实 ScopeKey；对 Session ID、Agent subject、绑定版本再次校验。
3. `await next()` 后完成提示词不可变变换，记录成功注入的 turn/step；重复组装不追加重复节。
4. 观察成功 `turn/end`，以事件 seq 为上界读取同轮已提交事件，定位最终助手消息。不要依赖 `assistant/message` 与 `turn/end` 通知回调完成顺序。
5. 订阅解除、AbortController、注入标记、去重和队列清理由 owning effect 管理；主 Agent Scope dispose 会关闭能力。切换和重复 dispose 都要幂等。
6. `packages/desktop-app/src/bundle.ts` 纳入插件 manifest，`packages/desktop-app/package.json` 添加依赖；同步 `packages/runtime/cordis.yml` 与 `packages/runtime/src/profiles/composition.ts` trusted entry。
7. 按 Loader 实际解析根显式补充 `packages/runtime/package.json` 的插件依赖，更新 `pnpm-lock.yaml`；同步 `packages/runtime/src/profiles/composition.test.ts` 与 Runtime 集成 fixture，保持 YAML 和 trusted entry 一致。

不向 `AgentLoop` 增加英语学习分支，不扩建全局 Prompt 缓存，不改 13 个 Session 核心事件，不新增 durable codec。若现有公共 API 的实际形态已变化，只调整必要的装配接线并在过程文档说明，不重写 Scope/Session 架构。

### S3. 配置、凭据与 Desktop 播放

修改 `apps/desktop/src/main/settings-service.ts`，新增 `src/main/speech-playback.ts` 和 `src/main/test/english-learning-settings.test.ts`、`speech-playback.test.ts`。

- 初始化、迁移、序列化、namespace patch 和旧设置兼容投影都处理新字段；旧 v4 文件缺字段时补默认，保留其他字段。
- 扩展 secret ID 的读写、清除和校验；读取配置只返回 `hasApiKey`。新 Key 从保存输入进入主进程后不回显。
- main 提供 `actspace.host.speech`：读取配置、每次解析凭据、可取消的 `afplay`、受控随机临时文件与启动/退出清理。
- HTTP 实现留在插件 `minimax.ts`，注入可替换 fetch；Host 只提供外部能力和秘密。检查 HTTP、业务错误码、空音频、hex 合法性和超时，不自动重试。
- 音频完成/失败/取消均清理；进程 `error`/`exit`、重复 stop 和取消后迟到 fetch 不泄漏文件或恢复播放。
- 保存语音配置或清除 Key 时取消旧语音任务；不关闭提示词模式。试听使用固定英文句子，共用播放器互斥，不写 Journal。

### S4. 接入 Host 控制和 typed IPC

修改现有：

- `apps/desktop/src/main/index.ts`。
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`、`runtime-registry.ts`、`host-ports.ts`。
- `apps/desktop/src/preload/index.ts`、`apps/desktop/src/global.d.ts`。
- `packages/shared/src/ipc.ts`：按现有导出方式接入新契约。

新增 `apps/desktop/src/main/runtime-v2/english-learning-ipc.ts`，集中注册设计第 9 节五个 channel，新增对应 `src/main/test/english-learning-ipc.test.ts`。

开启命令先校验可读、未归档主会话，通过现有 DesktopAppService 恢复并发布 Agent，再调用插件服务；恢复不会运行 Agent 任务。归档/删除路径撤销目标；退出时先停插件语音，再释放 Host 播放器。每次开关回包使用服务最终快照，状态推送有 revision。

列表复用已有 session list DTO，不建立第二套 SessionStore；按设计排序生成默认选择。所有 IPC 异常映射为脱敏错误，不把插件 Context、ScopeKey、Node Buffer、凭据或任意本地文件路径交给 renderer。

如果 renderer 关闭后 main 仍常驻，插件仍按当前目标运行；整个 Runtime 重启后关闭。main 退出/重启不可依赖某个设置页面组件卸载来停止播放器。

### S5. 扩展卡片与通用设置

新增 `apps/desktop/src/renderer/components/extensions/EnglishLearningCapability.tsx` 和 `components/settings/SpeechSettingsSection.tsx`；修改 `ExtensionsPage.tsx`、`CapabilitiesSection.tsx`、`SettingsPage.tsx` 及必要的 `App.tsx` 设置跳转接线。

- 能力名称固定「英语辅助学习」，提供开关、会话选择、状态、停止播放、前往「通用 → 语音播放」。关闭时可选择目标但不启用。
- 拆除能力列表对 Browser Bridge 可用性的整体依赖：Browser Bridge 缺失时语音卡片仍显示自身状态；修正搜索和能力数量。
- Settings 组放在媒体默认附近，展示 MiniMax、音色、语速、Key 存在性和试听；不增加仅有一个选项的 Provider 菜单，不增加中文朗读开关。
- 监听服务状态推送，页面重进先读快照；处理加载、保存、无会话、无 Key、平台不支持、队列满、无英文和错误。保存失败保留草稿，关闭/切换失败不显示假成功。
- 试听忙时禁用重复试听，播放主会话语音时禁用试听；停止按钮作用明确。键盘可操作，状态含文字，不只靠颜色。
- 全部样式使用现有主题 token，验证浅色/深色和窄窗口；不增加其他实验能力或调整导航结构。

新增 `src/renderer/test/english-learning-capability.test.tsx`、`speech-settings.test.tsx`；更新 `extensions-page.test.tsx`、`settings-page.test.tsx` 和对应 fixture。

### S6. 集成验证、文档同步与收尾

- 补充真实 Cordis + fake LLM 的 A/B 会话隔离集成测试：检查送给 Provider 的实际 messages 和 Journal request snapshot，不只测提示词字符串函数。
- 完成下节全部自动化与实机清单；记录不能执行的外部门禁，不将 fake audio 当作真实音频成功。
- 同步本设计状态、`docs/ARCHITECTURE.md`、`docs/design-docs/frontend/front-设置中心重构规范.md`、前后端索引及执行摘要；只在实现事实变更处更新。
- 更新本任务 history。实现后评估学习沉淀：Scope 继承与严格会话隔离、异步取消和迟到结果通常满足至少两项，按 `docs/learnings/WRITING_GUIDE.md` 写实际验证过的知识。
- 实现与自动化完成后将本计划移到 `completed/`，更新所有计划链接；保留明确未验证的实机项。不因只差人工验收一直保留在 active。
- 不自动 commit、push、发布、删除 worktree，或修改原 `agent-output-tts` 项目。

## 5. 自动化验收矩阵

| 场景 | 必须证明的结果 |
| --- | --- |
| 同目录 A/B、不同目录 A/B 并发 | 只选定会话的 Provider request 有本插件节，另一会话完全不变 |
| 父/子 Scope | 子事件虽然对父监听可见，但子请求无学习节，子结果不朗读 |
| 重试、工具循环、压缩重建 | 每次目标请求一份规则；最终 system text、sections、provenance 一致 |
| 已恢复主会话开启 | 绑定新 live Scope；旧双语消息不回放；下一次请求正确注入 |
| 开启前在途请求 | 没有成功注入记录的消息不入队 |
| A→B、关闭、stop 与 fetch 完成竞争 | 旧回调不恢复音频；stop 保留提示词；关闭取消提示词 |
| 快速多次切换与 Scope dispose | 旧异步开启不覆盖新状态；所有监听可释放且不重复 |
| 中英/代码/Markdown/空文本 | 仅英文正文送往 fake Provider，无代码、中文或工具内容 |
| 超长文本与队列满 | 符合字符上限；消息原子准入；拒绝时有提示，无无限积压 |
| 缺 Key、401、业务错误、timeout、空或非法音频 | 错误可见、队列清空、无自动重试；主 Agent 与双语规则继续 |
| 播放失败、退出与临时文件 | 子进程退出、文件删除、无残留活动请求 |
| 设置缺字段、保存失败和 Key 清除 | 默认兼容；无明文回显；失败保留草稿，不损坏其他配置 |
| secret canary | canary 不进入 Journal、诊断、日志、状态推送和设置读回 |
| Desktop / Headless 装配 | Desktop 提供服务；无 speech port 的 Headless 不启动此能力且可正常退出 |

## 6. 验证命令

实施采用以下命令，实际结果以执行摘要为准：

```sh
pnpm --filter @actspace/english-learning... build
pnpm --filter @actspace/english-learning test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/desktop test
pnpm check:packages
pnpm check:package-cutover -- --strict
pnpm check:v2-legacy-removal -- --strict
pnpm typecheck
pnpm test
pnpm build
pnpm check:frontend-theme
pnpm check:docs
pnpm check:current-docs
```

预期：新增 package 有完整导出和 lifecycle 覆盖；Desktop clean build 包含插件及提示词资源；Headless 没有新行为；新行为矩阵通过且无新主题或文档错误。已有基线失败需记录命令、失败位置与本任务关系，不能直接忽略，也不扩大范围修复其他任务。

检查构建闭包时同步 `apps/desktop/package.json` 的 `build:deps`，确保新包在 Runtime/Desktop 编译前可消费；若现有仓库根依赖构建已覆盖，使用该顺序并以 clean build 证明，不依赖本地残留 dist。

## 7. 实机验收

使用隔离 userData 的 `pnpm dev:log`，按 `docs/FRONTEND_VERIFICATION.md` 验证。只用测试会话文本和用户自行配置的有效 MiniMax 中国站 Key；本计划没有读取或迁移原项目 `.env` 的授权。

1. 浏览器 mock：浅/深主题、窄窗口、键盘操作，截取能力卡片和语音设置；此项只证明 renderer。
2. Electron：创建 A/B 主会话，在能力页默认选中最近活跃会话；手动选择 A 并开启，用中文分别询问 A/B。A 段落对照、只读英文；B 请求不含学习节。
3. A 触发带工具调用和代码块的回答：中间步骤不朗读、代码和中文不发送至 MiniMax；最终英文可听见。
4. 生成/合成/播放过程中分别切 B、关闭和停止；观察旧音频不继续，stop 后下一条仍双语并可朗读。
5. 通用设置保存 Key、修改音色/语速、试听；观察错误恢复。清除 Key 后双语仍工作，语音显示未配置。
6. 在生成中关闭与重新开启，核对请求快照生效边界；退出和重启后默认关闭，历史不补播，临时文件和 afplay 进程无残留。
7. 用实际音频确认音色、英文提取和播放；真实自然语言格式可能不稳定，记录偏差，不能把请求层注入成功等同于输出百分百合规。

MiniMax 鉴权、额度、音色、网络连通性、系统播放器及真实模型输出均属外部门禁。无 Key 或无法听取音频时，分别记录未执行项，不能用网络 stub 宣称验证完成。发布包、DMG、签名与公证不在本次范围。

## 8. 回退与执行记录

运行时回退：关闭能力，使绑定失效并取消语音。实现回退：移除 Desktop Bundle/Loader 中该插件的装配及固定 UI 入口，保留新增设置数据；不得改写或删除 Session Journal。用户 Key 只在显式清除时删除，回退不执行目录级清理。

开始实施时建立 `docs/exec-runs/20260906-actspace-english-learning/execution-process.md` 和 `execution-summary.md`。过程记录每步变更、检查和实际冲突；摘要包含自动化结果、实机步骤、截图/日志摘要和未验收边界。执行记录已建立，并在收尾时补全结果。

## 9. 进度与决定

- [x] 用户确认：英语辅助学习、单会话提示词注入、中英对照、仅英文朗读、MiniMax、扩展控制与通用配置。
- [x] 已核对现有 Prompt、Scope、Session、Desktop 装配和设置入口。
- [x] 设计文档和执行计划已建立。
- [x] S1 插件、契约与纯逻辑。
- [x] S2 Scope、完成事件与生命周期。
- [x] S3 配置、凭据与播放。
- [x] S4 Host 与 IPC。
- [x] S5 扩展卡片与通用设置。
- [x] S6 集成验证、文档同步与归档。

2026-09-06：采用现有 scoped Cordis 干预面和 Session 观察面，不建设通用 Hook。一个插件同时拥有双语规则和英文朗读，缺语音凭据时保留双语能力。实现按一个完整功能交付。2026-09-07：S1–S6 的代码、针对性自动化和文档已完成；实机未通过项单列在执行摘要，不标作验收成功。

实施调整：纯逻辑测试集中在 `speech.test.ts`，Scope 与 Effect 测试集中在 `lifecycle.test.ts`，真实 AgentLoop 位于 Runtime 集成测试。设置跳转在实际拥有导航的 `WorkbenchLayout` 接入；Host port 直接由 desktop-host-adapter 注入。Node Loader fallback 从 Loader 包解析裸模块，因此仓库根还声明插件依赖；Desktop 依赖构建先执行 Runtime 完整闭包。

2026-09-07 追加需求已批准并实施：语音模型由固定值改为用户给定的 8 个版本下拉选择，默认值不变；共享白名单、配置规范化、UI 保存与请求参数测试同步更新。
