# shell-tools

`@actspace/tools-shell-tools` 拥有 bash、bash_output、bash_kill 的工具定义、注册和 lifecycle。

公开入口：`.`、`./manifest`、`./plugin`。

Host port 为 `actspace.host.tools.shell-tools`；factory 只创建本包资源。

详细契约见 [Tool 插件边界](../../../docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)。

## Bash 会话前缀授权

Bash 先执行既有硬拒绝检查。显式批准后，符合 `command-prefix.ts` 规则的简单命令可复用当前会话授权；不是字符串 startsWith，也不是只读保证。

程序级：pnpm、npm、yarn、cargo、go、make、tsc、vitest、eslint、prettier；Git 支持 status、diff、log、show、ls-files、rev-list、rev-parse，以及 remote -v/get-url、branch --list、tag --list 查询形式。包管理器的动态执行、发布、配置、全局安装及指定 registry 等参数不复用。复杂 shell 语法（即使在引号内）、显式 no_sandbox、工作区外 cwd 不提供建议。是否单次询问或硬拒绝仍由既有策略决定。

新增查询：ls、pwd、du、stat、file、cat、head、tail、wc、rg、grep；node -v/--version 与 python/python3 --version。选项采用保守白名单；tail follow、rg 预处理器、未知选项和跟随链接参数不复用。git -C 真实目录和明确读取路径必须在工作区，敏感或无法解析的目标保持单次审批。

cwd 和 workspace 经过 realpath；Runtime 校验 session、agent、audience/version、有效期和前缀，Journal 记录签发、撤销和使用。只有本地 Desktop 主 Agent 开启能力；切换工作区撤销 process 授权。授权可随同一持久化 Session 恢复，不跨新会话或子 Agent。沙箱实现保持不变。
