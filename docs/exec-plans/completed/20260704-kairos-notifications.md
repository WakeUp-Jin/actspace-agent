# Kairos 通知中心实施计划

设计依据：`docs/design-docs/agent-kairos-notifications.md`。

## M1 agent-core：契约 + 工具 + 存储 + controller 集成

1. `packages/shared/src/kairos-contracts.ts`：
   - `KairosNotificationLevel` / `KairosNotification` / `KairosNotificationsListResponse` /
     `KairosNotificationsMarkReadRequest` / `KairosNotificationsMarkReadResponse`。
   - `KairosBridgeApi` 增加 `notificationsList()` / `notificationsMarkRead(req)` /
     `onNotification(listener): () => void`。
2. `packages/agent-core/src/kairos/storage/notification-store.ts`：
   - `createNotificationStore(filePath)` → `{ add(input), list(), markRead(id?), unreadCount(), onCreated(cb) }`。
   - 启动时读盘（损坏则告警重建空表）；变更原子写盘；滚动上限 200。
   - 单测：新增/已读/全部已读/滚动淘汰/损坏文件恢复。
3. `packages/agent-core/src/kairos/tools/notify.ts`：
   - `notifyUserDefinition`（描述含双向强调；`extractPaths: () => []`；`isReadOnly: true`）。
   - executor 工厂 `createNotifyUserExecutor(store, getTickNotifyCount, incTickNotifyCount)`：
     校验 title 非空、level 合法；每 tick > 3 条返回失败提示合并。
   - `registerKairosTools(manager, deps)` 增加 notify 注册（sleep 不受影响）。
   - 单测：正常创建 / 参数校验 / 每 tick 限额。
4. `packages/agent-core/src/kairos/controller.ts`：
   - 创建 store（`<kairosRoot>/memory/notifications.json`），传入 registerKairosTools。
   - tick 开始时清零 notify 计数（与 toolCallCountInCurrentTick 同点位）。
   - emitter 增加 `on("notification", listener)`；store.onCreated → emit。
   - `KairosController` 接口补 `notificationsList()` / `notificationsMarkRead(id?)`（薄封装 store）。

## M2 desktop main：IPC + 系统通知

1. `kairos-ipc-internals.ts`：`KAIROS_IPC_CHANNELS` 增加
   `notificationsList` / `notificationsMarkRead` / `notification`（push）。
2. `kairos-ipc.ts`：
   - handle 两条 invoke 通道（转发 controller）。
   - `controller.on("notification", n => { send push; if important → new Notification(...) 点击聚焦主窗口 })`。
3. `preload/index.ts`：暴露三个桥方法（onNotification 返回退订函数，模式同 onEvent）。

## M3 renderer：两视图 UI

1. `components/kairos/kairos-notifications-shared.tsx`：
   - `useKairosNotifications`：mount 拉 list、订阅 push、`markRead(id?)`。
   - `KairosNotificationBell`：铃铛 + 未读徽标 + 浮层列表（时间 / level 色点 / title，
     点击展开 body 并已读；全部已读按钮；空态）。主题 token，禁止字面量颜色。
2. `KairosPage.tsx` 头部按钮组挂 Bell；`KairosRightPanelView.tsx` 头部挂 Bell +
   未读横幅（最新未读 title）。
3. 渲染层测试：列表渲染 / 点击已读 / 全部已读 / push 徽标更新；现有 mock KairosBridgeApi
   补三个新方法。

## M4 收尾

- `pnpm typecheck` + agent-core / desktop 测试全绿。
- 文档同步：`agent-kairos-autonomous-mode.md`（工具矩阵 + 事件链路）、
  `core-storage-and-observability.md`（IPC 表 + 存储布局）、`agent-index.md`、
  `front-Kairos监控页规范.md`；系统提示词模板补产出契约 + 场景行。
- history + 视情况 learnings；本计划归档 completed/。
