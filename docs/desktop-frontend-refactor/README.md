# Desktop 前端重构文档集（2026-10-05）

> 临时目录，方便集中查看。各文档定稿后按「迁移去向」一栏移到对应的正式目录。
>
> 本目录只记录分析结论与重构方案，**不代表已经实施**。所有 `file:line` 均基于 2026-10-05 的 `main` 工作区（`e02f37f7` 之后的未提交状态），实施前需要按当时代码重新核对行号。

## 1. 为什么做

最近几轮重构（P1–P5 Harness / Host）主要投入在 Runtime、Host 和 Session 层，后端分层已经比较清楚；Desktop 前端则是一路按功能叠加出来的：消息队列、压缩时间线、回复批注、远端 Host、Review、Terminal 都直接长在 `App.tsx` 和 `Composer.tsx` 里。现在的状态是「能用、测试也不少，但每加一个功能都要在几千行的文件里找缝」。

本轮目标：

1. 找出隐藏的危险（安全、数据正确性、资源泄漏），优先处理。
2. 把状态和数据流收成清楚的层次，让 App 只做装配。
3. 删掉确认无用的代码，让架构变得干净、精简。
4. 顺带重做三处体验最差的 UI：消息队列位置、远端机器选择、输入框样式与 `+` 面板。

## 2. 总体评价：C+

| 维度 | 评价 | 主要证据 |
| --- | --- | --- |
| 分层 | 弱 | `App.tsx` 2770 行、`App()` 内 41 个 useState / 24 个 useRef / 80 处 `window.actspace` 调用；App → WorkbenchLayout 约 50 个 prop，WorkbenchLayout → ConversationView 约 43 个 |
| 数据流 | 有隐患 | 正文由 App 本地流式状态和 durable 记录拼接，靠 `turn:${runId}:` 字符串前缀去重；`sessionRecord` 两个写入者 |
| 远端接入 | 贴上去的 | `host:` 字符串前缀 + 30 多处 `remote?.hostId` 条件分支，没有「运行目标」抽象 |
| 组件复用 | 部分 | `components/ui` 只有 Button / IconButton / Tooltip / HoverCard / Sheet；约 70% 的按钮是原生 `<button>`；至少 10 套各自实现的弹层 |
| 安全 | 有缺口 | 工作区文件读取的 root 由渲染进程决定；窗口无导航防护、无 CSP；一处 sender 校验 fail-open |
| 测试 | 多但有噪音 | 86 个 renderer 测试文件；3 个只给死代码亮绿灯；数个读源码字符串断言类名 |
| 样式纪律 | 较好 | 颜色基本走 token；`check:frontend-tokens` 已拦字号 / 圆角 / 层级 / 阴影 / 动效，未覆盖间距任意值 |

## 3. 已拍板的决策（2026-10-05）

| # | 问题 | 决定 |
| --- | --- | --- |
| D1 | 文档拆分 | 越详细越好，不限 4 份；先集中放本目录 |
| D2 | 运行位置菜单放哪些项 | 只放**本机**和**远端机器**（含新建工作树）。不放 Cloud、不放 Remote Control |
| D3 | 对话中途能否切换机器 | **不能**。对话中的机器 / 分支是只读会话事实 |
| D4 | `+` 面板范围 | 认可方案：Cursor 式统一面板（搜索、模式、文件、Skills、模型）；MCP 未实现不放；搜索里的「对话」暂无数据源不放 |
| D4+ | 输入框外观 | 边框线太重，改为低对比细边 + 柔和阴影（Cursor 式），聚焦时加深阴影而不是加深边框 |
| D5 | 浏览器 mock 模式 | **保留**。从 App 内 40 处分支改成注入式 mock bridge |
| D6 | LabPage | **删除**，功能已不存在（已在 10 删除；Lab 导航入口保留为占位页） |
| D7 | UI 改动先出 demo | 输入框与远端连接的改动先给 HTML demo 确认，见 [`demo/composer-run-target-demo.html`](demo/composer-run-target-demo.html) |
| D8 | 输入框 demo 第二轮确认（2026-10-05） | 按 demo 实施，06 §9 九项按 demo 默认值定稿；执行计划见 [09](../exec-plans/active/20261005-desktop-frontend-refactor/09-输入框优化执行计划.md)；2026-10-06 已批准，执行中 |
| D9 | 执行方式（2026-10-05） | A1 按本文 §5 顺序；B1 每份设计文档一份任务级执行计划（10–17，加修订后的 09），由 [00 总执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/00-总执行计划.md) 统领，一起审一次；C2 settings-service 拆分纳入、排最后；C1（`applyToEnv`）、C3（协议）以后单独做；E 连续执行，只在设计偏差、修不好的测试、需要改协议时停下；J1 本轮不加主文档 CSP；J2 主线 `refactor/desktop-frontend` 加每份计划一个子分支，结束时 squash 成一个提交，不打 tag；J3 计划移进 `exec-plans/active/`；J4 附件随草稿保存 |
| D10 | 验收（2026-10-05） | 每份计划一个 `acceptance-handoff.md`，按阶段填写，由 Codex 验收、用户转达反馈；子智能体只做探索和验收复核；不使用 computer use，用 CDP 做能做的检查 |

## 4. 文档索引

| 编号 | 文档 | 内容 | 风险 | 迁移去向 |
| --- | --- | --- | --- | --- |
| 01 | [安全与 IPC 收口](01-安全与IPC收口.md) | workspace root 校验、sender 校验、导航 / CSP、openExternal、IPC 去重、生命周期 | 高 | `docs/exec-plans/active/` + `docs/SECURITY.md` 补条款 |
| 02 | [Renderer 状态层与会话数据流](02-Renderer状态层与会话数据流.md) | 拆 App.tsx、per-session store、正文单一事实源、类型化 identity、IPC 风暴 | 高 | `docs/design-docs/frontend/` + exec-plan |
| 03 | [运行目标抽象：本机与远端](03-运行目标抽象-本机与远端.md) | `RunTarget` 模型、`host:` id 统一解码、30 处分支收口、`useRemoteTarget` 重写。**已按 15 实施** | 中 | 已合并进 `docs/design-docs/frontend/front-workspace-git-worktree-context.md`「运行目标」一节 |
| 04 | [Preload 接口与 Mock Bridge](04-Preload接口与MockBridge.md) | 接口按域分组、必选类型、`satisfies` 对齐、注入式 mock bridge | 中 | `docs/design-docs/frontend/` |
| 05 | [UI 基础组件与大组件拆分](05-UI基础组件与大组件拆分.md) | Popover / Menu / Dialog 原语、焦点陷阱、Esc 栈、拆 Settings / Sidebar / Conversation / Workbench。**已按 16 实施**（Composer 归 09） | 中 | 已合并进 `docs/design-docs/frontend/front-基础组件封装规范.md` |
| 06 | [Composer 与运行目标交互重设计](06-Composer与运行目标交互重设计.md) | 队列移到输入框上方、运行位置菜单、输入框外观、`+` 面板 | 中 | `front-聊天输入框规范.md`、`front-workspace-git-worktree-context.md` 改写 |
| 07 | [冗余清理清单](07-冗余清理清单.md) | 已核实可删的文件、prop、分支、目录、channel | 低 | exec-plan 的第一阶段 |
| 08 | [测试与验证整理](08-测试与验证整理.md) | 删死测试、改脆弱断言、补缺口、验证矩阵 | 低 | `docs/FRONTEND_VERIFICATION.md` 补充 |
| 00 | [总执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/00-总执行计划.md) | 顺序、每个任务 / 阶段 / 计划的流程、停止条件、分支与提交、验收交接模板、基线、CDP 方法、总进度 | — | `docs/exec-plans/active/20261005-desktop-frontend-refactor/` |
| 09 | [输入框优化执行计划（含发送队列）](../exec-plans/active/20261005-desktop-frontend-refactor/09-输入框优化执行计划.md) | 按已确认 demo 实施：外观 / 布局、发送队列托盘、`+` 面板与 ModelPicker、运行位置菜单与只读状态行、Composer 剩余拆分；建立在 15、16 之上；T1–T30 | 中 | `docs/exec-plans/active/` |
| 10 | [冗余清理执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/10-冗余清理执行计划.md) | 07 R1–R10、B1；08 §2；T0–T12 | 低 | `docs/exec-plans/active/` |
| 11 | [安全与 IPC 执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/11-安全与IPC执行计划.md) | 01 S1–S5、channel 审计脚本、C1 核实；J1 CSP 已定为 A（本轮不加）；T0–T10 | 高 | `docs/exec-plans/active/` |
| 12 | [测试整理执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/12-测试整理执行计划.md) | 08 §3.1–3.2：读源码的测试改成 token 规则或语义断言；T1–T8 | 低 | `docs/exec-plans/active/` |
| 13 | [Preload 与 Mock Bridge 执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/13-Preload与MockBridge执行计划.md) | 04、01 S6、08 §3.3 / §5：契约、注册器、`R/api/*`、注入式 mock、`setupBridge`；T0–T11 | 中 | `docs/exec-plans/active/` |
| 14 | [状态层执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/14-状态层执行计划.md) | 02：SessionLocalStore、durable 单一事实源、类型化 identity、live-run store、Context、pending submission；T0–T21 | 高 | `docs/exec-plans/active/` |
| 15 | [运行目标执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/15-运行目标执行计划.md) | 03、01 S9：session locator、HostDirectory、RunTarget / readiness、gateway、审批 hostId、run-git；T0–T15 | 中 | `docs/exec-plans/active/` |
| 16 | [UI 原语与组件拆分执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/16-UI原语与组件拆分执行计划.md) | 05：Radix 原语、对话框和菜单迁移、四个大组件拆分、Composer 单次挂载、按钮基线；T0–T18 | 中 | `docs/exec-plans/active/` |
| 17 | [settings-service 拆分执行计划](../exec-plans/active/20261005-desktop-frontend-refactor/17-settings-service拆分执行计划.md) | 01 S8：先补特征测试，再纯搬迁到 `main/settings/`；T0–T8 | 中 | `docs/exec-plans/active/` |
| demo | [composer-run-target-demo.html](demo/composer-run-target-demo.html) | 输入框、队列、运行位置菜单、`+` 面板的可交互 demo | — | `docs/design-docs/frontend/` |

## 5. 执行顺序与依赖

**执行计划的顺序（2026-10-05 定稿，详见 [00](../exec-plans/active/20261005-desktop-frontend-refactor/00-总执行计划.md)）**：10 → 11 → 12 → 13 → 14 → 15 → 16 → 09 → 17，严格串行。下面是设计阶段的依赖分析，保留作为理由。

```text
阶段 A（可并行，低冲突）
  07 冗余清理  ──┐
  01 安全收口   ──┼─▶ 阶段 B
  08 测试整理(删死测试部分) ┘

阶段 B（结构）
  04 Preload 分组 + Mock Bridge
     └─▶ 02 状态层拆分（per-session store / 正文单一事实源）
            └─▶ 03 运行目标抽象

阶段 C（交互，依赖 03）
  05 Popover/Menu/Dialog 原语 ─▶ 06 Composer 与运行目标重设计（demo 确认后）
  05 大组件拆分（Settings / Sidebar / Conversation / Workbench）可与 06 并行
```

理由：

- 07、01 改动面小、彼此不冲突，先做能立刻减少噪音和风险。
- 04 先把接口面整理好，02 拆 App 时才不会把 80 处 `window.actspace` 原样搬家。
- 06 要改的远端选择器依赖 03 的 `RunTarget`，否则只是把 `<select>` 换成好看的菜单，分支照旧散落。
- 05 的弹层原语是 06 的前置：新的运行位置菜单、`+` 面板、队列 `⋯` 菜单都应该用同一套原语。

## 6. 风险总表（跨文档）

| 级别 | 问题 | 文档 |
| --- | --- | --- |
| P0 | 渲染进程可指定任意 `workspaceRoot` 读主机文件 | 01 |
| P0 | `desktop-shell-ipc` sender 校验在无窗口时放行 | 01 |
| P0 | 窗口无 `will-navigate` / `setWindowOpenHandler` / CSP | 01 |
| P0 | 会话列表每次变化触发 2N 次 IPC | 02 |
| P0 | 正文靠字符串前缀去重，改 id 格式即重复 / 丢消息 | 02 |
| P0 | `sessionRecord` 两个写入者，可能冲掉已加载的早期历史 | 02 |
| P1 | 约 10 个按会话 Map 只增不减 | 02 |
| P1 | ~~切换会话时附件可能串会话（待真机验证）~~ 已在 16 处理：Composer 只挂一次，附件按会话存进 SessionLocalStore | 06 |
| P1 | `useRemoteTarget` 返回值不稳定，`handleSend` / `executionContext` 每次重建 | 03 |
| P1 | macOS 关窗后 pty 成孤儿；退出时 Browser Bridge / 更新服务未清理 | 01 |
| P1 | ~~三套 IPC channel 并行注册，`projection-ipc` 18 个 handler 无调用方~~ 已在 10 处理：DESKTOP / DESKTOP_SHELL 两套已删除，只剩 FIXED | 01 |
| P1 | ~~10+ 套弹层实现，Esc 一次关多层，多数对话框无焦点陷阱~~ 已在 16 处理：弹层统一用 `components/ui/` 的 Radix 原语；Composer 归 09，三处未迁移的手写弹层记在技术债 | 05 |
| P2 | ~~LabPage / ExploreRunBlock / Sheet / terminal-ipc 等死代码~~ 已在 10 处理 | 07 |
| P2 | ~~70KB 轨迹 fixture 被打进生产包~~ 已在 10 处理 | 07 |

## 7. 本轮不做

- 不改 Runtime / Host / Session 协议；需要协议配合的地方只在文档里标出接口需求。
- 不新增 Cloud、Remote Control、MCP 能力。
- 不做对话中途切换机器 / 工作区 / 分支。
- 不重做消息区（中间消息流）的视觉，只处理它的数据来源和拆分。
