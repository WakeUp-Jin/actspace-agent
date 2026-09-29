# Agent 形态与三种工作模式

> 状态：2026-09-28 已授权实施；代码已接入，实机与外部服务验收结果见执行摘要。
> 执行入口：[执行计划](../../exec-plans/active/20260928-agent-forms-and-modes.md)与[执行摘要](../../exec-runs/20260928-agent-forms-and-modes/execution-summary.md)。

## 1. 已确认的产品方向

1. 不同插件组合形成不同的 Agent 形态；插件决定工具、上下文、行为与生命周期，形态不能仅实现成工具名单或提示词标签。
2. 当前只定义一种形态，其他形态没有产品需求，不设计、不提供选择入口。
3. 当前形态支持 `chat`、`plan`、`agent` 三种模式。
4. Chat 只提供当前实现的两个模型工具：`web` 与 `generate_image`。`web` 保留现有 `search/open` 操作，不额外暴露 `web_search`、`web_fetch`。
5. 设计与计划经用户审核后已授权实施。

本文取代早期讨论稿中 Chat / Workspace / Minimal 多形态的建议。[主 Agent Chat 形态](agent-main-chat-form.md)保留为旧方案记录；本文是当前规范，实机覆盖边界以执行摘要为准。

## 2. 本稿建议审核的决定

以下 D1–D5 已随执行计划得到用户实施授权。

| 编号 | 建议 | 理由 |
|---|---|---|
| D1 | 唯一内建形态沿用 `actspace.main`，新建会话默认 `agent` | 避免引入没有用户需求的新名称；保留默认开发工作流 |
| D2 | Plan 采用第 5 节的显式白名单，允许文件探索、Web、图片分析、只读 Explore 和 Todo；不允许 Shell、写文件、生图和 Browser | 形成硬边界，同时保留规划需要的探索与会话进度能力 |
| D3 | 仅在会话静止时切换模式；运行中需先停止并等待任务收束 | 不让 UI 标签与正在执行的能力不一致 |
| D4 | Chat 沿用当前上下文、附件及压缩策略；切换不删除既有历史 | 保持已有 Chat 行为，但明确它不是历史信息隔离机制 |
| D5 | 旧 preset 通过兼容读取映射到唯一形态与初始模式，不重写历史 Header/Journal | 保留 provenance，降低迁移风险 |

## 3. 四个独立维度

| 概念 | 职责 | 生命周期 |
|---|---|---|
| Host Profile / Bundle | 启动共享服务、准入插件代码与 Host 能力 | Runtime 启停；不增加第三种 Profile |
| Agent 形态 | 定义插件组合、配置、依赖、支持模式与默认模式 | Session 创建时固定组合身份 |
| Agent 模式 | 选择同一组合内的当前行为、上下文贡献及能力范围 | Session 内持久化，可在安全边界切换 |
| 权限策略 | 对具体调用的路径、资源、审批与沙箱做校验 | 沿用 `default/full-access` 和已有 Grant 生命周期 |

形态定义可被多个 Agent 实例复用；每个实例的插件状态、订阅与清理由自己的 AgentScope 持有。Session 保存恢复信息，不持久化内存插件实例。

`full-access` 不能扩大模式工具集合，已有 Session Grant 也不能使 Chat 调用文件工具。模式不替代权限系统。

## 4. 真正的插件组合与生命周期

```text
Host Profile / Bundle：共享 LLM、Journal、Tools、Host ports 和插件准入
    ↓
actspace.main 形态定义：版本、插件成员、依赖、配置、支持模式
    ↓
AgentScope：逐项激活成员的 Agent 行为并持有 disposer
    ↓
模式策略 → Prompt / Context 与模型工具定义
    ↓
Tool Runtime 门禁 → 权限 / 审批 / 沙箱 → 工具执行
    ↓
Journal → Projection → Desktop / Headless
```

### 4.1 共享服务与 Agent 行为

不复制每个 Agent 的 LLM 连接、全局工具注册表和存储服务。已有插件的 Host/Runtime 安装负责提供共享 executor 与服务；增加明确的 Agent 激活入口，负责为当前 Agent 绑定该插件的工具贡献、上下文贡献、事件订阅和状态。

首版组合包括现有 Prompt/Skills、Filesystem Read/Search/Write、Shell、Web、Image Generation/Inspection、Todo、Subagent、Compaction 的 Agent 行为；Browser 在 Profile 已装载时作为可选成员，英语辅助插件保持现有显式启用规则。基础 Loop、Inbox、Session 仍复用现有领域服务。形态清单引用已有插件/entry 身份，不把字符串标签冒充独立插件。

工具名称来自已选插件的贡献，再由模式白名单收紧。未选插件不得给当前 Agent 注册 prompt、监听器或工具贡献。新增插件默认不进入形态；新增工具默认不进入模式。

### 4.2 生命周期约束

- 激活前检查 required 成员、依赖和 Host 能力；缺失必需成员则失败，可选成员缺失记录在 composition snapshot 中。
- 按依赖顺序激活，成功后才发布可运行 Agent。半途失败逆序清理已成功成员。
- 释放前停止 Loop，处理关联后台执行、审批与子 Agent，然后清理订阅和插件状态；一个 Agent 的释放不能卸载其他 Agent 使用的共享服务。
- 恢复时从 Session 解析形态与模式，重建实例，不恢复过期的内存状态。
- 模式切换更新插件消费的策略快照，不改变插件成员，不重启整个 Runtime。
- Session provenance 保存形态 ID、版本、组合摘要和实际成员；继续已有 `createdWith.plugins` 作为 Host 装载证据，不把两者混用。升级后无法提供旧组合版本时禁止继续执行，保留只读访问，不静默替换组合。

第一版只实现这一个静态内建组合与其 Agent 激活契约，不做第三方形态市场、动态安装、热重载或整套工具包物理拆分。

## 5. 模式能力规范

| 模式 | 目标 | 允许的工具贡献 |
|---|---|---|
| Chat | 对话、网络查询与生图 | 恰好 `web`、`generate_image` |
| Plan（建议） | 探索、分析并产出可执行计划 | `read_file`、`list_directory`、`grep`、`glob`、`web_search`、`web_fetch`、`inspect_image`、`explore`、`todo_read`、`todo_write` |
| Agent（建议） | 在权限允许范围内执行任务 | 当前 Core Tools 除 `web` 的工具；现有 Todo、`agent`/`explore` 与已装载 Browser 工具 |

Agent 的当前 Core Tools 清单为：`read_file`、`list_directory`、`grep`、`glob`、`edit_file`、`write_file`、`delete_file`、`bash`、`bash_output`、`bash_kill`、`web_search`、`web_fetch`、`generate_image`、`inspect_image`。Todo 名单固定为 `todo_read`、`todo_write`。Browser 名单固定为 `browser_cua`、`browser_dom`、`browser_locator`、`browser_navigation`、`browser_tabs`、`browser_user`、`browser_wait`、`browser_io`、`browser_debug`、`browser_help`、`browser_run`，实际仍与 Profile 已注册集合取交集。新增工具需显式更新策略及集合测试，不能自动放行。

Plan 的限制不依赖 `read-only` 标记推断：禁用所有 Shell 工具，包括 `bash_output`、`bash_kill`；禁用文件修改、Browser、生图及通用 `agent` 委派。允许 Todo 是有意允许写入会话规划状态，不表示允许修改工作区。计划正文作为回复持久化；本版不增加计划文件写入例外。

Plan 的 Explore 子 Agent 只能使用父策略与自身只读 preset 的交集；子 Agent 不能通过嵌套委派或默认 `agent` 模式扩权。Chat 不允许 Subagent、Skills、Todo、图片分析或任何文件工具。

Chat 生图可产生费用和 Session Artifact，因此不是“完全只读”。缺少搜索/图片服务配置时保留两个 schema，返回现有明确配置错误，不回退到文件或 Shell 工具。Profile 缺少这两个必需注册本身则不能进入 Chat。

### 5.1 统一工具门禁

有效工具集合为：Host 已注册能力 ∩ 形态成员贡献 ∩ 模式白名单 ∩ Agent scope/委派上限。

同一份不可变策略快照供 Request Assembly 与 Tool Runtime 使用，至少包含 Session/Agent 身份、形态版本、模式和策略修订号。Runtime 从可信 AgentScope 绑定取得策略，不能相信模型参数或 renderer 自报的 allowed tools。

现有 AgentLoop 在 `runTools` 中拒绝不可见调用，应保留。进一步在 Tool Runtime 的执行准入以及真正进入 body 前检查 scope 策略；直接调用 `executeBatch`、排队调用、审批恢复也不能绕过。缺失/未知策略、未知模式或未知组合 fail closed。权限审批仅在模式门禁通过后发生，模式拒绝不弹审批升级能力。

同进程插件代码仍属于可信代码；这些门禁不构成恶意插件的进程沙箱。

## 6. 模式状态与切换

建议增加独立 `agent/mode-set` Journal 事实，包含模式、修订号、来源与时间；不复用 `permission/mode-set`。Session snapshot、列表摘要与 checkpoint 都投影当前 `agentMode`。每轮的 `turn/start` 及 request 审计记录实际生效模式/修订号。

模式变更和新运行接纳在同一个 Session 串行边界内进行：

1. 检查不存在活动 Run、未决审批、未收束子 Agent、后台 Shell 或待处理 Inbox 工作。存在时返回 `SESSION_BUSY`，模式不变；用户先使用已有停止/任务清理入口。
2. 校验目标模式、组合与 Host 必需能力；预构建策略，不做工具执行。
3. 追加模式事件并等待 durability barrier；成功前不向 UI 宣告切换完成、不接纳新 Run。
4. 发布新策略/投影。失败则阻止继续运行，按已持久化 Journal 恢复；不能让内存和落盘状态各自继续。

切换相同模式幂等。带过期修订号的请求返回冲突并刷新状态，不覆盖其他窗口的新状态。新 Run 固定使用接纳时模式，后续步骤不得暗中恢复为 `agent`。原有逐轮 `mode` 参数作为兼容入口：仅在相同串行边界内转为模式变更后再接纳运行。

重启恢复最近有效模式；fork 使用 fork 截断位置的有效模式和形态，而非父会话最新 UI 值。切换模式保持 Session ID、消息、附件与形态身份，不创建/归档替代会话。

## 7. 上下文、附件与界面

Chat 复用当前 Chat prompt：不主动读取/注入工作区 AGENTS、cwd/Git、Skills catalog/正文；保留用户指令、用户附件和会话历史。模式过滤必须发生在工作区 source 读取之前，不能只过滤最后渲染的文本。

从 Agent/Plan 切到 Chat 后，先前工具结果、用户消息及摘要仍在会话历史中。因此“Chat 不新增工作区上下文”不等于“Chat 看不到历史项目内容”；需要独立对话时新建会话。此限制需在用户说明中明确，不静默清空或改写历史。

Plan/Agent 保持工作区上下文和现有 Skills 机制，但 Skill 文字不能扩大工具权限。Chat 下不消费 selected Skills；切换不删除草稿或附件，发送前按目标模式的既有附件规则校验，不支持的附件要求用户移除或换模式，不能静默丢弃。

Chat 继续消费已有 `chatCompactionTriggerRatio` 设置，按当前模式判断，不再按旧 preset 判断；模式切换不自动触发一次压缩。动态模式事实通过持久化 runtime-context 传递，renderer/transcript 隐藏；同一模式稳定输入仍应保持 prompt 前缀稳定，跨模式切换不承诺相同前缀。

Desktop Composer 统一展示 Chat / Plan / Agent 模式菜单；删除形态切换导致新建并归档空会话的路径。活动会话禁用切换并提示先停止。新建入口可以预选模式，但最终创建同一形态；默认新建继续 Agent。

Chat 复用当前开发控件隐藏行为；Plan/Agent 显示工作区与权限控件。隐藏不修改权限值和 Grant。Chat→Plan/Agent 时，没有工作区则提示显式选择，不自动借用 Runtime 启动目录；选择完成后再切换。手动使用终端等 Host UI 不属于模型工具授权，不能把模式承诺描述成整台电脑只读。

## 8. 数据契约与兼容建议

- 新 Session 记录 `agentFormId=actspace.main`、形态版本/组合摘要和 `initialAgentMode`，保留现有 profile provenance。
- 新 API 明确区分 `agentFormId`、`agentMode`、`permissionMode`；旧 `agentForm=chat/agent` 仅作为兼容输入映射到初始模式，退出正式 UI 契约。
- 旧 `actspace.chat` 映射到唯一形态，默认 Chat；它过去 `turn/start.mode=agent` 是内部执行细节，不能用于把旧 Chat 恢复成 Agent。
- 旧 `actspace.main` 或无 preset：初始 Agent；若存在合法的历史 Plan/Agent turn，恢复最后有效模式。新模式事件出现后，以新事件及其后接纳的模式状态为准。
- 未知 preset/形态/版本/模式禁止运行，不回退到全工具。
- 旧 Header/Journal 原位保留。新 Session 的 Header 保存形态成员及摘要；旧会话通过原 preset 兼容映射，未回填或改写旧记录。
- fork 保留旧 provenance 作为来源，新 Session 使用规范字段与截断位置模式；不改变现有附件复制和路径重写契约。
- 增加 codec 和投影版本，清理/重建派生缓存不能丢失模式；禁止依赖 renderer 本地缓存恢复模式。

最脆弱的前提是所有 Agent 调用路径都能绑定可信作用域策略；若仍存在无作用域的生产调用入口，本方案不能声称模式是硬限制，必须在上线前收口。

## 9. 范围、风险和回退

不新增形态选择 UI、配置页、依赖、供应商、进程或数据库；不开展独立的工具包拆分。新增持久状态仅用于组合身份/版本、模式事实及投影；新增 Host 操作仅用于切换模式，由现有 App Service/IPC 持有。维护成本是 codec、恢复、fork 和旧数据 fixture，不能通过第二份配置文件保存模式规避。

不选择“只改 Composer 标签”的最小方案，因为它不能满足插件生命周期、旧 Chat 固定 preset 以及 Runtime 门禁要求。最小完整交付是一个内建组合、三种模式、一条状态链和双层调用校验。

此变更涉及多包和持久化，不能保证旧二进制读取新事件。执行前备份隔离验收数据；回退可撤回代码并恢复对应备份，新格式原数据另存保留。无备份时将受影响会话留在支持新 codec 的版本只读查看，禁止删事件、重写 Header 或强行降级执行。

## 10. 验收不变量

1. 一个内建形态拥有三个模式；模式切换不改 Session ID/组合成员。
2. 未选插件无 Agent 贡献；失败激活和实例释放无状态/订阅泄漏。
3. Chat schema 恰好两个工具；伪造写入、Shell 或委派调用被 Runtime 拒绝。
4. Plan 的允许列表逐项可调用；禁止项在 full-access/已有 Grant 下仍被拒绝。
5. 子 Agent 不能超出父策略；审批和排队不会穿透门禁。
6. 并发切换/发送、持久化失败、忙碌切换均不产生混合模式执行。
7. 重启、fork、旧 Chat/Plan 恢复和删除派生缓存后模式一致。
8. Chat 不新增工作区/Skills 上下文，保留历史的行为有明确说明。
9. 真实 Electron 交互、浅深主题、附件和真实 Provider 验证分别记录，源码/fixture 不替代实机通过。
