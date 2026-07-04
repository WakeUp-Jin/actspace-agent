# macOS Seatbelt 沙盒接入：deny-default、参数注入与三个反直觉陷阱

> 提炼自 `docs/histories/2026-07/20260704-1840-bash-sandbox-e5.md`（bash 工具 E5 沙盒落地）。

## 是什么

macOS 的 Seatbelt（`/usr/bin/sandbox-exec` + SBPL profile）是进程级沙盒：启动进程时附加一份声明式 allow/deny 规则，此后该进程**及其派生的整个进程树**的每次系统调用都由内核对照规则检查。它已被 Apple 标记 deprecated，但仍是事实行业标准（Chrome / Cursor / Claude Code 都在用）。

## 核心设计决策

### 1. `(deny default)` 全拒基线，而不是 `(allow default)` + 定向拒

直觉做法是「默认放行，拒掉危险的」，但拒不完——你列不全所有危险面（mach 服务、IOKit、sysctl、Unix socket……）。正确路线是全拒 + essential allows 白名单。难点在于全拒基线下普通命令根本跑不起来（连 fork/exec 都没有），essential allows 清单要靠成熟项目沉淀——我们直接抽取了 sandbox-runtime（Apache-2.0）里源自 Chrome 沙盒策略的清单，这是**比代码更值钱的抽取资产**。

### 2. 路径一律 `(param "X")` 注入，profile 源码零路径拼接

SBPL 是 Scheme 语法，把路径字符串拼进 profile 源码，路径里的引号/括号会破坏语法甚至构成注入面。`sandbox-exec -D KEY=VALUE` + profile 里 `(subpath (param "KEY"))` 天然规避，还让 profile 变成可整体审计的静态文本。测试也因此可以断言「profile 源码不含任何注入路径」。

## 三个反直觉陷阱

### 陷阱一：Seatbelt 按 realpath 匹配，symlink 路径的规则会静默失效

macOS 上 `/tmp` → `/private/tmp`、`/var` → `/private/var`。**profile 规则匹配的是内核解析后的真实路径**。如果 deny 规则写的是 `/var/folders/...`（symlink 形态），实际系统调用到达内核时是 `/private/var/folders/...`，规则不命中——**deny 等于没写，且不会有任何报错**。我们的敏感路径禁读测试第一版就这样假绿了（测试目录在 tmpdir 下，deny 没生效但测试没跑沙盒时也能过）。结论：**所有注入 profile 的路径必须先过 `realpath()`**，包括看起来"肯定不是 symlink"的 home 子目录。

### 陷阱二：last-match-wins，规则顺序就是语义

SBPL 后写的规则覆盖先写的。「读广域放行 + 敏感定向拒」必须把 `(deny file-read* ...)` 放在 `(allow file-read*)` **之后**才生效，反过来 deny 会被广域 allow 吃掉。这也意味着 profile 生成器的输出顺序是安全边界的一部分，值得用单测锁住（断言 deny 的字符串 index 大于 allow）。

### 陷阱三：嵌套沙盒下 sandbox_apply 失败，可用性探测必须"真的跑一次"

如果宿主进程自身已在沙盒里（我们的开发环境：Cursor 的 agent 沙盒里跑测试），`sandbox-exec` 会因 `sandbox_apply: Operation not permitted` 失败。只检查「文件存在且可执行」的探测会误报可用。正确探测是**真的用空 profile 跑一次 `/usr/bin/true`**，按退出码判断，再模块级缓存。集成测试也据此自动 skip，而不是在 CI/嵌套环境里假失败。

## 一个搭车发现：renderResult 覆盖 data 的元数据丢失

给 preview 加 `sandboxed` 字段时发现：scheduler 会用 `renderResult` 的回填文本**覆盖 `ToolResult.data`**，下游按对象形状读 `data.taskId` 的 bridge 代码在真实链路上从来拿不到值——但所有测试都过，因为测试 mock 的工具没有 renderResult。教训有两层：

1. **管道中途改写字段类型（object → string）是隐形契约破坏**，下游按形状探测（`typeof data === "object"`）会静默退化而不是报错。修复方式是加 `structured` 字段保留原始结构，而不是让下游去解析回填文本。
2. **测试桩和生产实现的差异（有无 renderResult）刚好盖住了 bug**——集成测试的桩要尽量带上与生产一致的关键行为。

## 自检问题

1. 为什么敏感路径 deny 规则要对 home 子目录也做 realpath？如果用户的 `~/.ssh` 是个 symlink 指向别处，deny 应该跟着 realpath 走还是两个都拒？（提示：我们当前跟 realpath 走，symlink 源路径的读取会命中目标路径的 deny。）
2. `(deny default)` 基线下，为什么 `(allow network*)` 一行就能放行 Unix socket 连接（如 docker.sock）？这对"第一期只收文件系统"意味着什么？
3. 如果把探测简化为 `existsSync("/usr/bin/sandbox-exec")`，在什么环境下会出什么错？
