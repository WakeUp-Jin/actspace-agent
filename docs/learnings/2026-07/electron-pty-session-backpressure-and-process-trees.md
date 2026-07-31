# Electron 交互式 PTY：会话、背压与进程树

关联变更：`docs/histories/2026-07/20260730-1501-right-panel-terminal-design-plan.md`

## 是什么

交互式终端不是“执行一条命令然后收集 stdout”。它需要 PTY 来模拟真实终端设备，让 shell、`vim`、REPL、颜色、Ctrl+C 和窗口尺寸获得和系统终端一致的语义。在 Electron 中，一个稳妥的首版结构是：main 持有 PTY 与进程生命周期，preload 暴露窄 IPC，renderer 只持有 xterm 显示实例。

## 为什么不能直接在 renderer spawn

renderer 如果能传 executable、argv、cwd 和 env，就等于获得通用本机进程启动能力；XSS 或错误 UI 状态都可能扩大为任意命令执行。更安全的契约只允许 renderer 传 `sessionId`、`terminalId`、输入和尺寸，main 再从已登记会话解析 workspace，并自行选择 shell 与脱敏环境。

这也让所有权可被验证：每个终端记录创建它的 `webContents.id`，后续 attach、write、resize、ACK 和 close 都从 IPC sender 取身份，而不是相信 renderer 自报 owner。

## 为什么输出需要 ACK

PTY 能在很短时间产生大量输出。如果每个 data callback 都直接发 IPC，消息数量会先压垮 renderer；如果只做批处理但不做流量控制，renderer 仍可能持续落后，main 的待发送数据和 xterm 写入队列会无界增长。

可迁移的做法是：

1. main 用短周期合并 PTY data，并把单个 IPC payload 限制在固定字节数。
2. renderer 调用 `xterm.write(data, callback)`。
3. 只有 callback 表示该批已被 xterm 消费后，renderer 才 ACK 对应 UTF-8 字节数。
4. main 的未确认字节超过高水位就 `pause()` PTY，降到低水位再 `resume()`。

高低水位必须分开，否则在临界值附近会频繁 pause / resume，形成抖动。回放缓冲也必须独立设上限；attach 恢复不是无限历史存储。

## 关闭一个 PTY 为什么要杀进程树

shell 只是根进程。用户可能启动 dev server、后台任务或再派生一层脚本；只 kill shell 会让子孙被系统重新托管，最终留下看不见的端口占用和后台耗电。

关闭策略应先读取父子关系，按叶子到根节点发送温和终止信号，给短暂宽限，再处理仍存活的进程。Tab close、会话归档、窗口销毁和 App quit 必须复用同一治理原则，但用户 Terminal Registry 与 Agent Bash Registry 仍应保持独立，避免混淆安全语义和任务身份。

## 开发命令也需要明确的进程所有者

`pnpm dev 2>&1 | tee log` 看起来只是“顺便写日志”，实际上 pipeline 会增加 shell、pnpm、tee 等多个进程，让 Ctrl+C 的接收者、前台进程组和真正需要退出的 watcher 之间变得模糊。`concurrently -k` 只能在自己观察到子命令退出后清理其他命令；如果 SIGINT 没有可靠到达对应进程，`-k` 并不会自动解决问题。

更稳定的模式是使用一个长期存活的监督器作为唯一所有者：

1. 监督器启动受管命令，并在 Unix 上为它建立独立进程组。
2. 监督器自己留在终端前台接收 SIGINT / SIGTERM，再把信号发送到整个受管进程组。
3. stdout / stderr 由监督器复制到终端和日志文件，不再通过额外 pipeline 改变进程拓扑。
4. 温和信号超过宽限仍未退出时，监督器才向同一进程组发送 SIGKILL。
5. 受管根进程即使是因错误自行退出，监督器也要对原进程组做一次退出后收割；包管理器 wrapper 可能已经退出，但 `wait-on`、dev server 或其他孙进程仍活着。
6. 自动化测试必须同时包含“收到 Ctrl+C”和“根命令报错退出但孙进程仍运行”的 fixture，只验证直接 child 退出不足以证明没有孤儿 watcher。

这个模式不仅适用于 Electron，也适用于同时启动 API、前端 dev server、编译 watcher 和 worker 的任何本地开发脚手架。

## 异步资源创建需要可取消的 UI 状态

“点击后 await 创建资源，成功后再打开页面”会制造两个问题：用户在等待期间没有明确位置感；如果 UI 已经离开，异步请求完成后可能创建一个没有可见所有者的后台资源。

适合 Terminal、上传任务、远程会话等资源的状态流是：

1. 先创建带 request id 的 `starting` UI 对象。
2. 并行准备互不依赖的前端模块与后端资源。
3. 成功后用同一个 Tab id 原位替换为 ready 状态，避免两段 loading 跳变。
4. 用户关闭 starting UI 时只记录取消意图；如果后端随后成功，立即执行资源清理。
5. 关闭 ready 资源时显示 `closing`，阻止重复请求，只有后端确认清理后才移除 UI。

关键点是“取消 UI”不等于底层异步调用真的被取消。没有原生 cancellation 的 API 必须在完成回调里检查取消状态，并补偿性释放已经创建的资源。

## 原生打包的反直觉陷阱

`node-pty` 的 npm 包可能同时包含多个平台和架构的 prebuild。用 `find ... -name pty.node -print -quit` 校验产物会随机拿到第一个文件，甚至把 Windows arm64 当成当前 macOS arm64。发布脚本必须按 `prebuilds/<platform>-<arch>/` 精确定位，并同时验证：

- `pty.node` 与 `spawn-helper` 都存在。
- `file` 输出匹配目标架构。
- `spawn-helper` 有 executable bit。
- 嵌套 native 文件先完成签名与校验，之后再签外层 `.app`。

另一个陷阱是包管理器可能出于供应链安全忽略 install script，导致 helper 权限没有准备好。把这一动作收口成显式、可审计的 `native:prepare` 比依赖隐式 postinstall 更可靠。

## ANSI 颜色是协议角色，不是应用品牌色

xterm 提供默认 ANSI 16 色板。即使应用已经把背景、正文和灰色接入主题，只覆盖 `foreground`、`background`、`black` 与 `brightBlack` 仍不够：shell prompt、`ls`、Git 和测试工具经常输出 bright green / cyan / blue / red，未覆盖的角色会静默回落到 xterm 的高饱和默认值，于是终端看起来像一块脱离产品设计系统的彩色贴片。

可迁移的处理方式不是修改用户的 `PS1`，而是在终端渲染边界做完整协议色板翻译：

- neutral 映射 ANSI black / white。
- operational 映射 green。
- info、warning、danger 分别映射 blue、yellow、red。
- 低饱和 visualization 色映射 cyan / magenta，保留 CLI 内容区分但不把它们升级为应用操作色。
- normal 与 bright 角色都必须显式给值；主题变化时更新 xterm options，不重启 shell。

这样同一套用户 shell 配置在系统终端中保持原样，在应用内则遵循产品的 Light / Dark / System 主题。测试时应直接断言 16 个 ANSI 字段，而不是只截图验证某一个 prompt，因为其他 CLI 可能使用不同色号。

## 自检问题

1. renderer 为什么不应该传 cwd，即使 UI 中的路径看起来来自合法 workspace？
2. 只有 16ms 批处理、没有 ACK 和高低水位时，大输出仍会在哪里积压？
3. 为什么发布脚本不能只验证“包里存在某个 pty.node”？
4. 为什么只设置 xterm 的 foreground / background 仍可能出现荧光色？
5. 为什么给开发命令加 `concurrently -k` 仍不能替代明确的信号所有者？
6. 用户关闭 starting Tab 后，为什么不能简单忽略创建请求的返回值？
