# Web / PWA 客户端：决策与验收归档

归档：来自原《Web / PWA 客户端规范》（2026-10-17 实施，`apps/web`）。现行规则见 `docs/design-docs/frontend/front-web-pwa客户端规范.md`；本文保留当时确认的决策表（D1–D4 及用户确认项）和验收清单。视觉方案最终采用「B · 轻玻璃」（iOS 原生感、手机优先），结构沿用 Happy 原生移植的 V1（含宽屏两栏）；参考项目为 slopus/happy 的 `packages/happy-app`。

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

## 13. 验收

- 工程：`pnpm --filter @actspace/web typecheck`、`test`、`build`；`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`；Host 和 client 包的测试。
- 浏览器：Host 以 `serve --mock` 运行，Chrome 分别在 390×844 和 1440×900 两个窗口下，浅色、深色各走一遍：连接、列表、新建、详情、审批、排队、停止、模式、模型。
- 真机：iPhone Safari 按 D4 的 Tailscale 方式打开，添加到主屏幕，以全屏方式走一遍上面的流程；锁屏 1 分钟后回来能自动重连；在服务器上吊销设备后页面回到连接页。

