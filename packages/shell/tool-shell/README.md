# shell-tools

`@actspace/tool-shell` 拥有 bash 的工具定义、注册和 lifecycle。

转后台的命令（`blockMs` 到时或 `blockMs=0`）登记到 Host 服务 `actspace.host.background-tasks`：进程仍归本包持有（卸载 Harness 会结束进程），完成通知、`notifyOnOutput` 匹配通知、`task_output` / `task_stop` 查询都由 Host 登记表负责，见 [后台任务](../../../docs/design-docs/collaboration/agent-background-tasks.md)。

公开入口：`.`、`./manifest`、`./plugin`。

Host port 为 `actspace.host.tools.shell-tools`；factory 只创建本包资源。

## 沙箱

- `default`、`auto-review` 下每条 bash 进沙箱；`full-access` 下不进。是否进沙箱在批准时算出，记在进程资源的 `noSandbox` 上，执行端只认它。
- 出沙箱：`sandbox_permissions: "require_escalated"` 加 `justification`（1–200 字），只给一个返回 `BASH_ESCALATION_INVALID`；成对时审批原因是 `justification`，每次单独批准，没有前缀授权。`full-access` 或沙箱不可用时成对的参数不起作用。
- 被拦提示：`sandboxDenial` 判断沙箱内失败（退出码不是 0/2/126/127）且输出文件末尾 8KB 含 `operation not permitted` / `eperm`，命中时在前台结果的模型文字末尾、后台任务结束通知的摘要末尾加一行提示；用户看到的摘要不变。特征串来自 macOS nono 与 Seatbelt 的实测，见[沙箱设计](../../../docs/design-docs/execution-safety/agent-沙箱设计.md)第 9 节。

详细契约见 [Tool 插件边界](../../../docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)。

## 脚本临时目录

`node-ports.ts` 创建端口时就建好并 realpath 它的 scratch 根 `<tmpRoot>/bash-v2/<process>/`，`plugin.ts` 在 `apply` 时把它登记到 `tools.runtime` 插件提供的 `actspace.host-writable-roots`：这个目录下的路径 `read_file` / `write_file` / `edit_file` 免审批，`delete_file` 仍问。每条命令执行前确保 `scripts/<sessionId>/` 存在，并以环境变量 `ACTSPACE_SCRATCH` 传给子进程；`python3 "$ACTSPACE_SCRATCH"/run.py` 这类脚本路径在前缀授权里算作工作区内（`query-paths.ts` 的 `extraRoots`）。Harness 卸载时整个 scratch 根随 `dispose` 删除，上次崩溃残留的由下次创建端口时的 sweep 清。

## 随包 Python

`createNodeBashToolPorts` 的 `python`（`BashPythonRuntime`，由 Host 用 `@actspace/python-runtime` 的 `pythonRuntimeForBash` 构造）存在时，每条命令的环境里 `PATH` 前置 shim 目录（只含 `actspace-python`，Windows 另有 `.cmd`），并导出 `ACTSPACE_PYTHON=<shim>`；扩展层已安装时再导出 `ACTSPACE_PYTHON_EXT=<site-packages>`，这个值每条命令都重新从 getter 读，所以设置页里下载完成后下一条命令就能 `import pandas`。没有 `python`（开发环境没跑 `pnpm python-runtime:prepare`）时什么都不注入，提示词退化成用本机 `python3`。`tools.shell-tools` 服务上也带 `scratchRoot` 与 `python`，提示词从那里取。

## Bash 硬拒绝

`command-rules.ts` 在所有模式下生效。命令先按 shell 引号规则切成简单命令，只对**未加引号**的语法判断（设计见[脚本执行](../../../docs/design-docs/tool-system/agent-script-execution.md)第 2.1 节）：

- 单引号内任意字符、双引号内除 `$` 和反引号以外的字符都是字面量，所以 `python3 -c 'print(1)'`、`node -e '…'` 可以运行。
- 未加引号的 `$`、反引号、`( ) { }`、`<( )` 一律拒绝；拒绝文案告诉模型把脚本源码放进单引号或写成文件。
- `;` `&&` `||` `|` `&` 和换行切开的每条简单命令各自经过 `eval`/`source` 等内建、`rm`/`rmdir` 目标与 `.git` 规则。
- 输出重定向目标解析后必须在工作区或系统临时目录内，或是 `/dev/null`、`/dev/stdout`、`/dev/stderr`；`2>&1` 这类描述符复制放行；`~`、glob、`.git` 内的目标拒绝。输入重定向放行。
- heredoc 的分隔符必须带引号（`<<'EOF'`），正文整体跳过、不参与分类；未加引号的分隔符拒绝。

## Bash 会话前缀授权

Bash 先执行硬拒绝检查。显式批准后，符合 `command-prefix.ts` 规则的简单命令可复用当前会话授权；不是字符串 startsWith，也不是只读保证。

程序级：pnpm、npm、yarn、cargo、go、make、tsc、vitest、eslint、prettier；Git 支持 status、diff、log、show、ls-files、rev-list、rev-parse，以及 remote -v/get-url、branch --list、tag --list 查询形式。包管理器的动态执行、发布、配置、全局安装及指定 registry 等参数不复用。管道、重定向等复杂 shell 语法（即使在引号内）、申请出沙箱、工作区外 cwd 不提供建议。是否单次询问或硬拒绝仍由既有策略决定。

查询：ls、pwd、du、stat、file、cat、head、tail、wc、rg、grep。选项采用保守白名单；tail follow、rg 预处理器、未知选项和跟随链接参数不复用。git -C 真实目录和明确读取路径必须在工作区，敏感或无法解析的目标保持单次审批。

解释器：python、python3、actspace-python、node 运行脚本文件（`python3 run.py …`，脚本路径必须在工作区内）或 `python3 -m <模块>`（pip、ensurepip、venv 除外）时前缀为解释器名；`-c`、`-e`、`-p` 等内联源码和其他前置选项保持单次审批；`--version` / `node -v` 照旧。

cwd 和 workspace 经过 realpath；Runtime 校验 session、agent、audience/version、有效期和前缀，Journal 记录签发、撤销和使用。只有本地 Desktop 主 Agent 开启能力；切换工作区撤销 process 授权。授权可随同一持久化 Session 恢复，不跨新会话或子 Agent。沙箱实现保持不变。
