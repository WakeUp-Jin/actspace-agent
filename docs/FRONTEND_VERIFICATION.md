# 前端验证约定

这份文档定义 `actspace` 前端改动完成后的验收方式。

`actspace` 是桌面端应用，不能把浏览器里的 `http://127.0.0.1:5173/` 等同于完整产品。浏览器只能直接加载 renderer，完整桌面端还包含 Electron main、preload、IPC、本地文件和持久化能力。

## 默认原则

- 前端改动必须在计划和收尾中写清验证方式。
- 工程验证优先使用仓库命令，不要只依赖人工目测。
- UI 样式与组件打磨优先使用浏览器 renderer 验证，因为它更适合快速检查 CSS、布局、HMR、空态和不依赖 IPC 的局部交互。
- 真实桌面链路必须使用 Electron 窗口验证，但它是完成流程的最终验收，不是每次样式微调的首选工具。
- 有 Computer Use 的 Agent，完成重要 UI 修改后应在收尾阶段查看真实 Electron 窗口。
- 没有 Computer Use 的 Agent，需要说明限制，并让用户提供截图或启动日志辅助确认。

## 验证分层

### 1. 工程验证

适用范围：

- 所有实质性前端代码修改。
- 组件结构、样式、状态管理、IPC 类型、构建脚本相关改动。

默认命令：

```sh
pnpm typecheck
pnpm build
```

如果只改了局部包，可以使用更小的命令，但最终说明要写清原因。

这层验证用于确认：

- TypeScript 类型没有破坏。
- workspace 包边界没有漂移。
- Vite renderer 可以构建。
- Electron main/preload 可以构建。

### 2. 浏览器 Renderer 验证

适用范围：

- 纯 UI 样式。
- 组件布局。
- 普通前端交互。
- 响应式检查。
- 不依赖真实本地文件系统和 IPC 的页面状态。
- 设计图还原、视觉密度、间距、颜色、组件状态打磨。

推荐目标：

```text
http://127.0.0.1:5173/
```

浏览器验证只加载 renderer，不代表完整桌面产品。开发模式（`pnpm --filter @actspace/desktop dev:renderer`）下没有 Electron preload 时，renderer 注入完整的 mock bridge，场景用 `?mock=<场景>` 选择（默认 `empty`），见下文「浏览器 mock 场景」。生产构建没有 bridge 时显示「无法连接桌面服务」致命页，不渲染 App。bridge 与 mock 的约定见 [Preload bridge 与 Mock 规范](design-docs/frontend/front-preload-bridge与mock规范.md)。

浏览器 renderer 验证不能用运行时假业务数据证明产品状态。稳定样例数据应放在测试、Story 或显式 demo 边界内。

可以验证：

- 左侧会话栏。
- 中间消息区。
- Composer。
- Context popup。
- Diff 卡片。
- 右侧文件预览的视觉状态。

不能证明：

- preload 是否注入成功。
- IPC 是否可用。
- 本地会话是否真实落盘。
- 文件读取、附件、持久化、恢复是否正常。

#### 浏览器 mock 场景

目标地址：`http://127.0.0.1:5173/?mock=<场景>`。如果端口被占用，可以用 `VITE_DEV_PORT=<端口> pnpm --filter @actspace/desktop dev:renderer` 换端口。

| `?mock=` | 种子数据 | 适合验证 | 不覆盖 |
| --- | --- | --- | --- |
| `empty`（默认） | 没有会话，只有一个工作区（相当于首次启动自动创建的「默认工作区」） | 首次启动空态、新建会话、Composer 各形态、设置页、浅色 / 深色、窄窗 | 任何已有历史的状态；首次启动建目录（main 单测覆盖） |
| `no-workspace` | 没有会话，唯一的工作区已从侧栏移除 | 新建会话页发送按钮禁用并提示「请先选择工作区」、Composer 工作区按钮显示「选择工作区」 | 选择文件夹后恢复发送（mock 的目录选择器总是返回取消，由 Electron 验收） |
| `streaming` | 两个会话。打开「检查 bridge 调用方」后约 300ms 开始逐段输出，停在运行态 | 「生成中」界面、流式中切换会话再切回、运行中发送进入队列 / 引导 / 撤回 | 回复完成后的工具调用细节 |
| `long-session` | 一个 40 轮问答的长会话（含代码块），外加一个短会话 | 长列表滚动、分组、早期历史加载；右侧 Context 面板（任何有会话的场景都返回完整 mock 数据，见 `mock/context-panel-fixture.ts`），会话行跳轨迹 | 真实分页边界（mock 一次返回全部消息） |
| `context-pagination` | 长会话、620 个额外工具条目，初始历史失败，重试后同步完成；有明细及原文分页；路径卡片活跃满 100、睡眠 1284 条多页，每页 400ms 延迟，首次读睡眠路径失败一次 | Context 错误/重试、条件刷新、加载更多、全文分段、路径满额提示/分页/重试及主题/窄窗 | 不证明真实 SQLite、Loop、披露引擎或后端权限 |
| `approval-pending` | 一个会话停在高风险 `bash` 命令（`rm -rf …`）的审批上 | 审批卡片、允许 / 拒绝、刷新后经 `approvals.listPending` 恢复 | 真实工具执行结果 |
| `approval-prefix` | pnpm test 待审批，含正式 command_prefix 建议 | 三按钮、会话授权文案和主题布局 | 真实授权复用、持久化与工具执行 |
| `remote-host` | 三台 Host：devbox 已连接、GPU 服务器离线、旧笔记本已撤销；本机 / devbox / GPU 各一个会话 | 侧栏 Host 分组与离线标记、运行位置菜单、Host 删除 / 重连后的列表 | `hosts.call`（`host.describe`、`files.reference`）、`hosts.preview` / `download` 在 mock 中未实现，会 reject；因此 Host 工作区和模型显示为「等待 Host …」，远端读文件和下载产物只能由单测和真实 Host 覆盖 |
| `sidebar` | 三个工作区，15 个未归档会话按真实「现在」分布在今天、昨天、近 7 天、本月更早、往月、往年；2 个置顶、2 个已归档 | 侧栏视图选项（按工作区 / 单列表 / 按时间、手动排序、归档筛选、恢复默认）、拖拽排序与「已切换为手动排序」、标题行搜索、取消归档、每组 5 条与「展开其余」 | 运行中、待审批、失败、跑完未看四种状态点和「需要处理」（状态来自真实运行，由单测覆盖） |
| `turn-deliverables` | 一个会话三轮：第 1 轮改 2 个文件、交付 1 个；第 2 轮最终改 6 个文件（另有新建后删除的临时脚本）、交付 5 个；第 3 轮只改报告 1 个文件（+1/-1）、交付 1 个；三轮回复都带用量，第 2 轮没有价格 | 轮尾改动卡与交付卡的单文件 / 多文件形态与折叠、悬停 diff 浮层、「第 N 轮改动」标签、交付卡网格与打开方式菜单、设置开关「显示本轮代码改动」；回复尾部的「用量 … tok」胶囊与本轮用量弹窗（预估花费、花费未知）；`workspaces.readFile` 只认识 `docs/report.md` 和 `docs/summary.csv` | 真实 `present` 工具调用、原生关联应用列表与图标、远端 Host 下载（见 [front-中间消息区规范.md](design-docs/frontend/front-中间消息区规范.md) §轮尾改动卡与交付文件卡） |

mock 中没有实现的成员调用时 reject `Mock bridge does not implement 域.成员`，包括终端创建、新建工作树和 Git 写操作。界面上看到的报错属于 mock 的边界，不是缺陷。如需新增场景，按规范 §7 处理，并同步更新本表。

#### 轨迹页 fixture（只在开发构建和测试中加载）

在任意 mock 场景的地址后加 `&trajectoryFixture=<名称>`，切到轨迹视图后显示固定数据，例如 `http://127.0.0.1:5173/?mock=long-session&trajectoryFixture=complete`。加 `&trajectoryTheme=dark`（或 `light`）只临时覆盖轨迹样例的主题，卸载时恢复。数据在 `apps/desktop/src/renderer/fixtures/trajectory-complete.json` 和 `apps/desktop/src/renderer/trajectory/fixtures.ts`。

| `trajectoryFixture=` | 内容 | 适合验证 |
| --- | --- | --- |
| `complete` | 6 轮：工具、重试、审批、压缩、缺计时的旧消息、运行中的回复 | 表格、请求圆点、时间轴、各类详情页签 |
| `errors` | 在 `complete` 上加：上下文行（Context 补充、后台任务通知）、子工具失败、系统提示词差异、审批拒绝、请求失败 | 上下文 / 子工具类型标签、失败状态、差异页签、层级跳转 |
| `running` | 去掉所有结束事件 | 等待中状态、请求占位行 |
| `streaming` | `complete` 的运行中回复，每 120ms 追加一个 chunk | 流式时行在原地变长、不闪；时间轴不跟着重绘 |
| `long` | `complete` 重复 24 次 | 虚拟化、加载更早的历史、帧耗时 |
| `streaming-long` | `long` 加一条运行中的回复，每 120ms 追加 20 个 chunk，共 2000 个 | 长会话流式：行不重挂载、帧间隔、选中后详情实时变长；`TRAJECTORY_PERF=1` 跑 `trajectory-streaming-perf.test.ts` 测每帧耗时 |
| `empty` | 没有事件 | 空态 |

#### Space 多 Actor 协作演示（只在开发构建出现）

Space 是纯前端演示，数据来自 `components/space/model/` 的内存 store，不走 bridge，任何 `?mock=` 场景下都能打开；打包版看不到入口（`SPACE_DEMO_ENABLED = import.meta.env.DEV`）。设计见 [front-space-工作台设计.md](design-docs/多智能体协作/front-space-工作台设计.md)。走查步骤：

1. 左栏「Space」分区点「支付链路提速」：中栏是协调 Agent，标题栏中间是 Space 标签栏，右栏默认 Actor / 库 / 记忆。
2. 点消息里的引用胶囊（如「后端」）打开 Actor 标签：右栏换成 Review + 终端（有改动）或文件 + 终端。
3. 点琥珀胶囊「等你决定」展开审批托盘，「运行」/「拒绝」后托盘收起，右栏分组行跟着移动。
4. 协调 Agent 里对「环境巡检」点「留下」：星尘动画后左栏「Actor 名册」数量加一。
5. 「Actor 名册」：右栏和右栏开关都隐藏；搜索；点卡片进入一对一对话，工作区列表里出现这条对话。
6. 「新建 Space」弹窗创建后直接进入新 Space（空 Space 显示星空和成员头像）。
7. 标签栏右侧「?」看演示说明；提示条「重置演示」回到初始状态。浅色、深色、480px 窄窗各看一遍。

单测：`space-*.test.ts(x)`。

### 3. Electron 真实验证

适用范围：

- 一轮前端改动完成后的最终桌面验收。
- 桌面端窗口行为。
- preload 注入。
- IPC。
- 本地持久化。
- session 恢复。
- 文件系统能力。
- 任何涉及 `window.actspace` 的真实能力。

默认启动：

```sh
pnpm dev
```

启动器先完成依赖与本轮 Electron main/preload 构建，成功后才启动并行 watch、renderer 和 Electron。即使磁盘已有旧的 `dist-electron`，本轮构建失败也会停止启动。`dev:electron:run` 是内部运行阶段，文件存在检查不能替代上述构建屏障；请从 `pnpm dev` / `pnpm dev:log` 启动。

macOS 开发启动不会直接暴露依赖目录里的默认 `Electron.app`。启动器会在系统临时目录缓存一份当前 workspace 专属的开发 runtime，并为它设置唯一的应用名、bundle ID 与可执行文件名。启动日志中的 `[dev-runtime]` JSON 是本次运行的事实来源，例如：

```text
[dev-runtime] {"appName":"Actspace Dev d11e-ab10","appId":"com.actspace.desktop.dev.wab10a3c4",...}
```

Computer Use 必须使用这里的 `appName` 或 `appId`，不要使用通用的 `Electron`。优先使用可读的 `appName`；若自动化工具不接受 display name，就使用同一行日志里的 `appId`。不同 worktree 因此可以并存，自动化也不会被 macOS LaunchServices 路由到另一份源码的 Electron 欢迎页。临时开发身份只改变系统识别与进程名称；main 进程仍使用既有的 `actspace` userData 目录，因此会话和设置不会因 workspace hash 改变。

开发 runtime 缓存复用前，启动器会对照已安装 Electron 检查文件结构、普通资源大小、可执行权限、framework 符号链接和 Info.plist 身份；缺失或损坏时输出 `rebuilding cached Electron` 并自动重建。新副本通过同一检查后才替换旧缓存。此检查用于发现临时目录里的残缺文件，不是安全签名或完整字节哈希验证；不会清理会话、设置或 Chromium 用户缓存。可用 `node scripts/run-electron-dev.mjs --prepare-only` 单独验证缓存准备，回归测试为 `node --test scripts/test/electron-runtime-integrity.test.mjs`（macOS）。

开发启动默认不弹出独立 DevTools 窗口，避免它与主窗口共享应用身份并抢走 Computer Use 焦点。需要 DevTools 时显式运行 `ACTSPACE_OPEN_DEVTOOLS=1 pnpm dev:log`。

需要确认：

- Electron 窗口可以弹出。
- renderer 正常加载，不是空白页。
- `window.actspace` 注入后，页面可以加载 bootstrap state。
- 首次启动可以创建或恢复会话。
- 本地数据目录正常初始化。

有 Computer Use 的 Agent 应该从 `[dev-runtime]` 读取当前 `appName` / `appId`，直接观察对应 Electron 窗口，必要时点击核心交互并截图确认。

没有 Computer Use 的 Agent 应说明无法直接观察桌面窗口，并请用户提供：

- Electron 窗口截图。
- `pnpm dev` 终端日志。
- 必要时提供 `sessions-v2/<sessionId>/journal.jsonl` 的脱敏摘要；不要发送完整 Journal、凭据或包含敏感工具输出的原始文件。

## 默认验收矩阵

| 改动类型 | 必须验证 | 推荐补充 |
| --- | --- | --- |
| 样式、布局、组件展示 | `pnpm typecheck`、浏览器 renderer 截图 | 完成阶段再看 Electron 窗口 |
| Composer、弹窗、菜单等交互 | `pnpm typecheck`、浏览器 renderer 交互 | Electron 窗口交互 |
| IPC、preload、session、本地文件 | `pnpm typecheck`、`pnpm build`、Electron 真实验证 | Computer Use 操作或用户截图 |
| 构建脚本、workspace、Electron 配置 | `pnpm typecheck`、`pnpm build`、`pnpm dev` | 检查 `dist-electron/main/index.js` 是否生成 |
| 设计文档或图片更新 | 文档链接检查 | 对照设计图人工确认 |

## Desktop 前端重构期间的验证矩阵

来源：[08 测试与验证整理 §5](desktop-frontend-refactor/08-测试与验证整理.md)。每个阶段完成后按此表验证。「浏览器 mock」指上文的 mock 场景；「Electron」指真实桌面窗口，无 Computer Use 时用 CDP（`--remote-debugging-port`，临时 `ACTSPACE_DATA_DIR`），具体做法见 [00 总执行计划 §8](exec-plans/completed/20261005-desktop-frontend-refactor/00-总执行计划.md)。

| 场景 | 单测 | 浏览器 mock | Electron |
| --- | --- | --- | --- |
| 新建本机会话 → 发送 → 流式 → 完成 | app-streaming | `?mock=streaming` | ✓（需要模型 key） |
| 流式中切换会话再切回 | transcript | `?mock=streaming` | ✓ |
| 流式中刷新窗口恢复 | app-approval-recovery | — | ✓ |
| 加载早期历史后收到新消息 | app-earlier-history* | `?mock=long-session` | ✓ |
| 运行中发送 → 进入队列 → 引导 → 撤回 → 删除 | app-message-queue | `?mock=streaming` | ✓ |
| 审批弹出 → 允许 / 拒绝 / 重启后恢复 | app-approval-recovery | `?mock=approval-pending` | ✓ |
| 新建远端会话（connected / offline / revoked） | readiness | `?mock=remote-host`（只看状态显示） | 需要真实 Host |
| 远端会话中读文件、下载产物 | remoteArtifact | —（mock 未实现 `hosts.call` / `preview` / `download`） | 需要真实 Host |
| Host 删除后历史会话显示 | app-remote-host-refresh | `?mock=remote-host` | ✓ |
| 新建工作树（Git / 无提交 / 非 Git） | run-location-menu | `?mock=empty`（只看菜单） | ✓ |
| Composer：inline ↔ stacked、`+` 面板、模型、模式 chip | composer / composer-toolbar / composer-palette | ✓ | ✓ |
| 中文输入法 | composer-ime | — | ✓（必须真机） |
| 外链点击不导航主窗口 | window-security（window-navigation* 补全） | — | ✓（系统浏览器是否打开需真机） |
| macOS 关窗再打开，无孤儿 pty | — | — | ✓（`ps` 核对） |
| 退出后无残留子进程 | — | — | ✓ |
| CSP 开启后 mermaid / 高亮 / HTML 预览 / xterm 正常 | — | — | 本轮不加主文档 CSP（11 J1=A），暂不适用 |
| 浅色 / 深色、480px 窄窗 | — | ✓ | ✓ |
| 键盘走查（`+` 面板、运行位置菜单、Settings 对话框） | ui-layering* | ✓ | ✓ |

2026-10-18 核对：transcript、readiness、run-location-menu、composer-ime 及 Composer 系列测试已经落地。仍带 `*` 的 app-earlier-history、window-navigation、ui-layering 专项测试未找到同名文件，保留缺口；不能用相邻测试推定完整覆盖。

相关自动检查：`pnpm check:ipc-channels`（IPC 以契约为准）、`pnpm check:renderer-bridge`（renderer 只经 `api/<域>` 访问 bridge）、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`。其中 `check:renderer-bridge`、`check:ipc-channels` 和这些检查脚本自己的测试（`test:renderer-bridge`、`test:ipc-channels`、`test:frontend-tokens`）已包含在 `pnpm test` 里；`check:frontend-tokens`、`check:frontend-theme` 由 CI 的仓库卫生检查（`scripts/check-repo-hygiene.sh`）运行。

## Web 客户端验证边界

Web 使用独立 Host 协议与浏览器存储；Desktop renderer 的 `?mock=` 不覆盖 Web 连接、认证、重连、任务队列或浏览器下载。Web 工程检查运行 `pnpm --filter @actspace/web test` 与 `build`，真实路线还需隔离 Host、有效模型配置及浏览器交互。停止/失败后验证暂停状态、普通发送仍排队、显式继续、刷新后恢复入口；审批触控目标在 390px 浅深主题检查至少 44px。iPhone/Tailscale、PWA 安装与系统通知需真实设备单独验收。

## 计划与收尾写法

计划阶段应该写明：

- 这次改动属于哪一类。
- 使用浏览器 renderer 还是 Electron 真实验证。
- 是否需要用户截图或 Computer Use。

收尾阶段应该写明：

- 实际运行过的命令。
- 是否看过浏览器或 Electron 窗口。
- 没能验证的部分和原因。

示例：

```text
已运行 pnpm typecheck 和 pnpm build。
本次只改 Composer 样式，使用浏览器 renderer 验证布局；未涉及 preload、IPC 和本地持久化。
```

另一个示例：

```text
已运行 pnpm typecheck、pnpm build 和 pnpm dev。
本次涉及 preload 与 session 恢复，需要 Electron 窗口验证；当前环境没有 Computer Use，因此需要用户提供窗口截图和终端日志。
```
