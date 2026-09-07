# Agent 工具体验与轨迹布局调整

> 状态：P1–P3 实现、自动化和浏览器界面验证完成；Todo 仅修改参数说明，UI 不改。2026-09-06。
> 真实 Electron IPC／Provider 人工验收边界见 [执行摘要](../../../exec-runs/20260906-agent-tool-experience/execution-summary.md)。

## 用户已明确的体验

- Think 指模型 Thinking 折叠组件。
- 默认模式只有 Bash 工具需要操作审批，其他工具不弹逐次操作审批。
- 用户最新确认 Todo 界面正常：不调整位置、排序、清单状态或渲染；仅澄清后端工具参数契约。
- 子智能体在右侧面板显示列表，点击进入该子智能体执行详情，可返回列表。
- List 在当前 workspace 内显示相对路径，外部路径显示绝对路径。
- 工具参数不逐字符展示，避免频繁变化；工具状态仍需及时显示。
- 轨迹模式隐藏底部输入区域，把空间让给执行记录。

## 实施前证据

1. `ThinkingBlock.tsx` 和 reasoning-delta → assistant_thinking_delta → App 的链路仍存在；`fixed-renderer-ipc.ts` runAgent 只传 model/mode/content 等字段，漏传 Composer 的 thinkingEnabled/reasoningEffort。必须继续核对请求选项映射和模型能力，不能仅凭组件存在判定思考功能正常。
2. `packages/tools/core-tools/src/plugin.ts` 对所有 write/execute effect 统一 require-approval；Browser tools 另有操作审批策略。写入审批不是上一轮新加入的策略，上一轮修复使其能够被正常展示。
3. Todo schema 明确支持 activeForm、可选 id；TodoService 把有 id 的条目当作更新，不存在则拒绝。真实 ToolRuntime + ephemeral Session 的只读探针确认：activeForm 新建成功；自定义未知 id 失败，原因是 `Todo task1 does not exist.`；完整已有 id + activeForm 更新成功。截图中的模型解释不能作为 activeForm 不受支持的证据。
4. 用户已撤回 Todo 展示与排序调整；本轮不修改 Todo UI、清单顺序或快照更新行为。
5. 子智能体目前通过 ConversationView 底部 SubAgentTranscriptPanel 展示，未接 RightPanel 的列表/详情导航。子 Session 和 transcript 查询已有基础；运行中列表必须核对 delegation 身份与进度来源，不能等 finished 才拿到子会话身份。
6. Main preview builder 直接使用 args.path；缺少当前会话 workspace 的展示路径归一化。
7. ConversationView 的 composer-zone 只判断会话就绪，不判断 activeView，所以轨迹页仍占用底部输入空间。

## P1：运行显示与默认审批

- 思考开关从 Composer 经 IPC、Runtime turn 输入、LLM request options 贯穿；遵循实际模型能力，必选思考模型不伪装可关闭。不把正文或工具参数当作思考内容。验证 reasoning delta 和最终 reasoning block 两条来源。
- 参数阶段只插入一条稳定的动作占位，例如 Read、Write、Bash；不显示 partial path、partial command 或 Write streamingContent。prepared 时一次更新完整摘要；started、approval、finished 继续实时更新。正文与 Thinking 保持流式，Bash 输出等真实执行进度保留，但不重写参数标题。
- 删除仅为可见参数增量服务的缓冲/解析/50ms 定时器与测试；底层协议保留工具参数事件，Journal 格式不变。
- 默认策略仅 Bash 弹操作审批，覆盖 Write/Edit/Delete 和 Browser 等其他工具的逐次审批入口。参数校验、workspace 边界、Host 能力限制、系统权限与硬拒绝保持；不将“不审批”改成绕过能力限制。Bash 现有硬拒绝与审批语义保留，不在本轮重做统一审批中心。
- 路径展示在 Host 统一处理，依据当前 Session workspace（含 worktree/子 Session）用路径相对关系判断，不能用字符串 startsWith；workspace 根显示 `.`，内部显示相对路径，外部保持绝对路径。先覆盖 List，复用到 Read/Write/Edit 的可见路径，真实执行路径与轨迹 Raw 参数保持原值。

主要文件：Core loop/run input、Shared runtime input、Runtime app/agent 转发、fixed-renderer-ipc、legacy adapter/model options、core-tools/plugin、browser-tools/plugin、fixed-renderer-stream-adapter、fixed-renderer-tool-preview、projection 与对应测试。先用搜索确定真实调用链，不另建第二套请求配置。

## P2：Todo 参数说明与轨迹视图

- 已完成最小 Todo 修复：仅为 id、merge 各补一句 schema 说明。新建省略 id，更新使用工具返回的完整 id；false 替换清单，true 保留未提及条目。activeForm 和执行逻辑不变。按用户要求不扩充冗长描述或示例；现有 11 项测试与真实 ToolRuntime 临时会话参数探针通过。
- 不修改 Todo 界面位置、排序、清单状态或渲染逻辑。
- 轨迹模式隐藏整个 composer-zone，包括 Review、模型选择和输入框；不影响任务运行。切回会话恢复草稿、附件和模型选择，避免直接卸载造成状态丢失。运行中停止入口仍可访问，必要时在顶部提供紧凑停止操作。

主要文件：core/agent/todo-tool 及对应测试、ConversationView 与输入区域状态相关文件。TodoService 和 Todo UI 不在修改范围。

## P3：右侧子智能体列表与详情

- 在现有 RightPanel tab 体系新增 Subagents 视图，按 Running / Done 分组，显示任务名称、状态、持续时间；保留当前主题，不仿造 Codex 的内部实现。
- 第一次产生子智能体时打开列表；用户关闭后本轮后续更新不反复抢开。会话中的 Agent/Explore 条目可打开列表并选中对应任务。
- 点击列表条目在同一右面板进入详情，顶部提供返回列表、标题和状态；详情复用既有消息/工具展示，运行中持续更新，最终可从子 Session 恢复。
- 数据以 parent Session、parent callId、child Session 为关联；准备阶段尚无 childSessionId 时先显示稳定占位，身份建立后补全。不把其他会话的子智能体混入列表，不等待最终结果才建立详情入口。
- 保留文件、Review、Context 等现有 tabs。停止主任务/切换会话后清理订阅；已完成子任务仍可查看。

主要文件：RightPanelContext、RightPanel、新 SubagentsPanel、ConversationView、AgentRunBlock/ExploreRunBlock、现有 transcript bridge、subagent publication/projection 以及针对列表和详情的测试。

## 验证与交付

- 先红后绿：Thinking 开关到请求、Todo activeForm/未知 id/完整已有 id/新建与合并参数说明、默认非 Bash 不调用 approval broker、Bash 仍审批、路径根边界与 worktree。
- 真实 Loop→Main→App：工具参数分片只产生稳定占位，prepared 一次补齐；短工具和 done-only 不丢条目；结果仍立即收尾；正文 JSON 保留。
- 轨迹切换：输入区不占高度；切回草稿/附件/模型恢复；运行任务仍可停止。
- 子智能体：两个并行任务、不同完成顺序、失败、列表→详情→返回、会话切换、重开恢复、订阅释放。
- 工程：受影响 package 测试、Desktop 全量、根 typecheck/build、文档/主题/diff 检查。每个阶段是可验收切片，完整交付后记录执行摘要和 history。
- UI：浅深主题、轨迹可用空间、子智能体右面板列表/详情。Browser fixture 不替代 Electron IPC；真实模型验收须使用已授权验证范围，不读取或复制凭据。

## 范围和审批点

本计划包含默认操作审批策略变化、请求选项传递、Todo 后端参数说明和子智能体面板改造，超过五个实现文件，须在此具体方案获批后再改业务代码。沿用仓库既有 dirty-worktree 精确补丁规则；不提交、不推送、不迁移用户 Journal，也不清空用户 Todo 或删除截图中提及的临时文件。
