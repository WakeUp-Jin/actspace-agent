# 沙盒下的权限分级：deny 与 ask 的语义分界，以及 .git 延迟执行逃逸

> 提炼自 `docs/histories/2026-07/20260704-2010-bash-permission-tiers.md`。

## 核心知识点一：deny 和 ask 不是"严格程度"的差别，是语义差别

给命令做权限分级时，直觉容易把"危险命令"统统往最严的一档（hard reject / deny）塞——"越危险越该拒"。但 deny 的真实语义是**用户批准也救不回**，所以它的准入标准不是"危险"，而是"**不存在正当场景**"：

- `rm -rf /`、eval、删 `.git` 本体 → 任何场景下都不该发生 → deny。
- `git reset --hard`、`git push --force`、`rm foo.txt` → 用户可能真的要丢弃改动 / 强推 / 删文件 → 塞进 deny 会把正当任务堵死 → 只能 ask。

判定一条规则该进哪档，问两个问题就够了：

1. **有没有正当场景？** 没有 → deny；有 → 继续问第二个。
2. **出错有没有回滚路径？** 没有 → ask（且沙盒放宽不豁免）；有 → 可以自动放行。

第二个问题解释了为什么"写/编辑文件"不用 ask 而"删文件"要：写坏了 git diff/revert 能救，删掉的 untracked 文件没有任何机制能救——**不可逆操作摧毁的往往恰恰是回滚路径本身**（git reset --hard 摧毁的就是"git 可回滚"这个兜底）。

## 核心知识点二：沙盒不豁免 workspace 内的不可逆操作

文件沙盒的写白名单里必然包含 workspace（否则命令什么都干不了），所以**沙盒对 workspace 内部的破坏力为零防护**。"沙盒可用就自动放行"的放宽逻辑必须带一个例外清单：不可逆操作即使在沙盒内也要问人。否则沙盒反而成了 rm 的免审通道，比没有沙盒时更危险（没沙盒时 rm 起码要走 allowlist-miss 的 ask）。

另一个对齐点：如果专用工具 `delete_file` 永远 ask，而 bash `rm` 因为沙盒自动放行，模型很快会学会用 bash 绕过专用工具的审批——**同一动作的多个入口必须同档**。

## 核心知识点三：.git/hooks 与 .git/config 是沙盒逃逸的"延迟执行点"

沙盒约束的是"进程运行时能做什么"，但有一类写入的危害发生在**沙盒外的未来**：

- 写 `.git/hooks/pre-commit`：用户之后在真实环境 `git commit` 时，hook 以用户全权限执行。
- 写 `.git/config` 的 `core.fsmonitor` / `core.pager` 等键：等价于 hook，任意 git 操作触发。

这类路径在 workspace 内（沙盒写白名单内），文本层又防不住 `cp payload .git/hooks/`（cp 是无害命令），所以只能在 profile 机制层定向 deny，且必须放在广域写放行**之后**（Seatbelt last-match-wins）。

范围取舍的陷阱：拦 `**/.git` 会让沙盒内 `git clone` 和子目录 `git init` 全部失败——它们都会写 hooks 模板文件。所以只保护 workspace 根仓库的 `.git`，嵌套子仓库不拦；代价（根仓库 `git remote add` / `git push -u` 写 config 被拦）由"违规标注 + 升级审批"路径兜住。

## 核心知识点四：文本匹配可靠性的前提是语法收缩

`rm $DIR`、`$(echo rm) x` 这类绕过之所以不用防，是因为管道/重定向/命令替换/子 shell 在更早的一级被整体拒绝——**先收缩语法空间，token 级文本匹配才所见即所得**。如果哪天放开这些语法，整个文本规则层的可信度前提就塌了，必须换 AST 级解析。

## 自检问题

1. 为什么 `git branch -D` 不在不可逆清单里，而 `git stash drop` 在？（提示：reflog 覆盖哪些对象）
2. 如果把 `.git/hooks` 的保护范围从根仓库扩大到 `**/.git/hooks`，哪两个常见命令会在沙盒内坏掉？
3. 一个新的破坏性命令该进 deny 还是 ask，先问哪两个问题？
