# HTML 渲染与沙箱安全规范

## 定位

这份文档定义 `actspace` 桌面端**如何安全地渲染 HTML**，覆盖两类来源：

1. **聊天生成的 HTML**：模型在回复里直接输出、或把内容转换成的一段 HTML 代码，用户希望直接看到渲染效果。
2. **本地 HTML 文件**：工作区里的 `.html` 文件，在右侧面板里渲染预览。

它是右侧面板渲染主线之一，面板外壳 / Tab / 宽度规则见 `右侧面板与文件渲染规范.md` 与 `工作台布局与面板交互规范.md`；任何带颜色的样式仍受 `主题与配色规范.md` 约束。

核心判断（已和用户对齐）：**渲染 HTML 不需要自研渲染器，也不需要嵌入完整浏览器；最轻且正确的方式是 `sandbox` 属性的 `<iframe>`。** Cursor / Codex 的 "Browser" 是完整 Chromium（webContents / webview）+ CDP 自动化，定位是"让 agent 真实浏览/操作网页"，对"渲染一个 HTML"是过度设计。Claude、VS Code、open-design 等成熟实现的预览层本质都是 iframe。

## 威胁模型（为什么必须沙箱）

被渲染的 HTML **默认视为不可信或半可信**：

- 本地 HTML 文件可能来自任意来源（下载、克隆、他人产出），可能含恶意脚本。
- 聊天生成的 HTML 由模型产出，属半可信，仍可能被提示注入诱导写出窃取性脚本。

要防住的风险：

- **越权访问宿主**：iframe 脚本读到宿主 renderer 的 DOM / `window.actspace` / Electron preload API / 本地存储。
- **数据外联（exfiltration）**：脚本通过 `fetch` / `XHR` / `WebSocket` / `sendBeacon` 把本地信息发到外部。
- **Electron 特权升级**：拿到 `nodeIntegration` / `require` / 文件系统能力。
- **导航劫持 / 弹窗滥用**：`window.open`、`top.location` 跳转、表单提交到外部。

两道闸，职责不同，**都要上**：

- **`sandbox` 属性 = 权限闸**：隔离 origin、默认禁脚本/表单/弹窗/同源，按需精确放开。它是"减权限"开关，几乎零成本。
- **CSP（Content-Security-Policy）= 资源/网络闸**：限制能加载什么、能连到哪，专治外联。

> 关键安全铁律：**同源 `srcDoc` 绝不能同时开 `allow-scripts` 与 `allow-same-origin`。** `srcDoc` 默认继承宿主 origin，两者同开时 iframe 脚本可摘掉自身 sandbox、够到宿主。Claude 之所以能用 `allow-scripts allow-same-origin`，是因为它的 artifact 跑在**独立 origin**（`claude.site` / 内部 coordinator URL），那里的 "same-origin" 指 artifact 自己的 origin，与主程序隔离。本仓库的独立 origin 方案属于 V2。

## 渲染分层

| 来源 | 形态 | 处理方式 |
| --- | --- | --- |
| 聊天 HTML — 整页文档 | 完整 `<html>` / 自包含片段 | 一律塞进 `sandbox` iframe（`srcDoc`），不直接 `dangerouslySetInnerHTML` 整页 |
| 聊天 HTML — 行内小片段 | 一小段标签 | 先 DOMPurify 净化再内联渲染；或同样丢 iframe |
| 本地 HTML 文件 | `.html` | V1 自包含走 `srcDoc`；带相对资源走 V2 的独立 origin |
| MD→HTML 转换产物 | 主模型把回复转出的 HTML | 半可信，按"整页文档"走 `sandbox` iframe（默认 `relaxed` CSP）；生成与缓存见 `消息可视化转换规范.md` |

## V1：简单 + 安全（本轮范围）

V1 的目标是"能渲染、且默认安全"，**不追求多文件、相对资源、交互桥的完整能力**。

### iframe 沙箱配置

- 渲染容器：`<iframe srcDoc={html} sandbox="allow-scripts" />`。
  - 需要页面跑 JS 时给 `allow-scripts`；**绝不加 `allow-same-origin`**（见上方铁律）。
  - 纯静态展示（不需要 JS）时可连 `allow-scripts` 都不给，进一步收紧。
- Electron 侧：iframe 为 renderer 内的普通 frame，默认无 `nodeIntegration`；不使用 `<webview>`；不暴露 preload。预览**不得**获得任何 `window.actspace` / Node / 文件系统能力。

### CSP（注入到 srcDoc 的 `<meta http-equiv>`）

CSP 按来源信任级分两档，**默认从严**：

- `strict`（本地 HTML 文件默认）：只渲染自包含内容，禁一切外联。
  - `default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none';`
- `relaxed`（聊天生成 HTML，或用户在文件预览里主动点"信任并加载外部资源"）：允许 https 静态资源（很多产物用 Tailwind/字体 CDN），但**禁 `connect-src`** 阻断外传。
  - `default-src 'none'; img-src https: data: blob:; style-src https: 'unsafe-inline'; font-src https: data:; script-src https: 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none';`

> 分工记忆：`sandbox` 拦住"够到宿主 / 升特权"，`connect-src 'none'` 拦住"把数据发出去"。没有 `allow-same-origin` 时 iframe 已读不到宿主 origin 的 cookie/storage。

### 最小 postMessage 桥（单向回传，够用即可）

iframe → 父窗口只回传两类信息，父窗口不向 iframe 注入可执行内容：

- **运行时错误 / console.error**：在面板里显示"预览出错"提示（对标 open-design 的 iframe-error 观测）。
- **内容高度**：父窗口据此撑高 iframe，避免出现内层 + 外层双滚动条。

父窗口校验 `event.source === iframe.contentWindow` 后才处理，忽略其他来源消息。

### 主题注入

往 `srcDoc` 注入一小段基线：`color-scheme: light dark;` 及最小排版样式，让预览的默认色随浅/深主题观感一致；不强行覆盖产物自带样式。

### 聊天行内 HTML 片段

走 DOMPurify：限定 `ALLOWED_TAGS` / `ALLOWED_ATTR`、`sanitizeUrl`（只放行 `http/https/mailto`），再内联。需要脚本/复杂结构的，升级为整页 iframe 路径。

### V1 明确边界（不做）

- 不支持相对资源（同目录 `css/img/js`）——`srcDoc` 没有 base URL，相对路径会失效。
- 不支持页面内导航、`window.open` 新开浏览器、跨页跳转。
- 不持久化 iframe 状态、不做 keep-alive 池。
- 不提供父→子双向交互桥（截图、inspect、实时调参）。
- 不嵌入完整浏览器、不接 CDP。

## V2：完整版（计划先写，**等用户指令再实现**）

> V2 不在当前实现轮次。下列能力作为方向沉淀，**必须在用户显式指令后**才动工。

- **独立 origin**：在 Electron main 注册限定 workspace 根的自定义协议（如 `actfile://`），或本地静态端口；iframe 用 `src` 指向它。借鉴 VS Code Webview 的 `localResourceRoots`（越界白名单）+ `asWebviewUri`（本地文件映射成独立 origin 安全 URL）+ CSP nonce。
- **此时安全地开 `allow-scripts allow-same-origin`**：因为内容在独立 origin，与宿主隔离，可支持相对资源、`storage`、多文件 artifact。
- **相对资源 / 多文件产物**：对应 open-design 的 "URL-load" 策略。
- **iframe keep-alive 池**：多预览切换时复用 iframe 提性能（对标 open-design `IframeKeepAlivePool`）。
- **外部浏览器逃生口**：一键把产物丢给系统浏览器（对标 open-design `browser-open.ts`）。
- **双向交互桥**：截图导出、元素 inspect、实时调参、状态同步。
- **更细 CSP + nonce**：脚本须带 nonce，逐步收紧 `'unsafe-inline'`。
- **发布/分享隔离**：若做对外分享，走独立域名 / 独立端口（对标 Claude `claude.site`）。

## Electron 安全基线（main / preload）

- renderer 不直接访问文件系统；读取 HTML 文件内容统一经 preload / IPC（契约见 `右侧面板与文件渲染规范.md` 演进）。
- 主进程保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox` 合理开启；预览 iframe 不挂任何 preload。
- V2 自定义协议必须做路径规范化与越界拒绝（拒绝 `..` 逃出 workspace 根）。

## 验收

- V1 自包含 HTML（含内联 `<script>`）能在右侧渲染；预览**拿不到** `window.actspace` / Node。
- 注入"试图 `fetch` 外部 / 读取 `localStorage` / 访问 `parent`"的探针 HTML：网络被 CSP 拦截、宿主访问被 sandbox 拦截。
- 资源加载失败时显示可读错误（经 postMessage 回传）。
- 浅色 / 深色两套主题下预览观感一致。
- `srcDoc` 路径**不出现** `allow-same-origin`。

## 关联

- `右侧面板与文件渲染规范.md`：右侧面板外壳、Tab 类型、文件渲染总规则。
- `消息可视化转换规范.md`：把回复 Markdown 转成 HTML 的入口、缓存与数据流（产物在本规范下渲染）。
- `Markdown渲染规范.md`：Markdown 渲染与 Preview/源码切换（与 HTML 共用 Preview/源码模式）。
- `主题与配色规范.md`：颜色随主题翻转的硬约束。
- `工作台布局与面板交互规范.md`：右侧面板宽度与 chrome 让位规则。
- 执行计划：`docs/exec-plans/active/20260527-right-panel-views.md`。
