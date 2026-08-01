# Actspace 的 Bash 工具设计文档

## 当前状态

状态：E1–E4 已实现（2026-07-03，见 `docs/exec-plans/completed/20260703-bash-execution-model/`）；E5 沙盒第一期已实现（2026-07-04，见 `docs/exec-plans/completed/20260704-bash-sandbox/`），随后落地了文本层规则分级（hard reject / 不可逆 ask / allowlist，见「文本层规则分级表」）与 `.git` 延迟执行点定向禁写。2026-07-17 补齐后台任务治理：统一 30 分钟最大运行时间、单会话最多 8 个任务、相同 `cwd + command` 去重，以及每个新用户 turn 首次模型调用前注入一次运行清单。

E5 第一期与本文的裁剪偏差（后续阶段收敛）：

- **网络域名过滤代理未做**：profile 内 `(allow network*)` 放行网络，沙盒本期只收文件系统（写只放行 workspace / 会话 tmp / 系统临时区，敏感路径禁读）。代理是自研路线最大增量，单独立项。
- **`requiredPermissions` 只支持 `"no_sandbox"`**：`"full_network"` 在网络放行的第一期没有语义，随代理阶段引入。
- **违规标注只做输出模式匹配**（`Operation not permitted` / EPERM 等）；`log stream` 精确归因监听记 tech debt。
- Linux bwrap 未做：非 darwin 探测不通过即真实环境执行 + 权限层不放宽。

E1–E4 的已知偏差：前端首期复用 bash 块扩展后台徽标（未做独立任务卡片与输出流式滚动）；后台任务终态不回写持久化事件（重启后历史块停在 backgrounded）。均记录于 `docs/exec-plans/tech-debt-tracker.md`。

本文是 Actspace Bash 工具的**设计事实来源**，覆盖工具契约、输出管道、后台运行与通知机制、沙盒执行模型和前端展示契约。

相关文档：

- `docs/references/bash-tool-reference-analysis.md`：Cursor / Claude Code / OpenCode 三家参考实现的源码级调研与对比分析，是本文设计决策的输入底稿。
- `docs/design-docs/execution-safety/agent-bash-policy-allowlist-design.md`：权限层设计（allowlist、审批 UI、执行策略）。分工：该文管"命令能不能跑、要不要问用户"，本文管"命令怎么跑、输出怎么回、跑不完怎么办、在什么约束下跑"。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：前端预览契约。

## 设计总览

```txt
命令进入
  │
  ├─ ① hard reject（控制字符 / 危险删除 / eval 类 / 动 .git 本体 → 直接拒绝，任何环境都不跑）
  │
  ├─ ①' 不可逆 ask（rm / git reset --hard 等 → 沙盒放宽不豁免，永远问人）
  │
  ├─ ② 沙盒执行（默认路径：跳过 ask 审批，自动运行）
  │      │
  │      ├─ blockMs 内完成 → 前台返回（头部内联 + 条件落盘）
  │      ├─ blockMs 到点 → 转后台（当下不杀，输出持续落盘，受 30 分钟总时限约束）
  │      └─ 失败且输出中有沙盒拦截证据 → ③
  │
  └─ ③ 升级到真实环境（强制 ask 审批，无视 allowlist；用户批准后重跑）
```

三条核心原则：

1. **输出永远有界**：回填模型的内容和常驻内存有恒定上限，全量原文条件落盘、可检索。
2. **等待超时不等于执行失败**：`blockMs` 到点不杀进程而是转后台；后台进程受统一的时长、数量与去重约束，状态通过事件回流，而不是靠模型轮询。
3. **沙盒约束行为、权限层约束打扰**：沙盒决定"最坏能坏到哪"，审批只在要出沙盒圈时发生。

## 工具契约

### bash 参数

```ts
{
  command: string;          // 必填
  intent: string;           // 必填的一行中文意图说明（审批卡片 / 历史展示）
  cwd?: string;             // 工作区内相对/绝对路径（guardWorkspacePath 校验）
  blockMs?: number;         // 前台最长等待，默认 30_000，clamp [1_000, 600_000]
                            // 0 = 立即后台（dev server / watcher 等常驻进程）
  notifyOnOutput?: {        // 输出订阅（Phase E4）：常驻进程的关键日志事件
    pattern: string;        // 正则，匹配任意输出行时通知模型
    reason: string;         // ≤ 5 词的订阅原因，前端展示
    debounceMs?: number;    // 通知节流，最小 5_000
  };
  requiredPermissions?: Array<"full_network" | "no_sandbox">;
                            // 沙盒升级请求：携带即强制 ask 审批（Phase E5）
}
```

关键语义：

- **`blockMs` 是"模型等多久"，不是"进程活多久"**。到点后进程继续运行、输出继续落盘，模型稍后通过通知或读文件获取结果。不存在"超时失败"。
- **后台任务统一有界**：从进程启动开始最多运行 30 分钟；达到上限后按进程组 `SIGTERM → SIGKILL` 终止并发送终态通知。
- **单会话同时最多 8 个后台任务**。达到上限时不再创建新后台进程，返回当前任务清单并引导复用或 `bash_kill`。
- **相同规范化 `cwd + command` 去重**：若同一 session 已有相同任务运行，直接返回原 `taskId` 与输出路径，不生成第二个进程。

### bash 返回（前台完成）

```ts
{
  command, cwd,
  output: string,          // 合并输出（stdout+stderr）头部，≤ inlineThreshold（4000 字符）
  totalChars: number,
  exitCode: number | null,
  durationMs: number,
  truncated: boolean,      // 命中磁盘硬上限
  outputTruncated: boolean,
  stdoutFilePath?: string, // 超阈值时的全量落盘路径
  sandboxed: boolean,      // 本次是否在沙盒内执行（前端标签 + 模型归因用）
}
```

输出管道保持现有 sink 模式：**头部内联 + 超阈值才条件落盘**（不采用 Cursor 的无条件落盘——那是为其"终端即文件" UI 契约服务的，我们的 UI 预览流走独立通道）。超限时回填文本必须包含落盘路径和检索引导（用 `read_file` offset/limit 或 `grep` 检索文件，不要重跑命令加 `| head`）。

### bash 返回（转后台）

```ts
{
  command, cwd,
  status: "backgrounded",
  taskId: string,
  outputFilePath: string,   // 立即可读
  reason: "explicit" | "block_timeout" | "already_running",
  sandboxed: boolean,
  hint: string,             // "命令仍在运行，完成后你会收到通知；查看进度可读 outputFilePath"
}
```

### 配套工具

| 工具 | 职责 |
| --- | --- |
| `bash_output` | 读后台任务输出：默认返回自上次读取以来的增量（offset 记账），支持 tail 模式，单次上限 64KB + 省略提示 |
| `bash_kill` | 终止后台任务：进程组 SIGTERM → 宽限 → SIGKILL（复用现有 `signalChild`） |

不做 `bash_list`：运行中任务清单以轻量附件在 turn 边界注入（见下节），避免鼓励模型轮询。

## 后台运行与通知机制

### 任务生命周期

```txt
spawn ──► foreground ──(blockMs 到点 / blockMs=0)──► backgrounded ──► completed / failed / killed
             │                                            │
             └──(blockMs 内退出)──► 前台正常返回           └──(30 分钟上限 / bash_kill / 会话收割 / diskCap)──► killed
```

任务注册表（agent-core 内存态，不持久化）：

```ts
interface BashTask {
  taskId: string;
  command: string;
  intent?: string;          // 内部任务兼容旧记录；新的 Bash 工具调用已强制必填
  cwd: string;
  pid: number;
  outputFilePath: string;
  status: "running" | "completed" | "failed" | "killed";
  exitCode?: number | null;
  startedAt: number;
  endedAt?: number;
  maxRuntimeMs: number;     // 默认 30 分钟，从进程启动计时
  maxRuntimeHit?: boolean;
  sandboxed: boolean;
  notified: boolean;        // 通知去重
  lastReadOffset: number;   // bash_output 增量记账
}
```

- **会话收割是硬约束**：session 关闭 / app 退出时对所有 running 任务发进程组信号，绝不留孤儿 dev server。
- **竞态处理**：blockMs 到点转后台的瞬间命令恰好完成 → 撤销 taskId，按前台结果返回全量输出，标记 `notified` 抑制冗余通知。
- **准入约束**：转后台前检查相同 `cwd + command` 与 session running 数量；命中相同任务则复用，达到 8 个则终止尚未注册的新进程并返回错误。

### 四个事件源（覆盖后台进程的全部状态回流）

| 事件源 | 触发 | 覆盖场景 |
| --- | --- | --- |
| 终态通知 | 进程退出（completed / failed）或被 kill | 一次性长命令：build、test、迁移 |
| 输出订阅（`notifyOnOutput`） | 任意输出行匹配声明的正则（debounce 节流） | 常驻进程的中途事件：dev server 的 "ready on :5173"、watch 模式的编译报错。**常驻进程永不退出，终态通知一辈子不会来，这是订阅存在的原因** |
| 卡死看门狗 | 45s 无输出增长 **且** 尾行像交互式提问（`(y/n)`、`Press Enter` 等） | 命令阻塞在交互输入；两条件同时成立才报，慢构建不误报 |
| 最大运行时间看门狗 | 从进程启动满 30 分钟仍为 running | 防止被遗忘的 dev server / watcher 无限存活；终态摘要明确标记 maximum runtime reached |

### 通知的注入方式：turn 边界插入

后台事件**不是工具结果**（发起它们的工具调用早已返回 "backgrounded"），而是以结构化文本通知的形式在 **turn 边界**注入模型上下文，注入点复用 `engine/loop.ts` 已有的 steering messages 机制（每次调用 LLM 前检查 pending 队列）：

```txt
<task_notification>
<task_id>bash_01J…</task_id>
<status>completed | failed | killed | output_match | stalled</status>
<exit_code>0</exit_code>
<output_file>/…/tools/bash_01J….output</output_file>
<summary>Background command "pnpm build" completed (exit code 0)</summary>
<output_tail>…最后 N 行（≤ 2KB）…</output_tail>
</task_notification>
```

投递规则：

1. **agent loop 存活时**（模型还在多轮工具调用中）：事件进入 pending 队列，下一个 turn 边界随 steering messages 注入，模型在下一次思考前就能看到。
2. **loop 已结束**（agent 已回复完毕、处于空闲）：通知滞留队列，用户下一次发消息时随该轮注入。Kairos 自治模式下可触发一次 tick 主动唤醒（与 Kairos 设计对齐，本文不展开）。
3. **去重**：`notified` 一次性标志。模型自己调 `bash_kill` 已拿到结果的，标记 notified 抑制重复通知。
4. `output_tail` 内嵌少量尾部输出，多数"看一眼退出日志"的场景不需要再调一次 `bash_output`。
5. **运行中任务清单**：每个新用户 turn 在首次模型调用前固定注入一次轻量附件（"当前有 1 个后台任务运行中：pnpm dev，taskId、已运行 3m"），不依赖是否有新 notification；同一内部 Agent loop 后续调用不重复注入清单。

## 沙盒设计

### 为什么需要沙盒：权限层防不住的三类威胁

我们现在的执行方式是直接 `spawn("bash", ["-lc", command])`，子进程**继承用户的全部权限**：用户能读 `~/.ssh/id_rsa` 它就能读，能改 `~/.zshrc` 它就能改，能连任意网络它也能连。唯一防线是执行前的权限检查（allowlist / 正则 / AST 分段），而这道防线只能看到**命令的文本**，看不到进程运行起来之后实际做了什么。三类威胁会穿透它：

1. **间接执行**：`pnpm test` 文本上人畜无害，但测试代码可以做任何事；`pnpm install` 会执行第三方包的 postinstall 脚本。文本检查在第一层命令就止步，管不到进程树的后代。
2. **提示注入**：Agent 读到的网页 / 文件 / 工具输出可能携带恶意指令，模型被骗后发起的命令可能通过审批（用户习惯性 Allow、或命中 allowlist 前缀），然后用用户权限外传密钥。
3. **模型犯错**：算错路径的 `rm -rf`、写错位置的重定向。不需要恶意，只需要概率。

### 沙盒与直接 spawn 的本质区别

**直接 spawn：安全检查发生在执行前，检查对象是命令文本。沙盒：安全约束发生在执行中，约束对象是进程的实际行为。**

沙盒的运行原理（macOS 为例）：通过 `/usr/bin/sandbox-exec` 启动进程时附加一份 Seatbelt profile——一组声明式的 allow/deny 规则。此后该进程（**及其派生的整个进程树**，包括 postinstall 脚本、测试代码、孙子进程）每次发起系统调用，内核都会对照 profile 检查：

```scheme
(version 1)
(allow default)
(deny file-write*)                                  ; 默认禁写
(allow file-write* (subpath "/path/to/workspace")   ; 只放行 workspace
                   (subpath "/path/to/session-tmp")) ; 和会话 tmp
(deny file-read* (subpath "/Users/me/.ssh")          ; 敏感路径禁读
                 (subpath "/Users/me/.aws"))
(deny network*)                                      ; 网络走代理白名单
```

被拒绝的系统调用返回 `EPERM`（Operation not permitted）或连接失败，进程把它当作普通的 IO/网络错误上报。Linux 对应机制是 bubblewrap（mount namespace 只挂需要的路径 + network namespace 配域名过滤代理）；Windows 第一期无真隔离，仅靠权限层。

### 为什么有些命令沙盒里跑不了、真实环境就可以

命令文本相同，但**运行时触碰的资源不同**。沙盒逐系统调用拦截，只要进程碰到 profile 之外的资源就会失败。常见类别：

| 类别 | 典型命令 | 沙盒内的失败表现 |
| --- | --- | --- |
| 写工作区外的文件 | `npm i -g`（写全局 node_modules）、`git config --global`（写 `~/.gitconfig`）、`brew install`（写 `/opt/homebrew`） | `EPERM: operation not permitted, open '…'` |
| 连接非白名单网络 | `curl` 任意域名、连内网 API、拉私有 registry | 连接被拒 / DNS 解析失败 |
| Unix socket / 系统服务 | `docker ps`（连 `/var/run/docker.sock`）、用 ssh-agent 的 `git push` | `Cannot connect to the Docker daemon` 等 |
| 凭据服务 | https 方式 `git push`（credential helper 要访问 macOS Keychain） | 认证失败，看起来像"没登录" |
| 硬编码 `/tmp` | 一些工具写死 `/tmp/xxx` 而沙盒只放行了自己的 `$TMPDIR` | 写文件 EPERM |
| 设备 / 特权操作 | `sudo`、访问 USB | 直接失败 |

两个重要推论：

1. **失败信息可能有误导性**。很多程序没料到会收到 EPERM，会把它包装成奇怪的错误（"认证失败"、"daemon 没启动"）。所以执行层必须做**违规标注**：检测到沙盒拦截时，把明确的归因信息附加进命令输出（"此命令因沙盒限制失败：试图连接 /var/run/docker.sock"），否则模型分不清"命令本身错了"还是"被沙盒拦了"，会在错误方向上反复重试。
2. **同一条命令，环境不同就是两个行为**。这是"升级到真实环境必须重新审批"的理论依据：用户（或 allowlist）之前的授权是在"有沙盒兜底"前提下给出的，前提没了，授权需要重新获取。

### 沙盒优先的执行模型

沙盒不是审批的附属品，而是**默认执行路径**：

```txt
① hard reject：控制字符、危险删除目标（workspace 根 / 越界 / glob / .git）、
   eval 类、删除/移动 .git 本体 → 直接拒绝。
   `rm -rf` 的递归/强制 flag 本身不再等于危险；明确位于 workspace 子目录的
   目标有正当删除场景，进入下一层不可逆 ask。
   ↓ 通过
②' 不可逆操作：rm、git reset --hard 等 → 强制 ask（沙盒放宽不豁免）。
   见下方「文本层规则分级表」。
   ↓ 通过
② 沙盒执行：跳过 ask 审批，自动运行。
   沙盒的收益一半是安全，另一半是体验——大部分命令不再打扰用户。
   ↓ 失败，且输出中有沙盒拦截证据
③ 证据驱动升级：模型携带 requiredPermissions 重试 → 强制 ask 审批
   （无视 allowlist）→ 用户批准 → 真实环境重跑。
```

升级的约束：

- **证据驱动**：命令失败的原因大多与沙盒无关（路径错、参数错、依赖缺、编译不过）。只有输出中出现沙盒拦截痕迹（EPERM、非白名单连接失败、违规标注）才允许升级重试，否则等于把沙盒变成摆设还重复副作用。工具描述中写明合法证据清单。
- **逐条评估**：每条命令独立决定是否升级，不因上一条豁免过就默认下一条也豁免。
- **强制 ask**：携带 `requiredPermissions` 的调用无条件走审批，审批卡片展示升级原因（"上次沙盒执行被拦：试图连接 registry.npmjs.org"），让用户带着证据决策。
- **禁止静默降级**：沙盒 profile 创建失败时命令不执行，返回明确的初始化错误；只有模型显式携带 `requiredPermissions: ["no_sandbox"]` 并获得审批后，才能进入真实环境。
- **副作用提醒**：命令可能在沙盒里执行了一半才撞墙（先写了几个 workspace 内文件、再写外部路径失败），升级重跑会重复前半段副作用。对非幂等命令（append、发请求）在工具描述中提醒模型注意，不做机制。

### 权限层与沙盒的关系

- **权限层**回答"要不要打断用户问一下"——审批体验问题。
- **沙盒**回答"就算跑了，最坏能坏到哪"——爆炸半径问题。

沙盒落地后权限层可以放宽（沙盒内基本自动跑），最终形态是三层叠加：hard reject（文本层拦极端危险）→ allowlist / 审批（决定要不要问人，主要作用于升级请求和无沙盒平台）→ 沙盒（运行时兜底爆炸半径）。

沙盒管不了的，要靠其它层兜住：workspace 内的破坏（hard reject + 不可逆 ask + git 可回滚）、白名单域名内的滥用（域名白名单尽量窄）、Windows（暂只靠权限层）。

### 文本层规则分级表

规则内容集中在 `command-rules.ts`（单一事实源），`permissions.ts` 只做决策编排。分级的判据是两个问题：**有没有正当场景**、**出错有没有回滚路径**。

| 级别 | 语义 | 判据 | 清单 |
| --- | --- | --- | --- |
| hard reject | deny，任何环境、任何审批都不跑 | 不存在正当场景 | 控制字符 / Unicode 空白、不支持的 shell 语法（`\| < > $() {}` 等）、eval 类 builtin、删除目标为 workspace 根 / workspace 外路径 / glob / `.git` 树、删除或移动 `.git` 本体 |
| 不可逆 ask | ask，**沙盒放宽不豁免**，逐条评估（`allowSimilar: false`） | 有正当场景（用户可能真的要丢弃改动），但出错无法回滚 | workspace 内明确目标的 `rm` / `rmdir`（包括 `rm -rf <子目录>`）、`find -delete`、`dd` / `shred` / `truncate`、`git reset --hard/--merge`、`git clean`（非 dry-run）、`git restore`、`git checkout` 丢弃形态（`--` / `.` / 多参数 pathspec）、`git stash drop/clear`、`git push --force[-with-lease]` |
| allowlist | allow，任何环境免审 | 只读或幂等的高频开发命令 | `pwd`、`ls`、`git status/diff`、`node -v`、`pnpm typecheck/test/build` 等 |
| 其余 | 沙盒可用 → allow；否则 ask | 沙盒兜底爆炸半径 | — |

分级的关键取舍：

- **不可逆类放 ask 而不是 deny**：`git reset --hard`、`git push --force` 有正当场景（用户明确要丢弃/强推），deny 会把这些任务堵死；它们与 rm 同属"有正当场景但不可逆"。deny 的准入标准是"永远不该发生"。
- **判断删除目标而不是判断 `-rf` flag**：目录递归删除本身有正当场景，真正不可审批的是 workspace 根、越界、glob 和 `.git` 等目标边界。
- **写/编辑文件不进 ask**：git 提供了回滚路径（diff / revert），这也是 `write_file` 工具本身 allow 的原因；而 rm 与 `delete_file` 工具的永远 ask 对齐，否则 bash 成为绕过 `delete_file` 审批的后门。
- **git 分支/commit 级操作（`branch -D`、rebase 等）不列**：reflog 可恢复，保持清单短。
- **可信度前提**：不支持的 shell 语法在 hard reject 一级整体拒绝，变量展开 / 子 shell 不存在，因此 token 级文本匹配所见即所得，不会被 `rm $DIR` 绕过。

**机制层补充（profile 定向禁写）**：workspace 根仓库的 `.git/hooks/**` 与 `.git/config` 是"延迟执行点"——沙盒内写进去的内容会在沙盒外以用户全权限执行（commit 触发 hook；`core.fsmonitor` 等配置项等价于 hook），是 workspace 可写区里的沙盒逃逸通道，由 profile 在写放行之后定向 deny（last-match-wins）。只保护根仓库：嵌套子仓库不拦，否则 `git clone` / 子目录 `git init`（都会写 hooks 模板）在沙盒内全部失败；根仓库自身的 `git init` / `git remote add` / `git push -u`（写 config）被拦时走违规标注 + 升级审批路径。

## 模型引导（工具描述要点）

1. 长命令：预估运行时长设置 `blockMs`；dev server / watcher 用 `blockMs: 0` + `notifyOnOutput` 订阅就绪/报错日志；不要在命令尾加 `&`。
2. 后台任务治理：统一最多运行 30 分钟、每 session 最多 8 个；相同 `cwd + command` 已运行时复用返回的原 `taskId`，不要重复启动。
3. 禁止 sleep 轮询：后台事件会主动通知，不要 `sleep N && check` 或反复 `bash_output`；确需节流保持 sleep < 2s。
4. 大输出：不要用 `| head` / `| tail` 截断重跑（全量已落盘），用 `read_file` offset/limit 或 `grep` 检索落盘文件。
5. 沙盒：默认沙盒执行；只有看到沙盒拦截证据才申请 `requiredPermissions`，逐条评估；临时文件用 `$TMPDIR` 不要硬编码 `/tmp`。
6. `intent` 是 Bash 调用的必填非空字段，必须用一行中文解释命令目的；不可逆操作（rm、git reset --hard 等）沙盒内也会进审批，并应在 `intent` 里说明原因，优先用非破坏性替代（挪走文件而不是 rm、git stash 而不是 reset --hard）。
7. `delete_file` 只删除普通文件；用户明确要求删除目录时使用 Bash。若 Bash 返回 `Permission denied before execution`，表示命令未运行且不存在审批请求，不得让用户寻找审批按钮。
8. 沿用现状：读/搜/改文件用专用工具；引号包裹含空格路径；`cwd` 参数替代 `cd`。

## 前端展示契约

按 `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md` 和"preview 必须以最终态收尾"的原则：

- **两段最终态**：转后台时 bash 工具调用本身以 "backgrounded" 收尾；任务卡片（新预览类型）随任务状态独立更新到 completed / failed / killed 终态。
- 运行中任务卡片：滚动尾部输出（复用现有 UI 预览流）、已运行时长、kill 按钮（用户手动终止 → 走 killed 通知）。
- **执行环境标签**（审批卡片 + 实时执行 + 历史记录均展示）：
  - `沙盒`：审批时表示计划环境，执行完成后表示实际环境。
  - `真实环境`：审批时表示将无沙盒执行，执行完成后表示实际环境。
  - `未执行`：权限硬拒绝或用户拒绝，命令未进入任何执行环境。
  - 沙盒初始化失败同样不执行；错误正文说明可在必要时申请 `no_sandbox`，不能静默切换真实环境。
  - 必要性：沙盒优先意味着大量命令跳过审批，用户失去逐条确认机会，"命令在什么约束下跑"必须在别处可见，否则安全模型对用户是黑盒。

## 分阶段路线

| Phase | 范围 | 依赖 |
| --- | --- | --- |
| E1 输出管道收口 | 落盘检索引导写进回填文本与工具描述；错误语义三分类（命令失败 / 截断 / 启动失败）；后台落盘上限与截断标记 | 无 |
| E2 后台运行 MVP | `blockMs: 0` 显式后台 + 任务注册表 + `bash_output` / `bash_kill` + 终态通知（steering 注入）+ 会话收割 + 前端任务卡片 | E1 |
| E3 blockMs 语义切换 | `timeoutMs` → `blockMs`，超时转后台替代杀进程；竞态处理；运行中任务清单注入 | E2 |
| E4 事件订阅与看门狗 | `notifyOnOutput` 输出订阅；交互式卡死看门狗 | E3 |
| E4.1 后台任务治理 | 30 分钟最大运行时间；单会话 8 个上限；相同 `cwd + command` 去重；新用户 turn 首次运行清单注入 | E4 |
| E5 沙盒 | Seatbelt / bwrap 执行层 + 沙盒优先流程 + 证据驱动升级 + 违规标注 + 前端沙盒标签（与 allowlist 设计 Phase 3 合并立项） | 独立安全调研 |

## 被排除的方案

- **无限期后台运行**：即使常驻进程本身健康，也不能缺少资源边界；统一 30 分钟上限替代无限存活。
- **按临时任务 / 常驻任务分类**：首版不引入额外任务类型，所有后台任务统一使用相同的时长、数量和去重规则。
- **持久 shell 会话**（跨调用保留 env/cwd 的常驻 shell）：状态污染、清理复杂、注入面大，收益不值得。保持每次独立进程 + `cwd` 参数。
- **PTY / 交互式命令支持**：不做；看门狗通知引导"kill + 管道输入重跑"。
- **无条件输出落盘**（Cursor 式）：那是为"终端即文件" UI 契约服务的；我们保留条件落盘 + 独立 UI 预览流。
- **失败即升级真实环境**：必须证据驱动，否则沙盒形同虚设且重复副作用。
- **专用 `bash_list` 工具**：用 turn 边界附件注入替代，避免鼓励轮询。
- **后台任务跨重启恢复**：进程活不过应用退出，恢复注册表无意义。
- **输出流式进模型上下文**：上下文膨胀不可控，被"落盘 + 头部内联 + 增量拉取 + 事件通知"组合替代。

## 附录：Seatbelt profile 模板与生成契约（E5）

### 生成器而非静态文件

profile 中包含运行时才确定的路径（workspace root、会话 tmp、用户 home 下敏感路径），因此**版本化进仓库的是生成器代码**（未来位于 `packages/agent-core/src/tools/tools/bash/sandbox/`），profile 实例每会话生成到 session tmp（如 `<userData>/tmp/<sessionId>/sandbox.sb`），随会话清理。Cursor 与 Claude Code 均为动态生成。

### 决策：抽取式自研，不引入 `@anthropic-ai/sandbox-runtime` 依赖

对 srt（`anthropic-experimental/sandbox-runtime`，Apache-2.0，源码参考副本在 `back-code/sandbox-runtime`）做源码分析后确定自研，理由：

1. **需求覆盖仅约 10%**：srt 共 ~11.5K 行 + vendor 二进制（Linux seccomp、Windows srt-win）+ 4 个运行时依赖；我们 E5 需要的 macOS profile 生成（~1K 行）+ 违规监听（~260 行）+ 域名代理的域名层。
2. **不需要它的重型能力**：请求级过滤靠 TLS MITM（自签 CA + per-host leaf 证书，node-forge）——域名白名单在 CONNECT/SNI 层即可，不解密流量；凭据 sentinel 掩码——改为 bash 子进程 env 白名单过滤，密钥根本不进沙盒。
3. **沙盒规则是安全边界本身**，必须可逐行审计，不能黑盒化；srt 自标 Beta Research Preview，API 不稳定。
4. Cursor 同样是自研（自带沙盒 helper 二进制 + `workspace_readwrite`/`workspace_readonly`/`insecure_none` 策略），srt 只是 Claude Code 开源了自家实现。

抽取规则：以 srt 的 macOS 实现为参考蓝本，抽取文件头保留 Apache-2.0 derived-from 归属声明；重点抽取资产——**deny-default 基线的 essential allows 清单**（源自 Chrome 沙盒策略，解决全拒基线调不通的问题）、Seatbelt 陷阱处理（`file-write-unlink`/`file-write-create` 的 specific-deny 优先语义、last-match-wins 补偿规则）、`log stream` 违规监听与降噪。预计自研规模 < 1K 行，零新增运行时依赖。

与 srt 的差异清单（自研版裁剪范围的事实记录）：

| 维度 | srt | 我们的抽取版 |
| --- | --- | --- |
| 平台 | macOS / Linux / Windows | 仅 macOS（E5），Linux 留接口 |
| 网络过滤深度 | MITM 解密后请求级 | CONNECT/SNI 域名级，不解密 |
| 凭据保护 | 代理层 sentinel 掩码 | 子进程 env 白名单过滤 |
| 违规监听 | log stream + 订阅式 store | 同思路简化 + 输出模式匹配 |
| 运行时依赖 | node-forge、socks5-server、commander、zod | 零新增 |
| 规模 | ~11.5K 行 + vendor | < 1K 行 |

### profile 模板

基线采用 **`(deny default)` 全拒 + essential allows**（srt / Chrome 策略验证过的路线；`with message` 标签是内核日志中违规归因的钩子）。essential allows 清单较长（process-exec/fork、指定 mach 服务、POSIX IPC、特定 IOKit 等），实现时从 srt `macos-sandbox-utils.ts` 抽取，模板从略：

```scheme
(version 1)
(deny default (with message "actspace-bash"))  ; 全拒基线；message 标签供
                                               ; log stream 按 tag 归因违规

;; …essential allows 清单（抽取自 srt，源自 Chrome 沙盒策略）…
(allow process-exec)
(allow process-fork)
;; (allow mach-lookup (global-name …)) 等，见 srt macos-sandbox-utils.ts

;; 1. 文件读：广域放行（全拒基线下需显式 allow），敏感路径定向拒见下
(allow file-read*)

;; 2. 文件写：只放行三个区域
(allow file-write*
  (subpath (param "WORKSPACE_ROOT"))
  (subpath (param "SESSION_TMP"))      ; $TMPDIR 指到这里
  (subpath (param "DARWIN_USER_TMP"))  ; /var/folders/… 用户临时区
  (literal "/dev/null")
  (literal "/dev/stdout")
  (literal "/dev/stderr")
  (literal "/dev/tty"))

;; 3. 敏感路径定向禁读（清单可配置扩展；Seatbelt last-match-wins，
;;    定向 deny 置于广域 allow 之后生效）
(deny file-read*
  (subpath (param "HOME_SSH"))
  (subpath (param "HOME_AWS"))
  (subpath (param "HOME_GNUPG"))
  (subpath (param "HOME_KUBE")))

;; 4. 网络：全拒基线下默认已拒，只放行本地过滤代理
(allow network-outbound
  (remote tcp "localhost:8877"))  ; 端口由生成器写入
```

### 调用契约

`runProcess` 的入口命令从 `bash` 换为 `sandbox-exec`：

```bash
sandbox-exec -f <sessionTmp>/sandbox.sb \
  -D WORKSPACE_ROOT=… -D SESSION_TMP=… -D HOME_SSH=… \
  bash -lc "<command>"
```

约束继承到整个进程树。三条硬规则：

1. **路径一律走 `-D` 参数**，禁止把路径字符串拼接进 profile 源码——特殊字符会破坏 Scheme 语法并构成注入面；`(param "X")` 天然规避。
2. **Seatbelt 无法按域名过滤网络**（过滤器只认 IP/端口）。域名白名单的真实架构：profile 全拒网络、只放行本地代理端口 → agent-core 起本地代理做域名过滤 → 子进程注入 `HTTP_PROXY`/`HTTPS_PROXY`。这是 Cursor / Claude Code 的共同做法，也是自研路线的最大增量（代理本身 + 不认代理环境变量的工具的兜底）。
3. **`sandbox-exec` 已被 Apple 标记 deprecated 但为事实行业标准**（Chrome / Cursor / Claude Code 均在用，系统自带）。启动时探测 `/usr/bin/sandbox-exec` 可执行性，不可用降级为无沙盒执行 + 前端标签如实显示"真实环境"（Cursor 同款探测降级）。

违规标注实现两条腿并存：运行期监听系统日志（`log stream` 按 `(deny default (with message tag))` 的 tag 过滤，srt 同款，注意过滤 mDNSResponder 等噪声）获得精确归因；同时匹配命令输出中的 `Operation not permitted` 等特征模式做兜底标注。

## 从本设计派生计划的规则

派生 exec-plan 必须写清：

- 消费本文哪个 Phase（E1–E5），是否触碰 `blockMs` 语义切换（E3 有行为兼容影响）。
- 新增 shared 契约：任务状态事件、前端任务卡片与沙盒标签的 IPC 字段、preview kind。
- 通知注入与 `engine/loop.ts` steering messages 的对接方式与去重保证。
- 会话收割的验证方式（如何证明没有孤儿进程）。
- E5 需额外写清：沙盒 profile 的具体 allow/deny 清单、违规标注的检测方式、升级审批与 `docs/design-docs/execution-safety/agent-bash-policy-allowlist-design.md` 审批流的合并方案。
