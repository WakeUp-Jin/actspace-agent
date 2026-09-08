对，这里要把“UI 怎么让主会话看懂 team 在执行”和“team 底层到底怎么协作”分开。先说结论：Claude 参考实现的核心不是一个大文档，而是 **team config + task files + inbox files + 文件锁** 这四件东西。

**主会话 UI**
前端不用急着显示每个成员的完整执行流，但主会话里应该有一个 `Agent Team Run` 执行块，像一个大工具调用，而不是散落成一堆普通消息。

我建议主会话只显示这些层级：

1. `Team proposed`
   Lead 判断任务适合 team，展示拟议成员、职责、预计并发成本，等用户确认。

2. `Team created`
   展示 team 名称、成员角色、模型、权限策略。

3. `Task plan`
   Lead 创建共享任务列表，主会话显示任务树：
   `#1 research API`、`#2 implement module`、`#3 verify tests`，以及依赖关系。

4. `Team running`
   不展开每个 teammate transcript，只聚合：
   - 当前谁在跑哪个 task
   - 哪些 task completed / blocked
   - 有哪些重要 teammate message
   - 是否有 plan approval / permission / conflict 需要处理

5. `Synthesis`
   Lead 汇总 teammate 结果，生成最后回答或执行下一步。

6. `Cleanup`
   显示 teammates 是否已 shutdown，team 资源是否清理完成。

也就是说，主会话 UI 不是“多人终端”，而是一个 **team execution dashboard embedded in chat**。每个成员的完整执行流以后可以做右侧详情页，但不是 V0 必需。

**Team 怎么创建**
参考实现里由 `TeamCreateTool` 创建，核心在 [TeamCreateTool.ts](/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/tools/TeamCreateTool/TeamCreateTool.ts)。

流程大概是：

1. Lead 调用 `TeamCreate`
2. 生成唯一 `team_name`
3. 生成 lead id：`team-lead@{teamName}`
4. 写 team config 文件
5. 重置/创建同名 task list 目录
6. 把当前主会话设置成这个 team 的 lead
7. 后续 spawn teammate 时，把成员追加进 team config

Claude 原路径是：

```txt
~/.claude/teams/{team-name}/config.json
~/.claude/tasks/{team-name}/
```

actspace 可以对应成：

```txt
<userData>/teams/{teamId}/team.json
<userData>/teams/{teamId}/tasks/
<userData>/teams/{teamId}/inboxes/
```

**Team 文档结构**
Team config 大概长这样：

```json
{
  "name": "auth-refactor",
  "description": "Refactor authentication module",
  "createdAt": 1710000000000,
  "leadAgentId": "team-lead@auth-refactor",
  "leadSessionId": "main-session-id",
  "members": [
    {
      "agentId": "researcher@auth-refactor",
      "name": "researcher",
      "agentType": "reviewer",
      "model": "sonnet",
      "prompt": "Investigate auth risks",
      "color": "blue",
      "planModeRequired": true,
      "joinedAt": 1710000000000,
      "cwd": "/repo",
      "sessionId": "teammate-session-id",
      "subscriptions": [],
      "backendType": "in-process",
      "isActive": true,
      "mode": "default"
    }
  ]
}
```

关键点：成员之间不是靠“知道彼此上下文”协作，而是靠这个 config 发现队友名字，然后用名字发消息。

**Task 文档结构**
不是一个 task markdown，而是每个 task 一个 JSON 文件。参考在 [utils/tasks.ts](/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/utils/tasks.ts)。

```txt
~/.claude/tasks/{team-name}/
  .lock
  .highwatermark
  1.json
  2.json
  3.json
```

单个 task：

```json
{
  "id": "1",
  "subject": "Review auth token handling",
  "description": "Check JWT/session/cookie risks",
  "activeForm": "Reviewing auth token handling",
  "owner": "researcher",
  "status": "in_progress",
  "blocks": ["3"],
  "blockedBy": [],
  "metadata": {}
}
```

状态只有三类：

```txt
pending -> in_progress -> completed
```

依赖不是通过修改状态解锁，而是通过 `blockedBy` 动态计算：如果 `blockedBy` 里的 task 都 completed，那么这个 task 就可 claim。

**子智能体之间怎么交流**
这里要区分：Claude docs 里普通 `subagent` 只能回报主 Agent；Agent Team 的成员更像 `teammate`，每个都有独立上下文，能互相发消息。

通信靠 mailbox。参考在 [teammateMailbox.ts](/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/utils/teammateMailbox.ts)。

路径：

```txt
~/.claude/teams/{team-name}/inboxes/{agent-name}.json
```

消息数组：

```json
[
  {
    "from": "researcher",
    "text": "I found the likely issue in auth/session.ts",
    "timestamp": "2026-06-04T10:00:00.000Z",
    "read": false,
    "color": "blue",
    "summary": "Possible auth bug found"
  }
]
```

发送消息就是 `SendMessageTool` 写入对方 inbox。`to: "*"` 广播时，本质是遍历 team members，给每个人 inbox 写一份。参考 [SendMessageTool.ts](/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/tools/SendMessageTool/SendMessageTool.ts)。

接收方会轮询自己的 inbox：
- shutdown request 优先级最高
- lead 消息优先于 peer 消息
- 其他 peer 消息按 FIFO
- 读到后标记 `read: true`
- 如果当前正忙，先排队，等 turn 结束再注入

**状态如何锁定**
这是最关键的。

Task 创建用 **task-list 级锁**：

```txt
tasks/{team}/.lock
```

创建 task 时会锁住 `.lock`，读取当前最高 id 和 `.highwatermark`，然后写入下一个 `{id}.json`。这样多个 teammate 同时创建 task 时，不会生成两个 `1.json`。

Task 更新用 **task 文件级锁**：

```txt
tasks/{team}/1.json
```

更新 task 时会锁住对应 task 文件，重新读取当前 task，再写入更新。这样状态写入不会互相覆盖成半截 JSON。

Task claim 更严格。claim 时会：

1. 读取 task 是否存在
2. 加锁
3. 重新读取 task
4. 如果已有别的 owner，返回 `already_claimed`
5. 如果 completed，返回 `already_resolved`
6. 如果 `blockedBy` 里还有未完成 task，返回 `blocked`
7. 最后写入 `owner`

如果需要防止同一个 agent 同时抢多个任务，会用 **list-level lock** 把“检查自己是否 busy”和“claim 新任务”包成一个原子操作。

这里我会给 actspace 一个改进建议：不要让 teammate 直接用普通 `TaskUpdate(owner=...)` 来抢任务，因为参考实现里 `TaskUpdate` 是普通更新，语义上不如 `claimTask()` 严格。我们应该单独设计一个 `team_task_claim` 工具，内部做 CAS 式 claim：

```txt
claim only if:
  status === pending
  owner is empty
  unresolved blockedBy is empty
  claimant is not already busy
then:
  owner = claimant
  status = in_progress
```

这样比“让 LLM 自己 TaskUpdate owner”稳很多。

**对 actspace 的核心抽象**
我建议核心抽成四个工具/模块：

```txt
TeamController
  createTeam()
  spawnTeammate()
  stopTeammate()
  cleanupTeam()

TeamTaskStore
  createTask()
  claimTask()
  updateTask()
  completeTask()
  listTasks()

TeamMailbox
  sendMessage()
  readUnread()
  markRead()

TeamRunEvents
  team_created
  member_spawned
  task_created
  task_claimed
  task_completed
  message_received
  approval_requested
  team_synthesized
  team_cleanup
```

主会话 UI 只消费 `TeamRunEvents`，不要直接读底层 JSON 文件。底层文件是持久化和跨 agent 协作协议；UI 看到的是整理后的 team execution block。这样以后要不要显示每个成员 transcript，都不会影响核心运行模型。