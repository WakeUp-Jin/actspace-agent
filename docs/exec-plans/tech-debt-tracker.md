# 技术债追踪

这里记录那些暂时不阻塞当前任务、但已经值得留档的技术债。

## Agent 架构收尾状态

- 2026-10-05：旧 P05 CLI deterministic retry/error 欠账已关闭，真实 HTTP 进程及 fixture 保活/恢复 12 项覆盖成功/失败/取消、严格 stdout/stderr、冷恢复与释放。最终重构 35/35 Computer Use 已签收，见[收尾摘要](../exec-runs/20261005-agent-refactor-final-closeout/execution-summary.md)，本次目标内无剩余验收项。
- 中性存储冷读采用完整一致快照和有界内存缓存；列表初次重建会遍历会话。后续在真实大历史上测量峰值内存/延迟，再决定 Provider 扩展，不恢复通用层直接读取 JSONL 偏移。

## 当前文档债务

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-09-08 | 历史/学习文档链接 | 全量初扫剩余 16 处候选断链：15 处在旧 history，1 处在学习文档的示例图片。当前设计、归档、计划和执行记录链接已通过门禁。 | 按历史源码证据、错误相对路径、示例路径分别处理，不将历史源码一律指向当前实现；详见本轮执行摘要。 |
| 2026-10-05 | 当前设计重复与正文漂移 | 本轮已合并设置模型/Usage 重复章节，校准工具预览事实/Client 投影/界面事件和旧路径。 | 已结算，见[逐路径清单](../exec-runs/20261005-agent-refactor-final-closeout/cleanup-ledger.tsv)；保留项的证据限制单列，不宣称所有文档逐字段验证。 |

## 前端设计 token 遗留

2026-09-26 设计 token 收口（`completed/20260926-frontend-design-token-convergence.md`）后仍保留的写死值和未统一控件：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-09-26 | renderer 间距 | 组件中仍有 `p-[7px]`、`gap-[9px]`、`py-[5px]` 等间距写死值，没有纳入 `check:frontend-tokens`。 | 先统计分布，决定是否收敛到 4px 网格或登记例外，再加检查规则。 |
| 2026-09-26 | 内容边界 CSS | `styles/markdown.css`、`diff.css`、`tool-result.css`、`web-tool.css` 内部仍用 px 字号。 | 这些文件服务模型输出和第三方 DOM，改为 `var(--text-act-*)` 前需逐个对照渲染结果。 |
| 2026-09-26 | 未迁移的按钮形态 | 菜单项（Composer 命令菜单、模型列表）、下拉触发器（Composer 模式 / 模型选择器）、分段控件（预览 / 源码切换）仍是各自的样式常量；Composer 附件删除按钮、Sidebar 会话行置顶 / 归档等内联按钮未改为 `IconButton`。2026-10-06：消息操作菜单和 `SettingsSelect` 已由 Desktop 前端重构 16 改用 `ui/Menu`、`ui/Select`；原生按钮数由 `check:frontend-tokens` 的基线守住，不再增加。 | Composer 的随 09 迁移；分段控件随 `active/frontend-ui-components-foundation.md` 的 `Tabs`。 |
| 2026-09-26 | 设置表单内部 | `CustomConnectionModels` 行内操作、API Key 显隐切换等与 36px 输入框同排的控件，以及 `CustomModelForm`、连接状态块的「边框卡片」式分组仍是旧写法。 | 与 Input / Textarea 基础组件一起收口；分组样式需要用户决定是否改为内嵌分组。 |
| 2026-09-26 | dialog 圆角 | 8 处 dialog 仍用 `rounded-act-xl`（18px），规范为 12px。 | 单独做一次 dialog 外观统一，与 `Dialog` 基础组件一起。 |

## Desktop 前端组件遗留

2026-10-06 Desktop 前端重构 16（UI 原语与组件拆分，`active/20261005-desktop-frontend-refactor/16-UI原语与组件拆分执行计划.md`）之后仍未处理的项，过程见 `docs/exec-runs/20261005-desktop-fe-16-ui-primitives/execution-process.md`：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-06 | renderer / 文件行数 | `RightPanel.tsx` 763 行、`settings/SettingsPrimitives.tsx` 783 行、`workspace/WorkspaceChromeControls.tsx` 662 行，超过 500 行。SettingsPrimitives 剩下的组件都被两个以上设置文件使用，再降要拆成多个文件。 | RightPanel 按标签栏、标签内容、溢出菜单拆；SettingsPrimitives 按行 / 表单控件 / 菜单拆成 `settings/primitives/`。 |
| 2026-10-06 | renderer / 手写弹层 | 三处没有迁到 `components/ui/`：RightPanel 标签溢出菜单（菜单项里嵌「关闭标签」按钮）、`right-panel/ReplyHtmlRenderView.tsx` 的可视化文件列表、`settings/ModelSettings.tsx` 的 `ModelMultiSelector`（可搜索多选，document 监听，没有方向键）。它们仍自己监听 Escape 和外部点击。 | 溢出菜单要先改交互（关闭按钮挪出菜单项或改子菜单）再换 `ui/Menu`；文件列表换 `ui/Select`；多选换 `ui/Popover` + 列表，补方向键。 |
| 2026-10-06 | renderer / 归档范围 | App 的 `handleArchiveWorkspace` 自己按 `workspaceId` / 路径挑要归档的会话，规则和侧栏分组（`sidebar/session-grouping.ts`）不完全相同：带本机工作区 id 的远端会话会被它算进去，侧栏却分在远端组；`workspaceId` 已不存在、路径却和某个工作区相同的会话，侧栏归进那个工作区，它却不算。边角情况下「归档全部」可用与否和实际归档的范围可能不一致。 | 改为复用 `session-grouping.ts` 的 `sessionGroupKey`，补一条对照测试。 |
| 2026-10-06 | renderer / 死状态 | WorkbenchLayout 的 `usageSnapshot` 状态从未被写入（`setUsageSnapshot` 没有调用方），SettingsPage 收到的恒为 null。 | 先确认 SettingsPage 用量页的数据来源，再删掉这条 prop 链或接上数据。 |
| 2026-10-06 | renderer / 疑似死代码 | `messages/SubAgentTranscriptModal.tsx` 的 `SubAgentTranscriptPanel` 在 renderer 里没有使用方，只有 `agent-run-block.test.tsx` 引用。 | 确认子 Agent 记录已由 `right-panel/SubagentsPanel.tsx` 取代后，连同测试删除。 |
| 2026-10-06 | renderer / 死入口 | `ProviderKeyModal` 打不开：`SettingsPage` 传下去的 `onConnectProvider` 在 `settings/sections/` 里没有调用方（16 之前的 `ProvidersSection` 也只解构不调用）。 | 确认 Provider Key 是否已全部改由模型连接向导录入；是就删掉 `ProviderKeyModal` 和这条 prop，否则补上入口。 |
| 2026-10-06 | renderer / 占位按钮 | Composer 的「更多审查操作」`⋯`（`review-overflow-button`）没有 `onClick`，点了没有反应，16 之前就是这样。 | 补上菜单内容，或先隐藏。09（2026-10-07）只把它搬进 `composer/ReviewStrip.tsx`，行为未改。 |
| 2026-10-06 | renderer / 窄窗 | 窗口最小宽度 480 时打开侧栏覆盖层，会话右键菜单的「复制」子菜单（208px）左右都放不下，翻到左侧后左边约 52px 出界。Radix 只翻转，不在水平方向挪。 | 子菜单加 `max-w-[calc(100vw-16px)]` 并允许文字截断，或窄窗下把两个复制项平铺到主菜单。 |
| 2026-10-06 | renderer / Composer 跨会话状态 | Composer 不按会话重挂（16 之前两个有消息的会话之间也不重挂）：远端会话 A 发送中切到 B，B 的发送按钮也被 `sending` 禁用，直到 A 的请求结束；A 里选的模型运行时选项会带到 B。A 发送中切走、随后失败时，附件只靠 App 的恢复草稿（不带预览）找回，原来的预览 URL 不释放。 | `sending` 按 `draftKey` 记；运行时选项按会话存；失败时把附件写回 A 的附件草稿，和 `draftRestore` 的顺序一起定。09（2026-10-07）只把这部分搬进 `composer/use-composer-send.ts`、`use-composer-model.ts`，行为未改，建议单独做一个「Composer 草稿按会话隔离」小计划。 |
| 2026-10-06 | renderer / 嵌套交互 | `settings/CustomConnectionModels.tsx` 的模型行是 `div role="button"`，里面嵌了菜单按钮和开关，读屏会把整行读成按钮。检查脚本只数 `<button`，拦不住这类写法。 | 行本身改成非交互容器，点击区域收到标题上；或把行内控件挪出去。 |

## Desktop 安全遗留

2026-10-06 Desktop 前端重构 11（安全与 IPC，`active/20261005-desktop-frontend-refactor/11-安全与IPC执行计划.md`）之后仍未处理的项：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-06 | main / 子进程环境（C1） | `settings-service` 的 `applyToEnv` 把搜索服务 Key（`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `EXA_API_KEY` / `TINYFISH_API_KEY`）等写进 `process.env`。以下子进程继承完整环境：bash 工具（`packages/tools/shell-tools/src/node-ports.ts`）、`rg`（`packages/tools/filesystem-search/src/node-ports.ts`）、git / gh（`review-git-service`、`review-git-engine`、`review-git-worker`、`review-pr-service`、`workspace-environment-service`、`workspace-git-context-service`）、ssh（`remote-hosts/ssh.ts`）、Browser Bridge 命令、本地更新脚本。只有终端 pty 经 `sanitizeEnvironment` 过滤。 | 01 S7：工具配置改由 Runtime 配置端口注入，删除 `applyToEnv`；子进程改用环境变量白名单。需要单独设计。2026-10-07（17）：`applyToEnv` 已集中到 `apps/desktop/src/main/settings/env.ts`，调用点和次数不变，退役时只改这一处和 store 的转调。 |
| 2026-10-06 | main / Browser Bridge 安装 | `installBrowserBridgeFromRepo`（`fixed-renderer-ipc.ts`）把 renderer 传来的 `repoRoot` 交给 `browser-bridge-service.buildAndInstall`，只校验扩展 manifest（名称、key、扩展 id）就在该目录执行 `build.sh`。renderer 被注入脚本时，可以让 main 在任意满足条件的目录里跑脚本。11 的复核发现，不在 11 范围内。 | 改为 main 弹系统对话框选择源码目录（与 `selectWorkspaceDirectory` 相同的做法），channel 不再接受路径参数。 |
| 2026-10-06 | scripts / IPC 审计 | `check:ipc-channels` 只核对常量、注册和 preload 引用三者一致，不检查注册是否经过 `assertTrustedSender`；preload 只要出现 channel 字符串就算引用，不区分 invoke 和 on。 | 13 落地统一注册器和 IPC contract 后，由注册器强制 sender 校验，审计脚本改为以 contract 为来源并区分方向。 |
| 2026-10-06 | renderer / 主文档 CSP | 主文档没有 CSP。实测严格策略会让 HTML 预览（srcdoc iframe 继承父策略）的内联脚本、样式和桥脚本失效，mermaid SVG 内的 `<style>` 被拦；应用本身启动、React style prop、highlight.js、`data:` 图片不受影响。结论见 `docs/exec-runs/20261005-desktop-fe-11-security-ipc/execution-process.md` 的 T9。 | 先把 HTML 预览改用自定义协议（例如 `actspace-preview://`）加载，使其不继承主文档策略；mermaid 样式改走 nonce / hash 或隔离渲染；之后由 main 用 `onHeadersReceived` 注入严格 CSP。 |

## Desktop settings 遗留

2026-10-07 Desktop 前端重构 17（settings-service 拆分，`active/20261005-desktop-frontend-refactor/17-settings-service拆分执行计划.md`）的特征测试（T1，以及 T6 / T7 变异检查后补的用例）记下的现有行为。17 是纯搬迁，不改；测试按现状断言（`apps/desktop/src/main/test/settings-characterization.test.ts`）。

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-07 | main / settings 旧写入口 | 旧接口 `update` / `updateV2` 改 agent 字段时只改内存里的 v3 结构；写 v4 文件时，`toSettingsV4` 只在 v4 对应字段为空时才用它（`taskDefaults.temperature` / `maxOutputTokens` 为 null、`tools.disabledTools` 为空、`tools.bash.alwaysAsk` 为 false）。所以 v4 里已有值时，改动只留在内存和 env，重启或下一次 `updateNamespaceV4` 后回到文件里的旧值；`bashAlwaysAsk` 只能打开、关不掉。renderer 只在 v4 快照不可写时走这条回退（`useToolToggle.ts`、`ToolsSection.tsx`）。 | 旧入口同时写 v4 对应字段，或者删掉 renderer 的旧接口回退。 |
| 2026-10-07 | main / settings 回滚 | `restoreFilesBestEffort` 先恢复 settings.json、再恢复 secrets.json，放在同一个 try 里：恢复 settings 失败时 secrets 不再恢复，磁盘上留着新 key，内存里是旧 key。另外（读代码所得，未写用例）：`writeSecretsFile` 在字节已经落盘后才失败（例如 rename 之后的 chmod）时，`secretsWritten` 还是 false，不会回滚，磁盘和内存同样不一致。 | 两个文件各自恢复；`writeSecretsFile` 一旦开始写就当作「可能已落盘」处理。 |
| 2026-10-07 | main / settings v4 namespace 写入 | `updateNamespaceV4` 以及经它落盘的 custom connection 增改删、连接检测结果：写 settings.json 失败时只把内存恢复成写入前，不恢复文件。字节已经落盘后才报错时，磁盘上是新内容，内存是旧内容，直到下一次写入或重启（17 T7 补的特征测试 `v4 namespace updates` 照录）。 | 失败时也按内存重写一次 settings.json，或者和其他路径一样走 `restoreFilesBestEffort`。 |

## v1 历史债务记录

以下条目保留原日期与旧实现语境，不作为当前 v2 漏洞、缺陷或可直接执行的修复计划。重新立项前须按当前源码核实；当前安全边界见 [执行安全](../design-docs/execution-safety/README.md)。

| 日期 | 区域 | 债务描述 | 为什么会存在 | 计划中的后续动作 |
| --- | --- | --- | --- | --- |
| 2026-05-29 | Agent-core / 安全 | 读取类工具（`read_file`/`grep`/`glob`/`list_directory`）已放开 workspace 边界（`resolveReadablePath`），主 Agent 理论上可读任意本机文件（含 `~/.ssh`、密钥文件等）。 | 上下文压缩需要模型回读 `<userData>/tmp` 的 bash 落盘文件和 `<userData>/sessions` 的完整历史，这些都在 workspace 之外，workspace 硬边界会挡住正常回读（见 `context-compression.md`「读边界放开」）。 | 补「敏感路径 blocklist + 按需读审核」：读类工具命中敏感路径（如家目录密钥、系统配置）时拒绝或升级为审核，而非恢复 workspace 硬限制。可复用 Kairos 的 blocklist-check 思路。 |
| 2026-07-03 | Bash 后台任务 / 前端 | 后台任务终态只有内存态 `bash_task_update` 事件，session.jsonl 里持久化的 preview 停在 backgrounded/running；重启后历史块显示为「后台运行中」不再更新。 | 任务注册表不持久化（进程活不过 app 退出），终态发生在 turn 结束后，没有回写持久化事件的通道。 | 任务终态时回写/追加一条 session 事件（或加载会话时对 backgrounded 块做「进程已不存在」的降级显示）。 |
| 2026-07-03 | Bash 后台任务 / 前端 | 后台任务卡片无输出流式滚动、无 kill 按钮（设计文档前端契约的完整形态）。 | Plan 02 MVP 先复用 bash 块 + 徽标；输出流式与 kill 需要新增 IPC 通道和预览流对接。 | 独立前端任务卡片立项（可与 E5 沙盒标签一起做）。 |
| 2026-07-03 | Bash 后台任务 / 收割 | app 崩溃（非正常退出）时 before-quit 不触发，detached 后台进程可能残留。 | 收割依赖正常退出钩子；崩溃场景无进程内兜底。 | 可选：spawn 时记 pid 文件，启动时清理上次残留进程组。 |
| 2026-07-04 | Bash 沙盒 / 网络 | 沙盒 profile 内 `(allow network*)` 全放行：沙盒内命令可连任意域名 / Unix socket，网络维度无隔离。 | 域名过滤需要本地 CONNECT/SNI 代理（profile 全拒网络只放行代理端口 + 子进程注入 HTTP_PROXY），是自研路线最大增量，E5 第一期裁掉。 | 网络代理阶段单独立项；落地后引入 `requiredPermissions: ["full_network"]`。 |
| 2026-07-04 | Bash 沙盒 / 违规归因 | 违规标注只有输出模式匹配一条腿（EPERM / Operation not permitted 等），无 `log stream` 精确归因；程序吞掉错误输出时模型可能拿不到升级证据。 | log stream 监听（按 Seatbelt `with message` tag 过滤 + 降噪）约 200+ 行，不阻塞升级闭环，第一期裁掉。 | 参照 srt `startMacOSSandboxLogMonitor` 补第二条腿。 |
| 2026-07-04 | Bash 沙盒 / 跨平台 | Linux 无 bwrap 沙盒实现：非 darwin 一律真实环境执行且权限层不放宽（回到 allowlist ask）。 | 桌面产品当前只发 macOS。 | Linux 发布前按设计文档 bwrap 路线补齐。 |
