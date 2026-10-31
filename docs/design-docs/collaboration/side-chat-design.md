# 侧边对话（Side Chat）设计

> 状态：2026-10-21 用户确认概念与交互 Demo（`docs/design-docs/frontend/side-chat-demo.html`），进入实施。
> 执行计划：`docs/exec-plans/completed/20261021-side-chat.md`

## 为什么做

用户探索项目时习惯开多个窗口：一个主会话做组织，旁边再开几个对话追问细节。右侧栏里直接开「侧边对话」更方便——它知道主会话已经聊过什么，但之后各聊各的，不打断主会话。

## 是什么

从当前主会话分出一个新会话，显示在右侧面板的 tab 里，可以同时开多个。

| 规则 | 结论 |
|---|---|
| 继承什么 | 主会话 Journal 的前缀整段复制（现有 fork 机制）。截到**上一轮结束**：主会话正在跑时，进行中的那一轮不带入 |
| 之后的关系 | 互不影响。不回流，不做 `send_message`，主会话的新内容也不同步过来 |
| 保存 | 长期保存，就是一个普通会话；关 tab 只是收起，可以在 `+` 菜单里重新打开 |
| 默认权限 | 只读：侧边对话以 **Plan 模式**开始（只有读文件、搜索、网页、explore、todo 这些工具），点掉 Plan 标签即回到 Agent 模式 |
| 模型 | 默认取主会话当前选中的模型，侧边对话里可以单独切换 |
| 显示 | 面板从空白开始，不重放主会话消息；消息流开头一条居中细分隔线「继承主会话 N 轮」（运行中分叉时加「，不含进行中的第 N+1 轮」），随消息滚走，没有按钮 |
| 入口 | 右栏启动列表 / `+` 菜单的「侧边对话」；主输入框 `/side [问题]` |
| 左侧会话栏 | 不单独列出侧边对话，只在主会话行显示数量 |
| 第一版不做 | 从某条历史消息分出、侧边对话里再分出、回流主会话、远端 Host |

## 参考

- Codex `/side`（`codex-rs/tui/src/app/side.rs`）：临时 fork（ephemeral），注入边界提示「之前的内容只作参考，不要继续主线程的任务」，同时只能开一个。我们取它的继承方式和边界提示，但改为长期保存、可多开。
- Codex `thread/fork`：快照复制 rollout，子线程记 `forked_from_id`；运行中分叉在当前轮之前截断。与我们 `SessionStore.fork` 的语义一致。
- Cursor 3.11 side chats：长期保存，默认只读。

## 模块边界

```text
renderer  右栏 sideChat tab ─ SideChatView（TurnView + Composer） ─ /side
   │ IPC sessions.openSideChat / sessions.listSideChats
main      RuntimeV2Registry.openSideChat ─ usage 目录 side_chat_parent_id
   │
agent-service  AgentApplication.openSideChat：算分叉点 → SessionStore.fork(origin "side-chat") → 设 Plan 模式
   │                    ↑ resolveSideChatBoundary（纯函数）
@actspace/side-chat  插件：边界算法、边界提示词；在 session/created 时给侧边会话注册提示词扩展
   │
session-journal  lineage.origin 增加 "side-chat"
```

- **侧边会话的标记放在 header 的 `lineage.origin`**。lineage 本来就是「这个会话怎么来的」，并且会一路透传到会话列表，侧栏过滤、按父会话查找都不用再读事件。代价是旧版本读到 `"side-chat"` 会判定 header 无效（见风险）。
- **插件 `@actspace/side-chat` 负责侧边对话自己的规则**：
  - `resolveSideChatBoundary(events)`：找到最后一个已平衡的 `turn/end`，返回分叉序号、继承轮数、是否排除了进行中的轮次。
  - 边界提示词：监听 `session/created`（新建和恢复都会触发），会话 `lineage.origin === "side-chat"` 时经 `actspace.host.prompt` 的 `extensions.registerMainSession` 注入 system section；`session/disposed` 时移除。提示词不写进 Journal，不会显示成用户消息。
- **分叉流程放在 `AgentApplication`**，与现有 `forkMainSession` 并列，复用同一套 store / controller / runs；边界算法从插件包按库函数导入。
- **「只读」复用 Plan 模式**，不新增权限级别。Plan 的工具白名单已经是只读集合（`packages/core/agent/src/agent-mode-policy.ts`），Composer 也已经有 Plan 标签和退出按钮。父会话是 Chat 形态（没有工作区）时保持 Chat。
- **模型不进 Journal**：现有模型选择本来就是每次提交时随请求发送。侧边对话在 renderer 里保存自己的选择，打开时用主会话当前的模型初始化。

## 被排除的方案

- **插件事件标记侧边会话**（child Journal 里写 `plugin/actspace.side-chat/opened`）：列表和侧栏过滤要读每个会话的事件，或者在 usage 目录里额外解析事件，成本更高。
- **新增「只读」权限级别**：要改工具权限引擎和 Composer 的权限控件，且与 Plan 模式重复。
- **往子会话 Journal 里追加一条隐藏的用户消息作为边界提示**（Codex 的做法）：会出现在转录里，需要额外的隐藏规则。
- **把整个 `ConversationView` 挂两份**：它绑定了当前会话的分页、导航、批注、轨迹等，改为用 `TurnView` + `Composer` 拼一个精简的 `SideChatView`。

## 风险

- 旧版本（以及仍在别的分支上运行的开发版）读到 `origin: "side-chat"` 的 header 会报无效 header。这类会话只在旧版本里不可读，不影响其他会话。
- 主会话正在写入时读取 Journal，尾部可能是半行；分叉只用到更早的已平衡位置，读到 `repair-required` 时报错，让用户稍后重试。
