# Web / PWA 客户端

> 2026-10-18 状态校准：A1–D3 已实现并合入 main；D4 iPhone + Tailscale 真机验收仍未覆盖，不因归档改成通过。 下文保留原始实施决策与过程；最新分项证据见 [近期验收](../../exec-runs/20261018-recent-features-acceptance/acceptance.md)。
## 目标

新建 `apps/web`：一套响应式浏览器客户端，支持 PWA 安装。手机竖屏是原型 V1，浏览器宽屏是两栏。它直连服务器上的 `agent-host`，完成以下功能：

- 连接与配对；
- 会话列表；
- 会话详情（含流式输出）；
- 审批；
- 输入框（发送、停止、排队、模式、模型）；
- 新建会话。

`agent-host` 和 `@actspace/client` 只做支撑这些功能的最小改动。

## 范围

- 包含：
  - `apps/web` 全部代码、PWA 文件和测试；
  - `agent-host` 的静态托管（`webRoot`）、回环开发来源放行、Host 频道会话活动推送；
  - 把流式折叠逻辑从桌面端提到 `@actspace/client/live`，桌面端改为引用它，行为不变；
  - 两个前端检查脚本扩展到 `apps/web`；
  - 相关文档。
- 不包含（以设计规范 §2「不做」为准）：
  - 附件 / 上传、`@` 引用、斜杠命令；
  - 多 Host、推送通知、中转服务；
  - 终端、Git Review、文件树、浏览器、轨迹页、Space；
  - 注册工作区；
  - 把 web 构建产物打进 agent-cli 包。打包这一项记入技术债，v1 由部署者手动拷贝。

## 背景

- 必读（新会话或子 Agent 开工前）：
  - `AGENTS.md`
  - 设计规范 [front-web-pwa客户端规范.md](../../design-docs/frontend/front-web-pwa客户端规范.md)
  - 原型 [mobile-web-demo.html（已迁出）](../../design-docs/retired-html-demos.md) 的 V1 和「V1 宽屏」画面
  - [前端新功能开发清单](../../design-docs/frontend/front-新功能开发清单.md)
  - [主题与配色规范](../../design-docs/frontend/front-主题与配色规范.md)
- 相关代码路径：
  - Host 网关 `packages/agent-host/src/server.ts`（`request` 处理在第 38 行附近，`Origin` 检查在第 40 行附近）
  - Host 配置 `packages/agent-host/src/config.ts`
  - RPC 分发 `packages/agent-host/src/rpc.ts`
  - 事件发布 `packages/agent-host/src/bootstrap.ts`（第 80–110 行）
  - 订阅 `packages/agent-host/src/observation.ts`
  - 协议 `packages/shared/src/host-protocol/index.ts`
  - RPC 客户端 `packages/client/src/host/client.ts`
  - 会话投影 `packages/client/src/sessions/`
  - 流式适配 `apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts`，及其依赖 `subagent-activity.ts`、`file-generation-counter.ts`
  - 流式折叠 `apps/desktop/src/renderer/session/live-runs/{live-run-store,stream-blocks,stream-state}.ts`
  - 流式状态类型 `apps/desktop/src/renderer/session/session-run-state.ts`
  - 桌面远端适配 `apps/desktop/src/main/remote-hosts/desktop-adapter.ts`
  - 桌面审批逻辑参考 `apps/desktop/src/renderer/components/messages/ApprovalParts.tsx`
  - 推理档位参考 `apps/desktop/src/renderer/components/composer/use-composer-model.ts`
  - token 来源 `apps/desktop/src/renderer/styles/{tokens.css,tailwind.css}`
  - 检查脚本 `scripts/check-frontend-design-tokens.mjs`、`scripts/check-frontend-theme-colors.mjs`
  - 包边界 `scripts/check-package-boundaries.mjs`
- 已知约束：
  - `@actspace/client` 只依赖 `@actspace/shared` 和 `pathe`，不能引入 `@actspace/runtime` 或 `core-*`。`AgentLoopLiveEvent` 定义在 `packages/core/agent-loop/src/loop.ts:39`，所以 A4 要先在 shared 里定义线上类型。
  - Host 配置的 `allowedOrigins` 只接受 `https://`。非回环地址必须开 TLS。
  - `HostClient` 不重试写操作，不做重连。这两件事由 web 自己处理。
  - 依赖版本与 `apps/desktop/package.json` 保持一致：react `^18.3.1`、react-markdown `^10.1.0`、remark-gfm `^4.0.1`、@radix-ui/react-dialog `^1.1.23`、lucide-react `^1.16.0`、tailwindcss / @tailwindcss/vite `^4.3.0`、vite `^5.4.19`、vitest `^3.2.4`、jsdom `^26.1.0`、@vitejs/plugin-react `^4.5.2`、typescript `^5.8.3`。新增依赖要符合 `docs/SUPPLY_CHAIN_SECURITY.md`。

## 风险

| 风险 | 缓解方式 |
| --- | --- |
| A4 抽取流式逻辑改坏桌面端 | 纯移动 + 改 import，不改逻辑。现有桌面测试原样通过，用例数不减；另加一条类型断言，保证 `AgentLoopLiveEvent` 能赋值给新的线上类型 |
| 静态托管引入路径穿越 | 用 realpath 校验必须落在 `webRoot` 内；测试覆盖 `..`、编码后的 `%2e%2e`、指向外部的符号链接、NUL 字符 |
| 回环 http 来源被本机其他网页利用 | 只在 Host 监听回环地址时放行。连上后仍必须用 token 认证，未认证 5 秒断开（现有行为） |
| iOS 切到后台会断开 WebSocket | 设计上就要求 `visibilitychange` / `online` 时立即重连并重新订阅。`epoch` 变化时整体替换快照 |
| Service Worker 缓存住旧版本 | `index.html`、`sw.js` 不缓存；新版本由用户点「刷新」激活；导航请求网络优先 |
| token 存在 `localStorage`，可能被 XSS 拿到 | 页面不加载第三方脚本，用严格 CSP，Markdown 不渲染 HTML，不用 `dangerouslySetInnerHTML` |
| 新增的 `activity` 事件让桌面端出错 | A3 补一条桌面测试：桌面远端适配收到未知或新的 Host 事件 kind 时忽略，不抛错 |

## 任务

依赖关系：
- A1、A2、A3 互相独立，可以并行。
- A4 必须在 C5 之前完成。
- B1 必须在所有 B、C 任务之前完成。
- B4 可以和 C 并行。
- C 组内按编号顺序做。C6 和 C7 在 C5 之后可以并行。

### A. Host 与共享包

**A1 Host 静态托管 `webRoot`**

- 改动：
  - `packages/agent-host/src/config.ts`：`HostConfig` 增加可选的 `webRoot: string`，按配置文件所在目录解析为绝对路径，必须是可读目录，用 `realpath` 规范化；`keys()` 的允许字段同步增加。
  - 新建 `packages/agent-host/src/static.ts`，导出 `createStaticHandler(webRoot: string): (req, res) => void`：
    - 只处理 `GET` / `HEAD`，其他方法返回 405；
    - 对 URL 解码，拒绝含 NUL 的路径；
    - 用 `realpath` 后必须以 `webRoot + sep` 开头，否则返回 404；
    - 路径没有扩展名且找不到文件时，回退到 `index.html`；
    - 按扩展名给出 MIME（html、js、css、json、webmanifest、png、svg、ico、woff2）；
    - `/assets/` 下的文件返回 `Cache-Control: public, max-age=31536000, immutable`；`index.html`、`sw.js`、`manifest.webmanifest` 返回 `no-cache`；
    - 所有响应带设计规范 §6 的 CSP 和 `X-Content-Type-Options: nosniff`。
  - `packages/agent-host/src/server.ts`：`HostGateway` 的选项增加 `webRoot?`；`request` 处理在有 `webRoot` 时交给静态处理器，否则保持 404。
  - `packages/agent-host/src/bootstrap.ts`：构造网关时传入 `config.webRoot`。
  - `apps/cli/src/runtime-v2/host-command.ts`：`check` 子命令在设置了 `webRoot` 而 `allowedOrigins` 为空时，输出一行提示「页面能打开，但需要把页面地址写入 allowedOrigins 才能连接」。
- 测试：新建 `packages/agent-host/src/test/static.test.ts`，覆盖以下情况：
  - 首页返回 200；
  - `/assets/a-1234.js` 带 immutable；
  - `/sessions/abc` 回退到首页；
  - `/../package.json` 和 `/%2e%2e/package.json` 返回 404；
  - 指向 `webRoot` 外的符号链接返回 404；
  - POST 返回 405；
  - 未配置 `webRoot` 时仍返回 404；
  - 响应带 CSP。
- `config.test.ts` 增加用例：`webRoot` 不存在时报错，相对路径能正确解析。
- 验证：`pnpm --filter @actspace/agent-host test` 全部通过。

**A2 回环地址放行 http 开发来源（D2）**

- 改动：`packages/agent-host/src/server.ts` 的 `Origin` 检查。当网关监听 `127.0.0.1` 或 `::1` 时，额外接受主机名为 `localhost`、`127.0.0.1`、`[::1]` 的 `http:` 来源（任意端口）。其他情况保持精确匹配 `allowedOrigins`。配置校验不变。
- 测试：在现有 server 测试旁新增 `packages/agent-host/src/test/origin.test.ts`，覆盖四种情况：
  - 回环监听 + `Origin: http://localhost:5173` 能升级；
  - 回环监听 + `Origin: http://evil.example` 返回 403；
  - TLS 公网监听 + `Origin: http://localhost:5173` 返回 403；
  - 已列出的 `https://` 来源仍然能升级。
- 验证：`pnpm --filter @actspace/agent-host test`。

**A3 Host 频道推送会话运行状态**

- 改动：
  - `packages/agent-host/src/bootstrap.ts`：在 tasks 订阅里用一个 `Map<sessionId, boolean>` 记录每个会话是否有 `state === "running"` 的 run。值变化时向 `"host"` 频道发布 `{ kind: "activity", sessionId, running }`。
  - `packages/agent-host/src/rpc.ts`：`HostRpcOptions` 增加 `runningSessions(): string[]`；`host.observe` 的初始快照增加 `running: runningSessions()`。
  - `packages/shared/src/host-protocol/index.ts`：导出类型 `HostActivityEvent = { kind: "activity"; sessionId: string; running: boolean }`，以及 `HostObserveSnapshot`，其中包含 `approvals`、`state`、`running`。
- 测试：
  - `bootstrap.test.ts` 增加用例：提交任务后，Host 频道依次收到 `running: true` 和 `running: false`；运行期间调用 `host.observe`，快照的 `running` 包含该会话。
  - `apps/desktop/src/main/test/` 下找到远端适配的现有测试，增加用例：收到 `kind: "activity"` 的 Host 事件不抛错，会话列表不变。
- 验证：
  - `pnpm --filter @actspace/agent-host test`
  - `pnpm --filter @actspace/desktop test -- remote`

**A4 流式折叠提到 `@actspace/client/live`（D3）**

- 改动：
  - `packages/shared/src/runtime-v2/`：新增 `live-event.ts`，导出 `RuntimeV2LiveEvent`。字段与 `AgentLoopLiveEvent` 在网络上传输的形状一致，`ToolExecutionResult` 等嵌套值用 `RuntimeV2JsonValue` 表示。从 `runtime-v2/index.ts` 导出。
  - 新建 `packages/client/src/live/`，把桌面端以下文件原样移入（只改 import 路径）：
    - `stream-adapter.ts`：来自 `fixed-renderer-stream-adapter.ts`，入参类型改为 `RuntimeV2LiveEvent`；
    - `subagent-activity.ts`；
    - `file-generation-counter.ts`；
    - `stream-state.ts`；
    - `stream-blocks.ts`；
    - `run-state.ts`：来自 `session-run-state.ts`。
  - 把 `live-run-store.ts` 里不依赖 React 的部分拆成 `packages/client/src/live/live-run.ts`。桌面端的 `live-run-store.ts` 只保留 `useSyncExternalStore` 封装，从 client 引入其余部分。
  - 新建 `packages/client/src/live/index.ts`。`packages/client/package.json`：
    - `exports` 增加 `./live`，写法与 `./sessions` 相同；
    - `typesVersions` 增加 `live`；
    - `build` 脚本增加一条 esbuild 生成 `dist/live.cjs`。
  - 桌面端：`fixed-renderer-stream-adapter.ts`、`subagent-activity.ts`、`file-generation-counter.ts`、`stream-state.ts`、`stream-blocks.ts`、`session-run-state.ts` 改为从 `@actspace/client/live` 再导出，或删除后改调用方 import。二选一，以改动最少为准，并在执行过程文档里写明选的是哪种。原有测试文件随实现移到 `packages/client/src/live/test/`，或保留在桌面端改 import。
  - 类型断言：在 `apps/desktop/src/main/test/` 新增 `live-event-contract.test.ts`，写 `const _: RuntimeV2LiveEvent = {} as AgentLoopLiveEvent;` 一类的编译期断言。
- 验证：
  - `pnpm --filter @actspace/client build && pnpm --filter @actspace/client test`
  - `pnpm --filter @actspace/desktop typecheck && pnpm --filter @actspace/desktop test`。桌面测试用例总数不少于改动前，执行前先记录这个数字。
  - `pnpm check:packages`
  - `pnpm typecheck`

### B. `apps/web` 骨架

**B1 包结构**

- 新建以下文件：
  - `apps/web/package.json`：
    - `name: "@actspace/web"`、`private: true`、`type: "module"`；
    - scripts：`dev`（vite）、`build`（`tsc --noEmit && vite build`）、`preview`、`typecheck`（`tsc --noEmit`）、`test`（`vitest run`）；
    - 依赖：`@actspace/shared`、`@actspace/client`（`workspace:*`），以及「已知约束」里列出的版本。
  - `apps/web/vite.config.mts`：React 插件、Tailwind 插件；`@actspace/shared/*` 的源码别名照抄 `apps/desktop/vite.config.mts:10-18`；`server.port: 5173`。
  - `apps/web/tsconfig.json`：`module: ESNext`、`moduleResolution: Bundler`、`jsx: react-jsx`、`strict: true`。
  - `apps/web/vitest.config.ts`：jsdom、`src/**/test/**/*.test.{ts,tsx}`、setup 文件 `src/test/setup.ts`。
  - `apps/web/index.html`：`lang="zh-CN"`；viewport 包含 `viewport-fit=cover`；`theme-color` 浅色、深色各一条。
  - `src/main.tsx`、`src/app/App.tsx`（先放占位页）。
  - `src/styles/tokens.css`：从桌面端复制 web 用到的 `--act-*` 变量，文件头注明来源路径和「改桌面 token 时同步这里」；增加 `--text-act-base: 15px`、`--web-glass`、`--web-glass-strong`。
  - `src/styles/tailwind.css`、`src/styles/index.css`。
  - 一条冒烟测试 `src/test/app.test.tsx`：渲染 App 不抛错。
- 验证：
  - `pnpm install`
  - `pnpm --filter @actspace/web typecheck && pnpm --filter @actspace/web test && pnpm --filter @actspace/web build`
  - `pnpm check:packages`

**B2 PWA 文件**

- 新建以下文件：
  - `apps/web/public/manifest.webmanifest`：字段按设计规范 §8。
  - `apps/web/public/icons/icon.svg`：「A」品牌块。
  - 由 icon.svg 生成 `icon-192.png`、`icon-512.png`、`icon-maskable-512.png`、`apple-touch-icon.png`（180px）。生成方式是用 headless Chrome 截图，命令写进 `apps/web/README.md`。
  - `apps/web/src/pwa/sw-routing.ts`：纯函数 `routeRequest(url: URL, mode: RequestMode, origin: string)`，返回 `"bypass"`（非同源请求、`/rpc`、非 GET）、`"network-first"`（导航请求）或 `"cache-first"`（`/assets/*`）。
  - `apps/web/src/pwa/sw.ts`：Service Worker 本体，用 `sw-routing`；缓存名带构建号。
  - `apps/web/src/pwa/register.ts`：注册 SW，发现新版本时通知 UI。
  - `apps/web/src/pwa/UpdateToast.tsx`：显示「有新版本 · 刷新」，点击后 `postMessage({ type: "skip-waiting" })` 并刷新页面。
  - `vite.config.mts`：把 `src/pwa/sw.ts` 作为独立入口，输出固定文件名 `sw.js`，并把构建号注入为常量。
  - `index.html`：加入 manifest、apple-touch-icon、`apple-mobile-web-app-capable` 和 `apple-mobile-web-app-status-bar-style` 两个 meta。
- 测试：`src/pwa/test/sw-routing.test.ts`，覆盖 `/rpc`、跨域请求、POST、导航请求、`/assets/x.js` 五种情况。
- 验证：`pnpm --filter @actspace/web test && pnpm --filter @actspace/web build`；产物里有 `dist/sw.js` 和 `dist/manifest.webmanifest`。

**B3 连接层**

- 新建以下文件：
  - `apps/web/src/connection/saved-hosts.ts`：读写 `localStorage` 的 `actspace.web.hosts`，结构按设计规范 §5；读取时校验 `version: 1` 和字段类型，读写异常时当作没有保存。
  - `apps/web/src/connection/connection-store.ts`：带 `subscribe` 的小对象。
    - 状态有 `idle`、`connecting`、`ready`、`reconnecting`、`revoked`、`failed`。
    - 方法有 `pair(url, code, name)`、`resume()`、`disconnect()`。
    - 内部 `new HostClient(new WebSocket(url))`，按 `host.hello` → `auth.pair` / `auth.resume`（带 `expectedHostId`）→ `host.describe` → `host.observe` 的顺序执行。
    - 退避时间依次为 1、2、4、8、16、30 秒，之后都是 30 秒；监听 `visibilitychange` 和 `online`，触发时立即重连。
    - 关闭码 4003 或错误 `REVOKED` / `UNAUTHENTICATED` 时清掉 token，进入 `revoked`。
    - 错误 `MAINTENANCE` / `RECOVERY_BLOCKED` 时保持 `ready`，并置 `maintenance: true`。
  - `apps/web/src/connection/use-connection.ts`：`useSyncExternalStore` 封装。
  - `apps/web/src/connection/host-events.ts`：按 `subscriptionId` 把 `host.event` 分发给订阅方。
- 测试：`src/connection/test/` 用假 WebSocket，覆盖以下情况：
  - 配对成功后写入 saved-hosts；
  - 恢复时 `hostId` 不一致进入 `failed`；
  - 4003 进入 `revoked`，并清除 token；
  - 退避序列正确（用假定时器）；
  - `visibilitychange` 立即重连；
  - 维护状态。
- 验证：`pnpm --filter @actspace/web test`。

**B4 检查脚本覆盖 `apps/web`**

- 改动：
  - `scripts/check-frontend-design-tokens.mjs` 和 `scripts/check-frontend-theme-colors.mjs` 把扫描根目录改成列表：`apps/desktop/src/renderer`、`apps/web/src`。
  - token 定义分别从各自的 `styles/tailwind.css` 和 `styles/tokens.css` 读取。
  - web 的 `createPortal` / `role="dialog"` 只允许出现在 `apps/web/src/ui/`。
  - web 的原生 `<button>` 基线为 0：web 一律用自己的 `ui/Button`、`ui/IconButton`。
- 测试：`scripts/test/frontend-design-tokens.test.mjs` 增加 web 目录的正例和反例（写死 `text-[13px]` 应失败）。
- 验证：
  - `pnpm check:frontend-tokens && pnpm check:frontend-theme && pnpm test:frontend-tokens`
  - 现有桌面端结果不变。

**B5 仓库接线**

- 改动：
  - 根 `package.json`：增加 `"dev:web": "pnpm --filter @actspace/web dev"`；`build` 末尾追加 `&& pnpm --filter @actspace/web build`。
  - `docs/CICD.md`：说明 CI 通过 `pnpm -r typecheck/test` 和根 `build` 覆盖 web。
- 验证：`pnpm build` 成功；`pnpm typecheck` 包含 web。

### C. 功能

**C1 外壳、路由、响应式、主题**

- 新建以下文件：
  - `src/app/router.ts`：History API。路由有 `/`、`/sessions/:id`、`/connect`、`/settings`；导出 `parseRoute`、`formatRoute`、`useRoute`、`navigate`。
  - `src/app/use-wide.ts`：`matchMedia("(min-width: 1024px)")`。
  - `src/app/Layout.tsx`：窄屏只渲染当前路由；宽屏左栏固定 360px 渲染列表，右栏渲染详情或空状态。
  - `src/app/theme.ts`：三态主题，写 `html[data-theme]`，存在 `localStorage` 的 `actspace.web.theme`。
  - `src/app/App.tsx`：未连接时跳转 `/connect`。
- 安全区：顶栏用 `padding-top: env(safe-area-inset-top)`，底部输入坞用 `env(safe-area-inset-bottom)`；页面高度 `100dvh`。
- 测试：
  - `router.test.ts`：解析和格式化往返一致，未知路径回到 `/`；
  - `theme.test.ts`：持久化和系统模式。
- 验证：`pnpm --filter @actspace/web test`。

**C2 UI 原语**

- 新建 `src/ui/` 下的以下组件：
  - `Button.tsx`：变体有 primary、secondary、ghost、danger，最小高度 44px。
  - `IconButton.tsx`：必须传 `label`，用作 `aria-label` 和 title。
  - `GlassPill.tsx`。
  - `Sheet.tsx`：基于 `@radix-ui/react-dialog`。窄屏是底部弹层，带拖动条，圆角 26；宽屏是居中对话框，宽 420px。
  - `Toast.tsx`。
  - `WorkspaceTile.tsx`：首字母加哈希取色，纯函数 `tileColorIndex(id)` 返回 1–5。
- 测试：
  - Sheet 打开两层时，Esc 只关上层；
  - 关闭后焦点回到触发按钮；
  - `tileColorIndex` 结果稳定。
- 验证：`pnpm --filter @actspace/web test && pnpm check:frontend-tokens`。

**C3 连接页**

- 新建以下文件：
  - `src/pages/connect/ConnectPage.tsx`：地址默认取 `location.origin`。
  - `src/pages/connect/PairCodeInput.tsx`：支持粘贴整段配对码。
  - `src/pages/connect/connect-errors.ts`：把 `HostError` 的 kind 和关闭码映射成设计规范 §12 的文案，写成纯函数。
- 测试：`connect-errors.test.ts` 覆盖无效配对码、限流、连不上、吊销四种。
- 验证：`pnpm --filter @actspace/web test`。

**C4 会话列表**

- 新建以下文件：
  - `src/sessions/use-session-list.ts`：
    - 订阅 Host 频道；
    - 收到 `sessions-changed` 时以 300ms 去抖重新拉 `sessions.list`；
    - 维护 `approvals`（按 sessionId 分组）和 `running`（初始值来自 A3 快照的 `running`，之后按 `activity` 事件更新）。
  - `src/sessions/session-row-model.ts`，纯函数：
    - 状态优先级：等待审批 > 运行中 > 未读 > 空闲；
    - 时间格式：今天显示 `HH:mm`，本周显示周几，更早显示 `M/D`；
    - 工作区名：按 `workspaceRoot` 匹配 `host.describe` 的工作区，匹配不到取路径最后一段。
  - `src/sessions/unread-store.ts`：`localStorage` 的 `actspace.web.seen`，记录每个会话最后查看时的 `updatedAt`。
  - `src/pages/sessions/SessionListPane.tsx`、`SessionRow.tsx`、`ListHeader.tsx`。
  - `src/pages/sessions/ArchivedToggle.tsx`。
- 测试：
  - `session-row-model.test.ts`：四种状态的优先级、三种时间格式、工作区回退；
  - `unread-store.test.ts`。
- 验证：`pnpm --filter @actspace/web test`。

**C5 会话详情数据**

- 新建以下文件：
  - `src/sessions/use-session-observation.ts`：
    - 进入会话时 `sessions.observe`，离开时 `sessions.unobserve`；
    - 重连后重新订阅，`epoch` 变化时整体替换；
    - `projection` 事件交给 `ClientSessionStore`，`live` 事件交给 `@actspace/client/live`，`tasks` 和 `approvals` 事件更新各自状态；
    - 滚动到顶部时调用 `sessions.page { beforeSeq }`。
  - `src/sessions/transcript-model.ts`，纯函数：
    - 合并已落盘消息块和流式消息块，规则与桌面端 `renderer/session/transcript.ts` 一致；
    - 把相邻的 read / search / grep / glob / web_search 合并成一个探索分组。
- 测试：
  - `transcript-model.test.ts`：探索分组、流式块在落盘后被替换、空会话；
  - `use-session-observation.test.ts`：用假客户端验证 epoch 替换和重连后重新订阅。
- 验证：`pnpm --filter @actspace/web test`。

**C6 消息渲染**

- 新建 `src/pages/session/blocks/` 下的以下组件：
  - `UserBubble`
  - `AssistantText`：react-markdown + remark-gfm，不启用 rehype-raw，链接协议白名单为 `https:`、`http:`、`mailto:`，`target="_blank" rel="noreferrer"`
  - `ThinkingRow`
  - `ExploreGroup`
  - `DiffCard`：超过 12 行时折叠
  - `BashRow`：点开后用 `sessions.output` 分页读取输出
  - `TodoCard`
  - `ErrorRow`
  - `EventRow`
  - `GenericToolRow`：用 `toolPreview`
- 新建 `src/pages/session/SessionDetail.tsx`、`DetailHeader.tsx`。
- 测试：
  - `AssistantText.test.tsx`：`<script>` 原样显示为文本，`javascript:` 链接不生成 `href`；
  - `DiffCard.test.tsx`：13 行时显示「还有 1 行」。
- 验证：`pnpm --filter @actspace/web test`。

**C7 审批**

- 新建以下文件：
  - `src/pages/session/ApprovalCard.tsx`；
  - `src/sessions/use-approval-decision.ts`：提交中、已决定、失败三种状态，不允许重复提交。
  - `src/sessions/grant.ts`：`commandPrefixGrant(suggestion)`，规则与桌面端 `getCommandPrefixGrant` 一致。
- 测试：
  - 三种决定分别发出正确的 `approvals.decide` 参数；
  - 失败后按钮恢复可用；
  - 没有前缀建议时不显示「本会话允许」。
- 验证：`pnpm --filter @actspace/web test`。

**C8 输入框**

- 新建以下文件：
  - `src/pages/session/Composer.tsx`、`StatusLine.tsx`、`ModeSheet.tsx`、`ModelSheet.tsx`、`QueuedBubble.tsx`。
  - `src/sessions/composer-state.ts`，纯函数：`primaryAction({ hasText, running, awaitingApproval, connected })` 返回 `"send"`、`"stop"` 或 `"disabled"`。
  - `src/sessions/use-composer.ts`：
    - 发送用 `tasks.submit`，`submissionId` 用 `crypto.randomUUID()`，失败重试时沿用同一个；
    - 停止用 `tasks.command stop`；
    - 撤回排队用 `tasks.command cancel`；
    - 模式用 `sessions.update`，遇到 `CONFLICT` 时取新 revision 重试一次；
    - 模型和推理档位用 `tasks.command configure`；
    - 草稿存在 `sessionStorage`，按会话区分。
  - `src/sessions/model-options.ts`：`effortOptionsFor(modelId)`，查 `@actspace/shared/model-catalog-data`，判定方式与桌面端远端路径一致；模型不在目录里时返回空数组。
- 宽屏时 Enter 发送，Shift+Enter 换行；窄屏时 Enter 只换行。
- 测试：
  - `composer-state.test.ts`：覆盖全部组合；
  - `use-composer.test.ts`：重试沿用同一个 `submissionId`，CONFLICT 重试一次；
  - `model-options.test.ts`。
- 验证：`pnpm --filter @actspace/web test`。

**C9 新建会话**

- 新建以下文件：
  - `src/pages/sessions/NewSessionPanel.tsx`、`WorkspaceSheet.tsx`。
  - `src/sessions/create-session.ts`：依次执行 `sessions.create` → 模式变更（需要时）→ `configure`（需要时）→ `tasks.submit`，并通过回调报告进度；任何一步失败都抛出带步骤名的错误。最近使用的工作区存在 `localStorage` 的 `actspace.web.lastWorkspace`。
- 测试：`create-session.test.ts` 用假客户端，覆盖：
  - 调用顺序正确；
  - 模式是默认值时跳过 `sessions.update`；
  - 第三步失败时错误里带步骤名。
- 验证：`pnpm --filter @actspace/web test`。

**C10 设置页**

- 新建 `src/pages/settings/SettingsPage.tsx`，内容有：
  - 当前服务器的地址和设备名；
  - 「断开并移除」：二次确认后清除 saved-hosts，回到连接页；
  - 外观三态；
  - 版本号，由构建注入。
- 验证：浏览器 mock 里手动操作。

**C11 移动端细节**

- 改动：
  - 输入框获得焦点时，用 `visualViewport` 的 `resize` 事件调整底部偏移，保证输入框在键盘上方。
  - 状态栏颜色随主题切换。
  - 列表行按下时显示反馈。
  - 图标按钮补齐 Tooltip。
- 验证：C12 浏览器验收里用 390×844 窗口检查。

### D. 验收与文档

**D1 本机联调**

- 新建 `apps/web/dev-host.config.example.json`，内容是一个回环、无 TLS、带一个工作区和 `webRoot: "./dist"` 的示例配置。
- `apps/web/README.md` 写清两条流程：
  - 开发：`actspace-agent host serve --mock --config <path>` 加 `pnpm dev:web`；
  - 同源预览：`pnpm --filter @actspace/web build` 后由 Host 托管 `dist`。
- 验证：两种方式都能完成配对并进入列表。

**D2 浏览器验收（C12）**

按设计规范 §13 执行：Chrome 390×844 和 1440×900，浅色、深色。

逐项走：
- 连接
- 列表
- 新建
- 详情流式输出
- 审批三种决定
- 运行中排队和撤回
- 停止
- 模式
- 模型
- 断网后重连
- 设置页断开

截图存放在 `docs/exec-runs/20261017-web-pwa-client/`。

**D3 文档同步**

- `docs/ARCHITECTURE.md`：apps 列表增加 `apps/web`，以及它与 agent-host 的依赖方向。
- `docs/FRONTEND.md`：增加 web 入口和设计规范链接。
- `docs/SECURITY.md`：写入以下内容：
  - web token 存储方式；
  - CSP；
  - 回环 http 来源放行的条件；
  - 静态托管的路径校验。
- `docs/design-docs/frontend/README.md`、`docs/design-docs/index.md`：设计规范状态改为「已实施」。
- 本计划移到 `completed/`，`docs/exec-plans/README.md` 同步。
- `docs/exec-plans/tech-debt-tracker.md`：登记以下两项：
  - 「web 构建产物打进 agent-cli 包并默认托管」；
  - 「token 抽成共享包（第三个消费者出现时）」。
- `docs/histories/`：按 `docs/HISTORY_GUIDE.md` 记一条。

**D4 真机验收（用户执行）**

- 按设计规范 §6 用 Tailscale 方式部署。
- iPhone Safari 打开页面，添加到主屏幕，以全屏方式走一遍 D2 的流程。
- 锁屏 1 分钟后回来，应自动重连。
- 在服务器上执行 `host revoke`，页面应回到连接页。
- 结果写入执行摘要。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-host test`
  - `pnpm --filter @actspace/client build && pnpm --filter @actspace/client test`
  - `pnpm --filter @actspace/desktop typecheck && pnpm --filter @actspace/desktop test`
  - `pnpm --filter @actspace/web typecheck && pnpm --filter @actspace/web test && pnpm --filter @actspace/web build`
  - `pnpm check:packages && pnpm check:frontend-tokens && pnpm check:frontend-theme && pnpm check:current-docs`
  - `pnpm typecheck && pnpm test`
- 手工检查：D2 浏览器验收、D4 真机验收。
- 观测检查：Host 日志里没有未捕获异常；浏览器控制台没有报错。

## 进度记录

- [x] 2026-10-17 三版 Demo 对比，用户选定 V1，并确认响应式、功能范围和 `apps/web` 位置。
- [x] 2026-10-17 写设计规范和本计划；Demo 增加 V1 宽屏画面。
- [x] 2026-10-17 用户确认 D1–D4，要求完整实现。
- [x] 2026-10-17 A1–A5：Host 同源托管、回环来源放行、host 频道 activity 事件、`@actspace/client/live` 抽取、check 提示。
- [x] 2026-10-17 B1–B5：`apps/web` 脚手架、PWA（manifest / 图标 / Service Worker / 更新提示）、UI 原语、检查脚本覆盖 web。
- [x] 2026-10-17 C1–C11：连接与配对、会话列表、新建、详情流式、审批、输入坞与排队、模式 / 模型、设置、未读、移动端细节。
- [x] 2026-10-17 D1–D3：同源托管 + 开发两种运行方式；Chrome 390×844 / 1440×900 浅深色验收截图；文档同步。
- [x] 2026-10-18 视觉重做：`mobile-web-v2-demo.html` 对比后用户选 B · 轻玻璃，实施并完成浏览器验收（截图 `docs/exec-runs/20261017-web-pwa-client/screenshots-b/`）。
- [x] 2026-10-18 提交并开 PR 合入 `main`，与其他功能一起测试。
- [ ] D4 真机验收（用户执行，iPhone + Tailscale）。通过后本计划移到 `completed/`。

## 决策记录

- 2026-10-17：选 V1（Happy 原生移植）。原因：首页即会话列表、底部输入坞即新建入口，手机上最顺手，也最接近参考项目。
- 2026-10-17：手机和宽屏共用一套响应式代码，宽屏功能不超过手机。原因：避免做成第二个桌面端，只维护一套功能。
- 2026-10-17：`apps/web` 直接说 Host 协议，不复用 Electron bridge。原因：桌面 bridge 是 IPC 到 Host RPC 的翻译层，浏览器可以直接用 `HostClient`。
- 2026-10-17：用户确认 D1 同源托管、D2 回环 http 来源、D3 抽取流式逻辑、D4 Tailscale 测试证书，理由见设计规范 §3。
- 2026-10-17：A4 按计划「原样移动 + 改 import」：纯逻辑移到 `packages/client/src/live/`，桌面端原文件改为从 `@actspace/client/live` 重新导出（保留原路径，桌面端 import 不动），`live-run-store.ts` 只留 React 封装。
- 2026-10-17：Vite 开发端口用 5174（`VITE_DEV_PORT` 可改），不用计划里的 5173。原因：desktop 的 Vite 已占用 5173，两个一起开会冲突。
- 2026-10-17：静态页面 CSP 的 `connect-src` 除 `'self'` 外显式列出本页 host 的 `ws://` / `wss://`（取 `X-Forwarded-Host`，否则 `Host`，并校验格式）。原因：Safari 旧版本对 `'self'` 是否包含 WebSocket 不一致，`tailscale serve` 转发后 Host 头也可能是回环地址。
- 2026-10-17：`ConnectionStore` 在 `main.tsx` 创建并传给 `App`，不在组件里创建和销毁。原因：React StrictMode 开发时会卸载再挂载一次，组件里销毁会把连接永久关掉，表现为配对一直失败。

- 2026-10-18：视觉改为 B · 轻玻璃（iOS 原生感）。原因：web 端主要在手机上用，用户比较现状 / A / B 后认为 B 最好看。同时确认：空输入发送钮浅灰 34px；保留「拒绝后告诉 Agent 怎么做」；工具动作用英文，与桌面端一致；只改样式和交互，不改数据与连接逻辑。
- 2026-10-18：不做假数据。统计胶囊（TTFT / TPS）、Host 版本、检查更新、审批提醒、列表「失败」状态、重新生成、↳ 引导都没有数据或功能来源，demo 里有也不实施；用量胶囊、上下文环、改动卡只在 Host 给出对应数据时显示。
- 2026-10-18：桌面端的按轮拆分（`turns.ts`）、Worked for 时长、本轮用量行规则在 web 里重写为纯函数（`apps/web/src/sessions/turn-model.ts`、`usage-format.ts`）。原因：web 不能依赖 desktop；两份规则靠测试和人工对齐，登记技术债。
- 2026-10-18：先合入 `main` 再做 D4。原因：用户希望在 main 上和其他功能一起测。

## 执行模式

- **交互模式**：A4 涉及桌面端重构，A1–A3 涉及 Host 网络边界，都属于需要人在线审批的改动。C 组的边界清楚，用户同意后可以改为夜间模式分批执行。

## 执行文档

执行开始时，在 `docs/exec-runs/20261017-web-pwa-client/` 创建以下两份文档（模板在 `docs/exec-runs/templates/`）：

- `execution-process.md`：执行过程中持续更新，记录关键步骤、决定和问题，包括 A4 选的是哪种抽取方式。
- `execution-summary.md`：执行结束后填写，重点写人工验证指引，以及 D4 的结果。
