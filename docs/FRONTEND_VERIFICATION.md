# 前端验证约定

`actspace` 是桌面端应用，不能把浏览器里的 `http://127.0.0.1:5173/` 等同于完整产品。浏览器只加载 renderer；完整桌面端还包含 Electron main、preload、IPC、本地文件和持久化。本文定义前端改动的验收方式。

## 默认原则

- 前端改动必须在计划和收尾中写清验证方式；工程验证优先用仓库命令，不只靠人工目测。
- 样式与组件打磨优先用浏览器 renderer（快速检查 CSS、布局、HMR、空态和不依赖 IPC 的交互）。
- 真实桌面链路必须在 Electron 窗口验证，它是完成流程的最终验收，不是每次样式微调的首选。
- 有 Computer Use 的 Agent，完成重要 UI 修改后在收尾阶段查看真实 Electron 窗口；没有的，说明限制，并让用户提供截图或启动日志。

## 验证分层

### 1. 工程验证

所有实质性前端改动（组件结构、样式、状态、IPC 类型、构建脚本）都要跑：

```sh
pnpm typecheck
pnpm build
```

只改了局部包可以用更小的命令，最终说明要写清原因。这层确认类型、workspace 包边界、Vite renderer 与 Electron main/preload 都能构建。

相关自动检查：

| 命令 | 检查什么 |
| --- | --- |
| `pnpm check:ipc-channels` | IPC channel 以契约为准 |
| `pnpm check:renderer-bridge` | renderer 只经 `api/<域>` 访问 bridge |
| `pnpm check:frontend-tokens`、`pnpm check:frontend-theme` | 设计 token 与主题色约束 |

`check:renderer-bridge`、`check:ipc-channels` 及这些脚本自己的测试已包含在 `pnpm test`；`check:frontend-tokens`、`check:frontend-theme` 由 CI 的仓库卫生检查（`scripts/check-repo-hygiene.sh`）运行。

### 2. 浏览器 Renderer 验证

适用：纯 UI 样式、组件布局、普通前端交互、响应式、不依赖真实文件系统和 IPC 的页面状态、视觉密度与组件状态打磨。

启动：`pnpm --filter @actspace/desktop dev:renderer`，地址 `http://127.0.0.1:5173/`（端口被占用时用 `VITE_DEV_PORT=<端口>` 换端口）。开发模式下没有 Electron preload 时，renderer 注入完整的 mock bridge，场景用 `?mock=<场景>` 选择（默认 `empty`）；生产构建没有 bridge 时显示「无法连接桌面服务」致命页。bridge 与 mock 的约定见 [Preload bridge 与 Mock 规范](design-docs/frontend/front-preload-bridge与mock规范.md)。

- 浏览器验证不能用运行时假业务数据证明产品状态；稳定样例数据放在测试、Story 或显式 demo 边界内。
- 不能证明：preload 是否注入、IPC 是否可用、会话是否真实落盘、文件读取 / 附件 / 持久化 / 恢复是否正常。
- mock 中没有实现的成员调用时 reject `Mock bridge does not implement 域.成员`（包括新建工作树和 Git 写操作）；界面上看到这类报错属于 mock 的边界，不是缺陷。新增场景的做法见 mock 规范 §7，并同步更新下表。

#### 浏览器 mock 场景

| `?mock=` | 种子数据 | 适合验证 / 不覆盖 |
| --- | --- | --- |
| `empty`（默认） | 无会话，一个「默认工作区」 | 首次启动空态、新建会话、Composer 各形态、设置页、浅深主题、窄窗。不覆盖有历史的状态与首次启动建目录（main 单测覆盖） |
| `no-workspace` | 无会话，唯一工作区已从侧栏移除 | 发送按钮禁用并提示「请先选择工作区」。mock 的目录选择器总是取消，选择文件夹后的恢复由 Electron 验 |
| `streaming` | 两个会话；打开「检查 bridge 调用方」约 300ms 后开始流式并停在运行态 | 「生成中」界面、流式中切会话再切回、运行中发送进入队列 / 引导 / 撤回。不覆盖回复完成后的工具细节 |
| `long-session` | 40 轮长会话（含代码块）+ 一个短会话 | 长列表滚动、分组、早期历史加载；右侧 Context 面板（有会话的场景都返回完整 mock 数据，`mock/context-panel-fixture.ts`）、会话行跳轨迹。不覆盖真实分页边界 |
| `context-pagination` | 长会话 + 620 个额外工具条目，初始历史失败、重试后同步；路径活跃满 100、睡眠 1284 条多页，每页 400ms 延迟，首次读睡眠失败一次 | Context 错误 / 重试、条件刷新、加载更多、全文分段、路径满额提示与分页重试。不证明真实 SQLite、Loop 或披露引擎 |
| `approval-pending` | 会话停在高风险 `bash`（`rm -rf …`）审批 | 审批卡片、允许 / 拒绝、刷新后经 `approvals.listPending` 恢复。不覆盖真实工具执行 |
| `approval-prefix` | `pnpm test` 待审批，含 command_prefix 建议 | 三按钮、会话授权文案、主题布局。不覆盖授权复用与持久化 |
| `remote-host` | 三台 Host（已连接 / 离线 / 已撤销），各有会话 | 侧栏 Host 分组与离线标记、运行位置菜单、Host 删除 / 重连后的列表。`hosts.call` / `preview` / `download` 未实现，远端读文件与下载产物只能由单测和真实 Host 覆盖 |
| `sidebar` | 三个工作区、15 个会话按真实时间分布，2 置顶、2 已归档 | 侧栏视图选项（按工作区 / 单列表 / 按时间、手动排序、归档筛选）、拖拽排序、标题行搜索、取消归档、每组 5 条与「展开其余」。状态点由真实运行产生，单测覆盖 |
| `side-chat` | 主会话三轮完成、第 4 轮流式运行；下有两个收起的侧边对话，另有一个普通会话 | 侧栏角标、右栏启动页「侧边对话」与「已收起」分组、继承分隔线、侧边对话内发送 / 停止 / 收起重开、`/side 问题`。不覆盖 Journal 复制、Plan 拦截、重启恢复 |
| `markdown` | 一条全元素 Markdown 历史回复 + 一条按真实网络节奏流式回放的同款回复 | 聊天正文排版、代码块头与折叠、点击路径、流式淡入与逐帧高度稳定。不覆盖真实模型节奏 |
| `script-execution` | 一个会话两轮：第 1 轮一条内联 heredoc Python（15 行）和一条脚本文件命令，第 2 轮停在内联脚本的审批上 | Bash 行「Python 脚本（N 行）」摘要、详情里的代码块折叠 / 展开、`# script:` 文件名点开右侧面板、审批卡「运行 Python 脚本（N 行）」与代码块。不覆盖真实脚本执行与 `$ACTSPACE_SCRATCH` 解析 |
| `thinking` | 一个会话：流一段思考 → 一次 Read → 第二段思考，停在运行态 | 「简化思考过程」开 / 关两种样子（设置 › 通用 › 对话显示）、运行中一行标题与开头一句、结束后的 `Thought for Ns`、点标题展开。不覆盖回复完成后的 Worked 收起与历史回读 |
| `turn-deliverables` | 三轮：改动卡 / 交付卡的单文件、多文件、折叠形态，回复带用量（第 2 轮无价格）；`readFile` 只认识 `docs/report.md`、`docs/summary.csv` | 轮尾改动卡与交付卡、悬停 diff、打开方式菜单、「显示本轮代码改动」开关、用量胶囊与弹窗。不覆盖真实 `present` 调用与原生关联应用 |
| `subagent-trajectory` | 父会话含一次 `agent` 委派；`getSubagents` 返回五个子 Agent（已完成 Explore、运行中、后台运行中、失败、已停止） | 父轨迹只留 `agent` 一行、对话里单行派发卡片与 Fork 来信卡片（状态跟着派发卡片）、不出子智能体完成通知行、右侧子 Agent 列表（无外框、运行中悬停换停止；「压测 SQLite 写入」第二行每 3 秒换一句动态，打开后第 8–14 秒显示「来信：」和蓝点）与详情顶栏、「查看轨迹」、窄面板。`getSubAgentTranscript` 返回空，运行中的实时轨迹需真实运行 |
| `compaction` | 三个会话：已提交压缩、压缩进行中、压缩失败 | 压缩分隔线三态、「在轨迹中查看」、轨迹概述。不覆盖手动 `/compact` 与真实压缩 |
| `background-tasks` | 一个会话三轮：后台 `pnpm test`、后台 `agent`、完成通知唤醒（无用户消息）、仍在运行的 `pnpm dev` | Bash / 子 Agent 卡片的「后台」标签与状态、Bash 唤醒分隔行（子 Agent 完成唤醒没有分隔行）、右侧后台任务面板。不覆盖真实唤醒调度与 `task_*` 输出 |
| `harness-stats` | 直接打开 设置 → Harness 统计；数据来自 `mock/harness-stats-fixture.ts`。`&theme=dark` 强制深色 | 值得关注、5 张指标卡与版本对比行、卡片网格（占用 vs 使用、上下文、压缩、披露、运行时、版本对比）、悬停卡、跳转高亮、底部明细排序。真实汇总 Worker 与日志同步由 main 单测和 Electron 覆盖 |
| `usage-stats` | 直接打开 设置 → 使用统计；数据来自 `mock/usage-stats-fixture.ts`（demo v4 的 30 天口径，范围按比例缩放）。`&theme=dark` 强制深色 | 工具条筛选、5 张指标卡与跳转、Token / 耗时环形图、用量趋势、活跃度热力图、四个排行卡、底部 6 个明细 tab、请求明细悬停卡与分页。不覆盖真实统计库重建与时区分桶（main 单测覆盖） |

#### 轨迹页 fixture

在任意 mock 场景地址后加 `&trajectoryFixture=<名称>`，切到轨迹视图显示固定数据；`&trajectoryTheme=dark|light` 临时覆盖样例主题。数据在 `renderer/fixtures/trajectory-complete.json` 与 `renderer/trajectory/fixtures.ts`。

| 名称 | 内容 |
| --- | --- |
| `complete` | 6 轮：工具、重试、审批、压缩、缺计时旧消息、运行中的回复 |
| `errors` | `complete` 加上下文行、子工具失败、系统提示词差异、审批拒绝、请求失败 |
| `running` | 去掉所有结束事件，看等待中状态与请求占位行 |
| `streaming` | 运行中的回复每 120ms 追加一个 chunk，行原地变长不闪 |
| `long` / `streaming-long` | `complete` 重复 24 次（后者加 2000 个 chunk 的流式回复，`TRAJECTORY_PERF=1` 可测每帧耗时），验证虚拟化与加载更早历史 |
| `empty` | 没有事件的空态 |

#### 组件级回归与预览页

- 组件预览页在 `apps/desktop/src/renderer/test/fixtures/*-preview.html`（开发服务器直接打开，`?theme=dark` 切深色），只调用组件，不走 IPC；它们是代表场景，不能签收产品入口。
- 真实 Chromium 布局回归（需本地 Playwright，`ACTSPACE_PLAYWRIGHT_MODULE=/绝对路径/playwright/index.mjs`）：`pnpm --filter @actspace/desktop test:composer-palette-layout`（Composer `+` 面板）、`test:file-grant-scope-layout`（文件授权范围弹层，长路径必须换行保留完整路径与读写权限）。它们不读应用数据、不调用 Provider，也不代替 Electron 的真实授权与入口验收。

### 3. Electron 真实验证

适用：一轮前端改动完成后的最终桌面验收；窗口行为、preload 注入、IPC、本地持久化、session 恢复、文件系统能力，以及任何涉及 `window.actspace` 的真实能力。

```sh
pnpm dev
```

- 启动器先完成依赖与本轮 Electron main/preload 构建，成功后才启动 watch、renderer 和 Electron。本轮构建失败会停止启动，磁盘上旧的 `dist-electron` 不能替代这道构建屏障；请从 `pnpm dev` / `pnpm dev:log` 启动，不直接运行内部的 `dev:electron:run`。
- 修复 Runtime 内置行为包后，单独构建该 package 不足以验证 Desktop：执行实现会被打入 `packages/core/runtime/dist/default-harness/`。若用隔离验收启动器直接运行已构建入口，先重建 Runtime Harness（`pnpm --filter @actspace/runtime build`），确认制品包含本轮改动再重启；只检查源文件或依赖包 `dist` 不能证明运行中的 Harness 已更新。
- macOS 开发启动会在系统临时目录缓存一份当前 workspace 专属的开发 runtime，带唯一应用名、bundle ID 与可执行文件名。启动日志里的 `[dev-runtime]` JSON 是本次运行的事实来源：Computer Use 必须使用其中的 `appName`（优先）或 `appId`，不要用通用的 `Electron`。不同 worktree 因此可并存。该身份只改系统识别与进程名，main 仍使用既有的 `actspace` userData 目录，会话与设置不受影响。
- 缓存复用前会检查文件结构、资源大小、可执行权限、framework 符号链接与 Info.plist 身份，缺失或损坏时输出 `rebuilding cached Electron` 并重建；这不是签名或字节哈希验证，也不会清理会话、设置或 Chromium 缓存。可用 `node scripts/run-electron-dev.mjs --prepare-only` 单独验证，回归测试 `node --test scripts/test/electron-runtime-integrity.test.mjs`（macOS）。
- 开发启动默认不弹独立 DevTools 窗口（避免抢走 Computer Use 焦点）；需要时 `ACTSPACE_OPEN_DEVTOOLS=1 pnpm dev:log`。

需要确认：窗口弹出、renderer 正常加载而不是空白页、`window.actspace` 注入后能加载 bootstrap state、首次启动能创建或恢复会话、本地数据目录正常初始化。有 Computer Use 的 Agent 从 `[dev-runtime]` 读取 `appName` / `appId`，直接观察并截图；没有的，说明无法观察桌面窗口，请用户提供 Electron 窗口截图、`pnpm dev` 终端日志，必要时提供 `sessions-v2/<sessionId>/journal.jsonl` 的脱敏摘要（不要发完整 Journal、凭据或含敏感工具输出的原始文件）。

## 默认验收矩阵

| 改动类型 | 必须验证 | 推荐补充 |
| --- | --- | --- |
| 样式、布局、组件展示 | `pnpm typecheck`、浏览器 renderer 截图 | 完成阶段再看 Electron 窗口 |
| Composer、弹窗、菜单等交互 | `pnpm typecheck`、浏览器 renderer 交互 | Electron 窗口交互 |
| IPC、preload、session、本地文件 | `pnpm typecheck`、`pnpm build`、Electron 真实验证 | Computer Use 操作或用户截图 |
| 构建脚本、workspace、Electron 配置 | `pnpm typecheck`、`pnpm build`、`pnpm dev` | 检查 `dist-electron/main/index.js` 是否生成 |
| 设计文档或图片更新 | 文档链接检查 | 对照设计图人工确认 |

以下场景只能或必须在 Electron 下验：流式中刷新窗口恢复、中文输入法（必须真机）、外链点击不导航主窗口（系统浏览器是否打开需真机）、退出后无残留子进程、真实 Host 的文件读取与产物下载、新建工作树（Git / 无提交 / 非 Git）、侧边对话的上下文继承 / Plan 只读 / 重启恢复。浅色 / 深色与 480px 窄窗、键盘走查（`+` 面板、运行位置菜单、设置对话框）在浏览器 mock 与 Electron 各看一遍。

## Web 客户端验证边界

Web 使用独立 Host 协议与浏览器存储；Desktop renderer 的 `?mock=` 不覆盖 Web 连接、认证、重连、任务队列或浏览器下载。Web 工程检查运行 `pnpm --filter @actspace/web test` 与 `build`，真实路线还需隔离 Host、有效模型配置及浏览器交互。停止 / 失败后验证暂停状态、普通发送仍排队、显式继续、刷新后恢复入口；审批触控目标在 390px 浅深主题至少 44px。iPhone / Tailscale、PWA 安装与系统通知需真实设备单独验收。

## 计划与收尾写法

计划阶段写明：这次改动属于哪一类；用浏览器 renderer 还是 Electron；是否需要用户截图或 Computer Use。收尾阶段写明：实际运行过的命令；是否看过浏览器或 Electron 窗口；没能验证的部分和原因。例如：

```text
已运行 pnpm typecheck 和 pnpm build。
本次只改 Composer 样式，使用浏览器 renderer 验证布局；未涉及 preload、IPC 和本地持久化。
```

```text
已运行 pnpm typecheck、pnpm build 和 pnpm dev。
本次涉及 preload 与 session 恢复，需要 Electron 窗口验证；当前环境没有 Computer Use，因此需要用户提供窗口截图和终端日志。
```
