# Bash 工具参考实现分析（Cursor / Claude Code / OpenCode）

## 当前状态

状态：参考分析归档。本文是 Bash 工具设计的调研底稿，**正式设计事实来源是 `docs/design-docs/execution-safety/agent-bash工具设计文档.md`**；两文冲突时以正式设计文档为准。

本文回答三个问题：

1. Bash 工具的**输出如何稳定地传递给模型上下文**（尤其是大输出、持续输出的场景）。
2. **长时间运行的命令**（如 `pnpm dev` 这类不退出、持续打日志的进程）如何支持后台运行，以及模型如何拿到后台进程的状态和输出。
3. **沙盒**在整个执行模型中的位置。

与既有设计的分工：

- `agent-bash-policy-allowlist-design.md`：管"命令能不能跑"（权限、allowlist、执行策略、审核 UI）。
- 本文：管"命令怎么跑、输出怎么回、跑不完怎么办"（执行模型、输出管道、后台任务、沙盒执行层）。
- 两文共享 Phase 3 真沙盒路线，沙盒的**策略入口**在 allowlist 设计里，**执行层机制**在本文里。

## 参考实现调研结论

对 Cursor（编译产物 + 工具 schema）、Claude Code（本地源码）、OpenCode（本地源码）三个实现做了源码级调研，结论如下。

### 对比总表

| 维度 | Cursor (Shell) | Claude Code (Bash) | OpenCode (bash) | actspace 现状 |
| --- | --- | --- | --- | --- |
| 超时语义 | `block_until_ms`（默认 30s）到点**转后台**，不杀进程 | `timeout`（默认 2min，上限 10min）到点**转后台**（可自动后台的命令），显式 `run_in_background` 立即后台 | `timeout`（默认 2min）到点**杀进程**，提示模型加大 timeout 重试 | 到点杀进程（SIGTERM→SIGKILL），上限 120s |
| 后台运行 | 一等公民：所有命令天然可后台，`AwaitShell` 轮询 + 完成通知 | 一等公民：taskId + 输出文件 + `<task_notification>` 完成通知 + 卡死看门狗 | 不支持 | 不支持 |
| 输出通道 | 每个终端一个文本文件（含 pid/cwd/exit_code 元数据头尾），模型用 Read/Grep 读 | 输出流式落盘（append 队列，5GB 上限），内联回填上限 30K 字符，超限持久化到 tool-results 目录并给 preview + 路径 | 内存滚动窗口（2×50KB），超 2000 行 / 50KB 截断落盘，回尾部 + 文件路径提示 | headBuffer 4000 字符内联 + 5MB 落盘（已有 sink 模式） |
| stdout/stderr | 合并 | 合并（单 fd） | 合并（`handle.all`） | sink 模式已合并 |
| 完成通知 | turn 结束时投递完成通知；`notify_on_output` 支持正则匹配输出触发通知 | `<task_notification>` XML（taskId + 输出文件路径 + status + summary）作为 pending notification 注入下一轮 | 无 | 无 |
| 卡死检测 | 无（靠模型自查 + `AwaitShell` 超时判断） | 看门狗：每 5s 查输出文件大小，45s 无增长且尾部像交互式提问（`(y/n)` 等）→ 通知模型"杀掉后用管道输入重跑" | 无 | 无 |
| 沙盒 | macOS `sandbox-exec`（Seatbelt）helper；文件写限 workspace、网络 allowlist；`required_permissions: [full_network/all]` 逐条升级 | `@anthropic-ai/sandbox-runtime`（macOS Seatbelt / Linux bubblewrap+socat）；fs read denyOnly / write allowOnly、网络 host 级 allow/deny；`dangerouslyDisableSandbox` 逐条升级且受策略开关约束 | 无沙盒（权限层用 tree-sitter 解析出命令触碰的目录，外部目录单独审批） | 无沙盒 |
| 命令解析 | 未知（编译产物） | 自研 AST（`parseForSecurity`）+ 子命令拆分 | tree-sitter（bash + powershell 双语法） | 正则分段，`|<>$(){}` 一律 hard reject |
| cwd 策略 | `working_directory` 参数，shell 状态跨调用持久 | 引导用绝对路径避免 `cd`；跨调用持久化 cwd | `workdir` 参数，明确禁止 `cd x && cmd` | `cwd` 参数，shell 状态不持久 |

### 每家值得借鉴的核心机制

**Cursor —— "终端即文件"的输出契约**

- 每个终端会话对应一个持续更新的文本文件，带元数据头（pid、cwd、last_command、running_for_ms 每 5s 更新）和结束 footer（exit_code、elapsed_ms）。模型不需要专用"读后台输出"工具，直接 Read/Grep 这个文件。
- `block_until_ms` 把"前台等待"变成一个纯粹的调度参数：命令永远在跑，只是模型等多久的问题。到点转后台是无损的。
- `notify_on_output`（正则 + debounce + 原因说明）让模型可以"订阅"输出中的关键事件（如 `Server started`、`error`），而不是轮询。
- prompt 层大量行为引导：预估运行时长来设定 block 时间、禁止 sleep 轮询、后台任务完成会自动通知所以"不要反复 poll"。

**Claude Code —— 最完整的后台任务生命周期**

- 超时不杀进程而是**自动转后台**（`sleep` 等白名单命令除外），这是对"模型低估了命令时长"这一常见失误的兜底。
- 落盘写入器（`DiskTaskOutput`）是精心设计的：append 队列 + 单 drain 循环（避免 promise 链持有内存）、5GB 磁盘上限、`O_NOFOLLOW` 防符号链接攻击、按 sessionId 分目录防并发会话互删。
- 完成通知是结构化 XML：`<task_notification><task_id/><output_file/><status/><summary/></task_notification>`，带去重标记（`notified` 标志防 TaskStop 与自然完成重复通知），并处理"转后台与完成竞态"（完成先到就撤销 taskId、按前台结果返回全量输出）。
- 卡死看门狗只在"输出停止增长 且 尾行像交互式提问"时才通知，避免对慢命令（长构建）误报。
- 大输出内联上限 30K 字符，超限持久化 + 给模型 preview 与文件路径，引导用 Read/Grep 精查而不是塞满上下文。

**OpenCode —— 克制但精确**

- tree-sitter 真语法解析替代正则，能从命令里提取出触碰的**文件路径实参**，把"命令要访问工作区外目录"变成独立的权限问题（`external_directory`），这是比命令前缀更细的授权粒度。
- 输出用**恒定内存的滚动窗口**（chunk 链表 + 总量记账，超 2×50KB 就丢头部），结果回"尾部 2000 行 / 50KB + 全量落盘路径"，并按"有没有 Task 工具"给出不同的检索建议（有子代理就引导 delegate，省上下文）。
- 超时信息用 `<bash_metadata>` 标签附在输出尾部，明确告诉模型"是工具杀掉的，若非交互等待可加大 timeout 重试"——错误语义精确，防止模型误判方向。

## 设计目标

1. **输出永远有界**：无论命令输出多大、跑多久，回填给模型的内容和常驻内存都有恒定上限；全量原文落盘可检索。
2. **长命令不再是死路**：`pnpm dev` 这类不退出的进程可以显式后台运行；普通命令超时默认转后台而不是杀掉。
3. **后台状态可靠回流**：模型通过两条路径感知后台进程——完成/异常时的结构化通知（推）、随时读输出文件（拉）。
4. **沙盒是执行层属性**：沙盒决定"命令在什么约束下跑"，与权限层"命令能不能跑"解耦；升级路径（逐条豁免）有明确契约。
5. **对模型的引导写进工具描述**：错误语义精确、行为约束显式（禁 sleep 轮询、预估时长、后台不重复 poll）。

## 工具契约

### bash 工具参数（目标形态）

```ts
{
  command: string;          // 必填
  intent?: string;          // 一行中文意图说明（沿用现状，审批卡片/历史展示）
  cwd?: string;             // 工作区内相对/绝对路径（沿用现状 guardWorkspacePath）
  blockMs?: number;         // 前台最长等待时间，默认 30_000，clamp [1_000, 600_000]
                            // 0 = 立即后台（dev server / watcher 等明确的常驻进程）
  background?: boolean;     // 显式后台（等价 blockMs: 0，语义更直白，二选一保留其一即可）
}
```

关键决策：**用 `blockMs`（Cursor 语义）替换现在的 `timeoutMs`（杀进程语义）**。

- 现状 `timeoutMs` 到点杀进程，模型低估时长时会得到一个"失败"，然后倾向于盲目加大 timeout 重跑，浪费一轮且可能重复副作用。
- `blockMs` 到点只是"模型不再等了"，进程继续跑、输出继续落盘、完成后有通知。对模型来说没有失败分支，只有"现在拿到结果"和"稍后拿到结果"两种。
- 真正需要"杀死失控进程"的场景由后台任务管理（`bash_kill`）和磁盘上限看门狗兜底，而不是靠超时。

### bash 工具返回（前台完成时）

沿用现有 `BashResult` 骨架，字段语义不变：

```ts
{
  command, cwd,
  output: string,          // 合并输出头部，≤ inlineThreshold（4000 字符，现状保留）
  totalChars: number,
  exitCode: number | null,
  durationMs: number,
  truncated: boolean,      // 命中磁盘硬上限
  outputTruncated: boolean,
  stdoutFilePath?: string, // 全量落盘路径
}
```

补充两条既有实现的经验：

- 输出超限时，回填文本中除了头部 preview，要**显式包含落盘路径和检索建议**（"用 read_file offset/limit 或 grep 检索该文件，不要用 head/tail 重跑命令"）——OpenCode 和 Claude Code 都验证过这条引导非常有效。
- 非零退出码时错误信息要区分三种情形：命令自身失败（带 exit code）、被磁盘上限截断、启动失败（startError），各自给模型不同的下一步建议。

### bash 工具返回（转后台时）

```ts
{
  command, cwd,
  status: "backgrounded",
  taskId: string,
  outputFilePath: string,   // 落盘文件路径，立即可读
  reason: "explicit" | "block_timeout",
  hint: string,             // "命令仍在运行，完成后你会收到通知；如需查看进度请读 outputFilePath"
}
```

### 配套工具（最小集）

| 工具 | 职责 | 参考 |
| --- | --- | --- |
| `bash_output` | 读后台任务输出。默认返回自上次读取以来的**增量**（offset 记账），支持 `tail` 模式；单次读取上限（如 64KB）+ 省略提示 | Claude Code `getTaskOutputDelta` / `TaskOutput` |
| `bash_kill` | 终止后台任务（SIGTERM → 宽限 → SIGKILL，进程组信号，沿用现有 `signalChild`） | 三家皆有 |

不单独做 `bash_list`：运行中任务清单以轻量附件形式随上下文注入（见"通知注入契约"），避免模型主动轮询。

## 输出管道

分层沿用现有 sink 模式，明确各层上限：

```txt
子进程 stdout+stderr（合并单流）
  │
  ├── headBuffer（内存，≤ inlineThreshold 4000 字符）→ 前台结果内联回填
  ├── 落盘文件（<userData>/tmp/<sessionId>/tools/…，流式 append，≤ diskCap）
  │     前台：现状 5MB；后台任务建议放宽（如 512MB），命中上限时：
  │     写入截断标记 → 看门狗杀进程 → 发 failed 通知（防失控进程写满磁盘）
  └── UI 预览流（现有 preview 通道，滚动尾部，与模型上下文无关）
```

硬性规则：

1. **内存恒定**：任何路径下内存驻留 ≤ headBufferCap + 单 chunk 大小，与输出总量无关（现有实现已满足，保持）。
2. **文件是唯一全量事实**：headBuffer 只是 preview；落盘文件从第一个字节起就是完整原文（现有"创建文件时先回写 headBuffer"的设计保持）。
3. **落盘安全**：目录按 sessionId 隔离（防并发会话互删，现状已有）；实现真沙盒后，打开文件需加 `O_NOFOLLOW`（防沙盒内进程用符号链接诱导宿主写任意文件，Claude Code 的教训）。
4. **清理**：沿用现有 `cleanup-tool-outputs` 生命周期；后台任务输出文件在任务完成 + 通知已读后进入常规清理池，保留期对齐现状。

## 后台任务生命周期

### 状态机

```txt
spawn ──► foreground ──(blockMs 到点 / background=true)──► backgrounded ──► completed / failed / killed
             │                                                   │
             └────────(blockMs 内退出)──► 前台正常返回            └──(bash_kill / 会话结束 / diskCap)──► killed
```

### 任务注册表（agent-core 内存态）

```ts
interface BashTask {
  taskId: string;
  command: string;
  intent?: string;
  cwd: string;
  pid: number;
  outputFilePath: string;
  status: "running" | "completed" | "failed" | "killed";
  exitCode?: number | null;
  startedAt: number;
  endedAt?: number;
  notified: boolean;        // 通知去重（防 kill 与自然完成双重通知）
  lastReadOffset: number;   // bash_output 增量读取记账
}
```

生命周期约束：

- **会话结束必须收割**：session 关闭 / app 退出时对所有 running 任务发进程组 SIGTERM→SIGKILL（现有 `detached` + 进程组信号基础设施可直接复用）。绝不允许孤儿 dev server 留在用户机器上。
- **竞态处理**（Claude Code 验证过的坑）：blockMs 到点转后台的瞬间命令恰好完成 → 撤销 taskId，按前台结果返回全量输出，并标记 `notified` 抑制冗余通知。
- 注册表不持久化：应用崩溃后进程组已随之终止（detached 但同会话收割），重启后不恢复后台任务。

### 卡死看门狗（Phase 可后置）

照搬 Claude Code 的两条件触发，避免误报：

- 每 5s stat 输出文件；连续 45s 无增长 **且** 尾部最后一行匹配交互式提问模式（`(y/n)`、`Press Enter`、`Continue?` 等）→ 发一次性通知："命令疑似在等交互输入，建议 kill 后用 `echo y | cmd` 或非交互 flag 重跑"。
- 只是慢（长构建、`git log -S`）不触发。

## 通知注入契约

后台任务状态变化通过**结构化文本通知**回流模型，注入点复用 `engine/loop.ts` 已有的 steering messages 机制（`getSteeringMessages` 在每个 turn 边界被调用）：

```txt
<task_notification>
<task_id>bash_01J…</task_id>
<status>completed | failed | killed</status>
<exit_code>0</exit_code>
<output_file>/…/tools/bash_01J….output</output_file>
<summary>Background command "pnpm build" completed (exit code 0)</summary>
<output_tail>…最后 N 行（≤ 2KB）…</output_tail>
</task_notification>
```

投递规则：

1. **loop 存活时**：通知进入 pending 队列，下一个 turn 边界随 steering messages 注入。
2. **loop 已结束**（agent 已回复完毕）：通知滞留队列，用户下一次发消息时随该轮注入。Kairos 自治模式下可选择直接触发一次 tick（后续与 Kairos 设计对齐，本文不展开）。
3. **去重**：`notified` 标志一次性投递；kill 操作若由模型自己发起（`bash_kill` 已拿到结果），标记 notified 抑制重复。
4. `output_tail` 直接内嵌少量尾部输出，多数"看一眼退出日志"的场景可以不再发起一次 `bash_output` 调用；需要细查再读 `output_file`。
5. **运行中任务清单**：有 running 任务时，在 turn 边界以一行轻量附件注入（"当前有 1 个后台任务运行中：pnpm dev（taskId、已运行 3m）"），让模型对自己启动的进程保持感知，防止重复启动。

## 沙盒设计（执行层）

Phase 对齐 `agent-bash-policy-allowlist-design.md` 的 Phase 3，本文补充执行层契约。

### 机制选型

| 平台 | 机制 | 参考 |
| --- | --- | --- |
| macOS | `/usr/bin/sandbox-exec`（Seatbelt profile） | Cursor、Claude Code 均采用 |
| Linux | bubblewrap（`bwrap`）+ 网络代理（socat/域名过滤） | Claude Code（`@anthropic-ai/sandbox-runtime`） |
| Windows | 第一期不做真隔离，仅权限层约束 | Claude Code 也未覆盖 |

### 默认 profile（与 Cursor 一致的直觉）

- 文件系统：**写**仅允许 workspace root + 会话 tmp 目录（`$TMPDIR` 指向沙盒可写位置）；**读**开放但 deny 敏感路径（`~/.ssh`、keychain、浏览器 profile 等）。
- 网络：默认 allowlist（包管理源、git 托管域名）；其余拒绝。
- 违规不静默：把沙盒拒绝信息标注进命令输出（"此命令因沙盒限制失败：试图写 /etc/hosts"），让模型能区分"命令本身错了"和"被沙盒拦了"——这是 Claude Code `annotateStderrWithSandboxFailures` 的经验，防止模型在错误方向重试。

### 升级契约（逐条豁免，不是全局开关）

参数级升级，参考 Cursor 的 `required_permissions` 形态：

```ts
requiredPermissions?: Array<"full_network" | "no_sandbox">;
```

- 携带升级请求的调用**强制走 ask 审批**（无论 allowlist 是否命中），审批卡片明确展示"本次将绕过沙盒/放开网络"。
- 工具描述中写明升级的合法证据（"Operation not permitted"、非白名单域名连接失败），并要求"逐条命令评估，不因上一条豁免过就默认豁免"（Claude Code prompt 的原则）。
- 沙盒配置摘要注入工具描述（写清 allow/deny 边界），让模型能预判哪些命令需要升级，减少一次失败重试。

## 模型引导（工具描述要点）

工具 description 除现有内容外，补充以下经三家验证有效的行为约束：

1. 长命令引导：预估运行时长设置 `blockMs`；dev server / watcher 明确用 `background: true`；不要在命令尾加 `&`。
2. 禁止 sleep 轮询：后台任务完成会收到通知，不要 `sleep N && check` 或反复 `bash_output` 轮询；确需节流保持 sleep < 2s。
3. 大输出：不要用 `| head` / `| tail` 截断输出（全量已落盘可精确检索）；超限输出用 `read_file` offset/limit 或 `grep` 检索落盘文件。
4. 失败语义：exit code ≠ 0 附带精确原因分类；沙盒拦截会被显式标注，只有看到沙盒证据才申请豁免。
5. 沿用现状：读/搜/改文件用专用工具；引号包裹含空格路径；`cwd` 参数替代 `cd`。

## 前端预览契约要点

按 `agent-tool-preview-design-guidelines.md` 和"runtime tool preview 必须以最终态收尾"的学习结论：

- 后台任务的 preview 有**两段最终态**：转后台时 bash 工具调用本身以 "backgrounded" 收尾（该工具调用已结束）；任务卡片（新预览类型）随任务状态独立更新到 completed/failed/killed 终态。
- 运行中任务需要展示滚动尾部输出（复用现有 UI 预览流）、已运行时长、kill 按钮（用户手动终止 → 走 killed 通知）。

## 分阶段路线

| Phase | 范围 | 依赖 |
| --- | --- | --- |
| E1 输出管道收口 | 落盘检索引导写进回填文本与工具描述；错误语义三分类；后台落盘上限与截断标记 | 无（纯现有代码增强） |
| E2 后台运行 MVP | `background` 参数 + 任务注册表 + `bash_output`/`bash_kill` + 完成通知（steering 注入）+ 会话收割 + 前端任务卡片 | E1 |
| E3 blockMs 语义切换 | `timeoutMs` → `blockMs`，超时转后台替代杀进程；竞态处理；运行中任务清单注入 | E2 |
| E4 看门狗与订阅 | 交互式卡死看门狗；（可选）`notifyOnOutput` 正则订阅 | E3 |
| E5 真沙盒 | Seatbelt / bwrap 执行层 + 升级契约 + 违规标注（与 allowlist 设计 Phase 3 合并立项） | 独立安全调研 |

## 被排除的方案

- **持久 shell 会话**（跨调用保留环境变量/cwd 的常驻 shell）：三家中只有 OpenCode 的描述宣称 persistent 但实现仍是每次独立 spawn。常驻 shell 引入状态污染、清理复杂度和注入面，收益（少打几次 cd/export）不值得。保持"每次调用独立进程 + cwd 参数"。
- **PTY / 交互式命令支持**：不做。交互式需求用"kill + 管道输入重跑"引导解决（看门狗通知里给出该建议）。
- **超时杀进程作为默认语义**：被 blockMs 转后台替代；杀进程只保留给 `bash_kill`、会话收割和磁盘上限看门狗。
- **专用 `bash_list` 工具**：运行中任务用附件注入替代，避免鼓励模型轮询。
- **后台任务持久化跨重启恢复**：进程本身活不过应用退出，恢复注册表没有意义。
- **输出直接流式进模型上下文**（每个 chunk 一条消息）：上下文膨胀不可控，被"落盘 + 头部内联 + 增量拉取 + 完成通知"组合替代。

## 从本设计派生计划的规则

派生 exec-plan 必须写清：

- 消费本文哪个 Phase（E1–E5），以及是否触碰 `blockMs` 语义切换（E3 有行为兼容影响）。
- 新增 shared 契约：任务状态事件、前端任务卡片的 IPC 字段、preview kind。
- 通知注入与 `engine/loop.ts` steering messages 的对接方式与去重保证。
- 会话收割的验证方式（如何证明没有孤儿进程）。
