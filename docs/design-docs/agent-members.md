# Agent Members 持久成员设计

## 当前状态

本文档定义 actspace 中跨 Room 长期存在的 Agent Member：身份、运行配置、能力、活动记录、设置页管理界面，以及它与 Room 私有上下文之间的边界。

状态：设计已确认，尚未实现。

相关文档：

- `agent-form-room.md`：Room 如何选择 Member、触发运行、读取 Room Log 和提交消息。
- `front-设置页规范.md`：设置页整体导航与 Members 分区的信息架构。
- `agent-testing.md`：Member 与 Room 的后端测试入口。

参考：

- [Raft Agent Basics](https://docs.raft.build/features/agents/)
- [Raft Agent Lifecycle](https://docs.raft.build/features/agents/lifecycle/)
- [Raft Members](https://docs.raft.build/features/server/members/)
- [Raft Build your agent team](https://docs.raft.build/build-your-agent-team/)

## 核心模型

### Member 不是 Room 内的临时角色

Agent Member 是持久身份，不等于一次 LLM 调用、一次 AgentRun 或一个 Room 内的临时配置。用户创建 Member 后，它可以长期存在、加入多个 Room，并在应用重启后保留名称、描述、persona、模型和能力配置。

```text
AgentMember
├── 持久身份与配置
├── 跨 Room 活动记录
├── Member Workspace（V0 仅 UI 占位）
│
├── Room A 私有运行历史
├── Room B 私有运行历史
└── Room C 私有运行历史
```

“持久存在”不等于持续调用 LLM：

- 身份常驻：Member 记录长期存在。
- 运行时可空闲：没有任务时状态为 `idle`，不产生模型调用。
- 事件触发：用户广播、结构化 @或后续提醒触发 AgentRun。
- 配置与运行分离：停止或失败不删除 Member 身份。

V0 只管理 Agent Member，不实现 Human Member、Owner/Admin 角色、邀请、私聊或多人协作权限。

### 类型定义

```typescript
type AgentMemberStatus = "idle" | "working" | "error" | "offline";

interface AgentMemberCapabilities {
  webResearch: boolean;
  projectRead: boolean;
  skillIds: string[];
}

interface AgentMember {
  id: string;
  /** 每次影响行为的配置修改后递增 */
  configVersion: number;

  displayName: string;
  icon?: string;
  description: string;
  persona: string;

  modelId: ModelId;
  reasoning: "auto" | "on" | "off";
  capabilities: AgentMemberCapabilities;

  status: AgentMemberStatus;
  createdAt: string;
  updatedAt: string;
}

interface RoomMembership {
  roomId: string;
  memberId: string;
  joinedAt: string;
}
```

Member 的可见名称可以修改，但 Room 消息、结构化 Mention、Activity 和私有 transcript 永远使用稳定 `memberId` 关联。

### 配置版本

Room 不复制 Member 的 persona、模型、推理等级和 Skills。Member 配置更新后，所有 Room 中该 Member 的下一次运行使用新版本；历史消息保持原样。

每次运行必须记录实际使用的版本：

```typescript
interface MemberAgentRunIdentity {
  memberId: string;
  memberConfigVersion: number;
  roomId: string;
  cycleId: string;
  agentRunId: string;
}
```

这样可以回答“这条回复使用了哪一版 persona / 模型 / 能力配置”，而不需要把完整 Member 配置冻结进每个 Room。

## 与 Room 上下文的边界

同一个 Member 可以加入多个 Room，但不同 Room 的原始消息与私有运行 transcript 不自动混合。

V0 规则：

- 共享：Member 身份、Profile、运行配置和能力配置。
- 隔离：每个 Room 的 Room Log、工具调用、Draft、Held 复审和私有 Agent 历史。
- 不实现：跨 Room 自动注入原始聊天历史、自动长期记忆整理或 Workspace Memory 注入。

因此“同一个 Member”表示身份和行为配置一致，不表示 Room A 的全部上下文会自动出现在 Room B。

Member Workspace 后续可以承载主动沉淀的长期资料，但 V0 只有只读 UI 外壳，不参与 Agent 上下文。

## 设置页 Members 分区

### 导航层级

设置页左侧新增 `成员 Members` 分区。进入后先显示成员列表；选择成员后，右侧内容区切换为成员详情，成员列表不继续常驻成第三列。

```text
设置导航 → 成员列表 → 成员详情
                         ├── Profile
                         ├── Activity
                         ├── Reminders
                         └── Workspace
```

成员详情提供明确的“返回成员列表”，返回时恢复列表滚动位置。Tab 切换保留当前 Member，不回到列表。

### 成员列表

列表顶部只有一个主操作“创建 Agent”。每项至少展示：

- 图标、名称、描述
- 状态文字与辅助图标
- 模型
- 已加入 Room 数量

状态不能只依赖颜色；`idle / working / error / offline` 同时使用文字、图标或形状和主题感知语义 token。

空状态提供“创建第一个 Agent”，不展示 Raft 中的 Humans、角色权限或 Computers 概念。

### 成员详情顶部

四个 Tab 共用固定身份区：

```text
[图标] 搜索者
       外部资料搜索与事实核对
       空闲

[Profile] [Activity] [Reminders] [Workspace]
```

Tab 使用 Lucide 等统一 SVG 图标，不使用 emoji 充当结构性图标；支持键盘切换、`aria-selected`、明确焦点态，并使用语义颜色 token 覆盖浅色、深色和跟随系统主题。

## Profile

Profile 是 Member 的实际配置界面，按以下分组展示。

### 基本资料

- 名称
- 图标
- 描述
- Persona

### 运行配置

- 模型
- 推理等级：自动 / 开 / 关

### 能力

- Web Research
- 项目只读（Project Read）
- Skills

“项目只读”表示能否读取用户项目，不等于 Member 自己的 Workspace。Member Workspace 是成员详情的一部分，不作为能力开关。

### 使用情况

- 当前加入的 Room 列表
- 每项可跳转到对应 Room

影响行为的字段修改成功后递增 `configVersion`，只对未来 AgentRun 生效；正在运行的 AgentRun 继续使用启动时捕获的版本。

## Activity

Activity 是该 Member 跨所有 Room 的结构化活动日志，不是 Chain of Thought，也不是原始 stdout 全量转储。

```typescript
type MemberActivityType =
  | "activated"
  | "llm-request"
  | "tool-started"
  | "tool-finished"
  | "message-committed"
  | "silenced"
  | "error"
  | "idle";

interface MemberActivityEvent {
  seq: number;
  memberId: string;
  type: MemberActivityType;

  roomId?: string;
  cycleId?: string;
  agentRunId?: string;

  summary: string;
  createdAt: string;
}
```

默认按时间倒序或时间轴展示：时间、事件类型、简短摘要。与 Room 相关的事件可以跳转到对应 Room。

Activity 必须遵守：

- 不保存或展示模型隐藏推理、原始 Chain of Thought 和完整 Prompt。
- 工具参数与输出只保留裁剪后的结构化摘要。
- API Key、访问令牌、环境变量值、用户秘密和未脱敏路径不得进入摘要。
- 错误展示原因分类和恢复方向，不只显示错误代码。
- 日志数量超过性能阈值后使用分页或虚拟化；后续可增加 Room、类型和日期筛选。

Activity 是面向用户的可观测投影；Room 私有 transcript 仍是该次运行恢复与调试的详细事实，不用 Activity 替代。

## Reminders

V0 保留 Tab 和产品位置，但不实现提醒创建、调度或 Agent 自主唤醒。

页面只展示明确空状态：

```text
提醒事项

Member 未来可以根据时间或周期自主唤醒。
该功能将在后续版本提供。
```

不展示无法工作的创建按钮或伪造提醒数据。后续设计提醒时另立专题，不在本轮预埋不稳定 Schema。

## Workspace

### V0 范围

Workspace Tab 首版只展示只读 UI 外壳，不实现真实文件能力：

```text
┌ 文件树 ─────────┬ 文件预览 ──────────────────────┐
│                 │                                │
│ 暂无文件        │ 该成员还没有工作区内容          │
│                 │ 工作区能力将在后续开放          │
└─────────────────┴────────────────────────────────┘
```

V0 不提供：

- 新建、编辑、保存或删除文件
- Agent 写入 Workspace
- 默认生成 `MEMORY.md`
- Workspace 内容自动进入 Agent 上下文
- Workspace 与长期记忆的整理机制

Room V0 继续保持完全只读，不向 Member 暴露 `write_file`、`edit_file`、通用 Bash 或其他写入能力。

### 后续写入方向

未来开放 Member Workspace 写入时，不新增 `write_member_file` / `edit_member_file`。复用现有 `write_file` 和 `edit_file`，由创建工具时的运行时作用域绑定约束：

```typescript
createWriteFileTool({
  allowedWriteRoots: [memberWorkspaceRoot],
});

createEditFileTool({
  allowedWriteRoots: [memberWorkspaceRoot],
});
```

后端必须对解析后的真实路径做根目录包含检查，拒绝绝对路径、`..` 和符号链接逃逸。用户项目目录不能因为 Member Workspace 开放写入而进入 `allowedWriteRoots`。

这只是未来方向；V0 不创建 Workspace 写入工具实例，也不创建真实 Workspace 文件结构。

## 持久化边界

Member 全局事实与 Room 私有历史分开：

```text
<userData>/members/
├── index.json
└── <memberId>/
    ├── profile.json
    └── activity.jsonl

sessions/<sessionId>/room/
├── config.json
├── state.json
└── members/
    └── <memberId>.jsonl
```

- `members/index.json`：Member 列表和稳定 ID 索引。
- `members/<memberId>/profile.json`：Profile、能力、运行配置和 `configVersion`。
- `members/<memberId>/activity.jsonl`：跨 Room 的脱敏活动投影。
- `room/members/<memberId>.jsonl`：该 Member 在当前 Room 的私有运行历史，不与其他 Room 自动合并。

Workspace V0 不落真实目录；后续实现时再增加 `<userData>/members/<memberId>/workspace/`，避免现在制造没有消费方的空文件结构。

## 测试与验收

### 后端

- Member 创建后获得稳定 ID 和 `configVersion: 1`。
- 行为配置修改递增版本；显示失败时不得部分写入。
- 已启动 AgentRun 固定使用启动时版本，后续修改只影响新运行。
- Room 只保存 `memberId`，不能内嵌并漂移出另一份 persona/model/tools 配置。
- Activity 事件正确关联 Room/Cycle/AgentRun，并完成秘密脱敏。
- 不同 Room 的私有 transcript 相互隔离。
- V0 Member 工具集合中不存在任何写入能力。

### 前端

- 设置页 Members 分区支持列表 → 详情 → 返回列表，并恢复列表状态。
- Profile、Activity、Reminders、Workspace 四个 Tab 可键盘访问。
- Activity 不展示隐藏推理、秘密或未经裁剪的工具输出。
- Reminders 与 Workspace 清楚标记为后续能力，不出现伪功能按钮。
- Workspace 空状态仍保持文件树/预览的未来布局占位。
- 浅色、深色、跟随系统、焦点态和 reduced motion 均满足前端规范。

## 非目标

- 不实现 Human Member、邀请、Member/Admin/Owner 权限。
- 不实现 Agent 私聊、Apps 或由 Agent 创建其他 Agent。
- 不实现 Reminders 调度。
- 不实现 Member Workspace 文件读写或长期 Memory。
- 不把多个 Room 的原始对话自动合并进 Member 上下文。
- 不让 Room Agent 修改用户项目或 Member Workspace。

## 决策记录

- 2026-07-11：Agent 是跨 Room 持久 Member，不是 Room 创建时复制的临时角色；Room 只通过稳定 Member ID 引用参与者。
- 2026-07-11：Member 配置修改影响未来运行；每次 AgentRun 保存 `memberConfigVersion`，历史消息不回写。
- 2026-07-11：设置页新增 Members 分区，先展示成员列表，再进入带 Profile / Activity / Reminders / Workspace 的成员详情。
- 2026-07-11：Activity 是跨 Room 的结构化脱敏日志，不展示 Chain of Thought、完整 Prompt 或秘密。
- 2026-07-11：Reminders 与 Workspace V0 只展示 UI 占位；Room 保持完全只读，不新增 Member 专用写工具。
- 2026-07-11：未来 Workspace 写入复用现有 `write_file` / `edit_file`，通过运行时 `allowedWriteRoots` 绑定 Member 根目录。
