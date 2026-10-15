# 轨迹前端验收 — 2026-10-15

状态：**验收执行完成，A1–A8 均已有实际覆盖；未整体通过。** 真实 Provider 预览增长与新文字搜索已通过当前构建的隔离 Electron 自动化补齐；原生 Computer Use 的读取限制单独保留。发现的问题均已记录，未修复。

交接事项：B01 旧开发窗口轨迹持续空态；B02 旧窗口取消后“正在停止…”残留（待复核）；B03 关闭 Thinking 后任务失败且原因未展示；B04 Markdown 列表标记丢失；另有 O01 偶发长帧、I01 全量测试失败。首轮原始台账保存在本地证据目录，本文使用合并后的最终状态。

## 对象与边界

- Claude Code 会话：`轨迹页 DSH 样式对齐重做` / `e6b1e400-c042-4233-98db-c7443dd33629`，已读取本机会话末尾摘要并核对两个 execution-summary。
- 工作区：`/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent`。
- HEAD：`42b8ba405dd72efe39abd71eb0782b4e5e926af0`；验收开始与工程检查后状态一致。
- 范围：DSH 样式对齐与流式拆分 E1/T0–T6；其他未提交改动不纳入结论。
- 本轮只验收和新增本记录，无源码修复、提交、推送。复用了现有 Vite 与 Electron 开发服务，最后以独立数据目录启动当前构建的 Electron 补齐真实 Provider 动态检查。
- 工程验证依赖当前混合 WIP 工作区，因此结论代表当前工作区，不证明将轨迹补丁单独摘出后的构建与运行。
- Computer Use 执行模型：`gpt-6.1-sol`。下文严格区分真实 UI 操作、自动化脚本、测试与源码检查。

## 验收清单与路线

| 编号 | 验收点 |
| --- | --- |
| A1 | 轨迹入口、返回对话、草稿保留；无输入框与底部空白 |
| A2 | 类型、轮次、请求圆点、工具结果、上下文、审批拒绝、错误状态 |
| A3 | 详情页签、工具关联跳转、JSON 展开、系统提示词差异 |
| A4 | 搜索/清空/折叠展开，时间轴选择/定位/拖动 |
| A5 | 浅色、深色、480px 窄窗布局与可读性 |
| A6 | 短/长流式回放的表格、详情增长、稳定性与搜索更新 |
| A7 | 真实 Provider 输出中的轨迹、工具事件、完成与停止 |
| A8 | 流式性能、增量处理、等价性、Electron 历史分页与 IPC |

路线：errors 静态功能 → streaming/streaming-long 动态功能（复用主题与尺寸）→ 真实 Electron 会话。分组只用于执行；结论按验收点报告。

## A8：本轮工程与自动化验证

| 验证 | 结果 | 证据/限制 |
| --- | --- | --- |
| Desktop typecheck | 通过 | renderer + Electron TypeScript |
| Desktop renderer / Electron 构建 | 通过 | `build:renderer`、`build:electron`，非全 workspace clean build |
| 轨迹针对性测试 | 通过，10 文件 / 68 条 | builder、relations、render-view、details、layout、live、search-index、streaming-perf、streaming、timeline-view |
| client 测试 | 通过，6 文件 / 24 条 | 含事件对象缓存回归 |
| token / theme / renderer bridge / current docs | 全通过 | `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` |
| Desktop 全量测试 | 失败 | 1866 通过 / 1 失败 / 7 跳过；231 文件通过 / 1 失败 / 2 跳过 |
| watcher 单独重跑 | 通过，2 条 | 全量失败为 `review-workspace-watcher.test.ts:66`；单独通过只支持不稳定性线索，不能抹掉全量失败或证明根因 |
| 隔离 Electron 验收脚本 | 通过，11 项 | 当前 renderer/main/preload 重建后运行；真实 Journal、preload、IPC revisions、历史分页、UI 历史、助手工具跳转、结果、Schema、提交通知、草稿切换、重载；无 Provider 调用 |
| `git diff --check` | 通过 | 没有改动用户源码 |

命令：

```sh
TRAJECTORY_PERF=1 pnpm --filter @actspace/desktop exec vitest run src/renderer/test/trajectory-{builder,relations,render-view,details,layout,live,search-index,streaming-perf,streaming,timeline-view}.test.*
pnpm --filter @actspace/client test
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop build:renderer
pnpm --filter @actspace/desktop build:electron
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:renderer-bridge
pnpm check:current-docs
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop exec vitest run src/main/test/review-workspace-watcher.test.ts
```

上方轨迹命令是所测文件集合的简写，实际运行显式列出了 10 个文件。

### 计算性能与模型不变量

- 2000 chunk split 每帧 total p95：**1.148ms < 2ms**；本轮机器有并行检查负载，与历史摘要 0.252ms 分开记录。
- 40 chunk split p95：0.413ms。
- 首帧构建后，chunk 追加不再调用 builder/layout/timeline：计数测试通过。
- 每个 chunk 仅累加一次：计数等于 chunk 数。
- 与未拆分路径的逐帧内容/请求布局等价：测试通过；长会话覆盖 1/40/800/2000 chunk。
- 普通事件仍触发定稿层全量重建：本轮 p50 11.384ms / p95 12.434ms。属于已知保留边界。

### 浏览器自动测量（不是 Computer Use）

使用既有 `tmp/trajectory-shots/stream-long.mjs`，独立 headless Chrome，1440×900。长回放生成全部 2000 chunk。

| 采样 | 短回放 | 长回放 |
| --- | --- | --- |
| 与全量测试并发时 | 293 帧，p95 16.8ms，max 100ms | 765 帧，p95 16.8ms，max 133.4ms |
| 无全量测试负载复测 | 292 帧，p95 16.7ms，max 99.9ms | 760 帧，p95 16.8ms，max 200ms |
| 额外不截图诊断 | — | 773 帧，p95 16.8ms，max 83.3ms |

- 两轮均为 sameNode=true，removed=0，文本长度单调增长；长回放 100 个不同长度，119 → 11750 字符。
- 不截图诊断仍观测到约 4.45 秒与 9.45 秒处的两次 83.3ms 长帧。**p95 门槛通过，但不能承诺全程没有掉帧。** 根因未定位，不将相关性当成因果。
- 原脚本 console 记录 1 个资源 404，无 pageerror；`/favicon.ico` 单独请求也为 404。额外页面响应观察未捕获业务 4xx/5xx；不据此声称已精确定位原 404。

## Computer Use 阶段记录

首轮逐项记录保存在证据目录 `ui-acceptance.md`，补验记录为 `ui-acceptance-continuation.md`。首轮的未覆盖状态已被后续实测部分更新，下表为最终合并台账；不可把首轮历史结论当最终结果。

| 点 | 当前结果 | 证据与边界 |
| --- | --- | --- |
| A1 | 操作通过；首次真实加载异常 B01 | 原生入口/返回/无 Composer/主体布局/未发送草稿完整保留均通过；隔离 Electron 脚本亦通过草稿往返 |
| A2 | 通过已列场景 | 原生真实类型/轮次/请求圆点/工具完成；errors fixture 原生覆盖七类、工具失败、审批拒绝；自动化全样例矩阵补充 |
| A3 | 已覆盖；列表预览失败 B04 | 原生请求四页签、父子工具/助手关联、嵌套 Schema、系统差异/工具目录、压缩原始输出；28记录104页签由自动化逐个点击，未称原生逐个覆盖 |
| A4 | 通过已列功能 | 原生搜索/清空/轮次折叠/调用折叠/时长；时间轴定位/范围/缩放/平移/清除与面板调宽为实际浏览器自动化，未逐一重复原生 |
| A5 | 通过已列矩阵；精确尺寸证据分开 | 原生 Electron 浅/深、Chrome 约500px外宽深色代表交互；浅/深×1440/480 精确 viewport 与 DSH 对照由浏览器自动化完成 |
| A6 | 已覆盖；性能门槛通过，有长帧观察 O01 | 短/长正文与预览单调增长、同DOM、时间轴不变、滚动、新词约1322ms可搜均有实测；原生不重复所有 fixture 动态帧 |
| A7 | **已覆盖；默认路线通过，关闭 Thinking 失败 B03** | 原生真实工具、自然完成、主动停止；隔离 Electron 真实正文/预览增长、新词1797ms命中、全新进程停止恢复均通过。原生读取限制保留；B02为旧窗口待复核异常 |
| A8 | 轨迹门槛通过，全量测试失败 | 针对性测试、缓存、typecheck、构建、4检查、隔离 Electron11项与性能门槛通过；全量仍有 I01 |

## 真实 Provider 事件证据（只读 Journal，非 UI 通过证明）

会话 `轨迹界面验收：流式输出与工具调用协同` / `1bceee48-ee07-40da-b701-a00f8fa1ac22` 在北京时间 08:18:17–08:18:37 完成，2079 条 assistant/chunk、2 条 request/header、2 条 assistant/message、1 次 list_directory 工具调用和成功结果、turn/end completed。Computer Use 进入轨迹时观察到空态，数分钟后仍空，页面刷新后恢复，见 B01。已脱敏留存事件计数与时间，不复制原始 Journal、提示词或凭据。

第二轮 08:39:20–08:43:40，6702 条新增 assistant/chunk、1 条 request/header，最终 turn/end reason=completed。CUA 捕获到运行态，但这些 Journal 事件计数不能证明已观察正文连续增长，也不能作为停止成功证据。脱敏记录为 `real-session-second-turn-evidence.json`。

第三轮 12:51:22–12:57:57，4299 条 assistant/chunk；`assistant/message.finishReason=aborted`、`step/end.reason=aborted`、`turn/end.reason=aborted`。这是主动中止的运行时证据，和前两轮自然完成分开记录；子智能体确认已点击工具栏停止，截图捕获“正在停止…”，与随后 aborted 事件对应。第三轮未取得两次预览正文增长观察，因此不将它算作该子项通过。脱敏记录为 `real-session-third-turn-evidence.json`，仅含事件元数据、各类 chunk 的数量和字符数，不含原文或凭据。

第四轮 13:05:47–13:19:07，4865 条 assistant/chunk；13:07:08 起已有 assistant-delta 正文。原生操作已按 AX 选中第 4 轮助手的预览页签，但随后 AX＋截图组合读取约 151 秒超时，单独 AX 读取约 120 秒超时（Sky request timed out），未拿到两时点正文证据。为结束验收运行，通过已确认的工具栏 AX 节点点击停止；13:19:07.120 turn/end=aborted，13:19:08.087 run finish=cancelled。脱敏记录为 `real-session-fourth-turn-evidence.json`。本条支持后台主动中止，不支持真实预览持续增长；工具超时不记作产品 Bug。随后静态 screenshot-only 成功提供了不同取证路径，因此仅追加第五轮有界补验；结果见下。

## 补充：浏览器样例静态自动化与截图审阅

本轮运行既有 `tmp/trajectory-shots/shots.mjs`（无源码改动），13 个截图在 `static-shots/`。主智能体实际查看了助手详情、失败工具详情、请求重试详情、系统提示词差异、调用收起、深色表格、深色失败请求详情和 480px 详情截图。

- 样例展示了用户、助手、工具、上下文、系统、压缩等行；失败工具/审批拒绝与请求错误的颜色及文本可读。
- 助手概述含来源、Token、计时；工具概述含参数、结果、Schema；请求详情含重试、用量与计时；系统行默认差异页有增删行。
- 浅/深主题上述截图未见明显布局破坏。480px 打开详情后，表格只剩窄条，符合计划明确的 DSH 容器行为，不据此提 Bug。
- 点击“收起所有调用”后显示工具调用数量与名称的摘要，截图确认。
- long 虚拟滚动：实际渲染 38 行，92 帧，p95/max 均 16.8ms。
- 这个脚本自身的 streaming identity 采样虽然同节点，但 12 次内容长度都是 30，未实际观测增长，**不能作为流式增长通过证据**；流式结论采用另一个 `stream-long.mjs` 和本轮针对性测试。
- 这些属于浏览器自动化与产物目视审阅，不能代替 Computer Use 的逐项交互结果；未与 DSH 真实运行界面进行像素级对照。

## Bug / 异常记录（不修复）

### B01：开发窗口的新真实会话首次进入轨迹后持续为空，刷新可恢复

- 环境：已有的隔夜 HMR 开发窗口 `Actspace Dev actspace-agent-2067` / `com.actspace.desktop.dev.w2067fa05`；当次验收没有重启此现有服务。
- 复现：新建专用会话 → 要求只读工具调用及长回复 → 运行中进入轨迹 → 显示“当前会话暂无可展示的 Agent 轨迹” → 回复完成、数分钟后再检查仍空 → Cmd+R 刷新 → 返回同一会话并打开轨迹后，完整表格与时间轴出现。
- 会话：`1bceee48-ee07-40da-b701-a00f8fa1ac22`；标题“轨迹界面验收：流式输出与工具调用协同”。Journal 在 08:18:17–08:18:37 已完成且含 2079 chunk 等事件，详见 `real-session-event-evidence.json`。
- 预期：新会话已有事件时轨迹自动显示并持续更新，不要求用户手动刷新。
- 实际影响：当前窗口首次验收的真实流式与详情增长被空态阻断；持续空态至少约六分钟，普通重新绑定窗口未恢复，页面刷新后恢复。
- 证据：`gpt-6.1-sol` 的 CUA 原生 Electron 操作及前后截图（由 CUA `nodeRepl.emitImage` 保留）、只读 Journal 的脱敏事件计数。
- 结论：确认观察到异常；**不能写成永久数据丢失，也不能证明是短暂投影竞态**。当前构建的全新隔离 Electron 多轮在约1.5–1.9秒内出现真实轨迹，未复现此持续空态；旧开发窗口的原因和受影响版本边界未定位。新进程通过不否定既有窗口的异常。
- 状态：未修复，留给后续统一处理。

### B02：后台已取消完成，界面仍显示“正在停止…”（待复核）

- 复现：在同一专用真实会话第三轮输出中点击轨迹工具栏停止，首次截图显示“正在停止…”。随后重复观察并返回对话，仍未恢复；Cmd+R 后才恢复空闲与可输入 Composer。
- 后台：12:57:57.939 的 turn/end reason=aborted，12:57:58.494 的 agent-service/run 为 op=finish、outcome=cancelled，之后没有新增运行事件。
- 界面证据：子智能体报告停止后的 AX 树仍有 `320 disabled 正在停止…`；返回对话那次只 diff 出轨迹 toggle Value0，没有新增 Composer、未移除停止节点。多次观察跨至少 180 秒。刷新后完整 AX 显示空闲、Composer enabled。
- 截图与 AX 有时间异步，截图中的侧栏绿点只作辅助；本条不单凭截图认定。当前观察支持既有开发窗口停止后的状态未恢复，但原生工具 AX/截图的时序亦有不确定性；登记为待统一复核问题，根因与全新进程边界未知。第四轮稍后已空闲，不证明每次停止均复现。
- 轨迹中已生成的正文在停止后保留；后台取消成功不等于界面恢复通过。
- 证据：续验 CUA 调用“停止后返回对话，检查是否恢复可输入状态”等及 `real-session-third-turn-evidence.json`。
- 状态：未修复、待复核。后续当前构建的隔离 Electron 两次在531ms / 143ms恢复输入框，另一次904ms，未复现长时间残留。为继续旧窗口验收曾重载专用窗口。停止会暂停队列，后续待发消息需点“继续发送”，不另记为 Bug。

### B03（P2）：DeepSeek 关闭 Thinking 后任务立即失败，聊天界面未展示失败原因

- 环境：当前构建的隔离 Electron，已有 DeepSeek 连接，`deepseek-flash`，独立数据目录/工作区；原用户设置未修改。
- 复现：新建会话 → 模型按钮 → `编辑 deepseek:deepseek-flash 选项` → 点击 Thinking 所在 label 关闭开关 → 发送一条普通纯文本任务 → 打开轨迹/返回对话。
- 实际：2026-10-15 14:13:54，任务在任何 `request/header` 或 `assistant/chunk` 之前失败。`turn/end` 为 failed，failure.message=`Request snapshot contains a non-JSON value.`，随后 run finish=failed。返回对话的截图/DOM 未出现该原因，只见用户消息与 `Worked / Review`；不能仅凭界面判断此次运行已失败。
- 预期：支持关闭 Thinking 的模型应能正常请求；任务若失败，界面应显示失败原因。
- 证据：`continuation/thinking-off-failure-evidence.json`、`thinking-off-trajectory-failure.png`、`thinking-off-chat-failure.png`、`thinking-off-run-results.json`。实际通过可见 label 操作开关并确认 checked=false；没有强制点击或伪造运行事件。
- 排查入口：`apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts:47-50` 在 reasoning=false 时构造含 undefined 的 reasoningEffort；`packages/context/engine/src/request-snapshot.ts:39` 拒绝非 JSON 值。此处是源码线索，未做修复或完整根因定论。
- 范围：真实模型补验发现的相邻运行问题，未证明由轨迹改动引入。当前只确认上述 DeepSeek 路线，不外推所有供应商。

### B04（P2）：轨迹 Markdown 预览丢失有序编号与无序圆点

- 首次证据：真实模型助手正文是编号列表，表格原文含 `1.` / `2.`，预览却只显示每项正文，见 `continuation/real-provider-preview-later.png`。
- 定向复现：通过浏览器网络路由仅替换测试 fixture 的一条用户消息为 `1. 第一项 / 2. 第二项 / - 苹果 / - 香蕉`（实际使用标准 Markdown 换行）；进入轨迹 → 点击该行 → 预览。未修改产品源码或 DOM 实现。
- 实际：浅/深主题均生成正确的 OL/UL 与各两个 LI，但 `list-style-type=none`、`padding-left=0px`，LI 的 marker 也为 none；四项呈现为普通文字，列表编号/层级信息丢失。
- 预期：预览保留有序列表编号、无序列表标记和基本缩进。
- 证据：`continuation/markdown-lists-results.json`、`markdown-lists-light.png`、`markdown-lists-dark.png`；脚本 `markdown-list-evidence.mjs`。这两张是增强 fixture 的真实浏览器渲染，不标为原生 CUA 或原始内置 fixture。
- 排查入口：`apps/desktop/src/renderer/components/trajectory/details/shared.tsx:40-44`、`apps/desktop/src/renderer/styles/trajectory.css:1505-1563`。未修复。

### O01：p95 达标，但仍观察到偶发长帧

不截图的长回放中两次约 83.3ms 帧间隔；最大帧间隔不属于既定 p95 门槛。记录为性能观察，不将未定位的调度/开发环境开销直接认定成某一代码 Bug。

### I01：全量测试的 watcher 失败

`apps/desktop/src/main/test/review-workspace-watcher.test.ts:66` 在全量运行失败，单独运行两条通过；源码与测试不在轨迹改动清单，本轮不修。单独重跑不改变全量失败结论，也不证明根因。

## 本地证据位置

本地截图与测试日志不随仓库分发：`/Users/wakeup-jin/.codex/visualizations/2026/10/15/01a13ce8-e4fb-7b42-a8a9-0d3ac9ec9869/trajectory-acceptance/`。子智能体逐项原始台账为此目录下 `ui-acceptance.md`，其中列明 CUA 证据调用标题。本文中的 JSON、日志和截图文件名均相对此目录；CUA 无落盘路径的截图仅保留在当轮工具输出中。新克隆不能据此假设已有本地证据文件。

## 续验：补齐界面操作与精确计时（用户要求全部验收）

本节为前次收束后的补验。仍只记录结果和问题，不修改实现；Computer Use 特殊状态和真实流式路线继续由 `gpt-6.1-sol` 执行。

### 已完成的真实浏览器自动操作（不是 Computer Use）

证据相对此目录下 `continuation/`：

| 子项 | 本轮证据 | 结果 |
| --- | --- | --- |
| 七类记录与详情 | `all-details.json`：28 条记录、104 个页签均已点击并有内容；含来源、压缩原始输出、工具结果与 Schema、系统差异 | 通过 |
| 请求详情 | `request-and-source-results.json`：10 个请求、38 个页签；失败、重试、等待中均核对 | 通过；#7 压缩和 #10 未记录选项，依规则不显示选项页签 |
| JSON / 思考 / 工具目录 | 展开工具目录及嵌套 JSON，ArrowLeft/Right 收起/展开；思考展开/收起 | 通过 |
| 关联跳转 | 助手预览与原始块 → 工具；子工具 → 父工具；工具 → 助手 | 通过 |
| 详情宽度 | 默认 440px；键盘 +16/−16；拖拽 602px；最小 320、最大 720；双击复位 440 | 通过 |
| 折叠与草稿 | 双击助手收起 2 个调用，摘要点击恢复；双击轮次、Enter 恢复；工具栏全部调用收起/展开；未发送草稿往返保留 | 通过 |
| 时间轴 | hover 提示含总时长/首 token/解码；点击块定位同一 recordId；拖选后 18 行淡化；Esc 清除；滚轮缩放、右键平移、空白点击与双击清除 | 通过 |
| 主题与尺寸 | 浅/深 × 1440/480，打开失败工具参数、关闭详情、搜索错误、清空；无页面横向溢出 | 通过 |
| 空态 | empty fixture 显示“当前会话尚未产生可展示的 Agent Loop 事件。”，无表格 | 通过 |
| 短流式详情 | 71 个采样，19 个不同长度，正文与预览 12→119；同一 DOM，时间轴 outerHTML 不变 | 通过 |
| 长流式详情 | 311 个采样，99 个不同长度，正文与预览 237→11750；单调增长、同一 DOM、时间轴 outerHTML 不变 | 通过 |
| 长回放中滚动 | 向上滚至顶部并停留，再向下返回；离开尾部时详情继续 1059→4584，随后至 8930；渲染 38–52 行，585 帧 p95 16.8ms、max 83.3ms，无页面异常 | 通过交互与 p95 门槛；仍保留 O01 长帧观察 |
| 新内容搜索 | “最后检查”出现后输入，起初 0 行，约 1322ms 后命中 | 通过本次 3 秒门槛；不是所有输入/调度的数学上限证明 |

详情和静态交互证据为 `extended-browser-results.json`、`interaction-supplement-results.json`、`request-and-source-results.json`；流式逐次采样为 `streaming-detail-growth.json`、`streaming-long-detail-growth.json`。

### DSH 对照

使用计划指定的编译参考页 `tmp/trajectory-demo-old/dsh-reference.html`，与当前 renderer 在浅/深 × 1440/480 相同 viewport 生成截图。`reference/comparison.json` 比较工具栏、行、事件列、时间轴的高度/字号，以及参考页中存在的类型标签颜色、背景、字号、字重和圆角，四组均无差异。工具栏 32px、时间轴 50px、行 30px、12px 字、事件列 84/50px 与参考一致。

样例内容与周边壳层不同，不能把此结论写成整页像素完全相同。静态表格、助手、失败工具、请求、系统差异的截图覆盖全部四组；主智能体审阅代表性的浅色表格/深色系统差异/深色窄窗请求/浅色窄窗失败工具，未见新的明显布局破坏。

### 验收工具自身的误差校正

- 首次面板宽度脚本未限定 separator 名称，误匹配侧栏与详情两个元素。修正验收选择器后定向通过，不是产品 Bug。
- 首次请求检查误以为“选项”无条件存在；按设计的记录字段条件核对后确认 #7/#10 合理省略，不是产品 Bug。
- 时间轴切换时曾瞬间读到极端比例；最小复现等待 150ms 后恢复 100%，与新页直接切换结果一致。未形成可确认缺陷，不作为 Bug 登记。记录 `mode-switch-investigation.json`。

### 原生续验收尾与证据路径校正

原生 Electron 深色上下文标签、请求圆点与请求详情已观察通过，随后恢复原浅色。未发送草稿原文进入轨迹再返回完整保留，验证后已清除。原 Chrome 深色近似窄窗外宽约500px：失败工具详情、搜索 Missing plan registration/清空、调用收起/展开、时长切换/恢复通过；窗口恢复1919×1050。不称这一条为精确480px，精确480px证据来自自动化。

为原生补验启动的另一个480px专用Chrome因mac原生接口按同bundle绑定到旧进程而没有获得原生操作证据；已仅关闭本次自建进程，未关闭原Chrome或开发服务。

第四轮失败的是组合 AX+截图与单独 AX 路径；后续静态 screenshot-only 成功，耗时约60秒，故不能笼统声称所有截图路径均不可用。随后做了限定的一轮 screenshot-only 真实动态补验，结果见下；运行中的这条独立截图路径同样超时。

## 原生动态补验阶段的缺口与最终覆盖方式

第五轮 13:50:05–13:56:48，仅一条纯文本任务，未调用工具或写文件。1992 条 chunk，正文在 13:51:50.975 开始。队列通过正式“继续发送”恢复，没有重复提交。单独 AX 为定位新增助手读取超时约141秒后停止使用；随后单独 `getScreenshot` 在运行中约120.56秒超时，没有拿到可判定的助手预览画面。子智能体随后通过已确认的工具栏停止节点结束运行：13:56:48.577 turn/end=aborted，13:56:49.588 run finish=cancelled。脱敏证据为 `real-session-fifth-turn-evidence.json`，没有第六轮原生动态尝试；后续改用当前构建的隔离 Electron 自动化。

静态独立截图成功不能证明运行中同一路径可用；运行中的超时也不能直接认定为产品卡死，CUA与产品两层原因尚未区分。只按“验收工具阻断”登记，不能把空闲截图、Journal字符增长或fixture结果补写成真实预览通过。

| 剩余验收点 | 状态 | 已有证据 / 缺失证据 |
| --- | --- | --- |
| 真实Provider运行中选中助手预览，两次正文末尾增长 | **通过，真实 Electron 自动化** | 正文13→315，间隔2330ms；运行中两张预览截图、543次DOM采样、137种预览长度。非原生CUA读取 |
| 真实Provider输出中新文字搜索 | **通过，真实 Electron 自动化** | appeared此前不在正文、思考或原始事件文本中；输入后先0行，再于新文字出现后1797ms命中助手行，截图保留停止按钮证明运行中 |
| 原生CUA逐帧短/长fixture与所有时间轴手势 | **未逐项重复** | 对应真实浏览器自动化已完成，有DOM、精确计时、滚动、交互证据；不将其标为原生CUA通过 |
| B01/B02在全新进程的代表路线 | **已执行，未复现旧窗口异常** | 当前构建独立数据目录：真实轨迹立即出现；停止后143/531/904ms恢复输入框。不能外推所有会话，也不替代旧HMR窗口根因复核 |

## 最终补齐：当前构建 + 真实 Provider 的隔离 Electron

此路线通过 Playwright 驱动当前 Electron、preload 与正式 IPC，使用既有 DeepSeek 连接真实请求；不使用假流、不手工写入回复事件，不标为原生 Computer Use。每次使用权限0700临时目录与0600凭据文件，仅供隔离主进程读取，完成后关闭自建应用并删除整个临时数据目录；原用户会话、设置与原开发服务保持不变。脚本和证据在 `continuation/`，不归入产品实现。

| 验收点 | 最终证据 | 结论 |
| --- | --- | --- |
| 真实正文与详情同步增长 | `real-provider-electron-primary-results.json`，会话76db2c53：13→315字符/2330ms；`real-provider-preview-first.png`、`real-provider-preview-later.png`；543次采样、137种预览长度，节点相同 | 通过 |
| 真实新文字搜索更新 | `real-provider-novel-search-results.json`，会话ddeb545e：新词 appeared；基线含239字符思考与63字符正文，合并完整chunk后仍确认基线未包含该词；新字出现→输入12ms→命中1797ms；输入后初始0行 | 通过，低于3秒 |
| 运行中搜索界面 | `real-provider-novel-text-search.png`，助手行与预览正文含新词，停止按钮仍在；页面无pageerror | 通过 |
| 全新进程入口/停止 | 真实表格约1667/1862ms出现；点击停止到停止中消失、返回对话输入框可见143/531ms（另一次904ms） | 通过该代表路线；B01/B02旧窗口边界仍保留 |
| Markdown 列表 | 真实助手预览发现，再用测试专用网络fixture定向复核浅/深两主题 | 失败，B04 |
| 关闭 Thinking | 正式模型选项label操作并确认关闭，发送真实任务 | 失败，B03；请求发出前失败，不声称供应商API失败 |

取证修正：第一个中文指定词可能提前存在于思考中，不能用其0ms数字证明新增索引；随机字符串样例也在思考中预列，早期raw JSON的逐chunk检索不够严格，已判为无效计时证据。最终使用英文故事的新词，基线同时检查原始事件与按kind拼接后的完整思考/正文，以上1797ms来自这一有效轮次。测试脚本的占位行、容器选择器、隐藏checkbox点击错误均为验收工具问题，不作产品缺陷。

新词搜索时先过滤掉不匹配助手行、后重新出现，因此该轮样本sameNode=false属于主动筛选的预期生命周期，**不能记为纯流式节点稳定性通过，也不是流式重挂载Bug**。原脚本该计数record默认pass=true，最终解读以本说明及 `real-provider-novel-search-assessment.json` 为准；原始JSON保留。纯流式稳定性采用前述543次真实采样和2000chunk回放/测试。

`execution-summary.md`两项必须手工检查现均已有真实界面执行证据：真实Provider路线由原生操作与上述Electron自动化合并覆盖；12秒长会话回放、持续滚动及搜索由真实浏览器自动化覆盖。原生CUA未重复全部fixture帧与时间轴手势这一工具边界仍明确保留，不将浏览器结果冒充原生操作。平滑度有O01，故“执行覆盖完成”不等于所有期望都通过。

## 收尾核对

- 未修复、未提交、未推送；只新增本验收记录，测试脚本与截图留在独立临时/产物目录。
- 原生Electron恢复原浅色，测试草稿已清理；Chrome调用/时长和原窗口尺寸恢复。只关闭本次独立启动的Chrome与隔离Electron，保留原Chrome、Vite与原Electron开发服务；隔离数据与临时凭据均已删除。
- 36个相关源码文件的SHA256与mtime均和续验前相同，`git status --short --branch --untracked-files=all`与续验基线一致；记录文件已存在于续验基线中。
- `git diff --check`、`pnpm check:current-docs`通过。产品源码未变化，未重复全套工程测试。
- 最终结论：**验收执行与A1–A8覆盖完成，整体未通过。B01/B02（待复核）/B03/B04与O01/I01已汇总，交后续统一修复；本轮没有修复、提交或推送。**
