## [2026-11-08 21:30] | Task: apps/desktop 开启 TypeScript strict

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `Claude Fable 5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> Desktop 是全仓唯一关了 strict 的代码：`apps/desktop/tsconfig.json` 和 `tsconfig.electron.json` 都是 `"strict": false`，而 base、web、cli、所有 packages 都是 strict。实际开 `--strict` 跑一遍：renderer 116 个、main 22 个，合计 138 个错误，其中 48 个集中在 `app-streaming-user-message.test.tsx`，生产代码约 60 个，以 TS2322（null 混入 undefined）、TS18047（possibly null）为主。一次 PR 能收掉，这个是不是可以优化一下？

### 🛠 Changes Overview

**Scope:** `apps/desktop`（tsconfig、main、renderer、renderer 测试）

**Key Actions:**

- **开启 strict**：`apps/desktop/tsconfig.json` 与 `tsconfig.electron.json` 的 `strict` 改为 `true`，与 `tsconfig.base.json` 和其余 app / package 对齐。`pnpm run typecheck` 在两份 tsconfig 下都为 0 错误。
- **main 进程（22 处）**：
  - `DesktopRuntimeV2ApprovalRequest.sessionId` / `agentRunId` 改为必填：唯一生产者 `approval-broker` 总是提供，上游 `ApprovalRequest` 也是必填，原来的 `?` 只是让下游多判一次空。
  - `fixed-renderer-ipc.ts` 新增 `showOpenDialog` 辅助：主窗口已关闭时走无父窗口重载，而不是把 `undefined` 传给 `dialog.showOpenDialog(window, …)`（Electron 类型不接受）。
  - `index.ts` 新增 `getMainWindowOrNull`，给要求返回 `BrowserWindow | null` 的 IPC 注册函数用，不再混用 `undefined`。
  - `browser-bridge-service.ts` `DoctorJson.checks` 改为必填，`JSON.parse` 结果按 `Partial<DoctorJson>` 解析。
  - `model-connections-service.ts` `removeKeysPatch`：合并时 `null` 表示删 key，但 `SettingsV4Models` 字段类型没表达这一点，改为经 `unknown` 断言并加注释说明。
  - settings 下的 `defaults.ts`、`facades/general.ts`、`migrations.ts`、`sanitize.ts` 以及 `provider-network-service.ts` 为 null / undefined 补守卫或显式类型。
- **renderer 生产代码**：
  - `SplitView.tsx`：拖拽 effect 把 `dragState` 守卫后固定到 `drag` 常量，嵌套函数不再读可能为 null 的闭包变量。同时顺手修正 `blur` 监听：原来直接挂 `endDrag`，`blur` 事件的 `pointerId` 永远不等于拖拽的 `pointerId`，所以窗口失焦时从不结束拖拽；现在用 `handleBlur = () => endDrag()`。
  - `ComposerInput.tsx`：`measureInput` 从函数声明改为箭头函数，保留 `input` / `body` 的非空收窄；`inputRef` 类型改为 `RefObject<HTMLTextAreaElement>`。
  - `use-harness-stats.ts`：`ValueOf<K>` 从 `Extract` 条件类型改为按 `kind` 建映射类型，TS 能直接把 `data` 赋给 `ValueOf<K> | null`，去掉断言。
  - `ApprovalParts.tsx`、`ReviewWorkspace.tsx`、`use-session-transcript.ts`、`composer-run-context.ts`、`use-composer-draft.ts`、`mock/handlers.ts`、`mock/mock-db.ts`、`mock/scenarios/background-tasks.ts`、`trajectory/fixtures.ts`：null / undefined 对齐、可选入参给默认值、删掉对非空字段的死 null 判断。
- **renderer 测试**：
  - `test/helpers/bridge.ts` 的 `BridgeOverrides` 改为方法签名（双变参数检查），测试 stub 可以把事件监听器 payload 写得更宽松、把可选入参写成必填，这正是 `strict: false` 下原本的语义，一次性消掉大部分测试错误，不用逐个改测试。
  - `test/task-host-fixture.ts`：参数类型从 `Record<string, any>` 改为 `FixtureOptions & BridgeOverrides`（原来会让回调参数隐式 any）；新增 `FixtureRunResult`，允许用例给 `contextSnapshot` / `contextState` 写 null。
  - 其余测试文件按点修：`this` 显式标注、`as unknown as` 替代直接断言、`?.` 补空值访问等。

### 🧠 Design Intent (Why)

- Desktop 是直接面向用户的进程，却是唯一没有 `strictNullChecks` 的代码；错误总量 138 个、生产代码约 60 个，一次性收掉比分批开子选项更省沟通成本。
- 优先用类型收紧（如 approval request 字段必填、`DoctorJson.checks` 必填、映射类型）消错误，而不是到处补 `!` 或 `as`；只有在类型系统确实表达不了语义（settings patch 的 null-删除）时才用 `as unknown as` 并写明原因。
- 测试 stub 走 `BridgeOverrides` 的双变放宽，是为了让 strict 的收益集中在生产代码，测试写法保持原样。

### 📁 Files Modified

- `apps/desktop/tsconfig.json`、`apps/desktop/tsconfig.electron.json`
- `apps/desktop/src/main/index.ts`、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`apps/desktop/src/main/runtime-v2/host-ports.ts`
- `apps/desktop/src/main/browser-bridge-service.ts`、`apps/desktop/src/main/model-connections-service.ts`、`apps/desktop/src/main/runtime-v2/provider-network-service.ts`
- `apps/desktop/src/main/settings/defaults.ts`、`facades/general.ts`、`migrations.ts`、`sanitize.ts`
- `apps/desktop/src/renderer/components/SplitView.tsx`、`components/composer/ComposerInput.tsx`、`components/harness-stats/use-harness-stats.ts`、`components/messages/ApprovalParts.tsx`、`components/review/ReviewWorkspace.tsx`
- `apps/desktop/src/renderer/mock/handlers.ts`、`mock/mock-db.ts`、`mock/scenarios/background-tasks.ts`、`session/use-session-transcript.ts`、`trajectory/fixtures.ts`
- `apps/desktop/src/renderer/test/helpers/bridge.ts`、`test/task-host-fixture.ts`、`test/app-streaming-user-message.test.tsx` 及其他若干测试文件
