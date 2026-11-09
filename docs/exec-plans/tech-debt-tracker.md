# 技术债追踪

这里记录那些暂时不阻塞当前任务、但已经值得留档的技术债。

## Agent 存储遗留

- 中性存储冷读采用完整一致快照和有界内存缓存；列表初次重建会遍历会话。后续在真实大历史上测量峰值内存/延迟，再决定 Provider 扩展，不恢复通用层直接读取 JSONL 偏移。

## 前端设计 token 遗留

2026-09-26 设计 token 收口（`completed/20260926-frontend-design-token-convergence.md`）后仍保留的写死值和未统一控件：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-09-26 | renderer 间距 | 组件中仍有 `p-[7px]`、`gap-[9px]`、`py-[5px]` 等间距写死值，没有纳入 `check:frontend-tokens`。 | 先统计分布，决定是否收敛到 4px 网格或登记例外，再加检查规则。 |
| 2026-09-26 | 内容边界 CSS | `styles/markdown.css`、`diff.css`、`tool-result.css`、`web-tool.css` 内部仍用 px 字号。 | 这些文件服务模型输出和第三方 DOM，改为 `var(--text-act-*)` 前需逐个对照渲染结果。 |
| 2026-09-26 | 未迁移的按钮形态 | 菜单项（Composer 命令菜单、模型列表）、下拉触发器（Composer 模式 / 模型选择器）、分段控件（预览 / 源码切换）仍是各自的样式常量；Composer 附件删除按钮、Sidebar 会话行置顶 / 归档等内联按钮未改为 `IconButton`。2026-10-06：消息操作菜单和 `SettingsSelect` 已由 Desktop 前端重构 16 改用 `ui/Menu`、`ui/Select`；原生按钮数由 `check:frontend-tokens` 的基线守住，不再增加。 | Composer 的随 09 迁移；分段控件随 `active/frontend-ui-components-foundation.md` 的 `Tabs`。 |

## Desktop 前端组件遗留

2026-10-06 Desktop 前端重构 16（UI 原语与组件拆分，`completed/20261005-desktop-frontend-refactor/16-UI原语与组件拆分执行计划.md`）之后仍未处理的项，结果见 `docs/exec-runs/20261005-desktop-fe-16-ui-primitives/execution-summary.md`：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-06 | renderer / 文件行数 | `settings/SettingsPrimitives.tsx` 856 行、`workspace/WorkspaceChromeControls.tsx` 662 行，超过 500 行（RightPanel 已拆到 `right-panel/`，不再超标）。SettingsPrimitives 剩下的组件都被两个以上设置文件使用，再降要拆成多个文件。 | SettingsPrimitives 按行 / 表单控件 / 菜单拆成 `settings/primitives/`；WorkspaceChromeControls 按控件拆。 |
| 2026-10-06 | renderer / 手写弹层 | `right-panel/RightPanelTabStrip.tsx` 的标签溢出菜单（菜单项里嵌「关闭标签」按钮）没有迁到 `components/ui/`，仍自己监听 Escape 和外部点击（`ModelMultiSelector` 已随模型页重做删除）。 | 先改交互（关闭按钮挪出菜单项或改子菜单）再换 `ui/Menu`。 |
| 2026-10-06 | renderer / 死状态 | WorkbenchLayout 的 `usageSnapshot` 状态从未被写入（`setUsageSnapshot` 没有调用方），SettingsPage 收到的恒为 null。 | 先确认 SettingsPage 用量页的数据来源，再删掉这条 prop 链或接上数据。 |
| 2026-10-06 | renderer / 死入口 | `ProviderKeyModal` 打不开：`SettingsPage` 传下去的 `onConnectProvider` 在 `settings/sections/` 里没有调用方（16 之前的 `ProvidersSection` 也只解构不调用）。 | 确认 Provider Key 是否已全部改由模型连接向导录入；是就删掉 `ProviderKeyModal` 和这条 prop，否则补上入口。 |
| 2026-10-06 | renderer / 占位按钮 | Composer 的「更多审查操作」`⋯`（`review-overflow-button`）没有 `onClick`，点了没有反应，16 之前就是这样。 | 补上菜单内容，或先隐藏。09（2026-10-07）只把它搬进 `composer/ReviewStrip.tsx`，行为未改。 |
| 2026-10-06 | renderer / 窄窗 | 窗口最小宽度 480 时打开侧栏覆盖层，会话右键菜单的「复制」子菜单（208px）左右都放不下，翻到左侧后左边约 52px 出界。Radix 只翻转，不在水平方向挪。 | 子菜单加 `max-w-[calc(100vw-16px)]` 并允许文字截断，或窄窗下把两个复制项平铺到主菜单。 |
| 2026-10-06 | renderer / Composer 跨会话状态 | Composer 不按会话重挂（16 之前两个有消息的会话之间也不重挂）：远端会话 A 发送中切到 B，B 的发送按钮也被 `sending` 禁用，直到 A 的请求结束；A 里选的模型运行时选项会带到 B。A 发送中切走、随后失败时，附件只靠 App 的恢复草稿（不带预览）找回，原来的预览 URL 不释放。 | `sending` 按 `draftKey` 记；运行时选项按会话存；失败时把附件写回 A 的附件草稿，和 `draftRestore` 的顺序一起定。09（2026-10-07）只把这部分搬进 `composer/use-composer-send.ts`、`use-composer-model.ts`，行为未改，建议单独做一个「Composer 草稿按会话隔离」小计划。 |

## Desktop 安全遗留

2026-10-06 Desktop 前端重构 11（安全与 IPC，`completed/20261005-desktop-frontend-refactor/11-安全与IPC执行计划.md`）之后仍未处理的项：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-06 | main / 子进程环境（C1） | `settings-service` 的 `applyToEnv` 把搜索服务 Key（`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `EXA_API_KEY` / `TINYFISH_API_KEY`）等写进 `process.env`。以下子进程继承完整环境：bash 工具（`packages/shell/tool-shell/src/node-ports.ts`）、`rg`（`packages/fs/tool-fs-search/src/node-ports.ts`）、git / gh（`review-git-service`、`review-git-engine`、`review-git-worker`、`review-pr-service`、`workspace-environment-service`、`workspace-git-context-service`）、ssh（`remote-hosts/ssh.ts`）、Browser Bridge 命令、本地更新脚本。只有终端 pty 经 `sanitizeEnvironment` 过滤。 | 01 S7：工具配置改由 Runtime 配置端口注入，删除 `applyToEnv`；子进程改用环境变量白名单。需要单独设计。2026-10-07（17）：`applyToEnv` 已集中到 `apps/desktop/src/main/settings/env.ts`，调用点和次数不变，退役时只改这一处和 store 的转调。 |
| 2026-10-06 | main / Browser Bridge 安装 | `browserBridge.installFromRepo`（`fixed-renderer-ipc.ts`）把 renderer 传来的 `repoRoot` 交给 `browser-bridge-service.buildAndInstall`，只校验扩展 manifest（名称、key、扩展 id）就在该目录执行 `build.sh`。renderer 被注入脚本时，可以让 main 在任意满足条件的目录里跑脚本。11 的复核发现，不在 11 范围内。 | 改为 main 弹系统对话框选择源码目录（与 `selectWorkspaceDirectory` 相同的做法），channel 不再接受路径参数。 |
| 2026-10-06 | scripts / IPC 审计 | `check:ipc-channels` 只核对常量、注册和 preload 引用三者一致，不检查注册是否经过 `assertTrustedSender`；preload 只要出现 channel 字符串就算引用，不区分 invoke 和 on。 | 13 落地统一注册器和 IPC contract 后，由注册器强制 sender 校验，审计脚本改为以 contract 为来源并区分方向。 |
| 2026-10-06 | renderer / 主文档 CSP | 主文档没有 CSP。严格策略会拦 mermaid SVG 内的 `<style>`（HTML 预览已在功能减法中删除，不再是阻碍）；应用本身启动、React style prop、highlight.js、`data:` 图片不受影响。实测结论见 `docs/exec-runs/20261005-desktop-fe-11-security-ipc/execution-summary.md`。 | mermaid 样式改走 nonce / hash 或隔离渲染；之后由 main 用 `onHeadersReceived` 注入严格 CSP。 |

## Desktop settings 遗留

2026-10-07 Desktop 前端重构 17（settings-service 拆分，`completed/20261005-desktop-frontend-refactor/17-settings-service拆分执行计划.md`）的特征测试（T1，以及 T6 / T7 变异检查后补的用例）记下的现有行为。17 是纯搬迁，不改；测试按现状断言（`apps/desktop/src/main/test/settings-characterization.test.ts`）。三行已立项：[Desktop settings 写入一致性修复](active/20261007-desktop-settings-write-consistency.md)。

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-07 | main / settings 旧写入口 | 旧接口 `update` / `updateV2` 改 agent 字段时只改内存里的 v3 结构；写 v4 文件时，`toSettingsV4` 只在 v4 对应字段为空时才用它（`taskDefaults.temperature` / `maxOutputTokens` 为 null、`tools.disabledTools` 为空、`tools.bash.alwaysAsk` 为 false）。所以 v4 里已有值时，改动只留在内存和 env，重启或下一次 `updateNamespaceV4` 后回到文件里的旧值；`bashAlwaysAsk` 只能打开、关不掉。renderer 只在 v4 快照不可写时走这条回退（`useToolToggle.ts`、`ToolsSection.tsx`）。 | 旧入口同时写 v4 对应字段，或者删掉 renderer 的旧接口回退。 |
| 2026-10-07 | main / settings 回滚 | `restoreFilesBestEffort` 先恢复 settings.json、再恢复 secrets.json，放在同一个 try 里：恢复 settings 失败时 secrets 不再恢复，磁盘上留着新 key，内存里是旧 key。另外（读代码所得，未写用例）：`writeSecretsFile` 在字节已经落盘后才失败（例如 rename 之后的 chmod）时，`secretsWritten` 还是 false，不会回滚，磁盘和内存同样不一致。 | 两个文件各自恢复；`writeSecretsFile` 一旦开始写就当作「可能已落盘」处理。 |
| 2026-10-07 | main / settings v4 namespace 写入 | `updateNamespaceV4` 以及经它落盘的 custom connection 增改删、连接检测结果：写 settings.json 失败时只把内存恢复成写入前，不恢复文件。字节已经落盘后才报错时，磁盘上是新内容，内存是旧内容，直到下一次写入或重启（17 T7 补的特征测试 `v4 namespace updates` 照录）。 | 失败时也按内存重写一次 settings.json，或者和其他路径一样走 `restoreFilesBestEffort`。 |

## v1 历史债务记录

以下条目保留原日期与旧实现语境，不作为当前 v2 漏洞、缺陷或可直接执行的修复计划。重新立项前须按当前源码核实；当前安全边界见 [执行安全](../design-docs/execution-safety/README.md)。

| 日期 | 区域 | 债务描述 | 为什么会存在 | 计划中的后续动作 |
| --- | --- | --- | --- | --- |
| 2026-05-29 | Agent-core / 安全 | 读取类工具（`read_file`/`grep`/`glob`/`list_directory`）已放开 workspace 边界（`resolveReadablePath`），主 Agent 理论上可读任意本机文件（含 `~/.ssh`、密钥文件等）。 | 上下文压缩需要模型回读 `<userData>/tmp` 的 bash 落盘文件和 `<userData>/sessions` 的完整历史，这些都在 workspace 之外，workspace 硬边界会挡住正常回读（见 `context-compression.md`「读边界放开」）。 | 补「敏感路径 blocklist + 按需读审核」：读类工具命中敏感路径（如家目录密钥、系统配置）时拒绝或升级为审核，而非恢复 workspace 硬限制。 |
| 2026-07-03 | Bash 后台任务 / 收割 | app 崩溃（非正常退出）时 before-quit 不触发，detached 后台进程可能残留。 | 收割依赖正常退出钩子；崩溃场景无进程内兜底。 | 可选：spawn 时记 pid 文件，启动时清理上次残留进程组。 |
| 2026-07-04 | Bash 沙盒 / 网络 | 沙盒 profile 内 `(allow network*)` 全放行：沙盒内命令可连任意域名 / Unix socket，网络维度无隔离。 | 域名过滤需要本地 CONNECT/SNI 代理（profile 全拒网络只放行代理端口 + 子进程注入 HTTP_PROXY），是自研路线最大增量，E5 第一期裁掉。 | 网络代理阶段单独立项；落地后引入 `requiredPermissions: ["full_network"]`。 |
| 2026-07-04 | Bash 沙盒 / 违规归因 | 违规标注只有输出模式匹配一条腿（EPERM / Operation not permitted 等），无 `log stream` 精确归因；程序吞掉错误输出时模型可能拿不到升级证据。 | log stream 监听（按 Seatbelt `with message` tag 过滤 + 降噪）约 200+ 行，不阻塞升级闭环，第一期裁掉。 | 参照 srt `startMacOSSandboxLogMonitor` 补第二条腿。 |
| 2026-07-04 | Bash 沙盒 / 跨平台 | Linux 无 bwrap 沙盒实现：非 darwin 一律真实环境执行且权限层不放宽（回到 allowlist ask）。 | 桌面产品当前只发 macOS。 | Linux 发布前按设计文档 bwrap 路线补齐。 |

## CI 与工程化遗留

2026-11-08 CI 重新上线（`active/20261108-ci-pipelines.md`）时发现、但不在那一轮处理的事项：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-11-08 | Desktop main / git | `runGitCommand` 用 `execFile` 跑 git 并等 stdio 关闭；用户全局 `core.fsmonitor=true` 时，git 会为仓库拉起 fsmonitor 守护进程并继承管道，一次 `git status` 要等 20–30 秒才返回。测试侧已用 `GIT_CONFIG_GLOBAL=/dev/null` 隔离，产品侧没动。 | 在产品的 git 调用里加 `-c core.fsmonitor=false`（或改为 `spawn` + 只等 exit），用开启 fsmonitor 的真实仓库复验。 |
| 2026-11-08 | 依赖 | `katex` 钉在 0.16.x，`pnpm audit` 报一条 low；0.x minor 可能有破坏性改动，没随本轮升。 | 等 Dependabot 的 `runtime-minor-patch` 分组 PR 带上来，对照 Markdown 公式渲染测试后合并。 |
| 2026-11-08 | 测试环境 | `runtime-v2-output-reference-flow.test.ts` 对 `bash -lc` 的输出按行数断言；shell 启动时若有 nvm 等打印告警（如 `npm_config_prefix`），多出的行会让它失败。GitHub runner 上没这个问题，只在装了 nvm 的开发机上出现。 | 断言改成只看目标行，或给测试用的 shell 传 `--noprofile --norc`。 |
| 2026-11-08 | 测试环境 | `packages/core/tool-runtime` 的 `runtime.test.ts` 用 `/workspace/...` 当假的资源路径；机器上真有 `/workspace` 目录（如某些容器）时 3 个用例变成 `denied`。GitHub runner 上没这个问题。 | 测试用例改用 `mkdtemp` 出来的真实工作区路径，而不是硬编码的绝对路径。 |
| 2026-11-08 | Release | ~~`release.yml` 还是手动触发、单平台，且没装 Go。~~ 已在 P4 解决：`v*` tag 触发四平台矩阵 + `actions/setup-go` + 草稿 Release。 | 已完成。 |
| 2026-11-08 | Release / Windows | Windows 产物是 portable zip：`electron.exe` 只是改名，没换图标和版本资源（任务管理器、属性里仍显示 Electron），也没有 Authenticode 签名，首次运行会被 SmartScreen 拦。 | 接 `rcedit`（或 electron-builder / Forge）替换图标与版本信息；签名需要证书，视发行需求再立项。 |
| 2026-11-08 | Electron | `safeStorage.isEncryptionAvailable` / `encryptString` / `decryptString` 在 Electron 45 弃用、46 移除；`apps/desktop/src/main/index.ts` 的 `SecretCrypto` 和 `remote-hosts/credentials.ts` 都在用同步版。 | 在 46 成为 stable 前把 `SecretCrypto` 接口及其调用链（settings store、model-connections、HostCredentials）改为 `isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`。 |
| 2026-11-08 | 供应链安全 | `supply-chain-security.yml` 的 `osv-scan` 对整个 lockfile（含 devDependencies）扫描，当前报 93 条已知漏洞（axios、vite 5、vitest 3、devalue、fast-uri、joi 等），所以每个改到 `pnpm-lock.yaml` 的 PR 这个 job 都是红的，和改动本身无关；`pnpm audit --prod` 只剩 `katex` 一条 low。 | 要么把 dev 依赖升到修复版（vite 6 / vitest 4 是大版本，需要单独计划），要么给 osv-scanner 配 `osv-scanner.toml` 忽略仅 dev 的条目并只在 `--prod` 上失败；在此之前不要把 `osv-scan` 设为必需检查。 |
| 2026-11-08 | Release / Windows | Windows 包只在 CI 上打出、校验过文件结构，没有人实机启动过；沙盒缺位（nono 只有 darwin / linux）没验证。浏览器桥 CLI 在 Windows 上只是能编译（`ownedByCurrentUser` 的 Windows 实现恒为 `false`，实例注册表用 Unix socket 与 POSIX 权限位），`browser-tools` 插件在 Windows 上不可用。 | 第一个 tag 的草稿 Release 出来后，用 Windows 机器解压运行 `ActSpace.exe` 走一遍聊天、工具调用、浏览器桥。 |
| 2026-11-08 | Release | 四个平台的完整产物经 Actions artifact 中转到 Release（每次 tag 约 700 MB，保留 1 天）；若将来 artifact 配额紧张，改成在各 job 内直接 `gh release upload` 到草稿。 | 观察 Settings › Billing 的 Actions storage，超过一半再改。 |

## Web / PWA 客户端遗留

2026-10-17 `apps/web` 首版（`completed/20261017-web-pwa-client.md`）留下的事项，结果见 `docs/exec-runs/20261017-web-pwa-client/execution-summary.md`：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-17 | 发布 / Host | web 构建产物没有打进 agent-cli 包，`webRoot` 要手动指向 `apps/web/dist`，服务器部署得先在仓库里构建。 | 发布流程把 `dist` 带进 agent-cli 包，`webRoot` 缺省时默认托管内置页面；配置里显式写 `webRoot` 时仍以配置为准。 |
| 2026-10-17 | 前端 token | `apps/web/src/styles/tokens.css` 是 desktop `tokens.css` 的拷贝，两边靠人工同步。 | 出现第三个消费者（如官网要复用）时，抽成共享包，两端都从包里引入。 |
| 2026-10-17 | web 包体 | 业务代码一个块 325 kB（gzip 64 kB），React / Markdown / 其他依赖已分块；没有按页面懒加载。 | 手机首屏变慢时，再把会话详情（Markdown、diff）按路由懒加载。 |
| 2026-10-17 | web 运行计时 | 状态行「运行中 · Ns」从页面第一次看到这个 Run 开始计时，打开页面时已在跑的 Run 会少算。 | Host 的 tasks 快照带上 Run 开始时间后改用它。 |
| 2026-10-18 | web 时间线规则 | 按轮拆分、Worked for 时长、本轮用量行顺序是桌面端 `turns.ts` / `turnUsageModel` 的重写（`apps/web/src/sessions/turn-model.ts`、`usage-format.ts`），两边靠测试和人工对齐。 | 把这几段纯函数抽到 `@actspace/client`，desktop 和 web 共用。 |
| 2026-10-17 | Host 列表通知 | Host 每次 projection 更新都发 `sessions-changed`，流式输出时每个片段一次；web 端已改成 300ms 窗口内只刷新一次，但事件本身仍很密。 | Host 侧合并：只在会话元数据（标题、updatedAt 分钟级、归档等）变化时发。 |
