# 功能发布记录

这份记录按用户可感知的新功能、体验优化和重要修复回填，不等同于正式版本号、Git tag 或远程发布通道。

## 2026-07

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-07-25 | Browser 工具按需加载 | Agent 默认只加载浏览器入口，需要操作网页时再展开完整工具组，减少上下文占用和误调用；Browser 设置也更简洁。 | Browser 工具改为 progressive disclosure：每个 Turn 默认只暴露 `browser_help`，调用 gateway 后从下一次模型请求开始披露完整工具组，并在新 Turn 或 Kairos tick 重置；Context 与压缩链路统一读取当前可见工具，设置页收口为 Browser 总开关和折叠的能力选项。 |
| 2026-07-25 | Ink & Emerald 视觉系统 | 浅色、深色与跟随系统主题的界面层级更统一，主操作、运行状态、语义提示和数据配色更容易区分，悬浮与选中反馈也更明确。 | 建立 neutral、action、operational、semantic、chart、context 与 diff 语义 token，迁移 Sidebar、Composer、Settings、消息流、右侧面板、Kairos、Usage 和 Context；清除旧 `brand` alias，增加颜色防回流检查，并补齐模型、Review 与右侧 Tab 的交互状态。 |
| 2026-07-25 | 服务商余额管理 | DeepSeek、Kimi、OpenRouter 的余额回到各自服务商卡片中查看，模型用量与账户余额不再混在 Usage 页面。 | 新增统一 provider balance IPC；OpenRouter 模型 Key 与 Management Key 分开加密保存；服务商卡支持进入刷新、手动刷新和定时刷新，失败时保留上次结果；Usage 移除余额卡。 |
| 2026-07-25 | Kairos 配置稳定性 | 未选择模型时仍能编辑 Kairos 配置；选择可用模型后当前进程立即启用，无需重启，尚未开放的 Lab 入口也不再干扰主流程。 | 拆分 Kairos 配置 IPC 与 Controller 生命周期，配置通道保持可用；模型可用后即时创建 Controller 和 runtime IPC；Sidebar 暂时隐藏 Lab，保留现有实现资产。 |
| 2026-07-25 | 用量与费用透明度 | 每轮回复、每日统计和会话明细都能直接看到真实 Token 消耗与统一美元预估费用，Agent 的工具调用和失败重试成本不再隐藏。 | Assistant 回复悬浮尾栏新增时间、本轮 Token、USD 费用和快捷复制；按 turn 聚合全部 `llm_usage`，CNY/USD 共享固定折算口径；Usage 每日细目按 5 天分页并在范围切换时复位，会话明细新增费用列，同时保留低成本调用的小数精度。 |
| 2026-07-25 | 模型选择体验 | 模型增多后仍能快速搜索；支持的 OpenRouter 模型可以按需选择推理强度，新增模型也会立即出现在 Composer。 | Composer 增加本地模型搜索和轻量弹出过渡；OpenRouter catalog 的 reasoning effort、默认值与强制推理能力贯通 shared、IPC、Agent loop 和 provider adapter；目录重载会更新已安装模型的能力快照，添加与刷新完成后立即重拉 Composer 候选。 |
| 2026-07-25 | 多供应商模型 | 可以同时配置 DeepSeek、Kimi、OpenRouter，按服务商启用代理和模型，并为主会话、轻量任务、Explore、Kairos 选择真正可用的模型。 | 新增 settings v2 与一次性迁移备份、provider-qualified ModelKey、OpenRouter 精选/远端目录、供应商级代理 transport、统一 purpose resolver、任务模型 runtime，以及独立服务商/模型设置页；Key 配好后无需先测试即可选择，明确测试失败时才禁用。 |
| 2026-07-19 | 失败回归沉淀 | Agent 执行失败或效果不佳时，可以直接在当前会话生成可导入评估仓库的回归 Candidate。 | 新增 `/eval [失败说明]` 系统命令；独立生成 Agent 复用现有文件工具，在 `<userData>/eval-candidates/` 写入 `candidate.json + case.json + fixture/`，并通过 `eval_candidate` 事件恢复生成结果；独立 Eval 仓库提供 `ingest-candidate` 加入 regression 数据集。 |
| 2026-07-17 | Agent Turn 稳定性 | 流式回复不再重复，点击停止后能快速继续输入；中断轮次重新进入任务仍可恢复，完整回复结束时消息区也不会闪动或短暂重复。 | 为 assistant、工具、审批和 SubAgent 流事件补齐 `sessionId + turnId` 作用域，Renderer 收敛为应用级单一监听；Agent loop 显式区分 `completed / failed / aborted`，中断同步取消审批与前台 Bash，并以两阶段 append 持久化用户消息和 `turn_aborted`；流式块与持久化消息采用互斥数据源和稳定 `renderKey` 完成无 remount 交接。 |
| 2026-07-17 | Browser Locator Runtime | Browser Use 可以用 role、accessible name、label、placeholder 等接近真实用户语义的方式稳定定位页面元素，并覆盖 Frame、开放 Shadow DOM、自动等待和可操作性检查。 | 自研模块化 TypeScript Locator Runtime，确定性构建后由 Go `embed` 注入页面；新增结构化 `css / role / text / label / placeholder / test_id` target、strict match、actionability、deadline 重试，以及 Go 侧 Frame/OOPIF context 路由和坐标回算；Agent 默认最大轮次从 50 提升到 200，耗尽时返回明确终态。 |
| 2026-07-17 | Bash 后台任务治理 | dev server、watcher 等后台命令可以跨 Turn 延续，但不会无限运行、重复启动或悄悄堆积。 | 后台 Bash 默认最长运行 30 分钟，单会话最多同时运行 8 个任务；相同 `cwd + command` 自动复用已有 `taskId`，每个新用户 Turn 首次模型调用前注入一次运行任务清单，超时和达到上限均返回可读终态。 |
| 2026-07-17 | 右侧对象面板 | 打开右侧面板时可以直接选择 ActSpace 的真实对象，不再默认进入 Kairos，也不需要先创建无关 Tab。 | 新增 Files、Review、Context、Kairos、Reply 五格对象启动页；关闭最后一个 Tab 后自动回到入口页，`Reply HTML` 用户可见名称收口为 `Reply`，并补齐键盘焦点、禁用态和浅深主题适配。 |
| 2026-07-13 | Agent 评估体系 | Agent 能力优化开始可以通过可运行数据集、结构化评分和基线对比衡量，而不只依赖主观体验。 | 新增黑盒 `actspace-agent run` CLI 与显式 `--out` artifacts；独立 `actspace-agent-eval` 提供 Docker-first runner、coding fixture、确定性 graders、可选 judge grader、单 case/dataset 报告和 baseline comparison；eval 模式额外采集每次 LLM 调用前的 context snapshots，普通运行不产生评估文件。 |
| 2026-07-12 | Browser Use 安全与体验 | 浏览器首次使用只需按会话授权一次，不同任务不会互相关闭标签页；模型能获得更完整的 DOM、工具 schema 和批量操作结果，用户也能清楚看到 ActSpace 光标将点击哪里。 | 新增 `browser_session` 授权租约与 Turn 级拒绝语义，标签页 ownership/claim/finalize 按 session 隔离；DOM snapshot、精确 help、Locator 批量读取和 `browser_run` 采用结构化保真输出与分页；扩展升级为 ActSpace Browser 品牌，连续光标先移动到目标再触发真实输入，Native Host 安装改为探测后原子替换。 |
| 2026-07-12 | 输入与编辑体验 | 长输入和长消息保持易读，Composer 在单行与多行布局间稳定切换；文件修改完成后 diff 不会因上下文压缩丢失，确需写到工作区外时可以由用户明确批准。 | Composer 使用固定 inline 宽度作为多行测量基准，避免回车后误缩布局；用户消息支持默认折叠、点击展开和内部滚动；edit/write preview 改以原始 structured result 为事实来源，并为工作区外路径增加一次性审批和明确失败态。 |
| 2026-07-10 | Browser Use 全链路 | 主 Agent 可以直接通过标准 Browser 工具操作真实 Chrome，完成读取、导航、表单、截图、标签页、下载、剪贴板和调试等完整浏览器任务。 | Browser Bridge 合并进主仓库，建立 62 条 Go canonical command registry；Agent 工具面收敛为 9 个分类工具、`browser_help` 和 `browser_run`，批量 mutation 先完成整批参数验证与风险预检再顺序执行；Native Host socket、Chrome Extension primitive、Locator/CUA、Tab Group 与真实 Chrome smoke 接通。 |
| 2026-07-09 | 多模态图片输入 | 支持图片的模型可以直接查看用户附件、读取到的图片和工具生成的截图；纯文本模型会明确说明能力边界，不再暗中调用另一个模型代看。 | 模型注册表显式声明 `input: ["text"]` 或 `["text", "image"]`，图片附件按当前模型能力路由；删除隐藏的 `analyze_media` 兜底，为 `ToolResult` 增加原生图片 content parts，贯通 read_file、Bash data URL、Agent loop 与 OpenAI-compatible provider 的视觉 observation 顺序。 |
| 2026-07-06 | 联网工具重构 | 网页读取结果真实可靠（不再有 LLM 幻觉页面），搜索同时覆盖中英文来源，且供应商额度用尽会自动切换。 | 拆除 Kimi-backed `web_search`，新增 `web_fetch`（本地抓取 HTML 转 Markdown，含 charset 探测与 Cloudflare 兜底）+ 重写 `web_search`（智谱 + Tavily/TinyFish/Exa 双通道并行，配额/认证失败自动降级）；设置页新增「网络搜索」供应商区块（4 个 key + Tavily 额度显示）。 |
| 2026-07-05 | LLM 错误恢复 | 偶发网关错误会自动重试，重试耗尽后显示明确错误；失败轮次不再留下空白回复气泡。 | provider 错误元数据贯通到 Agent loop，对可重试错误默认执行两次退避重试并在界面显示进度；最终失败落为可恢复的 `error` SessionEvent，中间失败只保留 usage 审计，不污染后续模型上下文或持久化消息。 |
| 2026-07-04 | Bash 安全执行 | Bash 命令默认在 macOS 沙盒里运行，常规命令少打扰、危险命令永远问人，安全和流畅同时提升。 | 新增 Seatbelt 沙盒执行层（deny-default profile、敏感路径定向拒绝、运行时探测自动降级）；命令规则收敛为三级分级表：hard reject（`rm -rf` 关键路径、删 `.git` 本体等）、不可逆 ask（`rm`、`git reset --hard`、`git push --force` 等永远询问且不豁免）、allowlist/沙盒放宽自动放行；沙盒外升级走 `no_sandbox` 审批。 |
| 2026-07-04 | Kairos 通知中心 | Kairos 的重要发现不再淹没在滚动轨迹里，用户在铃铛通知中心就能看到并标记已读。 | 新增仅供 Kairos 使用的 `notify_user(title, body, level)` 工具（每 tick 限 3 条）；`memory/notifications.json` 持久化（滚动上限 200）；Kairos 完整页与右侧紧凑视图各挂一个铃铛入口。 |
| 2026-07-04 | Kairos 人格定制 | 用户可以自定义 Kairos 的人格，并直接在设置页编辑规则和任务表。 | 系统提示词开出 `{soul}` 人格插槽（`soul.md` + 4 个内置预设，空白回落默认人格）；rule.md、briefs 暴露给用户编辑；设置页新增独立「Kairos」分区。 |
| 2026-07-03 | Kairos 主动性 | Kairos 醒来会主动读取数据源、按场景表行动并留下笔记，不再"看一眼就睡"。 | 系统提示词重写为「唤醒例程 + 闲时工作」骨架，新增信息渠道说明、场景应对表和固定笔记落点；每条 tick 消息尾部追加固定提醒对抗提示词稀释；tick 头部渲染任务表清单；旧轮询巡检管道退役；工具守卫读写授权分离（监听目录、briefs 只读可访问）。 |
| 2026-07-03 | 文件监听插件与 Skills | 文件变化由常驻 Rust 插件持续监听，Kairos 和其他 Agent 都能通过 Skill 消费监听日志；插件和 Skills 可在设置页管理。 | 新建独立仓库 `actspace-plugins` 的 fs-watch 插件（notify 监听、去抖合并、按天 JSONL、心跳与单实例锁）；main 侧插件守护进程与 Skills 安装/启停服务；Kairos Skill 白名单注入 system prompt。 |
| 2026-07-03 | Bash 后台执行 | 长命令不再把 Agent 卡死：超时自动转后台继续跑，Agent 可查增量输出、终止任务，任务完成时会收到通知。 | `timeoutMs` 语义改为 `blockMs`（到点转后台而非杀进程）；新增跨 turn 任务注册表、`bash_output`（增量/tail 读取）与 `bash_kill` 工具；终态经 `task_notification` 注入下一次 LLM 调用；修复转后台后落盘文件停写、执行中缺 shimmer 等验收问题。 |
| 2026-07-03 | 工具与输入细节 | 写文件完成后能看到 +N/-N 的 diff 折叠态；输入框粘贴大段文本会自动长高；Bash 超时可靠返回已捕获输出。 | `tool_finished` 为普通工具补最终 preview（`write_file` 带 additions/deletions/diff）；Composer textarea auto-grow；`runProcess` 超时 SIGTERM→SIGKILL 进程组终止并保证返回。 |

## 2026-06

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-06-18 | 写入安全阀 | 模型输出触顶时不会再把截断的半截内容写进文件。 | provider 原始 stop reason 为 `length` 且本轮含 tool call 时阻断 `write_file`/`edit_file`/`delete_file` 并返回明确错误；工具描述引导长文档先写骨架再分段补齐；新增 `kimi-k2.7-code` 模型配置（1M context）。 |
| 2026-06-14 | 工具输出压缩 | 长工具输出压缩后关键细节更少被摘要稀释，模型判断更准。 | 压缩回填从「标记 + flash 摘要」改为「标记 + 原始输出前 2000 字符 + 摘要」；`glob` 输出每行附 `size` 和 `modified` 元数据。 |
| 2026-06-14 | 开源与品牌 | 项目以 Apache-2.0 协议开源，README、logo 和应用视觉整体成型。 | 开源协议切换为 Apache-2.0；完成项目 README 与 wordmark；logo 重设计；Lab 页改为「开发中」占位。 |
| 2026-06-10 | 会话稳定性 | 修复「只有第一条消息有响应」的严重 bug，多轮对话恢复正常；Review 支持图片预览。 | 历史重建 assistant 消息块顺序恢复为 `[thinking, text, toolCall]`，消除 DeepSeek 400 拒绝；Review 对二进制图片标记 `renderKind: "image"` 并复用 workspace 读取链路渲染。 |
| 2026-06-10 | Kairos 缓存与思考 | Kairos 的 prompt 缓存命中大幅提升，运行成本下降；支持思考模式展示，短期记忆压缩真正生效。 | system prompt 静态化 + 时间等易变内容移入 tick 消息；观测增量改为游标制（失败 tick 不丢增量）；thinking 全链路落盘/重放/前端展示；`compressKairosSegments` 接入后台压缩触发器；contextWindow 从模型配置动态读取。 |
| 2026-06-08 | 模型备份 | DeepSeek 降智时聊天可切换 Kimi 备用主模型，带联网搜索和余额卡。 | `kimi-k2.6` 转 public 并补 CNY 计价；Kimi 主模型内置 `$web_search` 回填循环；Usage 页余额卡泛化为 DeepSeek/Kimi 双卡；新增 DeepSeek 裸 DSML 泄漏检测兜底（按可重试错误处理）。 |
| 2026-06-06 | Explore 子代理 | 小范围代码探索可交给更便宜的聚焦子代理，主上下文更干净、成本更低。 | 新增内置 `explore` 工具（默认 `deepseek-v4-flash`、由主模型自动委派、内联折叠展示），与通用 `agent` 工具共用运行时；设置页可配置 Explore 模型。 |
| 2026-06-06 | 消息流与会话体验 | 完成的工具过程折叠成一行 `Worked for Xs`，长任务不再铺满屏幕；会话按最近排序，首轮后自动生成标题。 | 新增 `ToolActivityGroup` 折叠组件并修复时长恒为 1s 的落盘时间戳 bug；会话列表按 `updatedAt` 降序；首轮完成后用 flash 模型生成简短会话标题。 |
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
