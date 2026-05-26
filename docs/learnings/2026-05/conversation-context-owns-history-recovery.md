# 会话历史的所有权回到 ConversationContext

关联 history：`docs/histories/2026-05/20260526-1740-conversation-context-session-replay.md`

## 是什么

让上下文模块统一保持一种工作姿势：**构造时吃数据，运行期只读内存**。

`SystemPromptContext` 构造时吃 `corePrompt` 字符串，运行期 `format()` 只是从内存 `segments` 拼字符串——天然同步。`ConversationContext` 现在也按这个姿势工作：构造阶段就把 `session.jsonl` 读回来转成 `Message[]` 填进自己，运行期 `format()` / `getMessages()` 仍然纯内存。

`ContextManager.getContext()` 因此始终是同步的，调用链零牵连。

## 为什么需要

一个本可以提前避免的陷阱：**持久化产物（session.jsonl on disk）和内存上下文（ConversationContext.messages）是两套对象**。把会话事件落盘很容易让人产生"已经保存了"的错觉，但这只是写入侧；读取侧——把磁盘上的事件灌回当下的 ContextManager——是另一条必须显式存在的链路。

之前的实现里恢复链路三件套都已经写好：

- `parseJsonl(sessionPath)`
- `sessionEventsToMessages(events)`
- `ConversationContext.appendMessage(msg)`

但没有人把它们串到 `ContextManager` 的生命周期里。**写**有，**读**没有，于是每轮 LLM 永远只看见当前一条 user 输入。

## 错位的"分层"——别把恢复职责丢给调用方

最直觉的修复是在 main 进程里 await `recoverMessages(sessionPath)` 然后逐条 `appendMessage` 到新建的 ContextManager。能跑通，但分层是错的：

- main 是 IPC + 持久化层，它本不该认识 "SessionEvent → Message" 这个 agent-core 内部转换。
- ContextManager / ConversationContext 才是数据的拥有者。把恢复职责放到 main，相当于让调用方钻进 agent-core 的内脏去读细节。

**数据所有权放回拥有数据的模块**：ConversationContext 自己知道它的 messages 该怎么从 session 文件里建出来。main 只需要传一个 sessionPath 进去。

## 同步 vs 异步：在构造时做异步，运行期就能纯同步

很自然会想：那让 `ContextManager.getContext()` 异步化、第一次调用时再加载？

代价比看上去大：

- `getContext()` 被 `Agent.run` / `getUsageSnapshot` / `needsCompression` 多处同步调用，全要改 await。
- 上下文模块如果运行期可能"半未加载"，意味着每个调用方都得思考"现在到底有没有加载过"。

替代：**把异步留在构造阶段，运行期回归同步**：

```ts
const cm = await ContextManager.createForSession({
  systemPromptModule,
  sessionPath,
});
// 之后所有 getContext() / appendMessage / getUsageSnapshot 都是同步
```

这是 OOP 里最朴素的"用工厂消化异步初始化"模式——只要某类对象的初始化天然是异步的（IO、远程查询），就给它一个 async static 工厂，构造完成的实例对外接口仍然同步。`SystemPromptContext` 因为吃的是常量所以连工厂都不需要；`ConversationContext` 多了一步异步 IO 就给它一个 `createFromSession`。

## V0 → V1 的口子

`actspace-backend-context-pipeline.md` 写过 "V0 ConversationContext 极简、V1 升级为 ShortTermMemoryContext（带持久化和 turn 标记）"。把"持久化恢复"放到 V0 的 ConversationContext 上看似越权，但它是一个**构造入口签名不破坏**的提前移动：

- V0 现在的 `createFromSession(sessionPath)` 等于 V1 ShortTermMemoryContext 的同名能力。
- V1 真要做时，rename 类名 + 内部加 turn 标记 / 多日切片 / 压缩接入，外部调用方一行不用改。

## 三条 takeaway

1. **写入侧 OK 不代表读取侧 OK**——任何"已持久化"的数据，都要显式问"谁负责在新进程/新对象里把它读回来"。
2. **职责回到拥有数据的模块**——别让调用方钻进你的内脏。给一个语义化入口（`createFromSession`），细节封进去。
3. **异步初始化用工厂消化**——只要构造阶段一次性 await 完成，运行期就能保持同步契约，调用链零牵连。

## 自检

- 项目里还有哪些"已落盘但没人读回来"的数据？
- 你最近写的类是不是把内部状态的"来源"暴露给了调用方？能不能也封到一个 `createFor...` 工厂里？
- 一个长生命周期的对象，它在运行期所有 API 是否都应该保持同步可调用？哪些 IO 应该被压进构造阶段？
