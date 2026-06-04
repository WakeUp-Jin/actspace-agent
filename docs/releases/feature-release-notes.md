# 功能发布记录

这份记录按用户可感知的新功能、体验优化和重要修复回填，不等同于正式版本号、Git tag 或远程发布通道。

## 2026-06

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-06-05 | 本地更新 | 本地更新更稳：构建时能看到进度，坏包不会再把可用旧版覆盖掉。 | 本地更新独立到「设置 → 更新」页；构建阶段保持应用打开并写入 `status.json`；helper 默认生成 ad-hoc signed 本地包，替换前验证新 app，启动失败时自动恢复旧版本。 |
| 2026-06-05 | Usage 统计 | 用量页可以追到每轮请求明细，并用分页查看长列表。 | 底部新增会话明细表，展示 workspace、sessionId、模型、token；Token hover 展示 Cache Read/Input/Output/Total；明细支持每页 10 条分页。 |
| 2026-06-05 | 模型与连接 | 新会话选中的模型会真正生效，打包版 Kimi 默认连接也更适合国内 endpoint。 | 修复 Composer 模型选择在 initial/follow-up 输入框切换后回到默认模型的问题；Kimi 默认 base URL 统一为 `https://api.moonshot.cn/v1`。 |
| 2026-06-05 | Agent 文件读取 | Agent 重复读取同一文件范围时更少污染上下文，长任务缓存更稳。 | `read_file` 默认鼓励分段读取，重复读取未变化的同一路径/范围时返回简短提示，并保留 `force=true` 逃生口。 |
| 2026-06-05 | 界面细节 | 侧栏和设置入口更清爽，窄宽度下不会横向乱滚。 | 修复会话侧栏横向滚动；本地更新从通用设置移到独立「更新」页。 |
| 2026-06-03 | Agent 协作 | 主 Agent 可以把局部探索任务交给隔离的 SubAgent，主会话保持干净，同时仍可查看完整执行过程。 | 新增 `Agent` 工具、SubAgent sidecar transcript、运行中预览和 transcript 弹窗；主 session 只保留摘要与引用。 |
| 2026-06-03 | 本地安装与启动 | 源码本地自构建的 macOS 应用更容易打包、启动和排障。 | 修复 ad-hoc DMG 签名策略，新增安装版启动 JSONL 日志，并修复双击启动时从 `/` 推导日志和工作区路径的问题。 |
| 2026-06-02 | 上下文管理 | 用户可以在聊天中输入 `/compact` 主动压缩上下文，并在消息流里看到执行状态。 | 新增手动 context compaction IPC、started/progress/finished 生命周期、`CompactCommandBlock` 和可恢复的 `context_compaction` 消息块。 |
| 2026-06-02 | 文件操作工具 | 删除文件不再依赖 `rm` 这类高风险 Bash 命令，用户能在删除前看到明确确认。 | 新增 `delete_file` 工具、一次性审批、删除预览、流式恢复和 session 恢复契约。 |
| 2026-06-02 | 会话与工作区 | 会话管理更接近桌面 IDE：可右键管理会话，工作区选择也不会在未发送消息时污染 session。 | 会话行新增 Pin / Rename / Archive 右键菜单；workspace 选择改为发送时提交最终值，右侧文件树跟随当前选择预览。 |
| 2026-06-02 | 运行时规则 | 用户能确认 `AGENTS.md` 这类项目规则真正进入当前 Agent 上下文。 | 抽出 main 侧 `AGENTS.md` runtime loader，让真实 turn 与 Context 检查视图复用同一套规则加载链路。 |
| 2026-06-02 | 附件与输入 | 附件链路在 UI、运行时输入和持久化之间更稳定，图片预分析不会污染普通工具历史。 | 补齐附件发送、拖拽、删除、模型输入、`user_message.payload` 与 runtime-only `media_analysis` 的契约测试。 |
| 2026-06-02 | 工具体验 | 工具行、图标按钮和会话状态更容易读懂。 | 补充 icon button tooltip、侧栏 session 状态聚合，并收口工具行展示语义。 |

## 2026-05

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-05-31 | 本地更新 | 安装版应用可以从本地源码目录一键重新打包并替换，适合无 Developer ID 签名预算的本地迭代。 | 设置页新增「本地更新」入口，main 侧验证源码目录和安装位置，外部 helper 负责打包、备份、替换和重启。 |
| 2026-05-31 | macOS 打包 | 项目可以产出本地可用的桌面端安装包和 release manifest。 | 新增 DMG 打包脚本、桌面归档与本地发布说明，并区分本地签名、Developer ID 和 notarization 边界。 |
| 2026-05-30 | 设置与系统提示词 | 用户可以在设置页管理主 Agent 系统提示词、Kairos 配置、模型来源和运行节奏。 | 新增设置页运行时配置层、主 Agent system prompt 设置、Kairos 结构化配置表单、路径内联编辑和固定节奏配置。 |
| 2026-05-30 | 右侧对象面板 | 聊天中的文件、HTML、Markdown、图片和上下文内容可以在右侧更稳定地查看。 | 实现工作区文件浏览器 V1、右侧面板多视图、Reply HTML 视图和 Context 全文逐条查看，并修复多处渲染问题。 |
| 2026-05-30 | 上下文与缓存 | 用户能更清楚地看到 token、缓存和上下文构成，长会话也有压缩保护。 | 落地 context compression、cache-first 稳定排序、DeepSeek CNY 计价、Usage 语义修正和配置驱动的 Context 弹窗。 |
| 2026-05-29 | 外观设置 | 桌面端支持字体、代码字号、界面缩放和深色主题，视觉偏好可持久化。 | 新增外观页字体/缩放控制、三态主题切换、Electron `nativeTheme` 同步和语义 token 收口。 |
| 2026-05-28 | Kairos 监控体验 | 用户可以在完整页面和右侧紧凑视图中观察 Kairos 状态、轨迹、最终回复、上下文和用量。 | 重设计 Kairos 监控页，新增右侧 compact view、上下文 Sheet、token/成本用量胶囊和实时工具事件保留。 |
| 2026-05-28 | Lab 实验台 | 仓库出现可交互的实验管理入口，用于沉淀未来能力实验、晋升和废弃记录。 | 新增 Lab V0 renderer mock、四栏实验矩阵、新实验弹窗、详情推进、完成实验弹窗和前端设计文档。 |
| 2026-05-27 | Kairos 自治模式 | 桌面端具备第一版可独立运行的自治 Agent：能定时观察、记忆、生成 brief，并在主 Agent 工作时让步。 | 落地 Kairos shared contracts、配置与工具守卫、短期记忆、Observe + Briefs、Controller + Runner、main IPC 和 renderer 页面。 |
| 2026-05-26 | 工具审批 | 高风险工具调用可以暂停等待用户批准，批准后继续当前 turn，拒绝后保留可读状态。 | 实现工具审核暂停/恢复、Bash approval UI、一次性/相似批准语义、前端审核面板和 always-ask 测试开关。 |
| 2026-05-26 | 文件编辑工具 | Agent 可以用结构化工具读写、编辑和展示文件 diff，用户能看到更清楚的执行状态。 | 新增 edit/write 工具、FileDiffBlock、四阶段工具流式协议、工具进行中最小展示时间和 shimmer 可见性修复。 |
| 2026-05-26 | Usage 统计 | 用量页从原型进入运行时页面，支持跨 session 与 Kairos 的用量观察。 | 新增 Usage Statistics 页面、overview card、热力图 tooltip、DeepSeek 余额卡、全局统计范围和 Kairos 持久化用量累计。 |
| 2026-05-25 | 搜索与浏览工具 | Agent 可以更可靠地搜索本地代码和网络结果，工具行也更容易区分。 | 新增独立 Grep / Glob preview、基于 ripgrep 的受控子进程执行、WebSearch preview kind、内置 ripgrep fallback 和工具预览规范。 |
| 2026-05-25 | Token 与 Context 数据地基 | 每轮对话的用量和上下文快照开始可持久化、可恢复、可被 UI 展示。 | 新增 `llm_usage`、`context_snapshot`、`context-state.json`、context describe 边界和相关设计文档。 |
| 2026-05-24 | Bash 工具 | Agent 可以执行受控 Bash 命令，并在用户确认后完成高风险开发动作。 | 新增 Bash 工具 definition、权限检查、executor、结构化结果渲染、权限调度基座和审批 UI。 |
| 2026-05-24 | 模型能力 | DeepSeek 主模型与 Kimi 辅助能力的边界更清楚，模型选择更贴近真实使用。 | 补充 Composer 模型选项、DeepSeek + Kimi 混合能力设计、真实 Agent turn 链路修复和运行日志聚合。 |
| 2026-05-23 | 真实 LLM 对话 | 桌面端从 mock 对话推进到可使用 DeepSeek 真实 provider 的流式对话。 | 接入 DeepSeek SSE provider、前后端 streaming bridge、集中 env 管理、provider 错误分类、usage 映射和桌面真实探针验收。 |
| 2026-05-22 | 桌面工作台 | 应用形成可运行的三栏工作台骨架，支持会话创建、消息流、可拖拽面板和本地数据路径。 | 完成 Electron build 边界、SplitView、session contract、create session flow、稳定 app data path 和前端验收入口。 |
| 2026-05-21 | 产品原型 | actspace 从模板仓库推进为有明确界面语言和 Agent 工作台方向的桌面应用。 | 定稿 Composer、Context、Thinking、Read/Search、右侧面板和 Edit diff 组件，新增 DeepSeek 工作台 HTML 原型与桌面 UI 骨架。 |
| 2026-05-20 | 模板仓库 | 补齐 CI、脚本、全局初始化命令和 README，使模板可直接使用。 | 修复 CI 缺失文件、补齐 release-package.sh 和 create-project.sh、完善 package.json、撰写 README。 |
