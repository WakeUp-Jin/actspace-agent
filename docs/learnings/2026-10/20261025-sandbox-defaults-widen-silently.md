# 沙箱后端：Seatbelt 接入、只能授权的模型与默认值悄悄放宽边界

合并自三篇：macOS Seatbelt 接入（2026-07）、只能“授权”的沙箱挖不出只读子目录（2026-10）、沙箱默认值悄悄放宽边界（2026-10）。实现：`packages/sandbox/sandbox-seatbelt/src/backend.ts`、`packages/sandbox/sandbox-nono/`。权限分级语义见 [工具权限分级](../2026-07/tool-permission-tiers-deny-ask-allow.md)。

## 1. Seatbelt：deny-default + 参数注入

`/usr/bin/sandbox-exec` + SBPL profile 是进程级沙盒：启动进程时附加声明式 allow/deny，此后该进程及整个子进程树的每次系统调用由内核对照规则检查（Apple 已标 deprecated，但 Chrome/Cursor/Claude Code 仍在用）。

- **`(deny default)` 全拒基线**，而不是 `(allow default)` + 定向拒：危险面（mach 服务、IOKit、sysctl、Unix socket…）列不全。难点是全拒下普通命令连 fork/exec 都跑不了，essential allows 清单要靠成熟项目沉淀——抽取了 sandbox-runtime（Apache-2.0，源自 Chrome 沙盒策略）的清单，这是比代码更值钱的资产。
- **路径一律 `(param "X")` 注入**：SBPL 是 Scheme 语法，拼进路径的引号/括号会破坏语法或构成注入面。`sandbox-exec -D KEY=VALUE` + `(subpath (param "KEY"))` 天然规避，profile 变成可整体审计的静态文本，测试可断言“profile 源码不含任何注入路径”。

三个反直觉陷阱：
1. **按 realpath 匹配**：`/tmp`→`/private/tmp`、`/var`→`/private/var`。deny 写 `/var/folders/...` 时内核看到的是 `/private/var/folders/...`，规则不命中——deny 等于没写且不报错（第一版敏感路径禁读测试就这样假绿）。所有注入路径先过 `realpath()`，含看似“肯定不是 symlink”的 home 子目录；`~/.ssh` 是 symlink 时跟 realpath 走。
2. **last-match-wins**：“读广域放行 + 敏感定向拒”必须把 `(deny file-read* …)` 放在 `(allow file-read*)` 之后；输出顺序就是安全边界，用单测锁住（deny 字符串 index > allow）。
3. **嵌套沙盒下 `sandbox_apply` 失败**：宿主已在沙盒里时（如 Cursor agent 沙盒跑测试）报 `Operation not permitted`。可用性探测必须“真的用空 profile 跑一次 `/usr/bin/true`”按退出码判断并模块级缓存；只查文件存在会误报可用；集成测试据此自动 skip，而不是假失败。另：`(allow network*)` 一行就放行 Unix socket（如 docker.sock），第一期只收文件系统时要意识到。

搭车发现：scheduler 用 `renderResult` 的回填文本**覆盖 `ToolResult.data`**（object→string），下游按对象形状读 `data.taskId` 的 bridge 真实链路上拿不到值，但测试桩没有 renderResult 所以全绿。教训：管道中途改写字段类型是隐形契约破坏（加 `structured` 字段保留原结构，而不是让下游解析回填文本）；测试桩要带上与生产一致的关键行为。

## 2. 只能“授权”的后端（Landlock/nono）挖不出只读子目录

要求：工作区可写，但 `.git/hooks`、`.git/config` 不可写（否则沙箱命令可植入 hook，等你在沙箱外 `git commit` 时运行）。Seatbelt 一行：`(allow file-write* (subpath "/repo")) (deny file-write* (subpath "/repo/.git/hooks") (literal "/repo/.git/config"))`。Landlock 写不出来：每条规则只能在某目录层级“加”权限，子目录继承，没有“减”。绕法“不授权 `/repo`，逐个授权除 `.git/hooks` 外的子项”会让 `/repo` 根与 `/repo/.git` 根不可写（新建文件需对所在目录有写权限，git 每次要建 `.git/index.lock`），沙箱“安全”了却连 `git status` 都跑不了。

反过来，“全部可读、减去 `~/.ssh`”在只能允许的模型下可做：从 `/` 往下，不含排除路径的目录整体授权、含排除路径的上级展开子项递归、排除路径本身跳过；读取不需要上级目录的写权限，拆分不误伤。**同样“减去一块”，读可用拆分表达，写不行。** macOS 上 nono 的禁读也不用拆分：拆到 `~/Library` 十几个路径会生成上千条授权、启动约 900ms；可选时选模型原生支持的表达方式。

陷阱：nono 清单里的 `deny` 字段在 0.80.0 清单模式下被直接丢弃（源码把 `deny_paths` 写死为空），沙箱内照样能写 `.git/config`；`~/.ssh` 读不到只因没授权。所以安全规则要**反向测试**：验证“禁止的确实被拦”并检查文件真的没写出来（只看返回码可能把“命令自己失败”当“沙箱拦住”）；还要测别名路径（macOS `/System/Volumes/Data/...`）。

做法：后端表达不了就**报告能力缺口，不做近似**。能力表有 `filesystem.write-deny`（见 `packages/sandbox/sandbox-seatbelt/src/backend.ts`），`tool` 模板列为必需；Linux 上 nono 后端报 `unsupported`，管理器判 `tool` 沙箱不可用，bash 走“沙箱外执行”审批，审批卡显示“真实环境”。用户看到的是诚实的边界：要么真有完整保护，要么明确知道在真实环境。Linux 上把 `.git` 挂成只读 bind mount 需要 mount namespace，不是 Landlock 能力，应作为新后端注册，不要在 nono 后端里偷偷补。

## 3. 默认值会悄悄放宽边界（评估沙箱 T6）

评估沙箱设计：候选只能写临时根，网络只放行模型服务。生成的 nono profile 字面完全符合（`allow` 只有临时根，`allow_domain` 只有模型域名），真实运行却发现：
1. **候选写进了原工作区**：nono profile 默认带“系统写入组”（macOS `system_write_macos` 放行 `/tmp`、`/private/tmp`、`$TMPDIR`、整个 `/private/var/folders`；Linux `system_write_linux` 放行 `/tmp`），测试里原工作区恰好在 `$TMPDIR` 下所以可写。
2. **只放行本机端口时网络全开**：模型服务在 `127.0.0.1`，域名白名单空，只有 `open_port`；nono 把空 `allow_domain` 理解为“不过滤”，不启动代理，所有域名都放行。

这不是 bug，是后端为“多数命令直接能跑”选的默认值；我们 profile 没写的部分也在起作用。配置是“加法”写的、默认是隐式加的——读 JSON 看不出 `/private/var/folders` 可写，要 `nono why --path <路径> --op write` 才看到 `group:system_write_macos`。“空列表”有两种含义（我们：一个都不放行；nono：没配置过滤）。单元测试只能验证写出了什么，验证不了生效后是什么。

做法：边界用**探针**证明——集成测试让候选执行 `probe.mjs`：写原工作区、写 HOME、写别的临时目录、连白名单外域名，每项断言失败（“应该失败”的用例比“应该成功”的重要）；探针位置贴近危险区（这次是因为原工作区放在系统临时目录下才发现）；对“空”显式分支（只有本机端口时写 `block: true` + `open_port`，不把空列表交给后端解释）；按用途收紧，不顺手改别处（评估沙箱排除了系统写入组；工具沙箱也受影响，但改它会让某些工具失败，是另一个决定，交给用户）。

## 自检

1. 敏感路径 deny 为何要对 home 子目录也做 realpath？`existsSync("/usr/bin/sandbox-exec")` 做探测在什么环境出错？
2. allowlist 接口收到空列表，你的代码与底层工具理解一致吗？怎么确认？沙箱配置里没写的部分由谁决定、有无工具打印“最终生效规则”？
3. 只能加一个集成用例，选“该成功的成功”还是“该失败的失败”？除此之外还应测别名路径吗？

来源：`docs/histories/2026-07/20260704-1840-bash-sandbox-e5.md`、[沙箱第一期 history](../../histories/2026-10/20261025-1313-sandbox-v1-tool-sandbox.md)、`docs/histories/2026-10/20261025-1517-sandbox-v2-evaluation-sandbox.md`。
