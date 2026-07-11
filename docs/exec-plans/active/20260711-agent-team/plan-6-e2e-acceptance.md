# Plan 6：端到端恢复、并发、安全和真实桌面验收

状态：待执行

依赖：Plan 0-5

产物消费方：发布与后续优化

## 目标

用自动化测试、故障注入和 Electron 真实操作证明 Agent Team 的核心不变量成立，补齐文档、history、质量评分和发布记录，并将本计划归档。

## 附加必读

- `docs/design-docs/agent-form-team.md`
- `docs/design-docs/agent-testing.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/learnings/WRITING_GUIDE.md`

## 允许修改的文件

- `packages/agent-core/src/team/test/team-e2e.test.ts`（新增）
- `packages/desktop/src/main/team/test/team-ipc-e2e.test.ts`（新增）
- `packages/desktop/src/renderer/team/test/team-workbench-e2e.test.tsx`（新增）
- 发现缺口对应的 Team 专属实现文件
- `docs/design-docs/agent-form-team.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/ARCHITECTURE.md`（只在顶层导航需要变化时）
- `docs/QUALITY_SCORE.md`
- `docs/releases/README.md` 或当期 release note
- `docs/histories/YYYY-MM/`
- 命中学习沉淀条件时的 `docs/learnings/YYYY-MM/`
- 本执行计划目录

不得借验收阶段重构无关 Solo、Kairos、Browser 或通用 UI。

## 自动化验收矩阵

### 6.1 Session Form

- 创建 Solo、Team 两种 session。
- 旧 meta 缺 form 恢复 Solo。
- Team session 无 form update API。
- 修改全局模板后旧 Team session 继续使用 runtime snapshot。

### 6.2 Task 一致性

- 双成员同时 claim 只有一个成功。
- blockedBy 未完成时无法开始。
- 环依赖被拒绝。
- 旧 assignmentVersion completion 被拒绝。
- result 缺失时不能 completed。
- Task completed 后 idle notification 不创建第二份结果。

### 6.3 并发写入

- readonly 与 writer 并行。
- 两个不相交 paths writer 并行。
- 重叠 paths 后启动者 waiting。
- workspace writer 阻塞其他 writer。
- ToolScheduler 二次校验能阻止 runtime 状态变化后的越权写入。
- Bash 在 readonly/paths/workspace 三类 scope 下符合 Plan 3 矩阵。

### 6.4 Mailbox

- 多写者并发 append 不丢消息。
- 一次投递全部未读普通消息，保持同级 FIFO。
- 控制消息优先，Peer 消息不覆盖 Leader 消息。
- 忙碌成员消息保持 unread；成功注入后才标 read。
- prune 不删 unread。
- 重启后 unread 继续投递，read 不重复进入模型上下文。

### 6.5 用户直聊

- 用户消息进入目标成员 transcript。
- Leader 收到 `user_steering_notice`。
- 成员 stopped/failed 后拒绝消息。
- 用户要求越过 writeScope 时不会直接写入。
- 最终结果仍需写 Task。

### 6.6 权限

- approval UI 显示成员 actor。
- approve/deny/timeout 恢复正确成员调用。
- 重复 decision 幂等。
- 切 session 不把 A session 决策应用到 B session。
- 应用重启不自动继续旧的高风险 approval。

### 6.7 故障恢复

故障注入点：

- Task 写到 in_progress 后进程退出。
- Member transcript 写入中途出现坏行。
- Mailbox append 后、mark read 前退出。
- mark read 锁竞争。
- 成员 LLM error。
- 成员工具长时间无响应。
- graceful shutdown 超时后 force stop。

预期：

- 过期 lease 释放并 retryCount 增加。
- completed Task 不重复运行。
- transcript 坏行局部跳过。
- unread 消息最多重复投递但不永久丢失；message ID 防止 UI 重复。
- runtime 恢复后成员能继续 idle/wake。

### 6.8 Solo 回归

- Solo session 创建、发送、流式、工具、审批、SubAgent transcript、压缩和恢复测试全部通过。
- Team 代码路径不在 Solo turn 初始化 runtime 目录或注册 Team 工具。

## 完整工程验证

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
pnpm check:docs
pnpm check:repo
```

如果全仓验证失败且失败来自任务开始前已存在的脏工作树，必须在 history 中记录具体命令和已确认的无关失败；不得修改无关代码掩盖失败。

## Electron 真实验收脚本

使用 `pnpm dev:log` 启动，优先检查 `logs/latest-dev.log`。

### 场景 A：只读并行

1. 创建 Team session，选择编程开发模板。
2. Leader 创建两个独立探索 Task。
3. 启动两个 readonly 成员。
4. 确认两者并行、transcript 独立、Leader 可查看结果。

### 场景 B：写范围冲突

1. 给两个 Coder 配置不相交 paths，确认并行。
2. 扩大其中一个 scope 造成重叠。
3. 确认一个成员进入 waiting，并显示冲突原因。
4. 前一个 Task 完成后，等待成员自动恢复。

### 场景 C：用户直聊

1. 打开成员 Tab。
2. 输入新的兼容性要求。
3. 确认成员收到，Leader 页面出现 mirror notice。
4. 要求成员写 scope 外文件，确认成员请求 Leader 调整而不是直接写入。

### 场景 D：权限

1. 成员触发需审批工具。
2. 审核卡显示成员名、动作和影响范围。
3. 分别验证允许、拒绝、超时。

### 场景 E：恢复

1. 成员运行 Task 时关闭应用。
2. 等待 lease 过期或使用测试时钟。
3. 重启并打开原 Team session。
4. 确认 Task 重新 pending、retryCount 增加、未读消息继续投递。

### 场景 F：Team 形态不可切换

1. Team session 创建后检查 Composer 和设置。
2. 确认不存在切换为 Solo 的入口。
3. 新建 Solo session，确认两者并存且行为独立。

## UI 验收

- 浅色和深色主题各完成 TeamSetupDialog、Leader、Task、Member、waiting、approval 截图。
- 1280px 和较窄窗口检查 Tab overflow、任务列表和 Composer。
- 键盘可切换标签、聚焦 Task 操作和关闭弹层。
- 状态不依赖颜色单独表达。

## 文档与交付

- 更新 `agent-current-module-map.md` 的已实现模块。
- 若包边界或顶层导航变化，更新 `ARCHITECTURE.md`。
- 更新 `QUALITY_SCORE.md` 的 Agent Team 质量项。
- 写一份最终 history，列出各 Plan 实际文件、命令和未完成项。
- 检查学习沉淀条件；本任务预计命中“可迁移、有深度、有陷阱、有模式”，应生成关于“多智能体写入范围租约与任务单一事实源”的学习文档。
- 所有 Plan 完成后把目录移动到 `docs/exec-plans/completed/20260711-agent-team/`，并把状态更新为已完成。

## 发布闸门

以下任一不满足，不得宣称 Agent Team 完成：

- Team session 重启恢复未验证。
- writeScope 只存在 prompt、没有 scheduler 机械检查。
- 用户直聊没有 Leader mirror notice。
- Task completion 仍依赖 Mailbox `task_result`。
- 权限审核无法显示成员身份。
- Solo 全链路回归失败。
- Electron 真实窗口未验收。

## 完成标准

- 自动化矩阵全部通过。
- Electron 六个场景全部验证并记录证据。
- 文档、history、learning 和质量评分同步完成。
- active plan 归档到 completed。
