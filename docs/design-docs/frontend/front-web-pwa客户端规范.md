# Web / PWA 客户端规范

> 状态：已实施（2026-10-17，`apps/web`，分支 `feat/web-mobile`）。D1–D4 已由用户确认，见 §3；浏览器验收已完成，真机（iPhone + Tailscale）验收待用户执行。
> 原型：结构沿用 [mobile-web-demo.html](mobile-web-demo.html) 的 **V1 · Happy 原生移植**（含「V1 宽屏」）。2026-10-18 视觉改为 [mobile-web-v2-demo.html](mobile-web-v2-demo.html) 的 **B · 轻玻璃**（iOS 原生感，手机优先），已实施；下文 §9、§10 按 B 描述。V2、V3 及 v2 demo 里的 A 只做对比保留。
> 参考：[slopus/happy](https://github.com/slopus/happy) `packages/happy-app`（Expo，手机端和 Web 共用一套组件）。
> 执行计划：[20261017-web-pwa-client](../../exec-plans/active/20261017-web-pwa-client.md)。

## 1. 定位

ActSpace 新增一个浏览器客户端 `apps/web`：

- 一套响应式代码：手机竖屏是 V1 单栏，浏览器宽屏是两栏。
- 支持 PWA，手机上「添加到主屏幕」后全屏使用。
- 直连部署在服务器上的 `agent-host`（`actspace-agent host serve`），不经过本机桌面端，也不经过中转服务。
- 主要场景是不在电脑前时看进度、处理审批、派新任务。复杂工作仍回桌面端。

## 2. 范围

### 做

| 功能 | 说明 |
| --- | --- |
| 连接服务器 | 输入地址和配对码，换取设备 token；之后自动恢复连接 |
| 会话列表 | 一台 Host 上全部未归档会话，平铺，按更新时间倒序；可展开已归档 |
| 会话详情 | 用户消息、助手回复（Markdown）、思考、探索分组、文件改动 diff、Bash、待办、错误、状态行 |
| 输入框 | 发送、停止、运行中排队（可撤回）、模式（Agent / Plan / Chat）、模型和推理强度 |
| 审批 | 运行 / 本会话允许（有授权建议时）/ 拒绝；拒绝后引导补充说明 |
| 新建会话 | 选工作区（Host 发布的列表），写第一条消息，创建后进入会话 |
| 主题 | 跟随系统 / 浅色 / 深色，配色与桌面端同一套 token |
| PWA | manifest、图标、离线外壳、版本更新提示 |

### 不做（v1）

- 桌面端独有能力：终端、Git Review、文件树、浏览器、右侧面板、轨迹页、Space / 多智能体。
- 附件和图片上传（`uploads.*`）、`@` 文件引用、斜杠命令。输入框左侧不放 [+]。
- 多台 Host 同时连接。v1 只保存一台；数据结构按「Host 列表」设计，后续可以加。
- 推送通知、本机桌面端中转、公网中转服务。
- 在手机上注册新工作区。Host 没有对应 RPC，工作区只来自 Host 配置文件。
- 列表里的分支名和 `+N −N` 改动统计。Host 的会话摘要不提供这两项，原型里的这部分不实施。

## 3. 决策

### 已确认（用户，2026-10-17）

1. 形态：浏览器 Web + PWA，不做原生 App。
2. 视觉与交互：V1（Happy 原生移植），沿用桌面端配色。
3. 响应式：手机和浏览器宽屏一套代码；宽屏两栏布局按 §7 的推荐，不参考桌面端布局。
4. 功能范围：宽屏和手机完全一致，不加桌面端独有功能。
5. 代码位置：新建 `apps/web`。

### 技术决策（2026-10-17 用户确认）

| 编号 | 问题 | 推荐 | 不选的方案和原因 |
| --- | --- | --- | --- |
| D1 | PWA 静态文件由谁托管 | `agent-host` 在同一端口同源托管 `apps/web` 的构建产物（新增配置 `webRoot`） | 单独部署到别的域名：要多一张证书、多一个 `allowedOrigins` 条目，还要处理跨域缓存；同源只需打开 Host 地址 |
| D2 | 本机开发时 Vite 页面是 `http://localhost:5173`，Host 只放行 `https://` 来源 | Host 只在监听回环地址时，额外接受 `http://localhost:*` 和 `http://127.0.0.1:*` 来源 | 开发也走 HTTPS：每个开发者都要配本机证书；在 Vite 代理里改写 `Origin`：等于绕过 Host 的来源检查 |
| D3 | 流式输出的折叠逻辑在桌面端里（main 的 `FixedRendererStreamAdapter`，renderer 的 `live-runs/`），浏览器用不了 | 把这两部分的纯逻辑提到 `@actspace/client` 的新出口 `./live`，桌面端和 Web 共用；桌面端行为不变 | Web 复制一份：两份流式逻辑会越走越远；v1 不做流式、只等落盘结果：回复要整段出来，体验明显比 Happy 差 |
| D4 | 手机在局域网测试时信任哪张证书 | Tailscale：Host 监听 `127.0.0.1`，`tailscale serve` 提供 `*.ts.net` 的有效 HTTPS 证书；手机装 Tailscale 即可，离开局域网也能用 | mkcert：要把根证书装进手机并手动信任，每台设备都要做；Caddy + 自有域名：适合以后正式公网部署，写进部署文档作为第二种方式 |

## 4. 架构

```text
手机 / 浏览器
  apps/web（Vite + React 18 + Tailwind 4）
    connection/   HostClient(@actspace/client/host) + 浏览器 WebSocket，配对、恢复、重连
    sessions/     ClientSessionStore、projectChatWindow(@actspace/client/sessions)
    live/         流式折叠(@actspace/client/live，D3)
    ui/           V1 组件
        │  wss://<host>/rpc   JSON-RPC 2.0，token 在连接后用 auth.resume 传
        ▼
服务器
  agent-host  HostGateway(packages/agent-host/src/server.ts)
    GET /*     返回 webRoot 下的静态文件，未知路径回退 index.html（D1）
    WS  /rpc   现有 RPC，不新增业务方法（§9 的会话活动推送除外）
```

原则：

- `apps/web` 直接说 Host 协议，**不复用**桌面端的 `desktopBridgeContract` / `buildBridge`。桌面端那层是 Electron IPC 到 Host RPC 的翻译，浏览器不需要。
- 复用共享包，不从别的 app 深引用源码。`scripts/check-package-boundaries.mjs` 禁止跨 workspace 引用 `/src/`。

| 复用 | 来源 |
| --- | --- |
| RPC 客户端（请求 id、超时、大帧分页、事件顺序） | `@actspace/client/host` 的 `HostClient`（`packages/client/src/host/client.ts`），它接受浏览器 `WebSocket` |
| 协议常量和类型 | `@actspace/shared/host-protocol`、`@actspace/shared/runtime-v2` |
| 会话投影、消息块、工具摘要 | `@actspace/client/sessions`（`projectChatWindow`、`ClientSessionStore`、`toolPreview`），`@actspace/shared/session-selectors`（`createMessageBlocks`） |
| 消息块类型 | `@actspace/shared` 的 `MessageBlock`（`packages/shared/src/session.ts`） |
| 流式折叠 | `@actspace/client/live`（D3 新增） |
| 模型推理档位 | `@actspace/shared/model-catalog-data`；判定方式与桌面端远端路径一致（`apps/desktop/src/renderer/components/composer/use-composer-model.ts`） |

## 5. 连接与配对

### 首次连接

1. 用户打开 Host 地址（D1 下就是 PWA 自己的地址），页面上没有 token，进入「连接你的服务器」页。
2. 地址栏默认填当前页面的 origin，可以改。
3. 用户在服务器上执行 `actspace-agent host pair --config <path>`，把输出的配对码填进来。配对码 10 分钟内有效。
4. 客户端连接 `wss://<host>/rpc`，依次调用 `host.hello { protocol: "actspace-host/1" }` 和 `auth.pair { code, name }`。`name` 默认取「浏览器 + 系统」，例如「Safari · iPhone」。
5. 拿到 `{ hostId, deviceId, token }`，存入 `localStorage` 的 `actspace.web.hosts`（结构见下）。进入会话列表。

```ts
type SavedHost = { hostId: string; deviceId: string; url: string; token: string; name: string; pairedAt: string };
type SavedHosts = { version: 1; activeHostId: string; hosts: SavedHost[] }; // v1 只会有一项
```

### 之后的连接

- 启动时用 `auth.resume { token }`，并校验返回的 `hostId` 与保存的一致（`HostClient.authenticate` 的 `expectedHostId`）。
- 断线后指数退避重连：1s、2s、4s…，最长 30s。页面回到前台（`visibilitychange`）或网络恢复（`online`）时立即重连一次。
- 关闭码 4003（设备被吊销）或返回 `REVOKED`：清掉 token，回到连接页，提示「这台设备已在服务器上被移除」。
- 返回 `UNAUTHENTICATED`：同上，提示「登录已失效，请重新配对」。
- 返回 `MAINTENANCE` / `RECOVERY_BLOCKED`：保持连接，顶部显示「服务器维护中，暂时不能发送」；读操作照常。

### 连接状态在界面上的位置

- 列表页标题胶囊下方一行小字：`● my-server`。绿点表示已连接，琥珀色闪烁表示重连中，灰点表示已断开。
- 详情页输入框上方的状态行，断线时显示「已断开，正在重连…」，此时发送按钮不可用；草稿保留。

## 6. 部署与 HTTPS

PWA 必须运行在安全上下文里（HTTPS，或 `localhost`），否则 Service Worker 和「添加到主屏幕」都不可用。

### Host 配置（D1、D2 落地后）

```jsonc
{
  "listen": { "address": "127.0.0.1", "port": 4317 },
  "allowedOrigins": ["https://my-server.tailnet-name.ts.net"],
  "webRoot": "/opt/actspace/web",       // 新增：apps/web 的构建产物目录；不填则不托管页面
  "...": "其余字段不变"
}
```

- `webRoot` 必须是已存在的目录；静态响应只处理 `GET` / `HEAD`，解析后的路径必须在 `webRoot` 内，否则返回 404。
- 带 hash 的资源（`/assets/*`）缓存一年并标记 `immutable`；`index.html`、`sw.js`、`manifest.webmanifest` 一律 `no-cache`。
- 所有静态响应带 `Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`，并带 `X-Content-Type-Options: nosniff`。
- **页面自己的 origin 也必须写进 `allowedOrigins`**，否则页面能打开但连不上 `/rpc`。`host check` 在设置了 `webRoot` 而 `allowedOrigins` 为空时给出提示。

### 三种部署方式

| 场景 | 做法 | origin |
| --- | --- | --- |
| 本机开发（D2） | Host 监听 `127.0.0.1` 不开 TLS，`pnpm --filter @actspace/web dev`，浏览器打开 `http://localhost:5173` | `http://localhost:5173`，监听回环时自动放行 |
| 手机测试，推荐（D4） | Host 监听 `127.0.0.1`；服务器上执行 `tailscale serve --bg --https=443 http://127.0.0.1:4317`；手机装 Tailscale 后打开 `https://<机器名>.<tailnet>.ts.net` | 该 `ts.net` 地址，写入 `allowedOrigins` |
| 正式公网 | Caddy 或 Nginx 用自有域名签证书，反代到 `127.0.0.1:4317`，必须转发 WebSocket 升级请求和 `Origin` 头 | 自有域名，写入 `allowedOrigins` |

Host 直接监听公网地址并配置 `tls` 的方式仍然可用，但证书要能被手机信任，不推荐自签。

## 7. 响应式布局

| 宽度 | 布局 |
| --- | --- |
| `< 1024px` | 单栏，就是原型里的手机 V1。768–1023px（平板竖屏、窄窗口）也走单栏，内容区最宽 720px 并居中 |
| `≥ 1024px` | 两栏：左栏 360px 放 V1 首页（玻璃顶栏、会话列表、底部输入坞）；右栏放会话详情，消息和输入框居中、最宽 760px |

宽屏的差异只有这些，其余组件完全相同：

- 详情页不显示返回按钮；左栏当前会话行用 `selected` 背景标出。
- 右栏没有选中会话时显示空状态「选择左侧的会话，或在左下角新建」。
- 新建面板盖在右栏上，左栏仍可见。
- 底部弹层（模型、模式、工作区）改为居中对话框，宽 420px，没有拖动条。
- 支持悬停态；Enter 发送，Shift+Enter 换行；Esc 关闭最上层弹层。手机上 Enter 只换行，用按钮发送。

## 8. PWA

| 项 | 要求 |
| --- | --- |
| manifest | `name: "ActSpace"`，`short_name: "ActSpace"`，`display: "standalone"`，`start_url: "/"`，`scope: "/"`，`background_color` 和 `theme_color` 取浅色背景 `#f7f7f5`（`--act-color-bg` 的浅色值） |
| 图标 | 192、512、512 maskable 三个 PNG，外加 `apple-touch-icon` 180px；图形用原型里的「A」品牌块 |
| iOS | `<meta name="apple-mobile-web-app-capable">`、`apple-mobile-web-app-status-bar-style: default`；`viewport-fit=cover`，顶栏和底部输入坞用 `env(safe-area-inset-*)` 避让 |
| 主题色 | `<meta name="theme-color">` 浅色、深色各一条（`media="(prefers-color-scheme: dark)"`） |
| Service Worker | 手写，不引入插件。只缓存应用外壳（`index.html` 和带 hash 的资源），**从不缓存 `/rpc`**；导航请求网络优先，失败时回退缓存的 `index.html` |
| 离线 | 外壳能打开；连接状态显示「已断开」，列表和详情不缓存会话内容 |
| 更新 | 新 SW 安装完成后，页面底部弹出「有新版本 · 刷新」，用户点了才 `skipWaiting` 并刷新，避免打断正在输入的草稿 |
| 视口 | 页面高度用 `100dvh`；输入框获得焦点时用 `visualViewport` 保证输入框在键盘上方 |

## 9. 页面与数据

### 9.1 会话列表

数据：

- `sessions.list` 取全部会话（`RuntimeV2SessionListItem[]`），前端按 `metadata.archived` 分成未归档和已归档，按 `updatedAt` 倒序。
- `host.observe` 订阅 Host 频道：收到 `sessions-changed` 时重新拉 `sessions.list`（300ms 去抖）；收到 `approvals` 时更新待审批集合。
- 工作区名：用会话的 `workspaceRoot` 匹配 `host.describe().workspaces[].path`，匹配不到就显示路径的最后一段。
- **运行中状态需要 Host 补一个推送**：现在 `tasks` 快照只发到会话频道，列表拿不到。计划任务 A3 让 Host 在 Host 频道发 `{ kind: "activity", sessionId, running }`，并把当前运行中的会话放进 `host.observe` 的初始快照。

分组（B，对齐桌面侧栏）：最上面「需要处理」（等审批、未读，带数量），其余按 `updatedAt` 分到「今天 / 昨天 / 近 7 天 / 本月更早」，再往前按月（跨年写「YYYY 年 N 月」）。每组是一个圆角 12 的 inset 分组，行之间 0.5px 分隔线（从标题起缩进）。Host 没有「失败」状态，所以「需要处理」不含失败。

行内容（单行，48px）：

- 左侧 16px 状态位：等审批是琥珀色闪烁点，运行中是转圈，未读是绿点，否则留空。
- 标题 15px：未读加粗、等审批或运行中为正文色、其余 muted；后面跟工作区名（12px，最多 38% 宽）。
- 右侧时间（今天显示时分，本周显示周几，更早显示月/日）；等审批时换成琥珀色「待审批」。
- 未读：本机在 `localStorage` 记录每个会话最后一次在前台查看时的 `updatedAt`；会话 `updatedAt` 更新且不是当前打开的会话时视为未读。只在本机生效。
- 底部「已归档 N」，展开后已归档会话单独一个分组。
- 底部输入坞是一个 50px 的玻璃胶囊「开始新会话… · 📁 最近工作区 · 发送」，点击打开新建弹层。

顶栏：左边品牌圆钮（点击滚动到顶部），中间「会话」胶囊（下方是「● 服务器 · 在线」），右边设置圆钮。设置页是 inset 分组：服务器（地址、状态、本设备）、外观（主题分段：系统 / 浅色 / 深色）、关于（网页版本），最下面单独一组红色「断开并移除」和说明。Host 版本、检查更新、审批提醒没有数据来源，不显示；原型里的搜索 / 筛选按钮不实施。

### 9.2 新建会话

- 点底部输入坞打开「新会话」弹层：「工作区」横向芯片、两层输入框（占位「描述你要做的事…」，＋ 选模式、模型、发送），底部一行「在 my-server 上运行 · 需要时会请你审批」。
- 工作区来自 `host.describe().workspaces`，默认选最近一次新建用过的（`localStorage`），没有就选第一个。
- 发送：`sessions.create { workspaceId, agentForm: mode === "Chat" ? "chat" : "agent" }`，然后依次执行：
  1. 模式不是默认值时调用 `sessions.update { patch: { mode, expectedRevision } }`；
  2. 用户选过模型或推理档位时调用 `tasks.command { op: "configure" }`；
  3. 最后调用 `tasks.submit`，进入会话详情。
- 创建过程中输入卡片换成进度行「在 my-server 上创建会话… → 启动 Agent… → 打开会话…」。任何一步失败，面板保持打开、草稿保留，显示错误原因。

### 9.3 会话详情

数据：

- 进入时调用 `sessions.observe { sessionId }`，拿到 `{ observation, tasks, approvals, output }` 快照，交给 `ClientSessionStore`。
- 之后的 `host.event` 按 `value.kind` 分发：
  - `projection`：喂给 `ClientSessionStore`；
  - `live`：喂给流式折叠（`@actspace/client/live`）；
  - `tasks`：更新运行和排队状态；
  - `approvals`：更新审批卡。
- 离开会话时调用 `sessions.unobserve`。
- 向上滚动到顶部时用 `sessions.page { beforeSeq }` 加载更早的消息。
- 重连成功后重新 `sessions.observe`。`epoch` 变化时整体替换快照，不合并。

渲染（B）：时间线按轮次拆分，规则对齐桌面端 `turns.ts`：用户消息开一轮；末尾连续的助手回复是「回复」，之前的思考、工具和中间旁白是「过程」；错误和状态提示放在最后；上下文压缩单独一轮。

- 正在进行的一轮：过程逐行展开，等模型首个输出时显示扫光「思考中」。
- 已完成的一轮：过程折叠成一行「Worked for 1m 12s」（点开看全部），回复在外面；下面是改动卡（本轮成功写入的文件按路径合并，「已编辑 N 个文件 +A −D」，只来自真实的 diff 块），再下面是尾栏：复制、时间、用量胶囊「用量 88K tok」。用量胶囊只在回复带 `assistant.usage` 时显示，点开是「本轮用量」弹层（提供方 / 模型、缓存命中、未缓存输入、缓存读取、缓存写入、输出（其中推理）、花费（预估 / 未知 / 部分未知），与桌面端一致）。

过程行没有图标，动作 + 浅色目标，动作用英文和桌面端一致：

| `MessageBlock.kind` | 显示 |
| --- | --- |
| `user` | 右对齐气泡，背景 `surface`，圆角 18 |
| `assistant` | 无气泡正文，15px / 1.65，Markdown；代码块带语言名和复制按钮 |
| `thinking` | 「思考中」（扫光）/「思考过程」，点开看内容 |
| `read` / `grep` / `glob` / `search` / `web_search` | 每条一行：`Read 路径 L10-40`、`Grep 模式 in 范围`、`Glob …`、`Searched web …` |
| `edit_diff` / `write_diff` | 「编辑 / 写入 文件名 +N −N」，点开看 diff，超过 12 行折叠「还有 N 行」；被拒绝时动作是 `Denied` |
| `bash` | `Running / Ran / Failed / Denied / Expired / Cancelled` + 命令 + 徽标（沙盒 / 真实环境 / 未执行）；运行中显示计时；点开是 `# 意图`、`$ 命令`、`# 目录 · 环境` 和输出（`sessions.output`） |
| `todo` | 卡片：「任务清单 2/3」和条目，完成项划线 |
| `error` | 浅红底：标题 + 原因 |
| `status`、`context_compaction` | 灰色小字 / 分隔线 |
| 其他 | `Listed` / `Deleted` / `Analyzed` / `Generated image` / `Presented` / `Agent` + 摘要 |

顶栏：返回圆钮（宽屏不显示）、标题胶囊（会话标题 + 工作区名）。

Markdown：只渲染 CommonMark + GFM 表格和代码块，不渲染 HTML，链接只放行 `https:`、`http:`、`mailto:`，并在新标签页打开。Mermaid 不渲染，显示为代码块。

### 9.4 审批

- 数据来自会话快照和 `approvals` 事件里的 `ApprovalRequest`。
- 卡片放在时间线里，挂在对应工具条目之后（按条目 key）；等审批的命令由卡片代替那一行。找不到对应条目的放在最后一轮末尾。
- 样式与桌面端一致：上方琥珀色「● 等待确认」；卡头图标 + 动作（运行命令 / 写入文件 / 删除文件）+ 目标；命令块带 `$ ` 提示符；底栏左边是「沙盒 / 真实环境 · 目录」（知道时才显示），右边胶囊按钮：
  1. 「拒绝」（ghost）；
  2. 「本会话允许 `<前缀>`」（tonal）：只在有 `command_prefix` 授权建议时显示，前缀用 `getCommandPrefixGrant` 同样的规则从 `grantSuggestions` 取；
  3. 主操作「运行」，删除类用危险色「删除」。
- 点击后调用 `approvals.decide { sessionId, requestId, kind, suggestionId? }`。请求期间按钮不可用，并在被点的按钮上转圈。成功后被选中的按钮打勾，其余降到 45% 不透明度。失败时恢复按钮可用，并在卡片下方显示原因。
- 拒绝后输入框占位文字变为「告诉 Agent 应该怎么做…」并自动聚焦。
- 待审批时，输入框上方状态行显示琥珀色「● 等待确认」。

### 9.5 输入框

- 浮动玻璃输入框：短输入时单行 `[＋][文本][模型 · 档位][发送]`，圆角 24；输入变长、非 Agent 模式、拒绝后说明时变成上下两层（文本在上），圆角 18。
- ＋ 打开弹层：模式（Agent / Plan / Chat，各有图标和一句说明）和「添加 · 图片或文件（后续版本）」。非 Agent 模式在 ＋ 后显示可关闭的模式芯片，发送钮跟着模式着色（Plan 琥珀、Chat 翡翠）。
- 发送钮 34px：没字时浅灰 tonal，有字时实心，停止是实心方块。
- 占位：Agent「继续追问…」、Plan「描述要规划的改动…」、Chat「问点什么…」；拒绝后「告诉 Agent 应该怎么做…」；断开「已断开，正在重连…」；维护中「服务器维护中，暂时不能发送」。
- 上方状态行（12px 浅色）：等待确认 / 转圈「运行中 · 12s」/ 断开 / 维护中 / 空闲时「🖥 服务器名」；右侧上下文用量环（Host 给出 `contextSnapshot.percentUsed` 时才显示）。Host 没有 TTFT / TPS 数据，不显示统计胶囊。
- 主按钮规则：
  - 有文字时是发送；
  - 没文字且正在运行或等待审批时是停止；
  - 其余情况置灰。
- 发送调用 `tasks.submit { sessionId, submissionId, content }`。`submissionId` 用 `crypto.randomUUID()`，重试时沿用同一个。
- 正在运行时发送，Host 会把它排进队列（来自 `TaskSnapshot.queue`）。排队消息显示在输入框上沿的玻璃托盘里（每条一行，右侧垃圾桶「撤回」）；撤回调用 `tasks.command { op: "cancel", taskId, revision }`。v1 不做「↳ 插入」。
- 停止调用 `tasks.command { op: "stop", runId }`。
- 模式：底部弹层列出 Agent / Plan / Chat 和一句说明；选中后调用 `sessions.update`。返回 `CONFLICT` 时重新取 revision 再试一次，仍失败则提示。
- 模型和推理档位：底部弹层按供应商分组列出 `host.describe().models`，下方是推理档位分段控件。只有该模型在模型目录里支持推理档位时才显示档位；变更后调用 `tasks.command { op: "configure", configuration: { model, reasoningEffort } }`。
- 草稿按会话存在 `sessionStorage`，切走再回来仍在。

## 10. 视觉

- token：从 `apps/desktop/src/renderer/styles/tokens.css` 复制 web 用到的部分到 `apps/web/src/styles/tokens.css`。变量名保持 `--act-*` 不变，文件头写明来源和同步要求。不新建共享 token 包，等第三个消费者出现再抽。
- Tailwind 4：与桌面端相同的 `@theme inline` 写法，提供 `text-act-*`、`rounded-act-*`、`shadow-act-*` 和语义颜色类。
- 颜色硬约束与桌面端一致，遵循 [主题与配色规范](front-主题与配色规范.md)。`check:frontend-tokens` 和 `check:frontend-theme` 扩展到同时扫描 `apps/web/src`（计划任务 B4）。
- 玻璃材质（B · 轻玻璃）：`--web-glass` / `--web-glass-strong` 两个 web 专用变量，浅色 `rgba(255,255,255,.72)` / `.9`，深色 `rgba(36,37,34,.72)` / `.92`，配合 `backdrop-filter: blur(18px) saturate(1.6)`；不画实线边框，用 0.5px `--web-glass-edge` 描边 + `--web-glass-shadow` 柔和投影。弹层 blur 24。不支持 `backdrop-filter` 的浏览器回退为 `--act-color-surface`。
- 列表和设置用 iOS 式 inset 分组（`surface` 底、圆角 12、0.5px 缩进分隔线）；顶栏是 36px 玻璃圆钮 + 标题胶囊，下方渐隐。
- 字号：手机正文 15px、标题 16px。比桌面端大一档，因为手机阅读距离更近。新增 `--text-act-base: 15px`（`text-act-base`），只在 web 的 token 文件里定义。
- 图标：`lucide-react`，与桌面端一致。
- 状态色：运行中用 operational 翡翠绿；等待审批用 warning 琥珀色；未读用 success 绿点；错误用 danger 红。
- 触控：可点区域不小于 44×44px；列表行按下时显示 `hover` 背景。

## 11. 安全

- 设备 token 等于这台 Host 的完整访问权，存在 `localStorage`，所以：
  - 页面不加载任何第三方脚本；
  - CSP 见 §6；
  - Markdown 不渲染 HTML；
  - 不用 `dangerouslySetInnerHTML`，代码高亮除外，且只能用转义后的文本。
- 不在浏览器里保存任何模型 API Key。Key 只在服务器的环境变量里。
- 设备管理沿用 Host CLI：`host devices` 查看，`host revoke --device <id>` 吊销；吊销后已连接的页面立即断开并回到连接页。
- `allowedOrigins` 只放行明确写出的 origin。D2 的回环 http 放行只在 Host 监听回环地址时生效。

## 12. 错误与空状态

| 情况 | 显示 |
| --- | --- |
| 配对码错误或过期 | 连接页字段下方「配对码无效或已过期，请在服务器上重新生成」 |
| 地址连不上 | 「连不上 `<地址>`：请确认 Host 在运行、地址是 HTTPS，且这个页面的地址已写入 `allowedOrigins`」 |
| 被限流（`LIMIT_EXCEEDED`） | 「尝试太频繁，请一分钟后再试」 |
| 列表为空 | 「还没有会话，在下面写一句话开始」 |
| RPC 失败 | 在触发位置就近显示原因（审批卡下方、输入框上方、新建面板内），不只打控制台 |

## 13. 验收

- 工程：`pnpm --filter @actspace/web typecheck`、`test`、`build`；`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`；Host 和 client 包的测试。
- 浏览器：Host 以 `serve --mock` 运行，Chrome 分别在 390×844 和 1440×900 两个窗口下，浅色、深色各走一遍：连接、列表、新建、详情、审批、排队、停止、模式、模型。
- 真机：iPhone Safari 按 D4 的 Tailscale 方式打开，添加到主屏幕，以全屏方式走一遍上面的流程；锁屏 1 分钟后回来能自动重连；在服务器上吊销设备后页面回到连接页。
