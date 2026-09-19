# 消息流排版与工具摘要规范

状态：已实施；自动化与浏览器样例验证结果见[执行摘要](../../exec-runs/20260916-tool-stream-typography/execution-summary.md)，真实桌面验收边界单列。
日期：2026-09-16。

## 目标与依据

让工具调用、Thinking 和解释性正文在同一消息流中具有稳定的文字层级与阅读节奏。采用轻量独立行，通过字体、留白和摘要的信息结构建立主次。

视觉参考为[消息流排版 demo](../../design-demos/tool-stream-typography-demo.html)的“调整后”。“调整前”仅为截图风格示意，不是产品实时渲染。demo 使用静态数据和内嵌 token 快照，不能证明真实工具状态、历史恢复、分页或 IPC 已实现。

本规范补充[中间消息区规范](front-中间消息区规范.md)，颜色遵守[主题与配色规范](front-主题与配色规范.md)，数据语义遵守[工具预览契约](../tool-system/agent-tool-preview-design-guidelines.md)。实施入口为[执行计划](../../exec-plans/completed/20260916-tool-stream-typography.md)。关联规范已同步。

## 范围

- 主消息区 Thinking、轻量工具行、Read、Edit/Write 折叠行、Bash 执行行和相邻正文。
- 复用这些组件的子 Agent transcript：继承相同的字号和行高，验证容器宽度与局部间距。
- 保留执行顺序、每次调用的独立身份、现有 Worked 折叠、文件打开、diff 展开和审批操作。
- 不新增或改造工具分组，不修改子 Agent 运行与活动发布、不调整 Sidebar/Composer/右侧面板布局，不改变消息存储与执行行为。
- demo 中 Read 整行展开、装饰性的侧栏与输入框只是样例；产品继续遵守“文件文字打开文件，独立 disclosure 展开结果”的现有契约。

## 问题与已确认事实

实施前的工作区源码中：

1. `ConversationView.tsx`、`ToolActivityGroup.tsx` 的父级间距与 `-mt-1`、Thinking 默认上边距、`tool-result.css` 的组件上边距并存。`bash` 未进入工具紧凑关系集合，且分支不透传关系样式。
2. `ThinkingBlock.tsx`、`BashRunBlock.tsx` 使用 medium 字重；`toolLogStyles.ts` 使用 normal。结果预览中的文件按钮使用继承字体，可能与普通工具行字号不同。
3. Main 的 `fixed-renderer-tool-preview.ts` 将终态 Bash summary 用作标题；renderer 再加 Ran / Denied 等前缀，导致执行诊断占据摘要主位置。

真实组件测量证实：原 Thinking 为 14/20、500，带结果 Read 为 16/23.2，普通 Read 与 Bash 为 14/19.88；实施后统一为 14/22、400。过程间距为 5px，过程与正文之间为 14px。详见执行记录。

## 排版基线

以下为默认字体大小下的基线；用户字号设置仍有效，不新增外观开关。

| 对象 | 字号 / 行高 | 字重与文字职责 |
| --- | --- | --- |
| 工具行、Thinking 标题 | 14px / 22px | 400；动作 muted，目标与元数据 faint；Thinking faint |
| 解释性正文、最终回复 | 16px / 1.65 | 400；主文字，语义强调保留 |
| 展开思考内容 | 14px / 1.65 | UI 字体、muted |
| Bash 输出和工具结果详情 | 现有 mono 字号设置，默认 13px / 1.6 | 等宽、muted；保留语法和 diff 的专用样式 |

所有行共享 `--conversation-text-inset`，不增加头像/图标占位。行内代码继续遵守当前 Markdown 无边框样式；本轮不重设计代码块、表格与列表。

禁止通过“有无 resultPreview”“是否可点击文件”改变同一种工具的字号、字重或行高。Thinking 标题采用明确的块级 flex 行，消除 inline 行盒对摘要高度的隐式影响。

## 间距所有权

单个消息组件不再决定自己与上一条消息的距离。由消息流的相邻关系布局统一计算；组件只拥有标题与展开详情之间的内部间距。所有外部 margin 归零，不用负 margin 抵消父级 gap。

| 相邻内容 | 实际盒子之间的目标距离 |
| --- | --- |
| 两条折叠过程行，包括 Thinking ↔ Bash/Read/Edit/Write | 5px |
| 过程行 ↔ 正文段 | 14px |
| 两个独立正文块 | 23px，来源于 demo 的 5px + 两侧各 9px；同块内部段落仍按 Markdown 规则 |
| 过程结束 → 最终回复 | 18px；位于 Worked 之外时仍只应用一次 |
| 标题 → 展开详情 | 7px；Thinking 内容不包边框卡片 |
| 展开的 Thinking → 下一条过程行 | 5px，不附加详情尾部留白；思考正文的原始换行、空行保持不变 |
| 其他展开详情 → 下一条过程行 | 13px，包含详情尾部 8px 与过程间距 5px，统一由布局表达 |

空白 assistant 文本不生成主消息流的正文容器，避免仅含思考与工具调用的模型消息额外叠加两侧正文间距；原始消息及 usage 数据仍保留。

用户消息与回答之间、跨 turn、Worked 头部的现有间距不作为这轮全局压缩对象。审批卡片、媒体、Todo、系统通知保留现有布局，由关系计算器显式回退，不误套普通过程行规则。

实施可将这些值集中为 message flow 的局部 CSS 变量或 TS 样式常量；它们只有一个定义点。组件复用时由对应容器使用同一关系规则，不在 `base.css` 或 `markdown.css` 加全局覆盖。

## 工具主行的信息结构

结构为「动作 · 目标 · 必要状态/统计 · 原地展开入口」，各段独立渲染，不把整句日志放进一个不可区分的字符串。

| 类型 | 主行示例 | 展开 / 其他入口 |
| --- | --- | --- |
| Read | `Read Demos/README.md 1–8` | 文件文字打开右侧文件；结果 disclosure 维持独立 |
| Listed | `Listed Demos/ 25 entries` | 目录结果 |
| Edit/Write | `Edit Demos/README.md +1 −1` | 保留真实 diff 与变动统计 |
| Bash 成功 | `Ran ls -lt Demos/` | 完整命令、cwd、stdout/stderr、退出码、耗时、环境 |
| Bash 被拒绝 | `Denied wc -l … 审批超时` | 完整原因；未知原因不假定为审批超时 |
| Bash 失败 | `Failed pnpm test` | 真实 stderr 与退出码；不得显示为成功 |

动作与必要状态不参与目标的截断；目标 `min-width: 0`，超长视觉省略。完整路径/命令必须可以键盘访问和展开查看。展示层截断不得改变实际打开文件的路径。

颜色全部消费现有主题 token。普通完成态保持中性；拒绝/失败标签使用可读的 danger token；审批 pending 保留 warning；diff 增删使用专用 token。所有状态同时有文字，颜色不作为唯一证据。

## Bash 事实与展示边界

- 展示动作从结构化状态生成，目标优先 `commandPreview`，其次完整 command 的视觉截断，最后回退工具名称。不能把原始 summary 加动作前缀当作标题。
- `intent` 是描述性补充，不替代实际命令。完整 summary/错误信息在详情保留，不通过正则猜测退出码、环境或审批状态。
- `sandboxed: true` 的普通沙盒信息可进入执行详情；`sandboxed: false` 的“真实环境”、`notExecuted` 的“未执行”、后台运行状态继续在主行可见。pending 审批卡片保留计划执行环境及全部操作。
- 缺失 sandboxed 表示未知，不展示“沙盒”；缺失 exitCode/durationMs 不补 0。未执行不显示伪造输出或成功退出码。
- 暂不新增持久 schema、Journal 事件或服务。优先复用 `BashPreview` 的 command/commandPreview/reason/stdout/stderr/durationMs/exitCode/sandboxed/notExecuted 字段。
- 实时与历史回读经共享 preview builder 生成一致摘要；读取详情按当前按需加载契约，不把大工具输出塞回列表快照。
- 若现有结构化事实不足以生成短原因，主行仅显示状态与命令，完整原因留详情；不得为了凑齐 demo 文案扩大 Runtime 协议。

## 状态、交互与无障碍

- 可原地展开的箭头默认占位且隐藏；hover、focus-visible、expanded 时可见，避免悬停引起文字位移。
- Thinking 在 expanded 时保留箭头；折叠时在 hover/focus 显示。
- 文件/子 Agent 的打开入口不强加 disclosure 箭头，不混淆“打开对象”与“展开内容”。
- 保留 Thinking 现有默认折叠及完成后收起语义，不合并或隐藏实际 thinking segment。
- running 继续复用当前中性 shimmer；Write/Edit 的生成字符量、准备保存、正在保存以及每秒更新节奏保持不变。
- 键盘可到达可操作目标，Enter/Space 行为匹配按钮语义，保留 `aria-expanded` 和 focus ring。长内容无需依赖鼠标 hover 才能读取。
- 不引入连续布局动画；支持 reduced motion，避免流式更新和折叠引起不必要的滚动跳动。

## 验收矩阵

| 维度 | 必须覆盖 |
| --- | --- |
| 主题 | light、dark、system 跟随浅/深；复用产品 token，不复制 demo CSS |
| 宽度 | 桌面聊天列约 800px，右栏打开后的 480px，375px 窄列无横向溢出 |
| 内容 | 中文正文、长路径、长命令、相邻 Thinking/Read/Edit/Bash、无结果与有结果两类 Read |
| 状态 | running、completed/success、failed、denied、pending、cancelled、未知环境 |
| 交互 | 折叠/展开、键盘聚焦、Read 打开文件、diff、Worked、手动重开 Thinking |
| 数据链 | 同一调用流式到完成、历史恢复、详情按需加载、分页加载后不丢文本与折叠状态 |
| 复用 | 子 Agent transcript 继承文字基线，Agent 活动行及侧栏入口不被破坏 |

浏览器检查盒模型与实际渲染截图，Electron 检查真实会话、右侧文件打开及恢复。不把 demo 或 typecheck 通过当作产品 UI 验收通过。

## 选择与取舍

单独缩小 gap 是最小修补，但不能解决字号继承和日志摘要占主位的问题，故采用“统一过程行 + 相邻关系布局 + 摘要分层”。不更换字体、不增加卡片、不重做分组。

本规范涉及超过 8 个潜在生产文件，分为排版与摘要两个独立可交付切片。共享组件、脏工作区和异步状态是主要风险；执行时以当前工作区为基线做小范围增量，不恢复整文件，不覆盖其他任务。
