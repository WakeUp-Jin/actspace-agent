# Kairos 通知中心设计

状态：已实现（2026-07-04）。实施计划见 `docs/exec-plans/completed/20260704-kairos-notifications.md`。

## 1. 问题与定位

Kairos 的重要产出（任务成果、规则触发的分析结论）以「最终回复」形式淹没在运行轨迹里：
轨迹列表按 tick 滚动，用户几小时后回来只看到最新一条"安静观察中"，中间的关键汇报早已翻页。

通知 = **强调版的最终回复**：由 Kairos 自主判断"这条值得用户看到"，进入带未读状态的通知中心，
用户点击已读后消失。普通观察仍走笔记 + 轨迹，不进通知。

## 2. 通知产生：`notify_user` 工具（Kairos 专属）

被排除的方案：

- **解析最终回复中的标记**（如 `[通知]` 前缀）：格式脆弱、无结构化字段。
- **代码启发式**（非"安静"回复都算通知）：噪音大，通知失去强调意义。

采用与 `sleep` 同构的 Kairos 专属工具（`kairos/tools/notify.ts`，`registerKairosTools` 注册，
`extractPaths: () => []` 不涉路径，guard 走 toolsDenied）：

```
notify_user(title, body?, level?)
  title  必填，一句话结论（通知列表主行）
  body   可选，markdown 详情（展开显示）
  level  "info" | "important"，默认 "info"；important 额外弹 macOS 系统通知
```

工具描述做双向强调：**「这是唯一保证用户看到的渠道，重要发现（任务成果 / 规则触发的分析结论 /
异常）必须调用；日常安静观察不要调用，写笔记即可」**。

防刷兜底（代码层，不依赖提示词）：每 tick 最多 3 条，超出返回失败并提示合并成一条。
计数器由 controller 在每 tick 开始时清零（与 `toolCallCountInCurrentTick` 同点位）。

工具调用本身作为 `tool_call` 事件自然落轨迹与 short-term（发送 = 落盘 = 重放不受影响），
**不新增 `SessionEventType`**——通知的实时推送走独立 IPC 通道，不进事件重放管道。

## 3. 存储：NotificationStore

- 位置：`<kairosRoot>/memory/notifications.json`（已读状态会被修改，属可变用户数据，
  不混入 append-only 的 short-term）。
- 结构：`{ entries: KairosNotification[] }`，字段 `id / timestamp / title / body / level / read`。
- 滚动上限 200 条（超出丢最旧的已读；全部未读时丢最旧）。
- 每次变更原子写盘（tmp + rename）；通知频率低，无需攒批。
- 实现：`kairos/storage/notification-store.ts`，与 budget-store 同风格。

## 4. 契约与 IPC

`@actspace/shared`（`kairos-contracts.ts`）：

```ts
type KairosNotificationLevel = "info" | "important";
interface KairosNotification { id; timestamp; title; body: string | null; level; read: boolean }
type KairosNotificationsListResponse = { notifications: KairosNotification[]; unreadCount: number };
type KairosNotificationsMarkReadRequest = { id?: string };   // 省略 id = 全部已读
type KairosNotificationsRemoveRequest = { id: string } | { scope: "read" | "all" };  // 单条 / 清除已读 / 清空全部
```

IPC（main，kairos-ipc）：

| 通道 | 方向 | 语义 |
|---|---|---|
| `kairos:notifications-list` | invoke | 全量列表（新→旧）+ 未读数 |
| `kairos:notifications-mark-read` | invoke | 单条 / 全部标记已读，写盘后返回最新未读数 |
| `kairos:notifications-remove` | invoke | 删除（单条 / 清除已读 / 清空全部），返回删除数 + 最新未读数；纯用户侧操作，`notify_user` 工具不感知 |
| `kairos:notification` | main → renderer | 新通知实时推送（渲染层徽标 +1、列表头插） |

链路：executor 写 store → store `onCreated` 回调 → controller 对外 emit `"notification"` →
kairos-ipc 转发 renderer + `level === "important"` 时 main 弹 Electron `Notification`
（macOS 通知中心；点击聚焦主窗口）。

## 5. 前端：两视图共用（2026-07-04 定稿：内容 tab，不走浮层）

首版实现为「头部铃铛 + 锚定浮层」，用户评审后改为**内容 tab 形态**——通知列表与
最终回复等内容并列展示，不用额外浮层层级：

- 共用模块 `components/kairos/KairosNotifications.tsx`：`useKairosNotifications` hook
  （list 拉取 + push 订阅 + markRead）+ `KairosNotificationList`（列表 + 行内展开详情）+
  `KairosNotificationTabBadge`（tab 上的未读数徽标）。
- **KairosPage 详情面板**：tab 栏直出「最终回复 / 通知 / 更多 ▾」三格，通知是第 2 个
  可见 tab 并挂未读徽标；「工具结果」「思考过程」收进「更多」下拉，选中后「更多」格显示
  当前标签名并高亮。通知 tab 的头部右侧是「全部已读」（替代其他 tab 的时间/状态 meta）。
- **右侧面板（KairosRightPanelView）**：「最终回复」区头部改为 `最终回复 ⇄ 通知` tab
  切换，通知 tab 同样挂徽标 + 「全部已读」。
- 列表项：时间 + level 色点（important 用警示色）+ title；点击行内展开 body（手风琴）
  并即时标记已读，再点收起。body 按 Markdown 渲染（复用聊天区 `MarkdownProse`，
  工具参数里 body 本就声明为 markdown）；条目外层是 div 而非 button——正文里的链接
  要可点、文本要可选中，正文区点击不冒泡收起。空态「暂无通知」。
- 浏览器 mock（桥不可用）：hook 返回空数据，列表显示空态。
- **删除（2026-07-04 增补，方案对比见 `kairos-notification-delete-variants.html`）**：
  - 单条：条目 hover 时右上角浮现垃圾桶图标（`Trash2`），点击即删、不弹确认框——
    通知是低价值数据，误删兜底走撤销而非事前确认。删除先本地隐藏 + 未读数即时回落，
    列表底部出现「已删除 · 撤销」提示条，5 秒撤销窗口（`UNDO_WINDOW_MS`）到期才真正
    下发 IPC；期间点撤销恢复原位。窗口内删第二条 / 组件卸载 / 批量清理都会先提交
    上一条待删除，避免「删了又回来」。
  - 批量：头部「全部已读」旁的「清理 ▾」下拉（`KairosNotificationActions`，两视图共用）：
    「清除已读」直接执行；「清空全部…」点击后按钮原地变「确认清空？」二次确认，
    再点才执行（不弹对话框）。

头部按钮组同日调整：直出 `开启/暂停`、`唤醒` 两个高频按钮，低频操作（上下文 / 重置）
收进 `⋯ 更多` 下拉；通知入口即详情面板 tab，头部不再单设按钮。

## 6. 提示词层改动（最小）

- 产出契约段：合格产出加「通知」一项。
- 场景应对表补一行：**重要发现（任务成果 / 规则命中的分析结论 / 异常）→ `notify_user`；
  普通观察 → 笔记即可，不要通知**。
- 用户场景示例（rule.md 写法，配合授权覆盖原则）：
  「监听目录出现新 .csv 时，读取分析，把要点用 notify_user 通知我」。

## 7. 被排除的方案汇总

- 新增 `SessionEventType`（如 `kairos_notification`）：事件枚举带重放契约（「追加不允许调换顺序」），
  且通知有可变的已读状态，与 append-only 事件流语义冲突；用独立 store + 独立推送通道更干净。
- 通知复用「最终回复」渲染管道：最终回复是每 tick 覆盖式的（只看最新一条），通知需要列表 +
  未读生命周期，数据形态不同。
- OS 通知对所有 level 生效：info 级会打扰，违背 Kairos「安静」原则；只对 important 弹。

## 8. 参考

`docs/design-docs/kairos/agent-kairos-autonomous-mode.md`（工具矩阵 / 事件流）、`docs/design-docs/kairos/agent-kairos-prompt-design.md`
（授权覆盖原则、机制段边界）、`docs/design-docs/kairos/front-Kairos监控页规范.md`（KairosPage 布局）。
