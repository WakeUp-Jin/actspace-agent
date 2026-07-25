# Kairos 通知中心（notify_user 工具 + 两视图铃铛）

- 日期：2026-07-04
- 类型：新功能
- 设计：`docs/design-docs/kairos/agent-kairos-notifications.md`
- 计划：`docs/exec-plans/completed/20260704-kairos-notifications.md`

## 背景

用户指出 Kairos 的关键回复（如 fs-watch 发现新 CSV 后按 rule.md 分析出的结论）会淹没在
按 tick 滚动的运行轨迹里。用户提议做通知中心（列表 + 已读消失），并建议"通知作为 Kairos
工具，让它自己决定何时调用"。评估了解析最终回复标记、代码启发式两种替代方案后，
确认工具方案最优（结构化、落盘免费、与 sleep 同构、贴合"时机之神"自主判断的定位）。

## 变更

### agent-core

- 新增 `kairos/tools/notify.ts`：`notify_user(title, body?, level?)` 工具，仅注册给
  Kairos；描述双向强调（重要发现必须用 / 日常安静不要用）；每 tick 限 3 条（代码兜底，
  controller 在 `kairos_tick_injected` 时清零计数）。
- 新增 `kairos/storage/notification-store.ts`：`memory/notifications.json` 持久化，
  滚动上限 200（优先淘汰最旧已读），原子写盘，损坏时空表恢复，`onCreated` 回调。
- `controller.ts`：创建 store、注册工具、emitter 增加 `"notification"` 事件、
  接口补 `notificationsList()` / `notificationsMarkRead(id?)`；上下文快照的
  `KAIROS_OWN_TOOL_NAMES` 加入 `notify_user`。
- `prompt.ts`：产出契约加「通知」；场景应对表补「重要发现 → notify_user，普通观察 →
  笔记」；"不要假装能主动通知"改为"主动触达用户只有 notify_user 一个渠道"。

### shared / desktop main / preload

- 契约：`KairosNotification` / list & mark-read 请求响应；`KairosBridgeApi` 补
  `notificationsList` / `notificationsMarkRead` / `onNotification`。
- IPC：`kairos:notifications-list`、`kairos:notifications-mark-read`（invoke）、
  `kairos:notification`（push，直发不攒批）；important 级同时弹 Electron `Notification`
  （macOS 系统通知，点击聚焦主窗口）；dispose 时显式 off 通知监听。

### renderer

- 首版为「头部铃铛 + 锚定浮层」；用户评审三个交互方案（行内展开浮层 / 双层浮层 / 抽屉，
  mockup 见 `docs/design-docs/kairos/kairos-notification-ui-variants.html`）后提出第 4 种
  形态并定稿：**通知作为内容 tab**。
- 新增 `components/kairos/KairosNotifications.tsx`：`useKairosNotifications` hook +
  `KairosNotificationList`（列表 + 行内展开已读）+ `KairosNotificationTabBadge`。
- KairosPage 详情面板增加 tab「通知」（未读徽标 + 全部已读）；
  KairosRightPanelView「最终回复」区改为 `最终回复 ⇄ 通知` tab 切换。

### 同轮 UI 修整

- 头部按钮收纳：直出 `开启/暂停`、`唤醒`，`上下文` / `重置` 收进 `⋯ 更多` 下拉。
- 修复详情面板水平滚动条：tab `min-w-28` 固定宽在 340px 窄列下超宽（3×112 > 300），
  改为 flex-1 弹性收缩 + 面板 `overflow-x-hidden`。
- 详情面板 tab 二次收纳（用户反馈 4 tab 仍拥挤）：直出 `最终回复 / 通知 / 更多 ▾`，
  `工具结果` `思考过程` 收进「更多」下拉；选中隐藏 tab 时「更多」格显示该标签名并高亮，
  点击工具行自动切换的行为保持不变。
- 修复分页激活按钮数字不可见：激活态原先在 `pageButtonClass` 上叠加 `bg-brand text-white`，
  但 `bg-surface`/`bg-brand` 同为背景类，胜负取决于生成 CSS 的顺序而非 class 顺序，
  导致白底白字；改为激活态使用独立完整的 `pageButtonActiveClass`，不再做类叠加覆盖。

### 二轮反馈修复（同日中午）

- **暂停按钮失效（`kairos:control` ENOENT）**：`persistEnabledPreference` 用固定的
  `preferences.json.tmp` 做原子写；快速连点开启/暂停（一次 control 里 start 也会写 true）
  产生并发写，先完成的 `rename` 把共享 tmp 挪走，后一个 `rename` ENOENT 抛回 UI。
  修复：写入按 promise 链串行化 + tmp 名带 `pid + 时间戳` 唯一化；`kairos:write-config`
  同一 tmp 命名习惯一并改掉（它与 controller 可能同时写 preferences.json）。
  补并发回归测试。
- **通知正文 Markdown 渲染**：工具参数里 body 本就声明为 markdown，列表展开时改用聊天区
  `MarkdownProse` 渲染；条目外层从 `<button>` 改为 div（正文链接可点、文本可选中，
  正文区点击不冒泡收起），键盘可达性用 tabIndex + Enter/Space 保留。
- **滚动时 tab 栏被卷走**：详情面板原先整体 `overflow-y-auto`；改为三行 grid
  （tab 栏 / 标题行 / 内容区），只有内容区滚动。
- **控件样式对齐 Cursor 风格**（按 ui-ux skill 的 44px 触达/间距节奏与状态清晰原则收敛）：
  头部按钮 38px→32px（`h-8` + 圆角 7px + 13px 字号），`⋯ 更多` 改方形图标钮，header
  `py-4`→`py-3`；详情 tab 从边框分格改为 segmented control（浅灰槽 + 激活项白底微浮起，
  高 28px），右侧紧凑视图的「最终回复 ⇄ 通知」切换同款。
- **紧凑视图「开启」按钮不可见**：又是类叠加坑——`compactPrimaryButtonClass`（bg-brand
  text-white）叠在 `compactButtonClass`（bg-surface text-text-main）上，CSS 生成顺序
  决定胜负，实际白底白字。两处主按钮（紧凑视图 + KairosPage header）都改为独立完整类。
- **紧凑视图通知展开空间太小**：通知 tab 激活时该区上限从 `max-h-[220px]` 放宽到
  `max-h-[min(480px,60vh)]`，展开的 Markdown 正文有更多可视空间，轨迹列表相应下挤。

### 三轮：删除通知（同日午后）

用户问"想删除某一条通知怎么办"。做了三方案 mockup
（`mockups/kairos-notification-delete-variants.html`：hover 垃圾桶 / 展开态删除钮 /
头部清理下拉）供评审，用户选定 **A + C 组合**：

- **后端**：`NotificationStore.remove({ id } | { scope: "read" | "all" })` 返回删除数；
  controller 补 `notificationsRemove`；新 IPC `kairos:notifications-remove` + preload 暴露；
  契约加 `KairosNotificationsRemoveRequest/Response`。纯用户侧操作，`notify_user` 工具不感知。
- **单条删除（A）**：条目 hover 右上角浮现垃圾桶，点击即删不弹确认；本地先隐藏 + 未读数
  即时回落，底部出「已删除 · 撤销」提示条，5 秒窗口到期才真正下发 IPC，期间可撤销。
  窗口内删第二条 / 组件卸载 / 批量清理都会先提交上一条，避免"删了又回来"。
- **批量清理（C）**：新组件 `KairosNotificationActions`（两视图共用头部操作区）＝
  「全部已读」+「清理 ▾」下拉（清除已读 / 清空全部）；清空全部用按钮原地变
  「确认清空？」的轻量二次确认，不弹对话框。

## 测试

- 新增 `notification-store.test.ts`（8 用例，含单条/scope 删除）、`notify.test.ts`（5 用例）、
  `kairos-notifications.test.tsx`（7 用例，含 hover 删除撤销窗口 / 撤销恢复 / 清理下拉
  二次确认）；existing mock 桥补四个新方法；
  kairos-page 测试改为经 `⋯ 更多` 菜单触达重置，并新增详情面板「更多 ▾」下拉用例。
  测试坑：撤销窗口用例最初用 `vi.useFakeTimers()`，超时失败时 finally 不执行导致
  fake timers 泄漏、拖垮同文件后续用例；改为用「卸载即提交」断言删除下发，不碰假时钟。
- `pnpm typecheck` 全绿；agent-core 683 测试全过；desktop 渲染层 244 全过
  （`review-git-service.test.ts` 9 例因沙箱禁 `git init` hooks 失败，与本变更无关）。

## 备注

- 通知不进 SessionEvent 枚举：`read` 是可变状态，与 append-only 事件流语义冲突；
  工具调用本身已作为 `tool_call` 落轨迹，重放不受影响。
- 用户 rule.md 示例写法：「监听目录出现新 .csv 时，读取分析，把要点用 notify_user 通知我」。
- 学习沉淀：本次主要复用既有模式（专属工具照 sleep、存储照 budget-store、IPC 照 briefs），
  未新增独立 learnings 文档；「通知走独立可变状态存储而非事件流」的取舍已记录在设计文档 §7。
