# Context 引擎真实桌面验收计划

状态：2026-10-06 用户已批准，真实分组验收完成取证；通过、失败和未覆盖见[验收报告](real-desktop-acceptance-20261006.md)。仅验收和收集 Bug，不修复产品代码。

## 环境和当前进度

- 本worktree通过 `pnpm dev:log` 启动；首轮目录为 `/tmp/actspace-context-real-acceptance-20261006`，完整插桩验收使用 `/tmp/actspace-context-real-acceptance-logged-20261006`。
- 复用用户授权的现有模型配置：仅复制 `settings.json`、`secrets.json` 和 prompts 到独立目录，未输出凭据。原始数据目录不改写。
- 本次应用身份为 `Actspace Dev 956e-3624` / `com.actspace.desktop.dev.w3624b697`。启动日志 `/tmp/context-real-acceptance-dev.log`，仓库开发日志仍由 `dev:log` 生成。
- Computer Use 由 `gpt-6.1-sol` 执行。用户已批准分组验收及临时日志输出；发现问题先记录，统一留待后续修复。
- 使用独立测试会话和无敏感信息的 fixture。给模型的任务明确限定只读 fixture、禁止修改源码。

## 每次交互后的数据检查

不能只凭模型回答或最终截图判定通过。通过 `sessionId / turnId / stepId / requestId / attempt` 关联四个观察点：

1. **来源完成后的 Context**：记录真实的 request、system sections/modelFacts、原 Session Surface、supplements、tools，以及 status 中的 cycle、路径可见性/计数、睡眠索引和来源 owners。
2. **toLlmInput 返回值**：记录转换后的 messages、tools、options、model 和 routeId，与 Context 做逐字段对应检查。
3. **LLM prepare 后的非凭据请求**：记录实际交给 dispatch 的 messages、tools、options、model、routeId 和 contextWindow。prepare 可合法补充 defaults/解析模型，比较时说明差异，不要求对象机械相同。
4. **Journal 与桌面展示**：检查现有 request/header、request/context 和 Context 插件事件，核对模型输入快照与桌面分组、计数和容量。

现有 `request/context` 包含输入快照，但没有完整 Context.status，也不能代替独立捕获的转换前后值。因此确认后可增加仅本次验收启用的临时诊断输出；只观测，不改变转换、持久化或请求逻辑。Context/LlmInput/prepare 三阶段以同一 requestId 记录到本地 JSONL，压缩整理用 compactionId 关联 Journal。不记录 credential 对象、密钥、Authorization 或网络请求头。

验收结束撤掉本次新增的诊断插桩并恢复原有工作区改动，保留日志和报告。撤除是恢复诊断改动，不属于修复 Bug。若只能取得 Journal，必须标明相应阶段未独立捕获，不声称已经检查完整 Context。

## 验收点

| 编号 | 操作与界面预期 | 真实数据判定 |
| --- | --- | --- |
| A1 / U1 | Agent 普通请求、分页读取 fixture、文件附件/引用；Plan 请求和只读行为 | Surface 消息和工具调用 ID 保留；正文、附件、引用转换正确；成功分页读取每次计数，失败读取不计数 |
| A2 / U2 | Agent → Chat → Plan → Agent，打开各模式 Context | Chat 不新增 workspace/Skill 来源，工具符合现有模式范围；切回恢复适用来源。允许旧历史保留，不把历史文字当新来源残留 |
| A3 / U7 | 打开 Context Popup 与右侧详情，切换已配置模型并再发请求 | 界面对应本次 request/context；容量对应 prepared 模型事实；模型选择与 Prompt/输入一致；runtime 补充不显示为用户发言 |
| A4 / U8 | 开关英语辅助学习、发送独立短任务 | 双语来源仅作用于选定会话；Context、转换消息与真实回复对应；关闭后不新增贡献。不将旧历史中的双语内容视为关闭失败 |
| A5 / U8 | 请求运行中停止，再次发消息；有可控失败条件时重试 | 停止能结束任务；后续工具调用/结果结构合法；区分用户重新发送与同一逻辑请求自动重试，检查临时补充寿命与去重 |
| A6 / U3 | 空/短会话压缩反馈；足够历史下手动压缩并观察进行中/完成 | 摘要保留 Relevant Files；原历史仍在 Journal；成功事务和派生整理只应用一次；路径合并不重复。失败/取消不推进成功周期 |
| A7 / U4 | 准备超过 100 个真实文件引用，分配不同读取次数，压缩后看导航 | active ≤100 且均为文件、无目录；按周期读取次数及既定并列顺序选取；其余进入睡眠索引；读取计数在选取后清零 |
| A8 / U4 | 读取一个确定 sleeping 的文件，先观察，再压缩一次 | 读取后 count +1、visibility 仍 sleeping；下次成功压缩后按排名恢复 active，禁止立即唤醒 |
| A9 / U5 | 读取睡眠索引、原 Journal、压缩前读过的源文件；执行一次权限拒绝 | 索引可读且不计热度、不生成索引套索引；原历史引用有精确 event seq 而非行号；压缩后重读正文可达；拒绝有真实失败、计数不增 |
| A10 / U3–U4 | 在隔离环境临时降低现有压缩触发配置，真实请求触发一次自动压缩，再恢复 | 确认真由自动阈值触发，共用协调器，周期/摘要/导航与手动一致。若没有可用配置入口则记录限制，不修改算法冒充实机覆盖 |
| A11 / U6 | 正常退出并重启本实例，打开测试会话继续请求 | Surface/摘要/路径/计数恢复正确；首次新请求 Context 与持久状态一致；不重复摘要或整理 |
| A12 / U6 | fork 已压缩会话，在子会话读取和继续请求，再回父会话 | 父子状态独立；索引 artifact/导航指向各自合法资源；子请求不改父 Journal；继承历史仍可查看 |

图片/附件读取、英语语音播放和 provider 自动重试若缺少相应能力，需要分别标注未覆盖，不能用纯文本成功代替。不会为触发重试而切断全机网络或影响其他应用。

## 操作分组

### 第一组：普通请求、模式和实际输入（A1–A3）

进入独立测试会话，确认配置可用，执行普通 Agent 请求、fixture 读取与附件/引用，再切 Chat、Plan 和 Agent。每个模式查看 Popup/详情；若有多个可用模型，切换后发一条短请求。一次场景内检查布局、文案、状态和输入数据。

证据：关键界面截图；至少一份包含 system/user/assistant/tool/runtime 补充的 Context → LlmInput → prepared 对照；模式来源与工具集合对照。

### 第二组：扩展、停止和重试（A4–A5）

在测试会话开关英语学习，用另一会话检查作用域；执行可观察的长响应并停止，再继续。仅在隔离实例具备可控条件时制造请求失败，检查真正重试的 attempt，而非将新请求当成自动重试。

证据：开关与停止中间状态；请求/attempt 对照；补充版本、锚点和重复次数。

### 第三组：压缩和渐进式披露（A6–A10）

准备 101 个以上文件及引用清单，安排热/冷读取；先手动压缩，观察成功周期与索引，再读取一个已确认睡眠的文件，记录即时状态，再次压缩检查恢复。接着读取索引/原历史/源文件并拒绝一次权限；最后以隔离配置验证自动压缩并恢复配置。

文件存在本身不等于已进入 Context：开始验证排名前必须确认 Journal/Context 已登记超过 100 个路径。先保留首次压缩后的证据，不能只凭第二次压缩的终态判断延迟恢复。

证据：压缩前、第一次成功后、睡眠读取后、第二次成功后四份状态；摘要正文、候选/core/applied 事务、索引内容和实际模型导航。核对 system 前缀是否稳定，但不声称 provider cache 命中率通过。

### 第四组：重启和 fork（A11–A12）

保留第三组会话，正常退出并重启同一数据目录，恢复后发送一条短请求；fork 后在子会话读取，再回父会话核对状态。

证据：重启前后 state/Surface 对照；父子 sessionId、artifact 引用和对应请求；父 Journal 没有子会话读取引起的状态变化。

## 转换重点

- system sections 按 order/id 渲染；动态路径导航进入标记清楚的 runtime user 消息，不反复修改 system。
- conversation 复用现有 Surface；supplement 按锚点排在完整工具结果批次后，不切断工具调用关系。
- status 不自动进入 messages。明确来源生成的导航正文可以进入；管理字段 readsInCycle/cycle/owners 不应被整个序列化发送。
- tools 为模型工具定义，保留 schema；request 标识、model、route、options 与选定请求对应。
- 快照对应 prepare 后实际输入。记录合法的 prepare/default 差异与任何不一致，避免把同源快照彼此相同当独立验证。

## Bug 交付方式

报告位置：`real-desktop-acceptance-20261006.md`，位于本目录。

逐项记录通过/失败/未覆盖，另列 Bug：编号、严重性、复现步骤、期望/实际、关联验收点、会话/request/compaction 标识、截图与日志路径。区分 UI 直接观察、真实运行数据和源码推断。遇到阻塞只停止受影响路线，继续独立验收；不改业务代码、不修复、不提交、不推送。

启动日志目前含 Chromium cache 创建失败提示，仅列为待观察环境问题；尚无足够证据判断产品失败。本计划的待验项目不表示已经通过。
