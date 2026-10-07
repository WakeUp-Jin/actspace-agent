# 10 冗余清理 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/10-冗余清理执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-10-redundancy-cleanup/execution-process.md`
- **执行模式**：交互，连续执行
- **执行结果**：完成（T0–T12 全部完成；审批卡片的真实对话冒烟交给验收）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 删除 LabPage 原型（R1） | `R/components/LabPage.tsx` 及测试；`scripts/check-frontend-design-tokens.mjs` 及测试；`WorkbenchLayout.tsx` 注释 | 只被测试引用；token 检查不再需要为它设跳过名单。Lab 导航占位页保留 |
| 删除 ExploreRunBlock、Sheet（R2、R3） | 两个组件及测试 | 没有使用方 |
| 删除 terminal-ipc、空目录（R4、R5） | `M/terminal/terminal-ipc.ts`、`tsconfig.electron.json` | `registerTerminalIpc` 没有调用方 |
| 删除 projection-ipc 和 DESKTOP channel（R6、V7） | `M/runtime-v2/projection-ipc.ts` 及测试、`M/index.ts`、`S/runtime-v2/desktop-ipc.ts` | 18 个 handler 和 `approvalRequired`、`liveEvent` 发送都没有接收方；`desktop-ipc.ts` 只保留仍被引用的 11 个类型 |
| 删除 DESKTOP_SHELL 重复注册和双发（R7） | `M/runtime-v2/desktop-shell-ipc.ts`、`M/index.ts`、`S/runtime-v2/desktop-shell.ts`、对应测试 | preload 只用 FIXED；现在每个工作区 / Review / 终端 handler 只注册一次，事件只发一次 |
| 删除 Composer 死 prop（R8） | Composer、ConversationView、WorkbenchLayout、App、`test/composer.test.tsx`、4 个 preview fixture | `agentForm`、`onAgentFormChange`、`locked` 都没有读取方 |
| 删除 `useSessionProjection`、裸块（R9、R10） | `SessionProjectionContext.tsx`、`App.tsx` | 没有调用方；裸块是重构遗留 |
| 轨迹 fixture 移出生产包（B1） | `R/trajectory/index.ts`、`R/components/TrajectoryView.tsx`、`test/trajectory-render-view.test.tsx` | DEV / test 守卫内动态 import；主 chunk 1,802,434 → 1,759,896 字节，产物中搜不到 fixture |
| 文档同步 | 07、08、01、05、README、一篇旧 learning | 标注「已在 10 执行」并更正过期描述 |

## 人工验证指引

### 必须验证

1. **审批卡片**（T6 删掉了 `approvalRequired` 的发送端）
   - 验证方式：连接模型，在会话中让 Agent 执行一个需要审批的工具调用（例如需要确认的 shell 命令）。
   - 预期结果：审批卡片正常出现；批准后继续运行，拒绝后正常结束。
2. **终端**
   - 验证方式：打开终端面板，输入 `echo hi`。
   - 预期结果：有输出；关闭再打开不报错。
3. **Review 刷新**
   - 验证方式：在工作区里改一个文件，看 Review 面板。
   - 预期结果：改动出现，无需手动刷新。
4. **回归冒烟**
   - 验证方式：新建会话发一条消息；切换会话；打开设置任意两页。
   - 预期结果：流式输出正常结束，没有报错。

### 建议验证

1. **dev 下的轨迹 fixture**
   - 验证方式：`pnpm --filter @actspace/desktop dev`，在渲染页 URL 上加 `?trajectoryFixture=complete&trajectoryTheme=dark`，打开轨迹面板。
   - 预期结果：显示 fixture 轨迹，主题为深色；关闭面板后主题恢复。

## Agent 已完成的验证

- typecheck（shared + desktop）通过；desktop test 只有基线中已知的 1 个失败，与基线相比少了 4 个已删除的测试文件。
- `check:frontend-tokens`、`frontend-design-tokens.test.mjs`、`check:current-docs` 通过。
- 所有 grep 门槛为 0，包括旧 channel 前缀的字面量。
- Electron CDP 冒烟：
  - 终端回显 `FE10_FINAL_42`；
  - Review 快照和刷新 `ok`，通知收到 1 次；
  - 主窗口、轨迹面板、设置页渲染正常；
  - 控制台和主进程日志没有新错误。
- 新单测覆盖 URL fixture 的懒加载、主题覆盖和卸载时还原。
- Sonnet 只读复核没有阻塞项，建议项已处理。

## 已知风险和遗留事项

- 审批卡片没有自动化覆盖，只能靠验收 A1 确认。
- Lab 没有可点击的入口（S0 时就是这样）。占位页只能通过代码切换到 `view === "lab"` 才能看到。
- `packages/shared/package.json` 的子路径 `./runtime-v2/desktop-ipc` 保留了，因为文件中还有被引用的类型。

## 后续建议

- 直接进入 11（安全与 IPC）。01 P1-2 的第 3 步（preload 短别名表）随 13 执行。
