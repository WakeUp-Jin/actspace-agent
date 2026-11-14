# 技术债追踪

这里记录那些暂时不阻塞当前任务、但已经值得留档的技术债。

## Agent 存储遗留

- 中性存储冷读采用完整一致快照和有界内存缓存；列表初次重建会遍历会话。后续在真实大历史上测量峰值内存/延迟，再决定 Provider 扩展，不恢复通用层直接读取 JSONL 偏移。

## 前端设计 token 遗留

2026-09-26 设计 token 收口（`completed/20260926-frontend-design-token-convergence.md`）后仍保留的写死值和未统一控件：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-09-26 | renderer 间距 | 组件中仍有 `p-[7px]`、`gap-[9px]`、`py-[5px]` 等间距写死值。2026-11-10 统计：desktop 45 文件 99 处、web 6 文件 8 处，共 107；值集中在 `7px`（32）、`3px`（18）、`5px`（10）、`18px`（10），工具类集中在 `gap`（24）、`py`（20）、`pl`（15）。已按文件计数写入 `scripts/spacing-literal-baseline.json`，`check:frontend-tokens` 守住只减不增；`w-[…]` / `h-[…]` / `max-w-[…]` 等尺寸任意值（约 230 处）不在此列。 | 不做一次性全量替换（会改 50 个文件的视觉，无法逐个复看）。改到哪个文件就把它的任意值收到相邻刻度并收紧基线，规则见 token 规范 §6；存量集中的 `right-panel/`（24）、`space/`（18）、`messages/`（17）可以各开一个小任务整批收。 |
| 2026-09-26 | 内容边界 CSS | `styles/markdown.css`、`diff.css`、`tool-result.css`、`web-tool.css` 内部仍用 px 字号。 | 这些文件服务模型输出和第三方 DOM，改为 `var(--text-act-*)` 前需逐个对照渲染结果。 |
| 2026-11-09 | 图标尺寸 | `front-视觉token规范.md` §12 定了图标尺寸档位（12 / 14 / 16 / 18 / 20 / 22），但 renderer 与 web 里仍有约 190 处 `size={11 / 13 / 15 / 17 / 19 / 21}` 等非档位值（15 约 100 处、13 约 85 处），没有纳入 `check:frontend-tokens`。 | 按区域在 Electron 里对照收敛到相邻档位（13→14、15→16），改完再给脚本加 `size` 档位规则；期间不新增非档位值。 |
| 2026-09-26 | 未迁移的按钮形态 | 菜单项（Composer 命令菜单、模型列表）、下拉触发器（Composer 模式 / 模型选择器）、分段控件（预览 / 源码切换）仍是各自的样式常量；Composer 附件删除按钮、Sidebar 会话行置顶 / 归档等内联按钮未改为 `IconButton`。2026-10-06：消息操作菜单和 `SettingsSelect` 已由 Desktop 前端重构 16 改用 `ui/Menu`、`ui/Select`；原生按钮数由 `check:frontend-tokens` 的基线守住，不再增加。 | Composer 的随 09 迁移；分段控件随 `active/20260926-frontend-ui-components-foundation.md` 的 `Tabs`。 |

## Desktop 前端组件遗留

2026-10-06 Desktop 前端重构 16（UI 原语与组件拆分，`completed/20261005-desktop-frontend-refactor/16-UI原语与组件拆分执行计划.md`）之后仍未处理的项，结果见 `docs/exec-runs/20261005-desktop-fe-16-ui-primitives/execution-summary.md`：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-06 | renderer / 文件行数 | `settings/SettingsPrimitives.tsx` 856 行、`workspace/WorkspaceChromeControls.tsx` 663 行，超过 500 行（RightPanel 已拆到 `right-panel/`，不再超标）。SettingsPrimitives 剩下的组件都被两个以上设置文件使用，再降要拆成多个文件。 | SettingsPrimitives 按行 / 表单控件 / 菜单拆成 `settings/primitives/`；WorkspaceChromeControls 按控件拆。 |
| 2026-11-10 | renderer / 文件行数 | 2026-11-10 复查 `main`，超过 500 行且未登记的还有 5 个：`App.tsx` 1670（11 `useState`、18 `useEffect`、65 `useCallback`、12 `useRef`，会话列表、工作区、队列、发送、evict、侧边对话全在一个函数里）、`trajectory/builder.ts` 791、`stats/stats-ui.tsx` 617、`harness-stats/HarnessStatsCards.tsx` 523、`components/Composer.tsx` 507。 | `App.tsx` 走 [App 装配层拆分计划](active/20261110-app-assembly-split.md)；`builder.ts` 按事件种类拆成 `trajectory/builders/`（纯函数，带单测）；`stats-ui.tsx` 把 `DataTable`、环形图、`StatsCard` 各自成文件；`HarnessStatsCards.tsx` 按卡片拆；`Composer.tsx` 刚过线，随 09 的 Composer 收尾一起看。 |
| 2026-10-06 | renderer / 手写弹层 | `right-panel/RightPanelTabStrip.tsx` 的标签溢出菜单（菜单项里嵌「关闭标签」按钮）没有迁到 `components/ui/`，仍自己监听 Escape 和外部点击（`ModelMultiSelector` 已随模型页重做删除）。 | 先改交互（关闭按钮挪出菜单项或改子菜单）再换 `ui/Menu`。 |
| 2026-10-06 | renderer / 死入口 | `ProviderKeyModal` 打不开：`SettingsPage` 传下去的 `onConnectProvider` 在 `settings/sections/` 里没有调用方（16 之前的 `ProvidersSection` 也只解构不调用）。 | 确认 Provider Key 是否已全部改由模型连接向导录入；是就删掉 `ProviderKeyModal` 和这条 prop，否则补上入口。 |
| 2026-10-06 | renderer / 占位按钮 | Composer 的「更多审查操作」`⋯`（`review-overflow-button`）没有 `onClick`，点了没有反应，16 之前就是这样。 | 补上菜单内容，或先隐藏。09（2026-10-07）只把它搬进 `composer/ReviewStrip.tsx`，行为未改。 |
| 2026-10-06 | renderer / 窄窗 | 窗口最小宽度 480 时打开侧栏覆盖层，会话右键菜单的「复制」子菜单（208px）左右都放不下，翻到左侧后左边约 52px 出界。Radix 只翻转，不在水平方向挪。 | 子菜单加 `max-w-[calc(100vw-16px)]` 并允许文字截断，或窄窗下把两个复制项平铺到主菜单。 |
| 2026-10-06 | renderer / Composer 跨会话状态 | Composer 不按会话重挂（16 之前两个有消息的会话之间也不重挂）：远端会话 A 发送中切到 B，B 的发送按钮也被 `sending` 禁用，直到 A 的请求结束；A 里选的模型运行时选项会带到 B。A 发送中切走、随后失败时，附件只靠 App 的恢复草稿（不带预览）找回，原来的预览 URL 不释放。 | `sending` 按 `draftKey` 记；运行时选项按会话存；失败时把附件写回 A 的附件草稿，和 `draftRestore` 的顺序一起定。09（2026-10-07）只把这部分搬进 `composer/use-composer-send.ts`、`use-composer-model.ts`，行为未改，建议单独做一个「Composer 草稿按会话隔离」小计划。 |
| 2026-11-10 | renderer / 无障碍 | Biome a11y 组已按 `recommended` 打开（零命中的进 error、8 条共 22 处为 warn），但存量几十处、修法等于重做交互语义的 6 条仍关着：`useSemanticElements` 44、`useAriaPropsSupportedByRole` 39、`noStaticElementInteractions` 30、`noNoninteractiveElementInteractions` 30、`noNoninteractiveTabindex` 11、`useFocusableInteractive` 11，主要是 `div` / `tr` 上的 `onClick` 和手写 `role`。分层与各条原因见 `docs/coding-standards/lint-conventions.md`。 | 先清 22 处 warn 并升 error（`useKeyWithClickEvents` 的 6 处多数可以直接换 `PlainButton`）；6 条 off 的规则等桌面端 a11y 专题，按 `right-panel/`、`trajectory/`、`settings/` 分批打开。 |

## Desktop 安全遗留

2026-10-06 Desktop 前端重构 11（安全与 IPC，`completed/20261005-desktop-frontend-refactor/11-安全与IPC执行计划.md`）之后登记的四条，2026-11-09 由 [Desktop 安全遗留清零](completed/20261109-desktop-security-debt.md) 收口，结果见 `docs/exec-runs/20261109-desktop-security-debt/execution-summary.md`：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-06 | main / 子进程环境（C1） | ~~`applyToEnv` 把搜索服务 Key 写进 `process.env`，bash / `rg` / git / ssh / Browser Bridge / 更新脚本子进程继承完整环境。~~ 已解决：Desktop 不再把任何凭据写进 env（工具端口早已直接从 `getToolEnvironment()` 拿 Key）；子进程 env 由 `@actspace/shared` 的 `toolChildEnv`（继承 + 剥离凭据模式变量，用于 bash / `rg` / Browser Bridge 编译 / 更新脚本）与 `hostChildEnv`（基础白名单，用于 git / ssh）构造。 | 已完成。`toolChildEnv` 是模式过滤，不是穷举：用户 shell 里名字不像凭据的敏感变量仍会被 Agent bash 看到，这是沿用「Agent 可以用用户工具链」的产品取舍。2026-11-10 补了几类：名字是 `DATABASE_URL`、以 `_PWD` 或 `_DSN` 结尾的，以及值里带 `://用户名:密码@` 的（代理变量除外）。 |
| 2026-10-06 | main / Browser Bridge 安装 | ~~`browserBridge.installFromRepo` 接受 renderer 传来的 `repoRoot`，只校验扩展 manifest 就在该目录执行 `build.sh`。~~ 已解决：`selectSourceExtension` 由 main 弹系统目录对话框并校验，`installFromRepo` 不带参数只编译已保存的目录；保存前 `realpath`，`build.sh` 必须是目录内普通文件。 | 已完成。 |
| 2026-10-06 | scripts / IPC 审计 | ~~`check:ipc-channels` 不检查注册是否经过 `assertTrustedSender`。~~ 13 之后注册器强制 sender 校验与 guard，审计以契约为来源并区分方向；2026-11-09 再加一条：main 在 `ipc/registry.ts` 之外直接调用 `ipcMain.handle / handleOnce / on / once` 即失败。 | 已完成。 |
| 2026-10-06 | renderer / 主文档 CSP | ~~主文档没有 CSP。~~ 已解决：main 用 `onHeadersReceived` 下发 CSP，`script-src 'self'`、`connect-src 'self'`、frame / object / worker / base-uri / form-action 全 `'none'`，dev 只放开 Vite 需要的内联脚本和 ws。 | 已完成。残余见下一行。 |
| 2026-11-09 | main / safeStorage | ~~`SecretCrypto`（secrets v1 迁移）与 `remote-hosts/credentials.ts` 调用 `safeStorage.encryptString / decryptString / isEncryptionAvailable`，Electron 45 弃用、46 移除，此前未登记。~~ 已解决：全部改为 `isAsyncEncryptionAvailable / encryptStringAsync / decryptStringAsync`，`HostCredentials` 读到 `shouldReEncrypt` 时顺手重写。 | 已完成。升级 Electron 46 时不再被这条挡住。 |
| 2026-11-09 | renderer / CSP `style-src` | `style-src` 仍含 `'unsafe-inline'`。headless Chrome 实测（`execution-process.md`）：`style-src 'self'` 下 innerHTML 的 `<style>` 和 `style` 属性都被拦，DOMParser + `importNode` 的 `style` 属性能活、`<style>` 不行，`adoptedStyleSheets` / `el.style.cssText` 可用；但 CodeMirror 的 style-mod 用 `<style>` 标签注入、Vite dev 也注入 `<style>`，要去掉 `'unsafe-inline'` 需三处同时改。 | mermaid 改 DOM 挂载 + `<style>` 转 `adoptedStyleSheets`；CodeMirror 传 `EditorView.cspNonce`，nonce 由 main 每次启动生成并随 CSP 头与 preload 下发；Vite dev 配 `html.cspNonce`。做完后 `style-src 'self' 'nonce-…'`。 |
| 2026-11-09 | main / 偏好 env | `settings/env.ts` 仍把 `IMAGE_GENERATION_BASE_URL` / `IMAGE_GENERATION_MODEL` / `ACTSPACE_DISABLED_TOOLS` / `ACTSPACE_BASH_ALWAYS_ASK` / `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` 写进 main 自己的 `process.env`（不含凭据）。 | 找出 Desktop 内还在读这些 env 的路径，改走 settings 读模型后删掉 `applyToEnv` 与 `reloadEnv`。 |

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

2026-11-08 CI 重新上线（`completed/20261108-ci-pipelines.md`）时发现、但不在那一轮处理的事项：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-11-08 | Desktop main / git | `runGitCommand` 用 `execFile` 跑 git 并等 stdio 关闭；用户全局 `core.fsmonitor=true` 时，git 会为仓库拉起 fsmonitor 守护进程并继承管道，一次 `git status` 要等 20–30 秒才返回。测试侧已用 `GIT_CONFIG_GLOBAL=/dev/null` 隔离，产品侧没动。 | 在产品的 git 调用里加 `-c core.fsmonitor=false`（或改为 `spawn` + 只等 exit），用开启 fsmonitor 的真实仓库复验。 |
| 2026-11-08 | 依赖 | ~~`katex` 钉在 0.16.x，`pnpm audit` 报一条 low；0.x minor 可能有破坏性改动，没随本轮升。~~ 已解决：desktop 直依赖升到 0.18.2，并用 `pnpm.overrides` 把 `rehype-katex` / `mermaid` 的间接 katex 一起拉到同版，公式渲染测试通过。 | 已完成。 |
| 2026-11-08 | 测试环境 | `runtime-v2-output-reference-flow.test.ts` 对 `bash -lc` 的输出按行数断言；shell 启动时若有 nvm 等打印告警（如 `npm_config_prefix`），多出的行会让它失败。GitHub runner 上没这个问题，只在装了 nvm 的开发机上出现。 | 断言改成只看目标行，或给测试用的 shell 传 `--noprofile --norc`。 |
| 2026-11-08 | 测试环境 | ~~`packages/core/tool-runtime` 的 `runtime.test.ts` 用 `/workspace/...` 当假的资源路径；机器上真有 `/workspace` 目录（如某些容器）时 3 个用例变成 `denied`。GitHub runner 上没这个问题。~~ 已解决（2026-11-10）：用例改用 `mkdtemp` 出来的真实工作区路径。 | 已完成。 |
| 2026-11-08 | Release | ~~`release.yml` 还是手动触发、单平台，且没装 Go。~~ 已在 P4 解决：`v*` tag 触发四平台矩阵 + `actions/setup-go` + 草稿 Release。 | 已完成。 |
| 2026-11-08 | Release / Windows | Windows 产物是 portable zip：`electron.exe` 只是改名，没换图标和版本资源（任务管理器、属性里仍显示 Electron），也没有 Authenticode 签名，首次运行会被 SmartScreen 拦。 | 接 `rcedit`（或 electron-builder / Forge）替换图标与版本信息；签名需要证书，视发行需求再立项。 |
| 2026-11-08 | Electron | `safeStorage.isEncryptionAvailable` / `encryptString` / `decryptString` 在 Electron 45 弃用、46 移除；`apps/desktop/src/main/index.ts` 的 `SecretCrypto` 和 `remote-hosts/credentials.ts` 都在用同步版。 | 在 46 成为 stable 前把 `SecretCrypto` 接口及其调用链（settings store、model-connections、HostCredentials）改为 `isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`。 |
| 2026-11-08 | 供应链安全 | ~~`supply-chain-security.yml` 的 `osv-scan` 对整个 lockfile（含 devDependencies）扫描，当前报 93 条已知漏洞（axios、vite 5、vitest 3、devalue、fast-uri、joi 等），所以每个改到 `pnpm-lock.yaml` 的 PR 这个 job 都是红的，和改动本身无关；`pnpm audit --prod` 只剩 `katex` 一条 low。~~ 已解决：vite 7 / vitest 4 / esbuild 0.28 / astro 7.4 / wait-on 9 / katex 0.18 升级并重新生成 lockfile 后，osv-scanner 本地与 CI 扫描都是 0 条；工作流的路径过滤还排除了 `docs/**` 下的原型 `package.json`。 | 已完成。`osv-scan` 仍不是必需检查，后续新漏洞由每周定时扫描和 Dependabot 分组 PR 兜底。 |
| 2026-11-08 | Release / Windows | Windows 包只在 CI 上打出、校验过文件结构，没有人实机启动过；沙盒缺位（nono 只有 darwin / linux）没验证。浏览器桥 CLI 在 Windows 上只是能编译（`ownedByCurrentUser` 的 Windows 实现恒为 `false`，实例注册表用 Unix socket 与 POSIX 权限位），`browser-tools` 插件在 Windows 上不可用。 | 第一个 tag 的草稿 Release 出来后，用 Windows 机器解压运行 `ActSpace.exe` 走一遍聊天、工具调用、浏览器桥。 |
| 2026-11-08 | Release | 四个平台的完整产物经 Actions artifact 中转到 Release（每次 tag 约 700 MB，保留 1 天）；若将来 artifact 配额紧张，改成在各 job 内直接 `gh release upload` 到草稿。 | 观察 Settings › Billing 的 Actions storage，超过一半再改。 |
| 2026-11-09 | CI / `build` job | `ci.yml` 的 `build` job 和 `release-package.sh` 仍走逐包 `pnpm --filter ... build`，没有接 `setup-workspace` 的 `tsc -b` 缓存（`completed/20261109-ci-speedup.md` 决策记录）。`build` 不是最长的 job，而且 release 链需要确认 `tsc -b` 产物与逐包 build 完全等价（esbuild 包、prompts 拷贝、默认 harness）才能换。 | `build` 成为 `ci.yml` 关键路径时，让它也用 `setup-workspace` + `pnpm build:deps`，再比对两种方式的 `dist/` 目录差异后替换 release 链。 |

## 代码库审查修复遗留

2026-11-10 代码库审查修复（`active/20261110-codebase-review-fixes.md`）里看到、但没有在那一批处理的事项：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-11-10 | 图片生成 / 下载地址检查 | `packages/image/tool-image-generation/src/node-ports.ts` 的 `downloadImage` 自己有一份公网地址检查，是 `web_fetch` 修之前的写法：检查时解析一次域名、`fetch` 再解析一次；带方括号的 IPv6 主机名被当成域名；域名解析出 `::ffff:7f00:1` 这种写法的回环地址时判成公网。网址来自用户配置的图片服务商的响应，不是模型给的。 | 把 `packages/web/tool-web/src/public-request.ts` 的地址检查和固定地址的请求抽到两个包都能用的位置，`downloadImage` 改用它。 |
| 2026-11-10 | `web_fetch` / 环境代理 | 设置了 `NODE_USE_ENV_PROXY=1` 时 `web_fetch` 仍然走 `fetch`：连的是代理，目标域名由代理解析，固定不了地址，检查的地址和代理实际连的地址可以不同。 | 需要时改成自己向代理发 `CONNECT` 到检查过的地址；先确认有没有用户在这种配置下使用。 |
| 2026-11-10 | Agent Host / 上传清理 | 上传的定时清理每 60 秒把所有上传的 `state.json` 读一遍。被任务引用的上传跟着会话一直留着，所以这一遍随附件总数增长。它是后台任务，不在请求路径上。 | 上传数量大到这一遍明显占用磁盘读取时，改成只扫还没被引用的上传（内存里已经有这份集合）。 |
| 2026-11-10 | Agent Host / 产物错误 | `NodeArtifactStore` 在产物不存在、产物不属于这个会话时抛普通 `Error`，设备收到的是 -32603 `Host operation failed`，看不出是哪种情况（Host 日志里有）。 | 这两种情况改抛 `HostError`（`NOT_FOUND`、`FORBIDDEN`）。 |
| 2026-11-10 | 子进程输出解码 | `apps/desktop/src/main/browser-bridge-service.ts` 收集编译日志、`packages/subagent/subagent/src/external-cli.ts` 的 `OutputTail` 都按块 `toString`，一个多字节字符落在两块之间时显示成乱码。两处都只在失败时给出诊断信息。 | 换成 `setEncoding("utf8")` 或 `StringDecoder`，和 `tool-fs-search` 读 ripgrep 输出的写法一致。 |
| 2026-11-13 | LLM 重试 / `LlmRetryScope` | `agent-llm-core-pi.md` §13 设计的 `LlmRetryScope`（一个 lease 覆盖一个逻辑请求的全部尝试和退避等待）没有实现。现在每次尝试的 lease 在它的流结束时归还，重试时重新取一次；退避期间 registration 被完整注销的话，重试报 `LLM registration … is disposed.`，这一步失败。生产里走不到：路由随 Harness generation 一起注册和注销，进行中的 Run 持有那个 generation 的 lease。直接使用 `LlmService` 并自己注销路由的调用方没有这层保护。§13 末尾的「实现现状」写了差异。 | 出现不经 Harness 就使用带重试的 LLM 调用的地方，或者 Run 持有 generation lease 的做法要改时，在 `llm-service` 里实现 `LlmRetryScope`，并补 §13 关键回归序列里缺的那一段测试（退避期间旧 registration 被注销）。 |
| 2026-11-13 | Agent Loop / `llm/stream` 钩子 | `llm/stream` 钩子在派发之后抛错时，那条已经派发的流没有人读，也没有人中止：路由的 lease 会归还，但这次请求要等回合被中止或 Provider 那边结束才停。适配器拿到的是整个回合共用的 signal，没有只属于这一次请求的中止手段；生产适配器也都没有实现 `cancel`。目前没有生产插件注册 `llm/stream` 钩子。 | 有插件要注册 `llm/stream` 钩子之前，给每次请求派生自己的 `AbortSignal`（回合的 signal 触发时跟着触发），钩子在派发后抛错时中止这一次请求。 |
| 2026-11-14 | Agent Loop / `agent/pre-step`、`agent/turn-stopping` | 事件规范原来写 `agent/pre-step` 可以「接受、改写或跳过候选 step」，`agent/turn-stopping`「返回第一个继续/停止决策」。Loop 没有实现过这两种能力：`agent/pre-step` 的返回值只写进 `step/start` 的 `metadata`，`agent/turn-stopping` 的返回值没有人读。2026-11-14 给干预点加类型契约时，规范和契约都按代码写了。目前没有生产插件注册这两个干预点。 | 需要让插件跳过一步，或者在一轮结束前让它继续时，先在 `packages/core/agent-loop/src/hooks.ts` 的契约里定下返回值的形状，再让 Loop 读它，规范的表跟着改。 |
| 2026-11-14 | Harness 选择 / Host 契约摘要 | 持久化的 Harness 选择里记着 Host 契约摘要，启动时和当前算出来的不同就不加载这个选择（`RESTART_REQUIRED`）；只有内置插件、没有自定义历史的选择会自动换成随应用发布的内置版本。摘要里随代码变的只有 7 个 Host 模块入口文件的内容哈希（`packages/core/runtime/src/harness/default-harness.ts` 的 `hostModules`）；服务的版本号都是常量 1，事件和 codec 两项是空数组。所以它和「契约有没有变」两头都对不上：入口文件的字节一变摘要就变，哪怕只是重新导出的名字改了（2026-11-14 的改名就是这样）；入口文件以外的改动，例如某个共享服务的方法签名变了，摘要不变。有自定义选择的数据目录在前一种情况下升级后进不来，要重新准备一个选择。 | 先确认摘要要表达的是「Host 的构建换了」还是「契约变了」。是后者的话，给共享服务的版本号定规则（签名变了就加一），摘要改成看版本号和入口导出的名字，不看文件字节。 |
| 2026-11-14 | LLM / legacy wire 的名字和设计文档 | `LegacyProxyWireEngine`（`packages/llm/llm-pi-ai/src/legacy-proxy-wire-engine.ts`）名字里的 `Legacy` 和设计一致（`agent-llm-core-pi.md` §7、§14 的 legacy transport），2026-11-14 的命名清理没有改它。名字里的 `Proxy` 只对一半：§7 在 2026-11-08 改成了「代理不再是 legacy 理由」，现在选中它的是 OpenRouter 官方端点上不走 Anthropic 协议的路线，以及 DeepSeek 带图片并且有文件上传器的请求；但引擎里按代理地址进入的那条路径和它的用例还在。同一份设计文档有两处没有跟上：§3 的图和说明仍写「需要代理的请求切到兼容 wire」；§14 末尾一段还提到 `LegacyTransportAdapter`，§10 第 5 条写了这个类不再保留，代码里也没有。另外桌面端两个测试（`custom-connection-protocol.test.ts`、`runtime-v2-thinking-options.test.ts`）mock `@actspace/llm-pi-ai` 时带着 `LegacyProxyWireEngine` 这个键，而包的入口不导出它。 | 先定引擎里按代理进入的那条路径留不留。不留：删掉它和用例，类名去掉 `Proxy`，文档两处和两个 mock 一起改。留：只改文档两处和两个 mock。改类名时把新旧名字加进 `scripts/check-transitional-names.mjs` 的表。 |

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
