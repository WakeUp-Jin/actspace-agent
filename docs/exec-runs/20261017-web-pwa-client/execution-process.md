# Web / PWA 客户端 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261017-web-pwa-client.md`
- **设计规范**：`docs/design-docs/frontend/front-web-pwa客户端规范.md`
- **执行模式**：交互（主智能体 Claude Opus 5.5；C 组的一部分页面委派 Sonnet 5.5 子智能体，主智能体审查后合入）
- **分支**：`feat/web-mobile`（worktree `../actspace-agent-web-mobile`，从 main 9fb607a2 切出），未提交
- **开始时间**：2026-10-17
- **结束时间**：2026-10-17 23:59（D4 真机验收待用户执行）

## 执行时间线

### 步骤 1：用户确认 D1–D4，开工

- **操作**：用户确认同源托管、回环 http 来源、`@actspace/client/live`、Tailscale serve 四项，并说明目标是「Mac 跑 Host，手机连上能发消息」，不需要单独的服务器。
- **决定**：A 组（Host 网络边界、桌面端重构）在线逐项做；B4 检查脚本和 C 组边界清楚的页面委派子智能体。

### 步骤 2：A1–A5 Host 与共享层

- **操作**：
  - A1：`packages/agent-host/src/static.ts` 静态托管（realpath 校验不出 `webRoot`、SPA 回退、`/assets` 长缓存、`sw.js` / `index.html` 不缓存、安全响应头）；`config.ts` 增加 `webRoot`。
  - A2：`server.ts` 的 `isAllowedOrigin`，只在不开 TLS（只能监听回环）时放行 `http://localhost|127.0.0.1|[::1]` 来源。
  - A3：`bootstrap.ts` 在 host 频道发 `activity` 事件（`{ sessionId, running }`），`host.observe` 快照带 `running`；类型在 `packages/shared/src/host-protocol/events.ts`。
  - A4：见步骤 3。
  - A5：`apps/cli` 的 `host check` 提示改为「只有回环 http 页面能免 TLS 直连，手机要把 https ts.net 地址写进 allowedOrigins」。
- **验证**：agent-host 测试 44 → 55 条全部通过（新增 static、origin、activity）。
- **问题**：A3 的 bootstrap 测试里两次 observe 各收到一份事件，断言改为按第一个 subscriptionId 过滤。

### 步骤 3：A4 流式折叠抽到 `@actspace/client/live`

- **操作**：按计划「原样移动 + 改 import」。`stream-adapter`、`subagent-activity`、`file-generation-counter`、`stream-state`、`stream-blocks`、`run-state` 移到 `packages/client/src/live/`；`live-run-store.ts` 拆出不依赖 React 的 `live-run.ts`。线上事件类型 `RuntimeV2LiveEvent` 定义在 `packages/shared/src/runtime-v2/live-event.ts`。
- **决定**：桌面端原文件保留，改成从 `@actspace/client/live` 重新导出（一行注释说明来源）。这样桌面端几十处 import 一处不改，diff 只有被移走的实现。
- **验证**：desktop 1924 条测试数量不变、全部通过；client 26 条通过。

### 步骤 4：B1–B5 脚手架

- **操作**：`apps/web`（Vite + React 18 + Tailwind 4），`shared-aliases.mts` 照抄桌面端的源码别名；`tokens.css` 从桌面端复制（不含强调色调色板）；UI 原语 `Button`、`IconButton`、`GlassPill`、`Pressable`、`Sheet`（Radix Dialog）、`Toast`、`Segmented`、`WorkspaceTile`；PWA（manifest、四种图标、自写 Service Worker 只缓存导航和 `/assets`、`UpdateToast`）；`check:frontend-tokens` / `check:frontend-theme` 改为多根，覆盖 `apps/web/src`。
- **决定**：开发端口 5174（`VITE_DEV_PORT` 可改），因为 desktop 的 Vite 占着 5173。

### 步骤 5：C1–C11 功能

- **操作**：连接状态机 `connection/connection-store.ts`（hello → pair/resume → describe → observe，退避重连 1/2/4/8/16/30s，回到前台探活，4003 吊销、4008 重同步）；会话列表（Host 频道订阅只做一次，列表、顶栏、新建面板共用）；新建面板；详情（`session-observer` 合并 durable 投影和 live 流式块，审批卡挂在对应工具块之后）；输入坞（发送 / 停止 / 排队 / 撤回 / 插入）；模式与模型面板；设置页；本机未读；`visualViewport` 键盘避让。
- **验证**：web 23 个测试文件 85 条通过。

### 步骤 6：浏览器端到端调试（真实 Host + 假模型）

- **操作**：`/tmp/web-e2e/` 下用 playwright-core + 系统 Chrome 驱动；假模型 `fake-llm.cjs` 是 OpenAI 兼容的 SSE 服务，按关键词返回思考 + Markdown、Bash（需审批）、写文件、读文件、慢速长文本。Host 用 `host.json` 指向它。
- **问题与修复**：见下方「遇到的问题」。

### 步骤 7：收尾

- **操作**：
  - 分包：React、Markdown、其余依赖各一块，主块 672 kB → 325 kB，构建警告消失。
  - 未读接线：列表给没记录的会话打基线（`seedSeen`），详情顶栏随 updatedAt 记已读（`markSeen`）。
  - 断线时保留上次的 `host.describe`（`ConnectionState.description`），工作区名不变成路径末段。
  - D2 验收截图（同源托管 `http://127.0.0.1:4317`），存在 `screenshots/`。
  - D3 文档同步；`check:packages` 修复（见问题）。

## 遇到的问题

- **问题**：配对永远显示「连不上」。
  - **原因**：`App` 里 `useMemo` 创建 `ConnectionStore`、effect 清理时 `dispose()`；React StrictMode 开发时卸载再挂载一次，store 被永久关掉。
  - **应对**：store 在 `main.tsx` 创建，作为必填 prop 传给 `App`；加 StrictMode 回归测试。
- **问题**：发送按钮的箭头看不见。
  - **原因**：`IconButton` 基础类写死 `text-text-main`，和传入的 `text-on-action` 同为文字颜色类，谁赢取决于 CSS 顺序。
  - **应对**：`IconButton` 增加 `tone`（default / primary），基础类不再带文字颜色。
- **问题**：标题显示 “New chat”，思考行显示 “Thinking...”，停止后显示 “Stopped”，等待模型显示 “Operating Space · Expanding”。
  - **原因**：都是 client / live 层给桌面端的英文默认值。
  - **应对**：web 端只用快照元数据里的标题；思考行按 running 显示「思考中 / 思考过程」；状态行映射为中文。
- **问题**：代码块把整个时间线撑宽，横向溢出屏幕。
  - **原因**：grid 子项默认 `min-width: auto`。
  - **应对**：外层和每项的 grid 都用 `grid-cols-[minmax(0,1fr)]`，`pre` 自己横向滚动。
- **问题**：有序列表没有序号；被拒绝的命令显示绿色对勾；排队提示折行。
  - **应对**：`.md ol/ul` 恢复 list-style；拒绝状态用 `Ban` 图标；提示加 `whitespace-nowrap`。
- **问题**：新会话的顶栏一直显示「未知工作区」。
  - **原因**：Host 每次 projection 更新都发 `sessions-changed`，流式时每个片段一次；列表刷新用的是会被重置的 300ms 防抖，流式期间一直被推迟，新会话迟迟进不了列表。
  - **应对**：改为窗口内只刷新一次（不重置计时），加回归测试；Host 侧发得太密登记技术债。
- **问题**：重连测试里停 Host 后新 Host 起不来（“Session host is owned by runtime … pid”）。
  - **原因**：SIGTERM 是优雅停止，会等进行中的 Run，包括卡在审批的 Run。
  - **应对**：测试改用 `host stop --force --config …`，并等进程退出再启动；README 写明。
- **问题**：`pnpm check:packages` 崩溃（`Cannot read properties of undefined (reading 'startsWith')`）。
  - **原因**：本地 `apps/web/.host-data/`（开发 Host 的数据目录，已 gitignore）里的 harness 产物带没有 name 的 package.json，被检查脚本扫到；修好后又暴露 `@actspace/web` 缺 `exports['.']`。
  - **应对**：检查脚本跳过隐藏目录；`@actspace/web` 和 `@actspace/site` 一样列入应用豁免。
- **问题**：desktop 全量测试偶发一次失败。
  - **原因**：已知的 turn-tail 未处理错误，偶发；重跑 237 个文件 1924 条全部通过、退出码 0。
  - **应对**：不在本次范围，记录在执行摘要。

## 2026-10-18 视觉重做（B · 轻玻璃）

- **起因**：用户打开首版后觉得样式丑。先做 `docs/design-docs/frontend/mobile-web-v2-demo.html`（引用真实 `apps/web` tokens，现状 / A / B 三种可切换，9 个手机画面 + 宽屏），用户选 B，并对四个开放问题全部按建议拍板。
- **做法**：样式集中在 `apps/web/src/styles/`（玻璃改为 0.5px 描边 + 柔和投影、inset 分组、胶囊按钮、时间线间距类）；组件层新增 `PageHeader`、`PillButton`、`SendButton`、`ComposerBox`、`PlusSheet`、`QueueTray`、`TurnView`、`UsageSheet`、`ToolLine`；数据层只加纯函数（按轮拆分、改动合并、本轮用量、列表时间分组），连接与订阅逻辑不动。
- **问题**：`Pressable` 默认带 `block w-full`，Tailwind utilities 层压过组件层的 `.tl { display:flex }`。
  - **应对**：className 里已有 display / 宽度类时 `Pressable` 不再加默认值；`ToolLine` 显式写 `flex`。
- **问题**：demo 的 2px / 3px 圆角写成 `rounded-[Npx]` 会被 token 检查拦下。
  - **应对**：停止方块、行内代码改用 CSS 类（`.send-stop`、`.inline-code`）。
- **问题**：等审批时，命令既显示一行「Running … 0s」，又显示审批卡。
  - **应对**：挂了审批卡的 Bash 条目只渲染审批卡，和 demo、桌面端一致。
- **问题**：验收截图里写文件显示「+0 −0」。
  - **原因**：工作区里已有同内容的 `notes.md`，重复写入没有行变化，是真实数据，不改。
- **验证**：web 25 个测试文件 95 条、构建、token / 主题 / 包边界检查、根 typecheck 通过；真实 Host + 假模型浏览器验收，窄屏浅色全流程 + 深色、宽屏浅深色，截图在 `screenshots-b/`。

## 跳过或推迟的事项

- 计划移到 `completed/`：D4 真机验收还没做，按仓库惯例先留在 `active/`，验收通过后再移。
- web 产物打进 agent-cli 包、token 抽共享包、按路由懒加载、Run 开始时间、Host 侧合并 `sessions-changed`：登记在 `docs/exec-plans/tech-debt-tracker.md`「Web / PWA 客户端遗留」。
- 审批「本会话允许 `<前缀>`」：只在 Host 给出 `command_prefix` 授权建议时出现。浏览器验收用的 `no_sandbox` 命令没有这种建议，所以这个按钮只有单元测试覆盖（`ApprovalCard.test.tsx`、`grant.test.ts`），没有截图。
