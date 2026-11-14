# 技术债追踪

这里记录那些暂时不阻塞当前任务、但已经值得留档的技术债。

## Agent 存储遗留

- 中性存储冷读采用完整一致快照和有界内存缓存；列表初次重建会遍历会话。后续在真实大历史上测量峰值内存/延迟，再决定 Provider 扩展，不恢复通用层直接读取 JSONL 偏移。

## 前端设计 token 遗留

2026-09-26 设计 token 收口后仍保留的写死值和未统一控件：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-09-26 | renderer 间距 | 组件中仍有 `p-[7px]`、`gap-[9px]`、`py-[5px]` 等间距写死值。2026-11-10 统计：desktop 45 文件 99 处、web 6 文件 8 处，共 107；值集中在 `7px`（32）、`3px`（18）、`5px`（10）、`18px`（10），工具类集中在 `gap`（24）、`py`（20）、`pl`（15）。已按文件计数写入 `scripts/spacing-literal-baseline.json`，`check:frontend-tokens` 守住只减不增；`w-[…]` / `h-[…]` / `max-w-[…]` 等尺寸任意值（约 230 处）不在此列。 | 不做一次性全量替换（会改 50 个文件的视觉，无法逐个复看）。改到哪个文件就把它的任意值收到相邻刻度并收紧基线，规则见 token 规范 §6；存量集中的 `right-panel/`（24）、`space/`（18）、`messages/`（17）可以各开一个小任务整批收。 |
| 2026-09-26 | 内容边界 CSS | `styles/markdown.css`、`diff.css`、`tool-result.css`、`web-tool.css` 内部仍用 px 字号。 | 这些文件服务模型输出和第三方 DOM，改为 `var(--text-act-*)` 前需逐个对照渲染结果。 |
| 2026-11-09 | 图标尺寸 | `front-视觉token规范.md` §12 定了图标尺寸档位（12 / 14 / 16 / 18 / 20 / 22），但 renderer 与 web 里仍有约 190 处 `size={11 / 13 / 15 / 17 / 19 / 21}` 等非档位值（15 约 100 处、13 约 85 处），没有纳入 `check:frontend-tokens`。 | 按区域在 Electron 里对照收敛到相邻档位（13→14、15→16），改完再给脚本加 `size` 档位规则；期间不新增非档位值。 |
| 2026-09-26 | 未迁移的按钮形态 | 菜单项（Composer 命令菜单、模型列表）、下拉触发器（Composer 模式 / 模型选择器）、分段控件（预览 / 源码切换）仍是各自的样式常量；Composer 附件删除按钮、Sidebar 会话行置顶 / 归档等内联按钮未改为 `IconButton`。2026-10-06：消息操作菜单和 `SettingsSelect` 已由 Desktop 前端重构 16 改用 `ui/Menu`、`ui/Select`；原生按钮数由 `check:frontend-tokens` 的基线守住，不再增加。 | Composer 的随 09 迁移；分段控件随 `active/20260926-frontend-ui-components-foundation.md` 的 `Tabs`。 |

## Desktop 前端组件遗留

2026-10-06 Desktop 前端重构 16（UI 原语与组件拆分）之后仍未处理的项：

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

2026-10-06 Desktop 前端重构 11（安全与 IPC）之后登记的四条，2026-11-09 的「Desktop 安全遗留清零」已收口；没划掉的是那一轮留下的：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-06 | main / 子进程环境（C1） | ~~`applyToEnv` 把搜索服务 Key 写进 `process.env`，bash / `rg` / git / ssh / Browser Bridge / 更新脚本子进程继承完整环境。~~ 已解决：Desktop 不再把任何凭据写进 env（工具端口早已直接从 `getToolEnvironment()` 拿 Key）；子进程 env 由 `@actspace/shared` 的 `toolChildEnv`（继承 + 剥离凭据模式变量，用于 bash / `rg` / Browser Bridge 编译 / 更新脚本）与 `hostChildEnv`（基础白名单，用于 git / ssh）构造。 | 已完成。`toolChildEnv` 是模式过滤，不是穷举：用户 shell 里名字不像凭据的敏感变量仍会被 Agent bash 看到，这是沿用「Agent 可以用用户工具链」的产品取舍。 |
| 2026-10-06 | main / Browser Bridge 安装 | ~~`browserBridge.installFromRepo` 接受 renderer 传来的 `repoRoot`，只校验扩展 manifest 就在该目录执行 `build.sh`。~~ 已解决：`selectSourceExtension` 由 main 弹系统目录对话框并校验，`installFromRepo` 不带参数只编译已保存的目录；保存前 `realpath`，`build.sh` 必须是目录内普通文件。 | 已完成。 |
| 2026-10-06 | scripts / IPC 审计 | ~~`check:ipc-channels` 不检查注册是否经过 `assertTrustedSender`。~~ 13 之后注册器强制 sender 校验与 guard，审计以契约为来源并区分方向；2026-11-09 再加一条：main 在 `ipc/registry.ts` 之外直接调用 `ipcMain.handle / handleOnce / on / once` 即失败。 | 已完成。 |
| 2026-10-06 | renderer / 主文档 CSP | ~~主文档没有 CSP。~~ 已解决：main 用 `onHeadersReceived` 下发 CSP，`script-src 'self'`、`connect-src 'self'`、frame / object / worker / base-uri / form-action 全 `'none'`，dev 只放开 Vite 需要的内联脚本和 ws。 | 已完成。残余见下一行。 |
| 2026-11-09 | main / safeStorage | ~~`SecretCrypto`（secrets v1 迁移）与 `remote-hosts/credentials.ts` 调用 `safeStorage.encryptString / decryptString / isEncryptionAvailable`，Electron 45 弃用、46 移除，此前未登记。~~ 已解决：全部改为 `isAsyncEncryptionAvailable / encryptStringAsync / decryptStringAsync`，`HostCredentials` 读到 `shouldReEncrypt` 时顺手重写。 | 已完成。升级 Electron 46 时不再被这条挡住。 |
| 2026-11-09 | renderer / CSP `style-src` | `style-src` 仍含 `'unsafe-inline'`。headless Chrome 实测：`style-src 'self'` 下 innerHTML 的 `<style>` 和 `style` 属性都被拦，DOMParser + `importNode` 的 `style` 属性能活、`<style>` 不行，`adoptedStyleSheets` / `el.style.cssText` 可用；但 CodeMirror 的 style-mod 用 `<style>` 标签注入、Vite dev 也注入 `<style>`，要去掉 `'unsafe-inline'` 需三处同时改。 | mermaid 改 DOM 挂载 + `<style>` 转 `adoptedStyleSheets`；CodeMirror 传 `EditorView.cspNonce`，nonce 由 main 每次启动生成并随 CSP 头与 preload 下发；Vite dev 配 `html.cspNonce`。做完后 `style-src 'self' 'nonce-…'`。 |
| 2026-11-09 | main / 偏好 env | `settings/env.ts` 仍把 `IMAGE_GENERATION_BASE_URL` / `IMAGE_GENERATION_MODEL` / `ACTSPACE_DISABLED_TOOLS` / `ACTSPACE_BASH_ALWAYS_ASK` / `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` 写进 main 自己的 `process.env`（不含凭据）。 | 找出 Desktop 内还在读这些 env 的路径，改走 settings 读模型后删掉 `applyToEnv` 与 `reloadEnv`。 |
| 2026-11-09 | main / git、ssh 子进程环境 | `hostChildEnv` 是白名单（基础变量加 `LC_` / `XDG_` 前缀），不传 `GIT_*`、`GIT_SSH_COMMAND` 这类自定义 git 变量；依赖它们的用户，Desktop 自己发起的 git / ssh 会和终端里的行为不一样。 | 有反馈再在 `HOST_ENV_PREFIXES` 加 `GIT_`，加之前评估 `GIT_CONFIG_*` 的注入面。 |
| 2026-11-09 | 实机验证 | 这一轮的五项只有自动化覆盖，没有实机结果：打包版与 dev 下打开 DevTools 看 CSP 有没有违规（mermaid、代码高亮、KaTeX、图片附件预览、文档面板编辑、统计页、mermaid 下载 PNG）；Browser Bridge「选择源码扩展」的目录对话框和校验；Agent bash 里 `env` 看不到搜索 Key；远程主机凭据重启后还在；v1 `secrets.json` 迁移。 | 升级 Electron 46 时把 CSP 走查并进去一起做。 |

## Desktop settings 遗留

2026-10-07 Desktop 前端重构 17（settings-service 拆分）的特征测试（T1，以及 T6 / T7 变异检查后补的用例）记下的现有行为。17 是纯搬迁，不改；测试按现状断言（`apps/desktop/src/main/test/settings-characterization.test.ts`）。三行已立项：[Desktop settings 写入一致性修复](active/20261007-desktop-settings-write-consistency.md)。

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

2026-11-08 CI 重新上线时发现、但不在那一轮处理的事项：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-11-08 | Desktop main / git | `runGitCommand` 用 `execFile` 跑 git 并等 stdio 关闭；用户全局 `core.fsmonitor=true` 时，git 会为仓库拉起 fsmonitor 守护进程并继承管道，一次 `git status` 要等 20–30 秒才返回。测试侧已用 `GIT_CONFIG_GLOBAL=/dev/null` 隔离，产品侧没动。 | 在产品的 git 调用里加 `-c core.fsmonitor=false`（或改为 `spawn` + 只等 exit），用开启 fsmonitor 的真实仓库复验。 |
| 2026-11-08 | 依赖 | ~~`katex` 钉在 0.16.x，`pnpm audit` 报一条 low；0.x minor 可能有破坏性改动，没随本轮升。~~ 已解决：desktop 直依赖升到 0.18.2，并用 `pnpm.overrides` 把 `rehype-katex` / `mermaid` 的间接 katex 一起拉到同版，公式渲染测试通过。 | 已完成。 |
| 2026-11-08 | 测试环境 | `runtime-v2-output-reference-flow.test.ts` 对 `bash -lc` 的输出按行数断言；shell 启动时若有 nvm 等打印告警（如 `npm_config_prefix`），多出的行会让它失败。GitHub runner 上没这个问题，只在装了 nvm 的开发机上出现。 | 断言改成只看目标行，或给测试用的 shell 传 `--noprofile --norc`。 |
| 2026-11-08 | 测试环境 | `packages/core/tool-runtime` 的 `runtime.test.ts` 用 `/workspace/...` 当假的资源路径；机器上真有 `/workspace` 目录（如某些容器）时 3 个用例变成 `denied`。GitHub runner 上没这个问题。 | 测试用例改用 `mkdtemp` 出来的真实工作区路径，而不是硬编码的绝对路径。 |
| 2026-11-08 | Release | ~~`release.yml` 还是手动触发、单平台，且没装 Go。~~ 已在 P4 解决：`v*` tag 触发四平台矩阵 + `actions/setup-go` + 草稿 Release。 | 已完成。 |
| 2026-11-08 | Release / Windows | Windows 产物是 portable zip：`electron.exe` 只是改名，没换图标和版本资源（任务管理器、属性里仍显示 Electron），也没有 Authenticode 签名，首次运行会被 SmartScreen 拦。 | 接 `rcedit`（或 electron-builder / Forge）替换图标与版本信息；签名需要证书，视发行需求再立项。 |
| 2026-11-08 | Electron | `safeStorage.isEncryptionAvailable` / `encryptString` / `decryptString` 在 Electron 45 弃用、46 移除；`apps/desktop/src/main/index.ts` 的 `SecretCrypto` 和 `remote-hosts/credentials.ts` 都在用同步版。 | 在 46 成为 stable 前把 `SecretCrypto` 接口及其调用链（settings store、model-connections、HostCredentials）改为 `isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`。 |
| 2026-11-08 | 供应链安全 | ~~`supply-chain-security.yml` 的 `osv-scan` 对整个 lockfile（含 devDependencies）扫描，当前报 93 条已知漏洞（axios、vite 5、vitest 3、devalue、fast-uri、joi 等），所以每个改到 `pnpm-lock.yaml` 的 PR 这个 job 都是红的，和改动本身无关；`pnpm audit --prod` 只剩 `katex` 一条 low。~~ 已解决：vite 7 / vitest 4 / esbuild 0.28 / astro 7.4 / wait-on 9 / katex 0.18 升级并重新生成 lockfile 后，osv-scanner 本地与 CI 扫描都是 0 条；工作流的路径过滤还排除了 `docs/**` 下的原型 `package.json`。 | 已完成。`osv-scan` 仍不是必需检查，后续新漏洞由每周定时扫描和 Dependabot 分组 PR 兜底。 |
| 2026-11-08 | Release / Windows | Windows 包只在 CI 上打出、校验过文件结构，没有人实机启动过；沙盒缺位（nono 只有 darwin / linux）没验证。浏览器桥 CLI 在 Windows 上只是能编译（`ownedByCurrentUser` 的 Windows 实现恒为 `false`，实例注册表用 Unix socket 与 POSIX 权限位），`browser-tools` 插件在 Windows 上不可用。 | 第一个 tag 的草稿 Release 出来后，用 Windows 机器解压运行 `ActSpace.exe` 走一遍聊天、工具调用、浏览器桥。 |
| 2026-11-10 | 脚本执行 / Windows | Windows 包里带了随包 `python.exe` 和 shim，`release.yml` 的 windows-latest 上 `verify-python-runtime.mjs` 也通过了，但 `bash` 工具在 Windows 上没有可用的 shell：`packages/shell/tool-shell/src/node-ports.ts` 在 macOS 以外一律启动 `/bin/bash -lc`。用 Git Bash 还是 PowerShell、shim 在选定的 shell 里能不能按 `actspace-python` 叫到、没有 nono 时怎么隔离，都没有设计（[脚本执行](../design-docs/tool-system/agent-script-execution.md) §3 只写了「另立设计」）。 | 单独写 Windows 设计；定下 shell 后在 Windows 机器上让模型跑一次 `actspace-python`。 |
| 2026-11-10 | Release / macOS 签名 | 配了 `ACTSPACE_MAC_CODESIGN_IDENTITY` 时，`release-package.sh` 会给随包 Python 逐个签名（`.so` / `.dylib`，解释器带 `scripts/python-runtime/entitlements.plist`），签完再跑 `verify-python-runtime.mjs` 和 `codesign --verify`。这一段没执行过：`release.yml` 至今只在 PR 上跑过，每次这个变量都是空的，macOS 包的 manifest 是 `signed: false`。 | 第一次配 Developer ID 证书打包时，看签名之后的 `verify-python-runtime.mjs` 这一步过不过；不过就按报错调 entitlements 或签名顺序。 |
| 2026-11-08 | Release | 四个平台的完整产物经 Actions artifact 中转到 Release（每次 tag 约 700 MB，保留 1 天）；若将来 artifact 配额紧张，改成在各 job 内直接 `gh release upload` 到草稿。 | 观察 Settings › Billing 的 Actions storage，超过一半再改。 |
| 2026-11-09 | CI / `build` job | `ci.yml` 的 `build` job 和 `release-package.sh` 仍走逐包 `pnpm --filter ... build`，没有接 `setup-workspace` 的 `tsc -b` 缓存（原因见 [CI 提速计划](active/20261109-ci-speedup.md)的决策记录）。`build` 不是最长的 job，而且 release 链需要确认 `tsc -b` 产物与逐包 build 完全等价（esbuild 包、prompts 拷贝、默认 harness）才能换。 | `build` 成为 `ci.yml` 关键路径时，让它也用 `setup-workspace` + `pnpm build:deps`，再比对两种方式的 `dist/` 目录差异后替换 release 链。 |
| 2026-11-08 | Release / 首次实发 | `v*` tag 触发的四平台发布合入后还没有真的打过 tag（仓库里只有 2026-07 的 `v0.1.0`）：草稿 Release 的产物、attestation、`release-manifest.json`、`sbom.spdx.json` 只在 PR 的打包验证里跑过。 | 发第一个版本时按 `docs/CICD.md` 核对草稿 Release 的附件，再点 Publish。 |
| 2026-11-08 | Electron 45 | 升到 Electron 45 后只在 Linux 的 `xvfb` 下用 CDP 验过启动和 preload 桥；macOS 真实桌面上的窗口、审批弹层、保存再读回 API key、图片和文件的三种复制粘贴没有走查记录。 | 下次 macOS 实机验收时顺带走一遍。 |
| 2026-11-01 | 文档检查 | `check:package-readmes` 的类别核对要读 `packages/core/runtime/dist/plugin-catalog.js`，没构建时整项跳过，只打印一行提示；`base-checks.yml` 不构建，所以必需检查里这一项不生效。能力目录 README 里「包之间怎么连」靠人工同步，脚本不核对依赖方向。 | 让脚本直接读源码里的 catalog，或把这一项挪到构建之后的 job。 |
| 2026-11-09 | 测试环境 / 增量刷新 | `session-persistence-jsonl` 的 `refresh` 在文件大小不变时只比 `dev:ino:birthtimeMs:size:mtimeMs:ctimeMs`，同一个时间戳粒度内的等长改写会被当成没变。`refresh.test.ts > same-size rewrite falls back to a full read` 因此在部分机器上失败（`expected 'unchanged' to be 'replaced'`，2026-11-14 在云端 Linux VM 上复现），GitHub runner 上通过。 | 先让用例不依赖时间戳粒度；日志正常只追加，等长改写只会来自外部改文件，要不要给这种情况加内容校验另行决定。 |
| 2026-11-14 | CI / 包测试 | `main` 上 `CI` 的「包测试」连续两次失败，失败的用例不同，都是 2026-11-12 子智能体简化带进来的、和等待时间有关的用例：`bf566305` 那次是 `packages/subagent/subagent` 的 `external.test.ts > runs a Codex task in the background, records it like any subagent and notifies the parent`（`expected [] to deeply equal ['root']`）；`d0ca51c7` 那次是 `packages/shell/tool-shell` 的 `node-ports.test.ts > runs subagent commands in the foreground and kills them at the time limit`（`expected 'failed' to be 'completed'`）。 | 两条用例各自在 runner 上反复跑，分清是测试里的等待太紧还是产品逻辑有竞态，再修。 |

## Web / PWA 客户端遗留

2026-10-17 `apps/web` 首版留下的事项，以及之后登记的远程客户端问题：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-10-17 | 发布 / Host | web 构建产物没有打进 agent-cli 包，`webRoot` 要手动指向 `apps/web/dist`，服务器部署得先在仓库里构建。 | 发布流程把 `dist` 带进 agent-cli 包，`webRoot` 缺省时默认托管内置页面；配置里显式写 `webRoot` 时仍以配置为准。 |
| 2026-10-17 | 前端 token | `apps/web/src/styles/tokens.css` 是 desktop `tokens.css` 的拷贝，两边靠人工同步。 | 出现第三个消费者（如官网要复用）时，抽成共享包，两端都从包里引入。 |
| 2026-10-17 | web 包体 | 业务代码一个块 325 kB（gzip 64 kB），React / Markdown / 其他依赖已分块；没有按页面懒加载。 | 手机首屏变慢时，再把会话详情（Markdown、diff）按路由懒加载。 |
| 2026-10-17 | web 运行计时 | 状态行「运行中 · Ns」从页面第一次看到这个 Run 开始计时，打开页面时已在跑的 Run 会少算。 | Host 的 tasks 快照带上 Run 开始时间后改用它。 |
| 2026-10-18 | web 时间线规则 | 按轮拆分、Worked for 时长、本轮用量行顺序是桌面端 `turns.ts` / `turnUsageModel` 的重写（`apps/web/src/sessions/turn-model.ts`、`usage-format.ts`），两边靠测试和人工对齐。 | 把这几段纯函数抽到 `@actspace/client`，desktop 和 web 共用。 |
| 2026-10-17 | Host 列表通知 | Host 每次 projection 更新都发 `sessions-changed`，流式输出时每个片段一次；web 端已改成 300ms 窗口内只刷新一次，但事件本身仍很密。 | Host 侧合并：只在会话元数据（标题、updatedAt 分钟级、归档等）变化时发。 |
| 2026-11-05 | web Bash 输出 | `apps/web/src/pages/session/blocks/BashRow.tsx` 展开时调 `sessions.output` 取内容，那个接口返回的是模型还没定稿的回复正文，不是 bash 的输出。 | 改成读工具结果里的输出；远端没有工具输出接口时先只显示内联结果。 |
| 2026-11-05 | 远程底稿回放测试 | 桌面远程适配器（`remote-hosts/desktop-adapter.ts`）的底稿回放、web 的 `session-observer.ts` 没有自动化测试。 | 给两处各补一条「运行中切走再切回，未定稿文字补回、不重复」的测试。 |

## Browser Use 遗留

2026-11-01 功能减法把浏览器改成默认不加载的可选插件，当时进行中的「Chrome 扩展连接、启动与使用体验闭环」计划（2026-09-28 立项）随之暂停。工程实现已合入，没补完的是 macOS + Google Chrome 上的实机验收：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-11-01 | Chrome 扩展连接 / 实机验收 | 16 个验收点里通过的有 A01 首次启动、A04 自动连接、A07 多 profile、A08 真实对话里使用浏览器；A09 授权、A10 停止与断线只覆盖了一部分（批准、拒绝、等待中停止）。其余各点都还有没覆盖的范围：A02 随包安装、A03 Chrome 引导、A05 晚加载与忙碌 Runtime、A06 再次启动、A11 分层恢复、A12 主动断开、A13 更新回滚、A14 高级开发入口、A15 主题与窄窗口、A16 制品与隐私；其中应用重启后恢复、主动断开跨重启保持验过。 | 把 Browser Use 恢复成默认能力之前重新立项补验。原计划和各验收点的定义用 `git show d0ca51c7:docs/exec-plans/completed/20260928-chrome-connect-experience.md` 查看。 |

## 子智能体与后台任务遗留

2026-11-03 子智能体与后台任务重做、2026-11-12 子智能体简化之后留下的：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-11-03 | 通知文案 | 应用退出导致中断（`lost`）的通知行，展开后显示的是给模型看的英文摘要（`Subagent … was interrupted because the app exited…`）。 | 展开内容给 `lost` 单独写一句中文说明，模型看到的原文不变。 |
| 2026-11-03 | 外部子智能体 / 记录路径 | 按 2026-11-03 的核对，Claude Code 对很长的工作区路径会截断并加哈希；`encodeClaudeProjectPath` 只做字符替换，极长路径的工作区里算出来的记录文件路径可能对不上。 | 照 Claude Code 的规则补截断与哈希，用一个超长路径对照。 |
| 2026-11-03 | 外部子智能体 / 进程残留 | Host 被强杀时 Codex / Claude Code 子进程可能留下；下次启动只把那次运行补记成 `lost`，不清理进程。 | 启动外部 CLI 时记 pid，启动时清理上次留下的进程。 |
| 2026-11-12 | 同步子智能体 / 停止 | 同步运行的子智能体不进后台任务登记表，模型不能用 `task_stop` 停它（父会话本来就在等它），只有用户能在界面上停。 | 暂不处理；出现「模型需要中途放弃同步子智能体」的场景再议。 |
| 2026-11-12 | 同步转后台 / 登记失败 | 同步子智能体等满 30 分钟转后台时如果登记失败，它会被直接停掉、不发通知，界面上没有单独提示；转后台这条路径只有单测。 | 登记失败时给父会话一条说明；实机上把等待时间调短验一次转后台。 |

## 没有实机验证记录的功能

下面这些功能交付时只有自动化测试和浏览器 mock，没有在 Electron 里验过的记录（日常使用可能已经覆盖了一部分）。验过一项就删掉一行，发现问题另行登记。

| 交付日期 | 功能 | 没验的内容 |
|---|---|---|
| 2026-11-01 | 统一验收没覆盖的边界 | 真实触发步数上限和三小时审批超时；外部改文档后靠窗口聚焦触发「重新加载」；运行中、带用量的失败请求的未知费用口径；统计图表的悬停；英语学习的朗读（没有语音凭据）；从读文件工具行打开 HTML / TS。 |
| 2026-11-02 | 上下文面板「Bash 命令」卡片 | 老会话第一次打开时补齐、调用次数和轨迹一致；新调用几秒内计入（含失败数、子命令展开）。 |
| 2026-11-07 | 编辑重发与回退 | 编辑态外观、变淡淡出、提问条点击、空闲发送不闪托盘、回退后重载、`recovery/` 里的归档。 |
| 2026-11-07 | 统计页重做 | 使用统计、Harness 统计两页在真实数据下的走查。 |
| 2026-11-08 | 内置服务商改用 pi-ai | DeepSeek、Kimi、Anthropic、OpenAI、OpenRouter、自定义中转各发一条带工具调用的消息（开、关思考各一次）；代理可用和代理地址写错两种情况。 |
| 2026-11-08 | 模型目录价格锁定 | 启动后设置页的价格、回复尾部的花费显示正常。 |
| 2026-11-09 | 内置工具插件拆分 | Chat / Plan / Agent 三种模式各自的工具集合；自进化工具只在 Agent 模式可见；旧数据目录升级后自动换到新内置产物；子智能体的上下文里没有后台任务清单；压缩后披露状态恢复；`--mock` 下文件与 Bash 工具报不可用。 |
| 2026-11-10 | 脚本执行 | default 模式下内联 `python3 -c` 出单次审批卡、`echo $(id)` 被拒绝且文案给出改法；批准 `python3 scripts/a.py` 并勾选会话复用后 `scripts/b.py` 不再问、`python3 ../outside.py` 仍然问；打包版里对一份 PDF 说「把第 3 页的表格导出成 xlsx」：用 `actspace-python` 完成、不弹 `pip install`，临时脚本在会话临时目录、关闭应用后消失，设置 › 扩展 › 插件 › 命令行 里有「脚本运行时」面板；「下载数据扩展」前后的 `import pandas`；Bash 卡片的脚本形态（超过 12 行折叠、`# script:` 后的文件名打开右侧面板、审批卡标题），浅色深色各一遍。 |
| 2026-11-11 | 简化思考过程 | 真实模型下思考行保持一行、点标题看全文、多段思考、回复完成后收进 Worked、关闭开关后回到原样。 |
| 2026-11-11 | 三层字号 | 浅色、深色下的历史会话；用户消息、正文、输入框字号一致；展开 `Worked for`；界面字号调到 12 和 18。 |
| 2026-11-12 | 子智能体简化 | 同步子智能体、后台子智能体与通知、面板停止与 `task_stop`、结束后 `send_message`、改动前的老会话。Codex 子智能体的成功链路从 2026-11-03 起就没验过（当时本机 Codex CLI 不能用）。 |
