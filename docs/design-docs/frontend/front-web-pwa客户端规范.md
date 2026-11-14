# Web / PWA 客户端规范

`apps/web` 是 ActSpace 的浏览器客户端：一套响应式代码，手机竖屏单栏、浏览器宽屏两栏；支持 PWA（手机「添加到主屏幕」后全屏使用）；直连部署在服务器上的 `agent-host`（`actspace-agent host serve`），不经过本机桌面端，也不经过中转服务。主要场景是不在电脑前时看进度、处理审批、派新任务，复杂工作仍回桌面端。视觉是「轻玻璃」（iOS 原生感，手机优先）。本机联调和手机访问步骤见 [apps/web/README.md](../../../apps/web/README.md)。

## 1. 与桌面前端共用的规则

`apps/web` 是第二个前端入口，规则与 desktop renderer 相同：

- 样式与组件检查：`pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 同时扫描 `apps/web/src`；原生 `<button>`、`createPortal`、`role="dialog"` 只允许出现在 `apps/web/src/ui/`，其余基线为 0。颜色硬约束、token 规则见 [front-视觉token规范.md](front-视觉token规范.md)，组件与弹层模式见 [front-组件与交互模式规范.md](front-组件与交互模式规范.md)。
- token：从 `apps/desktop/src/renderer/styles/tokens.css` 复制 web 用到的部分到 `apps/web/src/styles/tokens.css`，变量名保持 `--act-*`，文件头写明来源和同步要求；不新建共享 token 包（等第三个消费者出现再抽）。web 专用 token（玻璃材质、`--text-act-base`、`--radius-act-sheet`）只在 web 内定义。Tailwind 4 与桌面端同一种 `@theme inline` 写法。
- 提交前验证：`pnpm --filter @actspace/web typecheck` / `test` / `build`，加上 token 与主题检查；真机（iPhone Safari，Tailscale 方式）与浏览器 390×844 / 1440×900 浅色深色走一遍：连接、列表、新建、详情、审批、排队、停止、模式、模型。

## 2. 范围

| 做 | 说明 |
| --- | --- |
| 连接服务器 | 输入地址和配对码，换取设备 token；之后自动恢复连接 |
| 会话列表 | 一台 Host 上全部未归档会话，按更新时间分组；可展开已归档 |
| 会话详情 | 用户消息、助手回复（Markdown）、思考、过程折叠、文件改动 diff、Bash、待办、错误、状态行 |
| 产物下载 | 成功 write / edit / present 的结构化产物可下载；复用 Host 授权快照和分块读取，不提供任意路径文件浏览 |
| 输入框 | 发送、停止、运行中排队（可撤回）、模式（Agent / Plan / Chat）、模型和推理强度 |
| 审批 | 运行 / 本会话允许（有授权建议时）/ 拒绝；拒绝后引导补充说明 |
| 新建会话 | 选工作区（Host 发布的列表），写第一条消息，创建后进入会话 |
| 主题 | 跟随系统 / 浅色 / 深色 |
| PWA | manifest、图标、离线外壳、版本更新提示 |

不做：桌面端独有能力（终端、Git Review、文件树、浏览器、右侧面板、轨迹页、Space / 多智能体）；附件和图片上传（`uploads.*`）、`@` 文件引用、斜杠命令（输入框左侧不放 [+] 的附件入口）；多台 Host 同时连接（只保存一台，数据结构按 Host 列表设计）；推送通知、本机桌面端中转、公网中转服务；在手机上注册新工作区（工作区只来自 Host 配置）；列表里的分支名和 `+N −N`（Host 会话摘要不提供）；设置页的 Host 版本、检查更新、审批提醒（无数据来源）；搜索 / 筛选按钮。

## 3. 架构

```text
手机 / 浏览器
  apps/web（Vite + React 18 + Tailwind 4）
    connection/   HostClient(@actspace/client/host) + 浏览器 WebSocket，配对、恢复、重连
    sessions/     ClientSessionStore、projectChatWindow(@actspace/client/sessions)
    live/         流式折叠(@actspace/client/live)
    ui/           组件
        │  wss://<host>/rpc   JSON-RPC 2.0，token 在连接后用 auth.resume 传
        ▼
  agent-host  HostGateway
    GET /*     返回 webRoot 下的静态文件，未知路径回退 index.html
    WS  /rpc   现有 RPC
```

- `apps/web` 直接说 Host 协议，**不复用**桌面端的 `desktopBridgeContract` / `buildBridge`（那层是 Electron IPC 到 Host RPC 的翻译）。复用共享包，不从别的 app 深引用源码（`scripts/check-package-boundaries.mjs` 禁止跨 workspace 引用 `/src/`）。
- 复用：RPC 客户端 `@actspace/client/host` 的 `HostClient`（接受浏览器 `WebSocket`）；协议常量与类型 `@actspace/shared/host-protocol`、`runtime-v2`；会话投影、消息块、工具摘要 `@actspace/client/sessions`、`@actspace/shared/session-selectors`；流式折叠 `@actspace/client/live`（桌面端同用）；模型推理档位 `@actspace/shared/model-catalog-data`，判定方式与桌面端远端路径一致。

## 4. 连接与配对

**首次连接**：打开 Host 地址（PWA 同源托管，页面没有 token）进入「连接你的服务器」页；地址栏默认填当前页面 origin，可改；用户在服务器上执行 `actspace-agent host pair --config <path>`，把配对码（10 分钟有效）填进来；客户端连接 `wss://<host>/rpc`，依次调用 `host.hello { protocol: "actspace-host/1" }` 和 `auth.pair { code, name }`（`name` 默认「浏览器 + 系统」，如「Safari · iPhone」）；拿到 `{ hostId, deviceId, token }` 存入 `localStorage["actspace.web.hosts"]`，进入会话列表。

```ts
type SavedHost = { hostId: string; deviceId: string; url: string; token: string; name: string; pairedAt: string };
type SavedHosts = { version: 1; activeHostId: string; hosts: SavedHost[] }; // 目前只会有一项
```

**之后的连接**：启动时 `auth.resume { token }` 并校验返回的 `hostId`（`HostClient.authenticate` 的 `expectedHostId`）；断线指数退避重连 1s、2s、4s…最长 30s，页面回到前台（`visibilitychange`）或网络恢复（`online`）时立即重连一次。关闭码 4003 或 `REVOKED`：清 token 回连接页，提示「这台设备已在服务器上被移除」；`UNAUTHENTICATED`：同上，提示「登录已失效，请重新配对」；`MAINTENANCE` / `RECOVERY_BLOCKED`：保持连接，顶部显示「服务器维护中，暂时不能发送」，读操作照常。

**连接状态位置**：列表页标题胶囊下方一行小字 `● my-server`（绿点已连接、琥珀闪烁重连中、灰点已断开）；详情页输入框上方状态行断线时显示「已断开，正在重连…」，发送不可用，草稿保留。

**产物下载边界**：每轮交付区在过程折叠后仍展示成功工具的产物，只接受投影提供的 `outputRelativePath`，不从助手文本、diff 或展示用绝对路径构造入口；失败、拒绝、运行中和无结构化元数据的旧记录不产生下载能力。点击时调用 `files.reference { sessionId, path }` 创建当前文件的不可变快照（是点击时的内容，不是工具执行时的历史版本），再仅以 `sessionId/artifactId` 调 `artifacts.read`；Host 负责已发布工作区、真实路径、符号链接、Session 归属和 20 MiB 上限；Web 分配内存前检查大小，按协议分块并核对每块及整文件 SHA-256，验证后才交给浏览器保存，一律用 attachment Blob，不能打开或执行 HTML / SVG。下载中禁用重复操作，失败原位展示原因并可重试，离线禁用，切换会话、连接或卸载时丢弃未完成结果；显示快照大小，「已请求保存」只表示已交给浏览器。不在 Service Worker 或 localStorage 缓存产物字节或下载能力。

## 5. 部署与 HTTPS

PWA 必须运行在安全上下文（HTTPS 或 `localhost`），否则 Service Worker 和「添加到主屏幕」不可用。Host 配置新增 `webRoot`：

```jsonc
{
  "listen": { "address": "127.0.0.1", "port": 4317 },
  "allowedOrigins": ["https://my-server.tailnet-name.ts.net"],
  "webRoot": "/opt/actspace/web"   // apps/web 的构建产物目录；不填则不托管页面
}
```

- `webRoot` 必须是已存在的目录；静态响应只处理 `GET` / `HEAD`，解析后路径必须在 `webRoot` 内，否则 404。带 hash 的 `/assets/*` 缓存一年并 `immutable`；`index.html`、`sw.js`、`manifest.webmanifest` 一律 `no-cache`。
- 所有静态响应带 `Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'` 与 `X-Content-Type-Options: nosniff`。
- **页面自己的 origin 也必须写进 `allowedOrigins`**，否则页面能打开但连不上 `/rpc`；`host check` 在设置了 `webRoot` 而 `allowedOrigins` 为空时提示。Host 只在监听回环地址时才额外放行 `http://localhost:*` 与 `http://127.0.0.1:*`（本机开发）。
- 三种部署：本机开发（Host 监听 `127.0.0.1` 不开 TLS，`pnpm --filter @actspace/web dev`，打开 `http://localhost:5173`）；手机测试推荐 Tailscale（Host 监听 `127.0.0.1`，`tailscale serve --bg --https=443 http://127.0.0.1:4317`，手机装 Tailscale 后打开 `https://<机器名>.<tailnet>.ts.net`，该地址写入 `allowedOrigins`）；正式公网（Caddy / Nginx 用自有域名签证书反代到 `127.0.0.1:4317`，必须转发 WebSocket 升级请求和 `Origin` 头）。Host 直接监听公网地址并配置 `tls` 仍可用，但证书要能被手机信任，不推荐自签。

## 6. 响应式布局

| 宽度 | 布局 |
| --- | --- |
| `< 1024px` | 单栏（手机）；768–1023px 也走单栏，内容区最宽 720px 并居中 |
| `≥ 1024px` | 两栏：左栏 360px 放首页（玻璃顶栏、会话列表、底部输入坞），右栏放会话详情，消息和输入框居中、最宽 760px |

宽屏差异只有这些：详情页不显示返回按钮，左栏当前会话行用 `selected` 背景；右栏无选中会话时显示「选择左侧的会话，或在左下角新建」；新建面板盖在右栏上；底部弹层（模型、模式、工作区）改为居中对话框，宽 420px，无拖动条；支持悬停态，Enter 发送、Shift+Enter 换行、Esc 关闭最上层弹层（手机上 Enter 只换行，用按钮发送）。

## 7. PWA

| 项 | 要求 |
| --- | --- |
| manifest | `name` / `short_name`「ActSpace」，`display: "standalone"`，`start_url` 与 `scope` 为 `/`，`background_color` 和 `theme_color` 取浅色背景 `#f7f7f5` |
| 图标 | 192、512、512 maskable 三个 PNG + 180px `apple-touch-icon`，图形为「A」品牌块 |
| iOS | `apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style: default`；`viewport-fit=cover`，顶栏与底部输入坞用 `env(safe-area-inset-*)` 避让 |
| 主题色 | `<meta name="theme-color">` 浅色、深色各一条 |
| Service Worker | 手写，不引入插件；只缓存应用外壳（`index.html` 与带 hash 的资源），**从不缓存 `/rpc`**；导航请求网络优先，失败回退缓存的 `index.html` |
| 离线 | 外壳能打开；连接状态显示「已断开」，不缓存会话内容 |
| 更新 | 新 SW 安装完成后底部弹出「有新版本 · 刷新」，用户点了才 `skipWaiting` 并刷新，不打断草稿 |
| 视口 | 高度用 `100dvh`；输入框获得焦点时用 `visualViewport` 保证在键盘上方 |

## 8. 页面与数据

### 8.1 会话列表

- 数据：`sessions.list` 取全部会话，前端按 `metadata.archived` 分未归档 / 已归档，按 `updatedAt` 倒序；`host.observe` 订阅 Host 频道：`sessions-changed` 时重拉（300ms 去抖），`approvals` 更新待审批集合，`{ kind: "activity", sessionId, running }` 更新运行中状态（Host 在初始快照中包含当前运行中的会话）。工作区名用会话 `workspaceRoot` 匹配 `host.describe().workspaces[].path`，匹配不到显示路径最后一段。
- 分组（对齐桌面侧栏）：最上面「需要处理」（等审批、未读，带数量；Host 没有「失败」状态，故不含失败），其余按 `updatedAt` 分「今天 / 昨天 / 近 7 天 / 本月更早」，再往前按月（跨年写「YYYY 年 N 月」）。每组是圆角 12 的 inset 分组，行间 0.5px 分隔线（从标题起缩进）。
- 行（48px 单行）：左侧 16px 状态位（等审批琥珀闪烁点、运行中转圈、未读绿点、否则留空）；标题 15px（未读加粗、等审批或运行中正文色、其余 muted）+ 工作区名（12px，最多 38% 宽）；右侧时间（今天时分、本周周几、更早月/日），等审批时换成琥珀色「待审批」。未读：本机 `localStorage` 记每个会话最后一次在前台查看时的 `updatedAt`，会话 `updatedAt` 更新且不是当前会话即未读，只在本机生效。底部「已归档 N」展开后单独一组。
- 顶栏：左品牌圆钮（点击滚动到顶部）、中间「会话」胶囊（下方「● 服务器 · 在线」）、右设置圆钮。设置页是 inset 分组：服务器（地址、状态、本设备）、外观（系统 / 浅色 / 深色分段）、关于（网页版本），最下面单独一组红色「断开并移除」及说明。底部输入坞是 50px 玻璃胶囊「开始新会话… · 📁 最近工作区 · 发送」，点击打开新建弹层。

### 8.2 新建会话

- 弹层「新会话」：「工作区」横向芯片、两层输入框（占位「描述你要做的事…」，＋ 选模式、模型、发送），底部「在 my-server 上运行 · 需要时会请你审批」。工作区来自 `host.describe().workspaces`，默认最近一次新建用过的（`localStorage`），没有则第一个。
- 发送：`sessions.create { workspaceId, agentForm: mode === "Chat" ? "chat" : "agent" }`；然后模式非默认时 `sessions.update { patch: { mode, expectedRevision } }`；选过模型或推理档位时 `tasks.command { op: "configure" }`；最后 `tasks.submit` 并进入会话。创建过程中输入卡片换成进度行「在 my-server 上创建会话… → 启动 Agent… → 打开会话…」；任何一步失败，面板保持打开、草稿保留并显示错误原因。

### 8.3 会话详情

- 进入时 `sessions.observe { sessionId }` 拿 `{ observation, tasks, approvals, output }` 快照交给 `ClientSessionStore`；`output` 是 Host 实时底稿的 `{ runId, revision }`，运行中时用 `sessions.output { sessionId, runId, afterRevision }` 按 revision 分页回放未定稿的正文，跳过投影里已定稿的消息，再以 `live_output_baseline` 灌入实时运行（[流式输出只走实时通道](../agent-plugin-runtime/agent-spec-live-assistant-stream.md) §5）；之后 `host.event` 按 `value.kind` 分发：`projection` 喂 store，`live` 喂流式折叠，`tasks` 更新运行和排队，`approvals` 更新审批卡。离开时 `sessions.unobserve`；向上滚到顶用 `sessions.page { beforeSeq }` 加载更早消息；重连后重新 `sessions.observe`，`epoch` 变化时整体替换快照不合并。
- 渲染：时间线按轮次拆分（规则对齐桌面端 `turns.ts`）：用户消息开一轮；末尾连续的助手回复是「回复」，之前的思考、工具和中间旁白是「过程」；错误和状态提示在最后；上下文压缩单独一轮。进行中的一轮过程逐行展开，等模型首个输出时显示扫光「思考中」；已完成的一轮过程折叠成一行「Worked for 1m 12s」，回复在外面，其后是改动卡（成功写入的文件按路径合并，「已编辑 N 个文件 +A −D」，只来自真实 diff 块）和尾栏（复制、时间、用量胶囊「用量 88K tok」，仅回复带 `assistant.usage` 时显示，点开「本轮用量」弹层：提供方 / 模型、缓存命中、未缓存输入、缓存读取、缓存写入、输出（其中推理）、花费（预估 / 未知 / 部分未知），与桌面端一致）。
- 过程行没有图标，动作 + 浅色目标，动作用英文，与桌面端一致：

| `MessageBlock.kind` | 显示 |
| --- | --- |
| `user` | 右对齐气泡，背景 `surface`，圆角 18 |
| `assistant` | 无气泡正文，15px / 1.65，Markdown；代码块带语言名和复制按钮 |
| `thinking` | 「思考中」（扫光）/「思考过程」，点开看内容 |
| `read` / `grep` / `glob` / `search` / `web_search` | 每条一行：`Read 路径 L10-40`、`Grep 模式 in 范围`、`Glob …`、`Searched web …` |
| `edit_diff` / `write_diff` | 「编辑 / 写入 文件名 +N −N」，点开看 diff，超过 12 行折叠「还有 N 行」；被拒绝时动作是 `Denied` |
| `bash` | `Running / Ran / Failed / Denied / Expired / Cancelled` + 命令 + 徽标（沙盒 / 真实环境 / 未执行）；运行中显示计时；点开是 `# 意图`、`$ 命令`、`# 目录 · 环境` 和输出（`sessions.output`） |
| `todo` | 卡片「任务清单 2/3」和条目，完成项划线 |
| `error` | 浅红底：标题 + 原因 |
| `status`、`context_compaction` | 灰色小字 / 分隔线 |
| 其他 | `Listed` / `Deleted` / `Analyzed` / `Generated image` / `Presented` / `Agent` + 摘要 |

- 顶栏：返回圆钮（宽屏不显示）、标题胶囊（会话标题 + 工作区名）。Markdown 只渲染 CommonMark + GFM 表格和代码块，不渲染 HTML，链接只放行 `https:`、`http:`、`mailto:` 并在新标签页打开；Mermaid 不渲染，显示为代码块。

### 8.4 审批

- 数据来自会话快照和 `approvals` 事件里的 `ApprovalRequest`；卡片放在时间线里，挂在对应工具条目之后（按条目 key），等审批的命令由卡片代替那一行，找不到对应条目的放最后一轮末尾。
- 样式与桌面端一致：一个框，卡上方不加文字行（「等待审批」只在容器 `aria-label`）；卡头图标 + 动作（运行命令 / 写入文件 / 删除文件）+ 目标；命令块带 `$ ` 提示符；底栏左边「沙盒 / 真实环境 · 目录」（知道时才显示），右边胶囊按钮：「拒绝」（ghost）、「本会话允许 `<前缀>`」（tonal，仅有 `command_prefix` 授权建议时显示，前缀用 `getCommandPrefixGrant` 同样规则从 `grantSuggestions` 取）、主操作「运行」（删除类用危险色「删除」）。
- 点击调用 `approvals.decide { sessionId, requestId, kind, suggestionId? }`；请求期间按钮不可用并在被点按钮上转圈；成功后被选中的按钮打勾、其余降到 45% 不透明度；失败恢复可用并在卡下方显示原因。拒绝后输入框占位变「告诉 Agent 应该怎么做…」并自动聚焦；待审批时输入框上方状态行显示琥珀色「● 等待确认」。

### 8.5 输入框

- 浮动玻璃输入框：短输入时单行 `[＋][文本][模型 · 档位][发送]`，圆角 24；输入变长、非 Agent 模式、拒绝后说明时变上下两层（文本在上），圆角 18。＋ 打开弹层：模式（Agent / Plan / Chat，各有图标和一句说明）和「添加 · 图片或文件（后续版本）」；非 Agent 模式在 ＋ 后显示可关闭的模式芯片，发送钮跟模式着色（Plan 琥珀、Chat 翡翠）。发送钮 34px：没字时浅灰 tonal，有字实心，停止是实心方块。
- 占位：Agent「继续追问…」、Plan「描述要规划的改动…」、Chat「问点什么…」；拒绝后「告诉 Agent 应该怎么做…」；断开「已断开，正在重连…」；维护中「服务器维护中，暂时不能发送」。
- 上方状态行（12px 浅色）：等待确认 / 转圈「运行中 · 12s」/ 断开 / 维护中 / 空闲时「🖥 服务器名」；右侧上下文用量环（Host 给出 `contextSnapshot.percentUsed` 时才显示）。Host 没有 TTFT / TPS 数据，不显示统计胶囊。
- 主按钮：有文字是发送；没文字且正在运行或等待审批是停止；其余置灰。发送 `tasks.submit { sessionId, submissionId, content }`，`submissionId` 用 `crypto.randomUUID()`，重试沿用；停止 `tasks.command { op: "stop", runId }`。
- 运行中发送由 Host 排进队列（`TaskSnapshot.queue`），排队消息显示在输入框上沿的玻璃托盘（每条一行，右侧垃圾桶「撤回」，调用 `tasks.command { op: "cancel", taskId, revision }`）；不做「↳ 插入」。
- 模式：底部弹层列出 Agent / Plan / Chat，选中调用 `sessions.update`；`CONFLICT` 时重取 revision 再试一次，仍失败则提示。模型与推理档位：底部弹层按供应商分组列出 `host.describe().models`，下方推理档位分段控件，仅当该模型在目录里支持档位时才显示；变更调用 `tasks.command { op: "configure", configuration: { model, reasoningEffort } }`。草稿按会话存 `sessionStorage`。

## 9. 视觉

- 玻璃材质：`--web-glass` / `--web-glass-strong`，浅色 `rgba(255,255,255,.72)` / `.9`，深色 `rgba(36,37,34,.72)` / `.92`，配合 `backdrop-filter: blur(18px) saturate(1.6)`；不画实线边框，用 0.5px `--web-glass-edge` 描边 + `--web-glass-shadow` 柔和投影；弹层 blur 24；不支持 `backdrop-filter` 回退 `--act-color-surface`。
- 列表和设置用 iOS 式 inset 分组（`surface` 底、圆角 12、0.5px 缩进分隔线）；顶栏是 36px 玻璃圆钮 + 标题胶囊，下方渐隐。手机正文 15px、标题 16px（`--text-act-base`），与桌面聊天正文同一档。图标 `lucide-react`。
- 状态色：运行中 operational 翡翠绿；等待审批 warning 琥珀；未读 success 绿点；错误 danger 红。可点区域不小于 44×44px；列表行按下显示 `hover` 背景。

## 10. 安全

- 设备 token 等于这台 Host 的完整访问权，存在 `localStorage`：页面不加载任何第三方脚本；CSP 见 §5；Markdown 不渲染 HTML；不用 `dangerouslySetInnerHTML`（代码高亮除外，且只能用转义后的文本）。
- 不在浏览器里保存任何模型 API Key（Key 只在服务器环境变量里）。设备管理沿用 Host CLI：`host devices` 查看，`host revoke --device <id>` 吊销，吊销后已连接页面立即断开并回到连接页。`allowedOrigins` 只放行明确写出的 origin，回环 http 放行只在 Host 监听回环地址时生效。

## 11. 错误与空状态

| 情况 | 显示 |
| --- | --- |
| 配对码错误或过期 | 连接页字段下方「配对码无效或已过期，请在服务器上重新生成」 |
| 地址连不上 | 「连不上 `<地址>`：请确认 Host 在运行、地址是 HTTPS，且这个页面的地址已写入 `allowedOrigins`」 |
| 被限流（`LIMIT_EXCEEDED`） | 「尝试太频繁，请一分钟后再试」 |
| 列表为空 | 「还没有会话，在下面写一句话开始」 |
| RPC 失败 | 在触发位置就近显示原因（审批卡下方、输入框上方、新建面板内），不只打控制台 |
