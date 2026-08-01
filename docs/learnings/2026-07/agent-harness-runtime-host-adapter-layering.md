# Agent Harness、Application Runtime 与 Host Adapter 为什么必须分层

关联 history：`docs/histories/2026-07/20260731-2310-host-neutral-runtime-and-cli.md`

## 是什么

一个可在 Desktop、CLI、Web 或 Voice 中运行的 Agent，至少包含三种不同变化速度的东西：

```text
Host Adapter
  输入、呈现、进程或应用生命周期、宿主能力
        |
Application Runtime
  Session、Turn、Event、Approval、Persistence、Abort
        |
Agent Harness
  LLM、Context、Tools、Agent Loop、Compression
```

Harness 回答“Agent 怎样思考和行动”；Runtime 回答“一个产品 Turn 怎样可靠地开始、提交、失败和结束”；Adapter 回答“这个宿主怎样输入、展示和提供能力”。

## 为什么不能只抽一个 Agent Core

很多代码库已经把 LLM 和工具放进 `agent-core`，但 Desktop Main 仍然负责：

- 恢复 Session；
- 先写用户输入还是先调用模型；
- 等待审批；
- 什么时候发送 `turn_finished`；
- Abort 和进程退出时清理什么。

这意味着真正的产品语义仍然只存在于 Desktop。CLI 如果直接 `new Agent().run()`，虽然共享了模型循环，却没有共享产品 Runtime，会逐渐形成第二套审批、持久化和失败语义。

正确的复用单位不是“能调用同一个 Agent 类”，而是“能执行同一个 Turn 状态机”。

## Runtime 的关键不变量

### 1. 成功事件必须晚于提交

错误顺序：

```text
Harness completed -> emit turn_finished -> persistence failed
```

用户已经看到成功，但历史无法恢复。正确顺序是：

```text
Harness completed -> persist result -> emit turn_finished
```

因此 terminal event 应由 Runtime 拥有，而不是由只负责事件翻译的 Bridge 或 UI 拥有。

### 2. Abort 不只是 Agent.abort()

Abort 可能发生在模型循环之前：读取 Context、解析模型、创建工具或等待审批时。只保存 Harness 的 abort closure 会留下一个初始化窗口。

Runtime 需要先登记活动 Turn，再记录 `abortRequested`；Harness 句柄出现后立即补发 abort。如果初始化完成时已经收到请求，应直接返回 aborted，不进入模型调用。

### 3. 观测失败不能重跑副作用

Event Sink、trace writer 或 context snapshot 是 sidecar。它们失败时可以记录诊断，但不能通过通用 retry 重新执行 Harness，否则文件修改和命令会执行两次。

业务执行 retry 与观测写入 retry 必须分开。

## Host Adapter 应该拥有的东西

Adapter 可以依赖宿主 API：

- Electron IPC、`BrowserWindow`、`safeStorage`；
- CLI argv、stdin/stdout、TTY readline、SIGINT；
- Web 的 HTTP / WebSocket、认证和多租户边界；
- Voice 的 STT / TTS 和打断策略。

这些对象不应进入 Runtime。Adapter 只把它们转换成稳定 Port：Context Provider、Model Resolver、Event Sink、Approval Broker 和 Capability Provider。

### 事件粒度不等于呈现粒度

Runtime Event 应保留生产者需要的细粒度。例如模型流可能把一句 thinking 拆成几十个 `assistant_thinking_delta`，JSONL 调用方也可能需要逐事件观察。但终端如果给每个 delta 都加前缀和换行，就会把 tokenizer 或网络 chunk 边界误当成用户可读结构。

Host Adapter 应在不修改底层事件协议的前提下做 semantic framing：连续 thinking delta 先按原顺序拼接，在工具、正式回复或 Turn 终态到来时刷新为一个块。这样 Desktop 仍可逐帧更新，JSONL 仍保留机器事件，而行式 CLI 得到稳定段落。

判断职责归属的办法是：如果变化只影响“同一事件流在某个端看起来怎样”，它属于 Adapter；如果变化影响事件的含义、顺序或可恢复状态，才属于 Runtime。

## 两个容易忽略的 CLI 陷阱

### 空 stdin pipe 会让显式输入挂起

自动化调用方可能传 `--input`，同时保留一个永不关闭的空 stdin pipe。为了检查“是否也传了 stdin”而读取 EOF，会让进程永久等待。

可组合的规则应是：显式 `--input` / `--input-file` 优先；只有两者都缺失时才读取非 TTY stdin。

### 单文件 JavaScript 不等于没有原生资产

SEA 可以打包 JavaScript 和 Node runtime，但 `ripgrep` 仍是平台原生二进制。它必须按目标平台嵌入、校验哈希，并原子释放到外部数据目录。不能从 executable 的 `__dirname` 猜仓库根或配置根。

## 核心要点

- 共享 Harness 不等于共享产品行为；Turn Runtime 才是跨端一致性的核心。
- terminal event、持久化和 Abort 必须由同一个状态机拥有。
- Host 差异通过 Port 表达，不能在 Runtime 里堆 `if electron` / `if cli`。
- 评估 trace、日志和 snapshot 是 sidecar，不是 LLM Context，也不能触发 Harness 重跑。
- 单文件制品仍需要明确的平台矩阵、原生资产和外部系统能力边界。

## 自检问题

1. 新增一个 Web Host 时，是否只需实现 Adapter，而不复制 Session 和 Agent Loop？
2. 如果 Session 写盘失败，用户是否仍可能收到成功事件？
3. Abort 在模型调用前到达时，Runtime 是否能保证不发出模型请求？
