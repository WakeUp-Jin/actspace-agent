# 主 Agent 的 Chat 形态

> 状态：2026-09-24 已实施；真实 Electron、本地文件与 Provider 验收边界见执行摘要。

## 1. 目标

ActSpace 主会话增加一个与工具权限模式分离的 **Chat 形态**。Chat 面向普通对话、联网查询、生图以及用户主动上传的轻量文件，不获得工作区开发能力；现有主 Agent 保持开发 Agent 语义。

Chat 不是新的 Runtime Profile，也不是 `default/full-access` 权限模式，更不是现有 `Plan/Agent` 单轮模式的第三个选项。它是创建主 Session 时选定并持久化的主 Agent preset。

首版交付日期目标为 2026-09-25。

## 2. 产品边界

### 2.1 两种主会话形态

| 产品形态 | Session preset | 主要用途 | 模型可见工具 |
|---|---|---|---|
| Agent | `actspace.main` | 工作区开发、Plan、Skills、文件与执行工具 | 现有 Agent 工具，不包含 Chat 专用 `web` 门面 |
| Chat | `actspace.chat` | 普通聊天、联网查询、生图、附件问答 | `web`、`generate_image` |

`actspace.agent` 已被一次性只读 Subagent 使用，不能复用为主会话 preset。旧 Session Header 没有 `createdWith.presetId` 时按 `actspace.main` 恢复，避免迁移或重写历史 Journal。

主会话创建后不允许原地切换形态。切换 Chat/Agent 必须创建新会话；fork 继承父 Session 的 preset。

2026-09-26 补充：还没发过消息的空会话允许在 Composer 中切换形态，实现方式仍是「用目标形态新建会话、带上草稿、归档原空会话」，不修改任何已存在 Session 的 preset。

### 2.2 Chat 首版附件

Chat 接受用户主动选择、拖入或粘贴的以下附件：

- 图片：PNG、JPEG、WEBP、GIF；
- 文本：TXT、Markdown（`.md`、`.markdown`）、JSON、CSV。

首版不支持 PDF、DOC、DOCX，也不做 OCR、PDF 解析、Office 转换、压缩包展开或网页文件下载。

图片直接作为模型多模态输入，不向 Chat 暴露 `inspect_image`。文本附件保留原始 Session Artifact，同时将确定的 UTF-8 正文随当前用户消息持久化，使现场请求与后续 Journal 重放一致。

### 2.3 Chat 首版上下文

- 保留当前 Compaction 算法、`contextLimitTokens`、`reserveTokens` 和区域选择逻辑；
- 不引入 8K/16K/32K/64K 请求硬预算；
- Settings General → Task Defaults 增加“Chat 上下文压缩阈值”；
- 默认 `0.8`，UI 显示 80%，允许 50%～95%，步进 5%；
- 设置只影响 `actspace.chat`，修改后下一次压缩判断立即生效；
- Agent 与 CLI 缺省继续使用当前默认策略。

## 3. 形态、模式与权限必须分开

当前 `ComposerMode = "chat" | "plan" | "agent"` 同时表达产品形态和单轮工具模式，容易让 Session 身份、工具集和 Composer 状态互相覆盖。目标契约拆成三个维度：

| 维度 | 值 | 所有者 | 生命周期 |
|---|---|---|---|
| 主会话形态 | `agent` / `chat` | Session Header `createdWith.presetId` | Session 创建到归档保持不变 |
| Agent 单轮模式 | `agent` / `plan` | 当前 Agent turn | 仅 `actspace.main` 可选 |
| 权限模式 | `default` / `full-access` | Session permission projection | 仅决定工具审批与授权，不改变形态 |

Chat Session 不接受 renderer 逐轮提交的模式覆盖，不显示 Plan、Skills、Workspace/Worktree 或权限相关控制。Agent Session 保留 Plan/Agent 单轮切换。

## 4. Runtime 组装

Chat 与 Agent 共用现有 Desktop Profile、Session Journal、AgentLoop、LLM Service、Tool Runtime、Compaction 和 Projection。差异由 Session preset 在 `actspace.agent.factory` 中解析，而不是新增第三套启动树。

```text
Desktop create-session(presetId)
          |
          v
Session Header.createdWith.presetId
          |
          v
actspace.agent.factory
    +-----+-----------------------------+
    |                                   |
    v                                   v
actspace.main                       actspace.chat
workspace prompt                    chat prompt
Plan/Agent turn mode                fixed Chat behavior
Agent tool surface                  { web, generate_image }
skills + workspace facts            no skills/workspace facts
    |                                   |
    +---------------+-------------------+
                    v
          shared AgentLoop / Journal / LLM
```

主 preset 是静态内建契约，不在首版增加用户自定义 preset、热重载、StandingMount 或第三方 preset 市场。插件加载仍负责组装 Prompt、Tools、Session 和 Agent factory；Session preset 只选择已加载能力的可见子集。

## 5. Chat Prompt 边界

Chat 使用独立主 Agent descriptor 和稳定身份段，说明它是通用对话助手，可以使用联网与生图能力，并将附件视为用户提供的上下文。

Chat Prompt：

- 包含 core safety；
- 可以包含用户级指令；
- 不包含 workspace `AGENTS.md`、cwd、Git、Host 文件能力、Skill catalog 或 selected Skills；
- 不通过 prompt 声明不存在的工具；
- 不把内部 run/request/invocation identity 暴露给模型。

Agent Prompt 保持现有工作区行为，但按下文修复 Prompt cache。

## 6. Prompt cache 与动态尾部

### 6.1 当前问题

当前 Request Assembly 把全部 `request-fact` 与 `hostFacts` 渲染进 `<runtime_facts>`。其中包含每轮变化的 `agentRunId`、每次 Runtime 启动变化的 `invocationId` 和可逐轮变化的 `agentMode`。这些字段出现在 system prompt，会让前缀缓存在第一个变化字节处失效。

Skill catalog 还把本次选择状态写入每项 Skill 的 `selected` 字段，使选择任意 Skill 时整个 catalog 都变化。

### 6.2 Facts 分层

Contributor 输出改为三个语义：

| kind | 是否进入 request snapshot | 是否进入 system prompt |
|---|---|---|
| `prompt-section` | 是 | 是 |
| `model-fact` | 是 | 是，作为稳定 `<runtime_facts>` |
| `request-fact` | 是 | 否，仅用于审计、Context/Trajectory 诊断 |

Request snapshot 增加 `modelFacts`，`facts` 保留完整审计事实。Context Projection 的“模型上下文”只计算 `modelFacts`；完整 `facts` 仍可在 request snapshot/Trajectory 中检查。

以下内部事实只保留为 `request-fact`：

- `agentRunId`；
- `invocationId`；
- turn/step/request identity；
- Host 内部诊断信息。

Agent descriptor、稳定 workspace facts 和稳定 capability 描述可作为 `model-fact`。Chat 不贡献 workspace/capability model facts。

Skill catalog 移除动态 `selected` 字段；显式选择的 Skill 正文仍是 `prompt-section`，选择 Skill 时允许 system prompt 有意变化。

### 6.3 必要动态信息位于最后一条用户消息

Agent 的 `plan/agent` 单轮模式对模型有用，因此不删除，而是持久化为当前用户消息末尾的隐藏 `runtime-context` 内容块。模型转换时将它渲染为最后的结构化动态上下文；renderer 不显示该块。

该块必须与用户消息一起写入 Journal。禁止只在 dispatch 前临时拼接，否则下一轮重放历史时，之前的用户消息与现场请求不一致，缓存仍会从历史中段断裂。

```text
system: 稳定身份、安全规则、稳定 model facts
history: 从 Journal 重放的原始消息
current user:
  - 用户正文
  - 附件
  - runtime-context（仅必要动态事实，位于末尾）
```

`runtime-context`：

- 在模型请求中可见；
- 在 Journal/request snapshot 中可审计；
- 不显示在用户消息、标题、复制 transcript 或附件 UI 中；
- 不进入 Compaction 自然语言摘要正文；
- 仍计入 Context token estimate，因为它确实发送给模型。

Chat 形态固定，不需要逐轮 `agentMode`，首版不为 Chat 添加该动态块。

## 7. 两个模型可见工具

现有 Web 能力有意拆为 `web_search` 和 `web_fetch`：搜索供应商负责候选 URL，本地确定性抓取负责读取页面。Chat 首版不能把这两条底层能力重新混成不可审计的 LLM 中转。

新增模型可见 `web` 门面：

- `action: "search"` 复用现有 `web_search` provider/failover；
- `action: "open"` 复用现有 `web_fetch` URL 校验、SSRF 防护、重定向、大小限制和 Markdown 转换；
- 输出、错误码和超时保持底层实现可观察；
- 不调用第二个隐藏 LLM，也不新增搜索供应商。

工具可见性：

- Chat：仅 `web`、`generate_image`；
- Agent：保留 `web_search`、`web_fetch` 和其他现有工具，不暴露 `web`，避免重复工具竞争；
- `inspect_image` 不属于 Chat；
- 搜索密钥或图片生成配置缺失时，工具返回明确的配置错误，不临时改变 Session 的工具 schema。

## 8. 附件内容与限制

Chat 文本附件在 Desktop Host 边界读取和校验，避免 renderer 读取本地文件：

1. 校验扩展名和识别后的 media type；
2. 要求普通文件；
3. 原始文件不超过 1 MiB；
4. 使用严格 UTF-8 解码，允许移除 UTF-8 BOM，拒绝 NUL/二进制内容；
5. 单次消息所有文本附件解码后合计不超过 256,000 个字符；
6. 不静默截断，超限时整次发送拒绝并返回结构化附件错误（类型、文件名、附件 id、限制值），不将发送前校验记作 Agent 运行失败；正文和附件恢复到草稿，中文提示说明处理方法，移除目标附件后清除相应错误，总量错误按已解码长度重新计算；
7. 原始 Artifact 和模型正文使用同一消息内容块持久化。

图片沿用 Session Artifact 的 20 MiB 单文件限制。模型不支持图片输入时必须在请求准备阶段明确失败，不自动改用 `inspect_image`。

## 9. Settings 与 Compaction

Settings v4 在现有 `general.taskDefaults` 增加 `chatCompactionTriggerRatio`，不新增 Settings namespace。旧设置缺字段时补 `0.8`，保存时限制为 `0.5`～`0.95`。

领域包不得依赖 Desktop SettingsService。Desktop Host 向 Runtime 提供只读 policy resolver；AgentLoop 在每次自动压缩判断时读取当前值，并仅在 Session preset 为 `actspace.chat` 时覆盖 `triggerRatio`。resolver 缺失、值非法或 Host 为 CLI 时回退 `DEFAULT_COMPACTION_POLICY`。

手动 `/compact` 不受阈值影响；阈值只决定自动压缩何时触发。

## 10. Desktop 交互

- “新建会话”提供 Agent/Chat 两个明确入口；`Command+N` 继续默认创建 Agent，保持现有肌肉记忆；
- workspace 分组的「+」直接创建 Agent 会话、不弹形态菜单（Chat 不使用工作区，在项目下新建 Chat 不符合入口语义）；需要 Chat 时在空会话 Composer 中切换形态，Chat 可以沿用该 workspace 作为会话归档分组，但不会把 workspace 内容注入模型；
- Agent Session 显示 Plan/Agent、Skills、Workspace/Worktree 等现有控制；
- Chat Session 显示固定 Chat 标识，隐藏 Plan、Skills、Workspace/Worktree 和权限入口；
- Chat 保留模型、Thinking、图片/文件附件和 Context 入口；
- Chat 顶栏、Composer、右侧菜单和空态启动器都隐藏开发操作（工作区、分支、运行位置、Review、终端和子 Agent）；切回 Agent 后保留原有开发标签，Chat 下不运行文件新鲜度探测或终端列表同步；
- 已有消息的 Session 不提供形态切换；空会话可通过 `+` 菜单在 Chat / Agent 间切换（Chat 标签本身不带 ×，不暗示可随时切换）（新建目标形态会话替换当前空会话，草稿随行，切到 Agent 时只保留图片附件）。

首版不要求在会话列表增加新的 Badge、颜色或独立分组，不重做 Sidebar/Composer 视觉系统。

## 11. 持久化、兼容与回退

- 新 Session 将 preset 写入 Header；Header 仍是 Session identity 的唯一事实；
- 旧 Session 缺 preset 时恢复为 Agent；
- fork 复制 preset；
- 未知 preset fail closed，不能静默获得 Agent 全工具；
- 不重写旧 Journal，不迁移历史附件；
- Chat 功能可通过停止创建 `actspace.chat` 会话回退，已有 Chat Session 仍可只读检查；
- Prompt snapshot 新字段必须兼容读取旧 schema，不能让旧 Session 的 Context/Trajectory 失效。

## 12. 非目标

- 不新增 Chat 专用 Runtime Profile、进程或数据库；
- 不做用户自定义 Agent preset；
- 不做跨会话长期记忆或 RAG；
- 不新增请求级硬 token 预算；
- 不支持 PDF、Office、OCR、音频或视频附件；
- 不给 Chat 文件系统、Bash、Browser Bridge、Subagent、Todo、Skills 或审批能力；
- 不改变现有 Agent 权限模型；
- 不宣称浏览器 mock 可以替代真实 Electron、Provider 和本地文件验收。

## 13. 验收不变量

1. 两个连续 Agent 请求即使 `agentRunId`、`invocationId` 不同，只要稳定输入相同，`renderedSystemPrompt` 必须逐字节相同。
2. Agent 的 Plan/Agent 模式作为持久化的最后用户消息动态块进入模型，renderer 与 transcript 不显示。
3. Chat Session 冷启动恢复后仍是 Chat，模型工具定义恰好为 `web` 和 `generate_image`。
4. Agent Session 不出现 Chat `web` 门面，并保留原 `web_search` / `web_fetch`。
5. Chat 文本附件现场请求与重放请求逐字节一致，PDF/DOC/DOCX 明确拒绝。
6. Chat 压缩阈值修改后不重启 Runtime 即可影响下一次自动判断，Agent 行为不变。
7. 自动化通过不能替代真实 Electron 中的会话创建、附件、重启恢复和真实 Provider 验收。
