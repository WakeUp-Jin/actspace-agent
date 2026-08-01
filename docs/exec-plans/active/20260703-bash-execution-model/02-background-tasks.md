# Plan 02：E2 后台运行 MVP + E3 blockMs 语义切换

## 目标

bash 支持后台运行：`blockMs: 0` 显式后台、`blockMs` 到点自动转后台（不杀进程）、`bash_output` / `bash_kill` 配套工具、终态通知在 turn 边界注入模型上下文、会话/应用退出时收割所有后台进程。前端 bash 块显示 backgrounded 状态。

## 范围

- 包含：任务注册表、runProcess 后台模式、bash 参数语义切换（`timeoutMs` → `blockMs`）、两个新工具、steering 通知接线、会话收割、shared 契约、前端 bash 块扩展。
- 不包含：`notifyOnOutput` 输出订阅、卡死看门狗（Plan 03）；沙盒（E5）；任务卡片独立预览类型（首期复用 bash 块扩展状态，独立卡片记 tech-debt）。

## 背景

- 相关文档：设计文档「工具契约」「后台运行与通知机制」节；`docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`（preview 必须以最终态收尾）。
- 相关代码路径：
  - `packages/agent-core/src/tools/subprocess/run-process.ts`（现有 sink 模式）
  - `packages/agent-core/src/tools/tools/bash/`（definition / executor / permissions / render-result / index）
  - `packages/agent-core/src/tools/index.ts`（工具注册，140 行附近）
  - `packages/agent-core/src/engine/bridge.ts`（`new Agent({...})` 处接 `getSteeringMessages`）
  - `packages/agent-core/src/engine/loop.ts`（steering 注入点，已存在，不改）
  - `packages/desktop/src/main/agent-run.ts`（每 Agent Run 新建 deps 的事实；`activeAgentRunAborts` 单例先例）
  - `packages/desktop/src/main/index.ts`（app 退出钩子，1312 行附近 `app:shutting-down`）
  - `packages/shared/src/session.ts`（`ToolUiPreview` bash 分支、`RuntimeStreamEvent`）
  - `packages/shared/src/session-selectors.ts`（bash 块映射，204 行附近）
  - `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- 已知约束：
  - Agent deps 每 turn 新建 → 注册表必须是 agent-core 模块级单例，按 sessionId 分组。
  - `getSteeringMessages` 已在 loop 每次 LLM 调用前被拉取，bridge 尚未传入。
  - turn 结束后的任务终态：通知滞留注册表队列，下轮 turn 开始时由 steering 拉取（设计文档投递规则 2）；同时用 `webContents.send("agent:stream", …)` 即时更新前端块状态（对照 `context-compact.ts` 先例）。

## 风险

- 风险 1：`timeoutMs` → `blockMs` 是行为切换（原「超时=失败」变「超时=转后台」），可能影响依赖超时失败语义的既有测试与模型行为。
  - 缓解：参数改名而非兼容别名（模型侧靠 description 引导）；全量跑 agent-core + desktop 测试；工具描述明确写「不存在超时失败」。
- 风险 2：孤儿进程（app 崩溃时注册表随进程消失）。
  - 缓解：spawn 已用 `detached` + 进程组信号；正常退出路径（app quit / session 关闭）由收割函数兜底；崩溃场景接受（进程组随 SIGHUP 大概率退出），记入 tech-debt-tracker。
- 风险 3：转后台与进程退出的竞态。
  - 缓解：转后台前检查子进程是否已 close（设计文档竞态处理），单测覆盖。

## 任务

### 阶段 A：注册表与进程层（agent-core，可独立验证）

1. 新建 `packages/agent-core/src/tools/tools/bash/task-registry.ts`：
   - `BashTask` 接口按设计文档（taskId/command/intent/cwd/pid/outputFilePath/status/exitCode/startedAt/endedAt/notified/lastReadOffset；`sandboxed` 字段留到 E5 不加）。
   - 模块级单例 `BashTaskRegistry`：`register / get / listRunning(sessionId) / markCompleted / markKilled / drainPendingNotifications(sessionId) / harvestSession(sessionId) / harvestAll()`。
   - 通知格式化函数 `formatTaskNotification(task): string`，输出设计文档的 `<task_notification>` XML（含 `output_tail`：读落盘文件末尾 ≤ 2KB）。
   - taskId 格式 `bash_<ulid>`，复用 `createToolOutputId` 的随机源或等价实现。
2. `run-process.ts` 增加后台模式：新增 `spawnDetachedProcess(options): { pid, outputFilePath, wait: Promise<终态> }` 导出（与现有 `runProcess` 并列，不重构既有路径）：
   - 始终创建落盘文件（后台任务输出必须可读），复用 sink 写盘逻辑（headBuffer 不需要，直接全量写盘 + diskCap 截断）。
   - diskCap 命中即 `signalChild` 终止（磁盘看门狗）并在终态里标注。
   - 验证：`subprocess.test.ts` 新用例——后台 spawn 长命令，文件持续增长，kill 后 wait resolve。
3. `executor.ts` 重写执行流：
   - 参数 `blockMs`（默认 30_000，clamp [1_000, 600_000]，`0` = 立即后台）替代 `timeoutMs`；`permissions.ts` 的 `sanitizeTimeout` 同步改名收敛。
   - 前台路径：`blockMs` 内退出 → 按现有返回（复用 Plan 01 成果）。
   - 转后台路径：到点未退出 → 注册到 registry，返回设计文档「bash 返回（转后台）」结构（status/taskId/outputFilePath/reason/hint）；`wait` promise 挂 registry 终态回调。
   - 竞态：转后台瞬间已退出 → 按前台结果返回，标记 notified。
   - 需要 sessionId：`BashExecutorConfig` 已有，透传给 registry。
4. 新工具 `bash_output` / `bash_kill`（`packages/agent-core/src/tools/tools/bash/` 下新文件，`tools/index.ts` 注册）：
   - `bash_output(taskId, tail?)`：默认从 `lastReadOffset` 读增量并推进 offset；`tail: N` 读末尾 N 行；单次回填 ≤ 64KB，超出加省略提示。任务不存在 → 明确错误。
   - `bash_kill(taskId)`：进程组 SIGTERM → 500ms → SIGKILL（复用 `signalChild`），返回退出状态 + 尾部输出，标记 notified。
   - 两者 `isReadOnly`：output 是、kill 否；`previewKind: "bash"`；permission 默认 allow（操作对象是自己启动的任务）。
5. `definition.ts` 更新：`blockMs` 参数描述（含 0 语义、默认值）、后台行为说明（会收到通知、勿轮询、勿加 `&`）、`intent` 保留。

### 阶段 B：通知接线（engine + main）

6. `engine/bridge.ts`：构造 `Agent` 时传 `getSteeringMessages`——从 registry `drainPendingNotifications(sessionId)` 取通知，包装为 UserMessage（`source: "task_notification"`，priority HIGH）。turn 内每次 LLM 调用前自动生效（loop 已有机制）。
   - 运行中任务清单附件：`listRunning` 非空时在同一 steering 消息尾部附一行清单（设计文档投递规则 5）。
   - 验证：`bridge.test.ts` 新用例——注册 mock 任务终态 → runTurn → 上下文中出现 `<task_notification>`。
7. 会话收割（main 进程）：
   - `packages/desktop/src/main/index.ts` app quit 钩子调用 `harvestAll()`。
   - 验证方式（设计文档要求写清）：手工——`pnpm dev:log` 中让 agent 启动 `sleep 300` 后台任务，退出 app，`ps aux | grep sleep` 确认无残留。

### 阶段 C：shared 契约与前端（依赖阶段 A 类型）

8. `packages/shared/src/session.ts`：
   - `ToolUiPreview` bash 分支加可选字段：`backgroundTaskId?`, `backgroundStatus?: "running" | "completed" | "failed" | "killed"`, `outputFilePath?`。
   - `RuntimeStreamEvent` 新增 `{ type: "bash_task_update"; sessionId; taskId; toolCallId; status; exitCode?; outputTail? }`。
   - `session-selectors.ts` bash 块映射透传新字段。
9. main → renderer 推送：任务终态回调里 `getMainWindow()?.webContents.send("agent:stream", bash_task_update)`（turn 内外统一走这条通道）；preload 无需改（`agent:stream` 已透传）。
10. `BashRunBlock.tsx`：`backgroundStatus` 存在时显示运行中/终态徽标 + 已运行时长；终态后显示 exitCode。不做输出流式滚动（记 tech-debt）。
    - 验证：`pnpm --filter @actspace/desktop test`（含 selectors 与组件测试各 1 例）；手工走查浅/深双主题（若新增颜色，先读 `docs/design-docs/frontend/front-主题与配色规范.md`）。

## 验证方式

- 命令：`pnpm typecheck`；`pnpm test`（全仓）。
- 手工检查（`pnpm dev:log`）：
  1. `sleep 5` + `blockMs: 2000` → 2s 返回 backgrounded，5s 后下一轮对话看到 `<task_notification>` completed。
  2. `blockMs: 0` 启动 `pnpm dev`（任意长驻命令）→ 立即 backgrounded，`bash_output` 能读增量，`bash_kill` 能杀掉。
  3. 退出 app 无孤儿进程（`ps` 验证）。
- 失败回退：阶段 A 独立可 revert（新文件为主）；阶段 B/C 若通知链路有问题，registry 仍可用（工具主动 `bash_output` 拉取），降级不阻塞。

## 进度记录

- [x] 阶段 A：任务 1–5（task-registry / startProcessSink 句柄化重构 / executor blockMs / bash_output+bash_kill / definition；`bash-background.test.ts` 10 用例 + bash.test.ts 20 用例全绿）
- [x] 阶段 B：任务 6–7（bridge getSteeringMessages 接线 + main before-quit harvestAll；bridge.test.ts 新增 2 用例。会话收割的手工验证待 dev 验收一并做）
- [x] 阶段 C：任务 8–10（shared BashPreview 扩展 + bash_task_update 事件 + selectors 透传 + App.tsx 覆写层 + BashRunBlock 徽标；selectors 2 用例、组件 2 用例全绿）
- [ ] 手工验收（pnpm dev:log 三项检查）——待开发者手动执行

实现偏差记录：
- `runProcessStreaming` 重构为基于新的 `startProcessSink` 句柄（超时语义留在包装层），bash executor 直接用句柄实现「到点转后台」，比计划里「新增 spawnDetachedProcess 并列函数」收敛。
- 注入消息以 `source: "task_notification"` 标记（`UserMessagePayload.source` 新字段），前端映射为 tool 样式块而非用户气泡——计划未明确此点，执行中补充。
- 全局 `pnpm test` 中 `review-git-service` 的失败是 agent 沙盒环境 git init 被拦所致（真实环境通过）；`settings-service` 1 例失败为存量问题（stash 后基线同样失败），与本计划无关。

## 决策记录

- 2026-07-03：E2/E3 合并一份计划执行，避免同一批文件两轮重构；`timeoutMs` 直接改名 `blockMs` 不留别名（工具契约由 description 传达，无外部调用方）。
- 2026-07-03：首期前端复用 bash 块扩展状态而非独立任务卡片；输出流式滚动、崩溃场景孤儿进程记入 tech-debt-tracker。
