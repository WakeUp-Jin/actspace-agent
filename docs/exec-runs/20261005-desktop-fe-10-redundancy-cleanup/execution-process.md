# 10 冗余清理 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/10-冗余清理执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-10`，从 `refactor/desktop-frontend@5fe9f1a6` 拉出
- **开始时间**：2026-10-06 00:10
- **结束时间**：2026-10-06 00:45

## 执行时间线

### T0：基线记录

- **产物**：`build:renderer` 通过；主 chunk `dist/assets/index-Di4Y99yT.js` 为 1,802,656 字节；`mock-trajectory-session` 只命中这一个 chunk（B1 确认存在）。
- **channel 字符串**：逐个 grep 了 `RUNTIME_V2_DESKTOP_CHANNELS`（41 个）和 `RUNTIME_V2_DESKTOP_SHELL_CHANNELS`（21 个）的字符串值，在 `apps/`、`packages/` 中（不含定义文件）字面量出现 **0 次**；FIXED 常量中也没有同值的 channel。
- **常量名引用**（除定义文件外）：
  - `RUNTIME_V2_DESKTOP_CHANNELS`：`M/index.ts:14`（import）、`:68`（`approvalRequired` 发送）、`M/runtime-v2/projection-ipc.ts`、`M/test/runtime-v2-projection-ipc.test.ts`。
  - `RUNTIME_V2_DESKTOP_SHELL_CHANNELS`：`M/index.ts:27`、`:235`（terminalEvent 双发）、`M/runtime-v2/desktop-shell-ipc.ts`（:49 双发、:67 capabilities、:72–:90 偶数行、:143–:150）、`M/test/runtime-v2-desktop-shell-ipc.test.ts`。
- **决定（按计划决策记录的规则）**：
  - `approvalRequired`：preload / renderer 都不监听，T6 删除 `M/index.ts:68` 这次 `webContents.send`；紧随其后的 `tool_approval_required` 流事件不动，审批卡片走的是它。
  - `capabilities`：没有 FIXED 版本，preload 不调用；`RuntimeV2DesktopShellBridge` / `RuntimeV2DesktopShellCapabilities` 两个类型在全仓也没有引用。T7 删除 handler、两个类型和 DESKTOP_SHELL 常量本身。
  - `RUNTIME_V2_DESKTOP_CHANNELS`：T6 后没有使用者，删除常量；`desktop-ipc.ts` 中的输入 / 输出类型还有别处使用，文件保留，只删 T6 后在全仓变为 0 引用的类型。

### T1：删除 LabPage（R1）

- 删除 `R/components/LabPage.tsx`、`R/test/lab-page.test.tsx`；`WorkbenchLayout.tsx` 的 Lab 注释改为不再提 LabPage。
- `scripts/check-frontend-design-tokens.mjs` 的 `SKIPPED_FILES` 只剩这一项，连同两处 `has()` 判断一起删除；脚本测试去掉 LabPage 断言并改名。
- 验证：`LabPage` grep 为 0；脚本测试 5/5；`check:frontend-tokens` 通过；typecheck 通过；test 文件 137 通过 / 1 已知失败，用例 999 通过（基线 1005，减去 lab-page 的 6 个）。

### T2：删除 ExploreRunBlock（R2）

- 删除 `R/components/messages/ExploreRunBlock.tsx`、`R/test/explore-run-block.test.tsx`。
- 验证：`ExploreRunBlock` grep 为 0；typecheck 通过；test 文件 136 通过 / 1 已知失败，用例 996 通过（减去 3 个）。

### T3：删除 Sheet（R3）

- 删除 `R/components/ui/Sheet.tsx`、`R/test/sheet.test.tsx`。`styles/tokens.css` 注释中的「Sheet」指抽屉这种形态，16 会用 Radix Dialog 提供，保留不改。
- 验证：`ui/Sheet` grep 为 0；typecheck 通过；test 文件 135 通过 / 1 已知失败，用例 989 通过（减去 7 个）。

### T4：删除 terminal-ipc（R4）

- 删除 `M/terminal/terminal-ipc.ts`，并删除 `tsconfig.electron.json` 中的文件条目。
- 验证：typecheck 通过（包括 electron tsconfig）；测试与 T3 一致。

### T5：删除空目录（R5）

- `rmdir` 删除 `R/pages`、`R/state`、`R/components/kairos`、`R/components/analysis`。删除前用 `ls -A` 确认四个目录都是空的。
- git 不跟踪空目录，所以没有提交内容；本条记录跟 T4 的提交放在一起。

### T6：删除 projection-ipc（R6、V7）

- 删除 `M/runtime-v2/projection-ipc.ts`、`M/test/runtime-v2-projection-ipc.test.ts`；`M/index.ts` 删掉 import、`disposeRuntimeV2Ipc` 的声明 / 注册 / dispose。
- `M/index.ts` 审批回调：删掉 `approvalRequired` 的 `webContents.send`（按 T0 结论没有监听方），以及只给它用的 `dto` 和 `RuntimeV2ApprovalRequest` 导入。审批卡片走的 `agentStream` 上的 `tool_approval_required` / `tool_approval_resolved` 不动。
- `registry.subscribe` 的监听只用于 `liveEvent` 转发，registry 的 `#listeners` 没有其他副作用，移除后事件缓冲（`replayLiveEvents`）照旧。
- `S/runtime-v2/desktop-ipc.ts`：删除 `RUNTIME_V2_DESKTOP_CHANNELS`、`RuntimeV2DesktopBridge`，以及 29 个随之在全仓变为 0 引用的输入 / 输出类型；保留仍被引用的 11 个类型，导入改为只引用需要的。文件保留，所以 `runtime-v2/index.ts` 的再导出和 `package.json` 的 `./runtime-v2/desktop-ipc` 子路径都不动。
  - 偏差记录：`./runtime-v2/desktop-ipc` 子路径在全仓 0 引用，但计划规定「整体删除文件时才删导出」，这里不删。
- 验证：`projection-ipc|registerRuntimeV2Ipc|RUNTIME_V2_DESKTOP_CHANNELS` grep 为 0；shared typecheck 通过；除 desktop 外 92 个包的 typecheck 全部通过；desktop typecheck 通过；test 文件 134 通过 / 1 已知失败，用例 988 通过（减去 1 个）。
- Electron 冒烟（审批卡片）：需要模型 key 才能触发真实工具审批，交给验收（见 handoff A 项）；T7 后统一做 CDP 启动检查。

### T7：删除 DESKTOP_SHELL 重复注册（R7）

- `M/runtime-v2/desktop-shell-ipc.ts`：删掉全部 `RUNTIME_V2_DESKTOP_SHELL_CHANNELS.*` 的 handle（工作区 / Review 10 个、终端 8 个、`capabilities` 1 个），以及 `reviewChanged` 双发中的 DESKTOP_SHELL 那一次；`terminalUnavailableReason` 选项只服务于 `capabilities`，一并删除（`M/index.ts` 不再传）。
- `M/index.ts`：删除 `terminalEvent` 双发中的 DESKTOP_SHELL 那一次和对应 import。
- `S/runtime-v2/desktop-shell.ts`：只剩常量和两个没人用的类型（`RuntimeV2DesktopShellCapabilities`、`RuntimeV2DesktopShellBridge`），整个文件删除，同时删掉 `runtime-v2/index.ts` 的再导出。这个文件没有 package.json 子路径导出，也没有 vite / vitest 别名。
- `M/test/runtime-v2-desktop-shell-ipc.test.ts` 改为断言 FIXED：终端不可用时，工作区和 Review 的 handler 已注册、`terminalCreate` 未注册、所有 handler 都在 `runtime-v2:fixed-renderer:` 命名空间，dispose 后清空。
- 验证：
  - `RUNTIME_V2_DESKTOP_SHELL_CHANNELS` grep 为 0（剩下的匹配只有 `registerRuntimeV2DesktopShell` 这个函数名）；除 desktop 外各包 typecheck 通过；desktop typecheck 通过；test 文件 134 通过 / 1 已知失败，用例 988 通过（数量不变，用例是改写不是删除）。
  - **CDP 冒烟（T6 + T7）**：`pnpm --filter @actspace/desktop build` 后用临时数据目录启动，通过 `window.actspace` 桥：
    - 终端：`createSession` → `createTerminal` → `attachTerminal` → `writeTerminal("echo FE10_SMOKE_$((40+2))")`，`onTerminalEvent` 收到 `attached`、`data`，输出包含 `FE10_SMOKE_42`；结束时 `closeTerminal`。
    - Review：`getReviewSnapshot` / `refreshReviewSnapshot`（默认工作区，`uncommitted`）都 `ok: true`；`onReviewChanged` 收到 1 次通知，说明只保留 FIXED 那一次发送后，渲染端仍能收到。
    - reload 后页面正常渲染（`screenshots/t7-after-reload.png`）；控制台只有已知的 CSP 警告；主进程日志只有 S0 时就有的 3 行 Chromium 磁盘缓存提示。
    - 审批卡片需要模型 key 才能触发，交给验收。

### T8：删除 Composer 死 prop（R8）

- 计划只列了 Composer 和 `App.tsx:2345`，实际这条死 prop 链更长（偏差，不改变结论）：
  - `onAgentFormChange`：App 从来不传给 WorkbenchLayout，WorkbenchLayout → ConversationView → Composer 只是逐层转发，Composer 不读。三层都删除。
  - `agentForm`：WorkbenchLayout 只声明了类型、没有解构；ConversationView 默认值是 `"agent"`，只转发给 Composer；Composer 不读。三层都删除。
  - `locked`：`ComposerExecutionContext.locked` 只由 App 写入，没有任何地方读取。删除类型字段、App 中的赋值，以及 `test/composer.test.tsx`、4 个 preview fixture 中的 `locked: true`。
  - 删除 `ComposerAgentFormSwitch` 类型；三个组件中只为它服务的 `MainAgentForm` import 一并删除。
- 验证：`ComposerAgentFormSwitch|onAgentFormChange` 在源码中 grep 为 0（只剩旧 `dist/` 产物）；typecheck 通过；test 文件 134 通过 / 1 已知失败，用例 988 通过，与 T7 相同。

### T9：删除 useSessionProjection（R9）

- 删除 `R/session/SessionProjectionContext.tsx` 中没有调用方的 `useSessionProjection`；`useOptionalSessionProjection` 有使用者，保留。`R/session/index.ts` 是 `export *`，不用改。（T9 提交时这句误写成「没有再导出」，在 T10 中更正。）
- 验证：typecheck 通过；测试与 T8 相同。

### T10：去掉 handleSend 中的裸块（R10）

- `App.tsx` 的 `handleSend` 中，`setCompactionFailureForSession(sessionId, null);` 之后有一个没有条件的 `{ … }` 块（原来分支删掉后留下的外壳）。删掉这对花括号，块内代码反缩进 2 格，并删掉 `}, [deps]` 前的空行。
- 删除前确认：块内声明的 `submitted`、`pendingKey`、`pendingStorage`、`previous`、`saved`、`serialized`、`submissionId`、`restore`、`attempt`、`result`、`snapshot`、`acceptedTaskId`，和外层作用域中的 `visibleSessionId`、`sessionId` 以及嵌套块里的 `created`、`result` 没有重名冲突。
- 验证：`git diff -w` 只显示删除的三行（`{`、`}` 和空行）；typecheck 通过；`vitest run app-` 8 个文件 / 76 用例全部通过；全量测试与 T9 相同（134 通过 / 1 已知失败，988 用例通过）。

### T11：fixtures 移出生产包（B1）

- `R/trajectory/index.ts` 删掉 `export * from "./fixtures"`。确认 fixtures 的导出（`loadTrajectoryFixture`、`loadTrajectoryFixtureFromUrl`、`trajectoryFixtureName`、`validateTrajectoryFixture`）在非测试代码中只有 `TrajectoryView.tsx` 一处使用，测试都直接从 `../trajectory/fixtures` 导入，不受影响。
- `R/components/TrajectoryView.tsx`：删掉静态 import；effect 保留原来的 DEV / test 守卫，守卫之后 `import('../trajectory/fixtures')`，用 `cancelled` 标志处理卸载竞态；主题覆盖的还原函数在 promise 里赋值，由 effect cleanup 调用。
- 小偏差：第一次改完后，有 2 个测试多出了 `not wrapped in act(...)` 警告。原因是没有 fixture URL 时，异步回调仍会执行 `setFixture(null)`。fixture 的初始值本来就是 null，所以改成只在加载到 fixture 时才 `setFixture`，行为不变，警告消失（改动前后都用 `git stash` 对比过，改动前没有这个警告）。
- 新增测试 `trajectory-render-view.test.tsx`「lazily loads the URL fixture and its theme override, restoring the theme on unmount」：设置 `?trajectoryFixture=complete&trajectoryTheme=dark`，用 `waitFor` 等 fixture 渲染出来，断言 `data-theme=dark`，unmount 后主题被还原。原有 7 个测试不需要改成 `waitFor`。
- 产物（`pnpm build:renderer`，主 index chunk）：

  | 时间点 | 文件 | 字节数 | 含 `mock-trajectory-session` |
  | --- | --- | --- | --- |
  | T0（计划开始前） | `index-Di4Y99yT.js` | 1,802,656 | 是 |
  | T11 改动前（T10 之后） | `index-YZTMW9kD.js` | 1,802,434 | 是 |
  | T11 改动后 | `index-BHeWkKf_.js` | 1,759,896 | 否 |

  改动后主 chunk 少了 42,538 字节。生产构建中守卫是常量 `false`，Rollup 直接去掉了动态 import，所以也没有单独的 fixture chunk：`grep -l "mock-trajectory-session" dist/assets/*.js` 没有任何命中，`.js` 文件总数仍是 63。
- 验证：typecheck 通过；`vitest run trajectory` 5 个文件 / 26 用例通过，没有 act 警告；全量测试 134 通过 / 1 已知失败，用例 989 通过（多了新增的 1 个）；`check:frontend-tokens` 通过。

### T12：同步 07 / 08

- 07：
  - 头部加执行状态说明；原来的「完成后本文档归档」改成「§2 的 D1–D17 全部删除后归档」，因为 D 项还没做。
  - §1 表新增「状态」列，R1–R10 都标为「已在 10 执行」。R1、R4、R6、R7、R8、R10 附上「10 执行时更正」，例如 Lab 入口保留、`tsconfig.electron.json` 条目、`approvalRequired` 发送端、`desktop-ipc.ts` 只缩减不整体删除、`capabilities`、死 prop 链的三层、行号漂移。
  - B1 后补执行结论；§5 表后补 V1（保留）、V7（引用为 0）的核实结论；§6 第 4 步标为已完成。
- 08 §2：删掉 chat-admission 那条（核实不存在），并在表后注明已在 10 执行。
- README 风险表（按 07 §6 第 4 步，计划 T12 没有单独列出）：两条 P2 划掉并标「已在 10 处理」。P1「三套 IPC channel 并行注册」也划掉，因为 DESKTOP / DESKTOP_SHELL 已删除，只剩 FIXED。
- 验证：`pnpm check:current-docs` 通过，没有新增断链。

### 收尾：复核与回归

- **全部验证命令**（计划「验证方式」）：
  - shared typecheck 通过；desktop typecheck 通过。
  - desktop test：文件 134 通过 / 1 已知失败 / 1 跳过；用例 989 通过 / 1 已知失败 / 2 跳过。
    - 与 00 基线（文件 138 / 1 / 1，用例 1005 / 1 / 2）对比：少了 4 个测试文件（lab-page、explore-run-block、sheet、runtime-v2-projection-ipc），用例净减 16（删除 17 个，T11 新增 1 个）。
    - 计划写的是「减少 5 个」，把 T7 改写的那个也算进去了。那个文件是改写不是删除，所以实际是 4 个。
  - `check:frontend-tokens` 通过；`node --test scripts/test/frontend-design-tokens.test.mjs` 5 / 5 通过；`check:current-docs` 通过。
- **Electron 最终冒烟**（完整 `build`，临时 `ACTSPACE_DATA_DIR`）：
  - 主窗口正常渲染（`screenshots/final-main.png`）。
  - 桥接终端：`attached`、`data` 事件都收到，输出包含 `FE10_FINAL_42`。
  - Review 快照和刷新都 `ok: true`，`onReviewChanged` 收到 1 次。
  - 打开轨迹面板：`trajectory-view` 渲染出空状态（`screenshots/final-trajectory.png`）。
  - 设置页正常（`screenshots/final-settings.png`）。
  - 主进程日志只有已知的 4 行 Chromium 磁盘缓存提示，没有新错误。
  - 侧栏没有可点击的 Lab 入口：`SidebarView` 的 `"lab"` 只在 WorkbenchLayout 中渲染占位页，没有按钮会切换到这个视图。S0 时就是这样，Sidebar 在本计划中没有改动，不算回归。
- **Sonnet 只读复核**：结论是没有阻塞项。
  - 范围：没有碰 D1–D17、V2–V6 和 preview harness；T6、T7、T8、T12 中超出计划字面范围的改动，都已在本记录中说明。
  - grep 门槛：全部为 0；旧 channel 前缀字面量也为 0。
  - 正确性：审批流事件仍走 RuntimeStreamEvent → FIXED；`handleSend` 的 `diff -w` 只有花括号。
  - 建议项及处理（随收尾提交）：
    - `05` 第 27 行「LabPage / Sheet，将删除」改为「已在 10 删除」。
    - `scripts/check-frontend-design-tokens.mjs` 删掉 T1 留下的悬空注释「v1 遗留页…」。
    - README D6 标注「已在 10 删除」。
    - 本记录补上结束时间。
  - 我另外补充的处理：
    - `01` P1-2 方案后注明第 1、2 步已在 10 执行。
    - `docs/learnings/2026-05/agent-transparent-inspection-via-sheet.md` 中「完整版见 Sheet.tsx」改为「原在…已删除，可从 git 历史查看」。
  - `04` 第 14 行的 channel 统计属于现状描述，由 13 在改写 preload 契约时更正，这里不动。
  - 审批卡片需要模型 key 才能触发，仓库里也没有测试覆盖，交给验收（交接文档 A1）。
- **学习沉淀**：命中「可迁移」和「有陷阱」两条，写了 `docs/learnings/2026-10/20261006-dev-only-code-out-of-bundle.md`，讲 DEV 守卫和静态 import 的关系，以及改成异步 effect 后的三个连带问题。
