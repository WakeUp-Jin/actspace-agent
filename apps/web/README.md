# @actspace/web

ActSpace 的浏览器 / PWA 客户端：手机和电脑浏览器通过 WebSocket 连接一台 ActSpace Host（`@actspace/agent-host`），查看会话、实时看回复、审批工具调用、发送消息。设计规范见 [front-web-pwa客户端规范](../../docs/design-docs/frontend/front-web-pwa客户端规范.md)。

- 窄屏（< 1024px）单栏，宽屏两栏；不含 desktop 独有功能（终端、Git 审阅、浏览器）。
- 页面只和同一个 Host 通信：默认地址是 `location.origin`，WebSocket 走 `/rpc`。
- 凭据（配对后得到的 token）保存在本浏览器的 `localStorage`，在服务器上执行 `host revoke` 即可失效。

## 前置：构建依赖

```sh
pnpm install
pnpm --filter "@actspace/client..." build     # web 通过 package exports 使用 @actspace/client 的 dist
pnpm --filter @actspace/agent-cli build        # 得到 apps/cli/dist/cli.js（actspace-agent）
```

## 准备 Host 配置

```sh
cd apps/web
cp dev-host.config.example.json dev-host.config.json   # 已在 .gitignore
mkdir -p .dev-workspace                                 # 示例工作区；可改成任意已有目录的绝对路径
```

配置里的相对路径都相对配置文件本身。`providers[].keyEnv` 指定的环境变量**必须存在**（mock 模式下也会检查），真实 key 只通过环境变量提供，不写进文件。

## 流程一：开发（Vite 热更新）

```sh
# 终端 1：Host（--mock 不调用真实模型，回复是固定的演示文本）
export DEEPSEEK_API_KEY=sk-test-mock  # --mock 下任意非空值即可
node ../cli/dist/cli.js host serve --mock --config dev-host.config.json

# 终端 2：页面，http://127.0.0.1:5174（desktop 占用 5173）
pnpm dev:web            # 在仓库根目录执行；/rpc 由 Vite 代理到 ACTSPACE_HOST_URL（默认 http://127.0.0.1:4317）

# 终端 3：生成一次性配对码，填进页面
node ../cli/dist/cli.js host pair --config dev-host.config.json
```

回环 http 来源（`http://127.0.0.1:*`、`http://localhost:*`）只在 Host 不启用 TLS 时放行，所以开发时 `allowedOrigins` 可以为空。

## 流程二：同源预览（Host 托管 dist）

```sh
pnpm --filter @actspace/web build                       # 产出 apps/web/dist，配置里 webRoot 指向它
node ../cli/dist/cli.js host serve --config dev-host.config.json
# 浏览器打开 http://127.0.0.1:4317 ，再用 host pair 生成配对码
```

## 用真实模型

去掉 `--mock`，把 `DEEPSEEK_API_KEY` 换成真实 key：

```sh
export DEEPSEEK_API_KEY=sk-...
node ../cli/dist/cli.js host serve --config dev-host.config.json
```

用其他服务商时修改 `providers`：`type` 可选 `openai-completions`、`openai-responses`、`anthropic-messages`；`baseUrl` 必须是 https（或回环 http）；`defaultModel` 写成 `<provider id>/<model>`。

## 在手机上打开（Tailscale）

Host 继续只监听 `127.0.0.1`，由 Tailscale 提供带有效证书的 HTTPS，手机不用装证书，离开局域网也能用。

1. Mac 和手机都安装 Tailscale 并登录同一个账号；在 Tailscale 管理后台开启 MagicDNS 和 HTTPS Certificates。
2. Mac 上执行 `tailscale serve --bg --https=443 http://127.0.0.1:4317`，记下输出的地址 `https://<机器名>.<tailnet>.ts.net`。
3. 把这个地址（不带结尾斜杠）写进 `dev-host.config.json` 的 `allowedOrigins`，重启 Host（流程二，需要先 build）。
4. 手机打开该地址 → Mac 上执行 `host pair` → 在手机输入配对码。iPhone Safari 可以「分享 → 添加到主屏幕」，以全屏方式使用。
5. 不用时 `tailscale serve --https=443 off`。

常用管理命令：`host status`、`host devices`、`host revoke --device <id>`、`host stop`（都需要 `--config dev-host.config.json`）。Ctrl+C / `host stop` 是优雅停止，会等进行中的 Run（包括卡在审批的）结束；急着停就用 `host stop --force`。

## 图标生成

图标源文件：`public/icons/icon.svg`（圆角，用于 any）与 `scripts/icon-full-bleed.svg`（直角铺满，用于 maskable 与 apple-touch-icon，字母在 80% 安全区内）。PNG 由无头 Chrome 渲染，在 `apps/web` 目录运行：

```sh
./scripts/gen-icons.sh
```

脚本内核心命令（每个尺寸一次，页面里只放一张 `<img>`，背景透明）：

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 --allow-file-access-from-files \
  --screenshot=public/icons/icon-512.png --window-size=512,512 file:///tmp/i.html
```

输出：`icon-192.png`、`icon-512.png`（来自 icon.svg）、`icon-maskable-512.png`、`apple-touch-icon.png` 180px（来自 icon-full-bleed.svg，无透明通道）。
