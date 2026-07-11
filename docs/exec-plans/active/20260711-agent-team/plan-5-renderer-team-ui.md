# Plan 5：Renderer Team 创建、任务页、成员页与直聊

状态：待执行

依赖：Plan 0、Plan 4

产物消费方：Plan 6

## 目标

在现有桌面工作台中实现 Team session 的用户入口和运行视图：新会话选择 Team 模板、Leader/任务/成员标签、成员 transcript、writeScope/状态展示、用户直聊、权限 actor 标识和成员预设/Team 模板设置管理。

## 附加必读

- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/front-主题与配色规范.md`
- `docs/design-docs/front-工作台布局与面板交互规范.md`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/design-docs/front-聊天输入框规范.md`
- `docs/design-docs/front-设置页规范.md`
- `docs/coding-standards/team/frontend-style-scope-conventions.md`

## 允许修改的文件

- `packages/desktop/src/renderer/team/TeamSetupDialog.tsx`（新增）
- `packages/desktop/src/renderer/team/TeamTabBar.tsx`（新增）
- `packages/desktop/src/renderer/team/TeamTaskView.tsx`（新增）
- `packages/desktop/src/renderer/team/TeamMemberView.tsx`（新增）
- `packages/desktop/src/renderer/team/TeamMemberHeader.tsx`（新增）
- `packages/desktop/src/renderer/team/useTeamRuntime.ts`（新增）
- `packages/desktop/src/renderer/team/team-selectors.ts`（新增）
- `packages/desktop/src/renderer/team/test/*.test.tsx`（新增）
- `packages/desktop/src/renderer/components/settings/MemberPresetSettings.tsx`（新增）
- `packages/desktop/src/renderer/components/settings/TeamTemplateSettings.tsx`（新增）
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/App.tsx`
- 必要的语义 CSS/token 文件（只有现有 token 不足时）
- renderer tests
- 对应设计文档和 history

## 任务清单

### 5.1 新会话 Agent Form 选择

- Initial Composer 的上下文选择行增加 Agent Form 入口。
- 可选 Solo 和 Team；Room 显示禁用或不展示，不伪造可运行入口。
- 选择 Team 后打开 `TeamSetupDialog`：选择 TeamTemplate、确认 think/steady/flash binding 和 workspace。
- 发送首条消息前调用 `session:create` 持久化 form。
- 已创建 session 不显示 form 切换入口。
- 浏览器无 preload 模式只允许 Solo；Team 入口显示“需要桌面运行时”，不创建前端假 Team。

### 5.2 Team runtime state hook

`useTeamRuntime(sessionId)`：

- 初始 `team:get-state`。
- 订阅四类 Team RuntimeStreamEvent。
- 按 sessionId 过滤。
- Task/member/message 增量使用 ID 覆盖，不重复追加。
- session 切换时清理订阅和本地 transient 状态。
- 不把 Team state 塞进现有主消息 blocks。

### 5.3 TeamTabBar

标签：

- Leader。
- 任务。
- 每个已启动成员。

状态只使用文本、语义 token 和克制的小面积提示，不写死颜色。成员 waiting/idle/failed 必须可区分，不能只靠颜色。

窄窗口下标签横向滚动或收进 overflow，不挤坏中间聊天区和 Composer。

### 5.4 Leader View

- 继续复用现有 ConversationView。
- 在 Leader 消息流中显示成员轻量状态、Task result 摘要和用户直聊 mirror notice。
- 不展开成员完整工具流。
- 点击成员状态跳转成员 Tab；点击 Task 跳转任务页。
- 成员权限审核卡显示成员名称。

### 5.5 TeamTaskView

显示：

- Task subject/status/owner/blockedBy/retryCount。
- pending 派生 blocked 状态和原因。
- result/resultRefs。
- 与 Task 关联的消息时间线。
- Leader 可用的重试、取消、重新分配操作。

Renderer 只调用 IPC/模型工具对应控制 API，不直接改状态对象。

### 5.6 TeamMemberView

- Header 显示成员名、成员预设、tier、状态、当前 Task、writeScope、耗时和 Token。
- transcript 复用现有 Thinking、ToolLogLine、FileDiffBlock、BashRunBlock、MarkdownProse 等消息组件。
- 成员运行中实时追加 `team_member_event`。
- 完成/恢复时可通过 `team:get-member-transcript` 补拉。
- 底部 Composer 直接发送到当前成员；不走 Leader `runTurn`。
- 发送后立即显示 pending 用户消息，IPC 成功后转为 delivered；失败显示可重试错误。
- stopped/failed 成员输入框禁用。

### 5.7 writeScope 与控制交互

- MemberHeader 用可读文本展示 readonly / paths / workspace。
- paths 可展开查看路径列表。
- Leader 可以打开 scope 调整弹层；提交 `team:update-member-scope`。
- write_scope_conflict 显示冲突成员和范围，不只显示“waiting”。
- stop 先 graceful，超时后 UI 提供 force stop。

### 5.8 设置页

- Agent 设置分区增加“成员预设”和“Team 模板”。
- MemberPreset：创建、复制、编辑、删除用户项；built-in 只允许复制。
- TeamTemplate：选择允许的 preset、Leader tier、TierBinding、peer messaging、assignment mode、max concurrency。
- 表单校验错误来自共享/IPC结果，不在 renderer 单独发明规则。

### 5.9 主题和可访问性

- 所有颜色使用语义 token。
- Tab、Task action、scope dialog、stop 按钮具备 keyboard/focus-visible。
- 状态不只依赖颜色。
- `prefers-reduced-motion` 下无必要循环动画。
- Team 页面根容器为 chrome bar 留出顶部高度。

## 自动测试要求

- TeamSetupDialog 创建输入包含正确 AgentForm。
- 已创建 Team session 无法切回 Solo。
- stream event 按 session/member/task ID 正确归并。
- 任务结果不从 `task_result` Mailbox 读取。
- 成员直聊走 Team IPC，不调用主 `runTurn`。
- Leader mirror notice 可见。
- scope conflict、permission waiting、failed/stopped 状态均有可读文案。
- 浅/深主题类不包含禁止的颜色字面量。

## 验证命令

```bash
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
rg -n "text-black|bg-black|bg-white|text-\[#|bg-\[#|border-\[#|rgba\(" packages/desktop/src/renderer/team packages/desktop/src/renderer/components/settings
```

逐条检查 `rg` 命中是否属于主题规范允许的例外。

## 手工验证

### 浏览器 renderer

- 用显式 Team mock harness 验证标签溢出、Task 状态、成员 transcript、scope dialog。
- 浅色和深色各截图一次。
- 浏览器模式不得用 mock 证明 IPC、持久化或恢复成功。

### Electron

- 创建真实 Team session。
- 切 Leader/任务/成员 Tab。
- 直接发送成员消息。
- 批准成员工具权限。
- 切 session 后返回，状态保持。
- 重启 Electron 后恢复。

## 完成标准

- 用户可以不理解内部文件结构完成 Team 创建、观察、干预和收尾。
- Team UI 不破坏现有 Solo 消息区和 Composer。
- 浅色、深色、窄窗口和 Electron 真实链路通过验收。

