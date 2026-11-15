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

2026-11-09「Desktop 安全遗留清零」那一轮留下的：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
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
| 2026-11-08 | 测试环境 | `runtime-v2-output-reference-flow.test.ts` 对 `bash -lc` 的输出按行数断言；shell 启动时若有 nvm 等打印告警（如 `npm_config_prefix`），多出的行会让它失败。GitHub runner 上没这个问题，只在装了 nvm 的开发机上出现。 | 断言改成只看目标行，或给测试用的 shell 传 `--noprofile --norc`。 |
| 2026-11-08 | Release / Windows | Windows 产物是 portable zip：`electron.exe` 只是改名，没换图标和版本资源（任务管理器、属性里仍显示 Electron），也没有 Authenticode 签名，首次运行会被 SmartScreen 拦。 | 接 `rcedit`（或 electron-builder / Forge）替换图标与版本信息；签名需要证书，视发行需求再立项。 |
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
| 2026-11-12 | 官网文档 | `apps/site/src/content/docs/subagents.md` 还是 2026-11-04 的说法：默认在后台运行、做完可以继续派活、停掉后仍可续派、子智能体之间互相发消息、面板显示模型和第几轮。现在是默认等结果、做完就结束、兄弟之间不能发消息、列表不显示模型。 | 按[子智能体运行规范](../design-docs/collaboration/agent-subagent-runtime.md)重写「默认在后台运行」「在右侧查看」两节和 `description`，配图 `subagent-running.png` 一并核对。 |
| 2026-11-12 | 插件页说明 | `packages/subagent/subagent/src/manifest.ts` 的 `display.description` 还是「子智能体的创建、续派、插话、中断与完成通知」，显示在 扩展 › 插件 里；续派和中断工具都没有了。 | 改成现在的能力（创建、消息、停止、完成通知）。 |
| 2026-11-07 | 对话里的通知行 | 子智能体完成通知在 `groupMessagesIntoTurns` 里被跳过，来信走 `SubagentMessageCard`，所以 `BackgroundNoticeRow.tsx` 里 `taskKind` 为 `subagent`、`agent_message` 的分支（标题、展开内容、「打开子智能体」按钮）在桌面端对话里走不到，只有 `background-notice-row.test.tsx` 在用。 | 确认 Web 端也不用之后，把这些分支和对应用例删掉，组件只留 Bash 通知。 |

## 上下文引擎遗留

2026-11-14 把上下文规范对着代码合并时发现的。生产里建 Loop 时总是带 Context 来源（`packages/core/runtime/src/harness/agent-factory-plugin.ts` 两处 `new AgentLoop` 都传 `contextSources`），下面几样是来源接入之前的做法留下的：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-11-14 | Loop / 旧请求路径 | `packages/core/agent-loop/src/loop.ts` 里 `!this.options.contextSources` 的分支（`appendRuntimeContext`、把预算提示拼成 user 消息、`assembler.assembleCandidate`、`contextFromCandidate`）生产不会走，只有 `packages/core/agent-loop/src/testing.ts` 的测试帮助函数不传来源时走，所以这些测试覆盖的不是生产那条路径。连带留着只有这条路径和测试在用的：`packages/context/prompt/src/` 的 `assembler.ts`（`RequestAssembler`）、`registry.ts`（`ContributorRegistry`）、`context-bridge.ts`（`contextFromCandidate`）、`request-snapshot.ts` 里的 `LogicalRequestSnapshot`，以及 `agent-factory-plugin.ts` 的 `createModeContributorActivation`。 | Loop 里的分支和 `testing.ts` 默认带来源，[#94](https://github.com/WakeUp-Jin/actspace-agent/pull/94) 已经做了（未合并）；它合入后把这一行缩成剩下的部分。剩下的：`packages/english-learning/english-learning/src/test/lifecycle.test.ts` 改用来源，然后删 `prompt` 包里的这几样、`createModeContributorActivation` 和 `ContributorKind` 的 `request-fact`。`request-snapshot.ts` 里的 `LogicalRequestCandidate`、`PreparedRequestMetadata` Loop 还在用，留下。 |
| 2026-11-14 | `context-engine` / 旧组装器 | `packages/context/context-engine/src/assembly.ts` 的 `ContextAssembler`、`ContextAssemblerService` 只有 `src/test/assembly.test.ts` 在用，却从包入口导出，还用着服务名 `context.assembly`（生产里这个服务由 `@actspace/context-assembly` 提供）。 | 删文件、测试和导出。 |
| 2026-11-14 | `context-engine` / reducer | `ContextReducerRegistry`（`packages/context/context-engine/src/reducers.ts`）接在 `context.engine` 上，`reconcile` 对每条新事件都调用它，但没有任何插件注册 reducer，只有测试注册，等于空转。 | 披露和压缩确认不用之后，删注册表和 `reconcile` 里的调用；要用就先写进[上下文引擎规范](../design-docs/上下文管理引擎设计/agent-context-engine.md)。 |
| 2026-11-14 | `context-engine` / 包清单 | `packages/context/context-engine/src/modules.ts` 的 `CONTEXT_PLUGIN_PACKAGES`、`contextPluginPackage` 只有 `src/test/modules.test.ts` 在用；包表已经由 `packages/context/README.md` 和 `pnpm check:docs` 管。 | 删文件和测试。 |
| 2026-11-14 | 插件页说明 | `packages/context/context-disclosure/src/manifest.ts` 的 `display.description` 写「按需把工作区路径和文件摘要告诉 Agent」，显示在 扩展 › 插件 里；披露只列路径和工具给的简短说明，不生成文件摘要。同一句还在 `apps/desktop/src/renderer/mock/plugins-fixture.ts` 和 `docs/design-docs/架构优化/02-插件结构设计.md`。 | 三处一起改成「把读过和产生的文件路径列给 Agent」。 |

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
