## [2026-11-08 22:30] | Task: 清零 noUnusedVariables / noFloatingPromises 并升为 error

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> `pnpm lint:report` 里约 2480 条 warning，noUnusedVariables 26、noFloatingPromises 10……那你帮我修复一下吧。

### 🛠 Changes Overview

**Scope:** `biome.jsonc`、`apps/desktop`、`packages/*`、`browser-bridge/apps/chrome-extension`、`scripts/`、`docs/coding-standards`

**Key Actions:**

- `noUnusedVariables`（26 处）全部清零：删掉无人引用的 `turnStarts`、`findWorkspaceOption`、`bigContext`、`protocols` 和 5 份 `node-ports.test.ts` 里复制粘贴来的 `waitFor`；三个工具包测试里只为建临时目录却从不使用的 `workspace()` 脚手架整段移除；`catch (error)` 不用 `error` 的改成 `catch {}`；测试里解构出来没用的 `container`、`root`、`task`、`requests`、`body` 去掉。
- `noFloatingPromises`（11 处）全部清零：测试里漏掉的 `await` 补上（`setObservation`、`createDisclosureSource().get`、`assertNoDeepImports`）；`coordinator.test.ts` 故意不等待 `accept()` 来验证写入顺序，显式写成 `void coordinator.accept(...)`；`harness-generations.ts` 后台回收 `#collect()` 内部已经观察 rejection，调用处写 `void`；Chrome 扩展 `background.js` 两条 `handleNativeRequest(...).then(...)` 链补上 `.catch`，一条记日志、一条把错误通过 `sendResponse(fail(...))` 回给页面。
- `biome.jsonc`：`correctness.noUnusedVariables` 和 `nursery.noFloatingPromises` 升为 `error`，从此阻塞 CI。
- `docs/coding-standards/lint-conventions.md` 规则分层同步：两条规则从 warn 列表移到 error 列表，并写明 `noFloatingPromises` 类型推断不完整、故意不等待要写 `void`。

### 🧠 Design Intent (Why)

- 债务按「清零一条升一条」推进，先做纯清理、不改行为的两条，剩余 warning 从约 2480 降到约 2440；`noExplicitAny`、`useExhaustiveDependencies`、`noNonNullAssertion` 需要逐处判断，留待后续。
- `void promise` 只用在「调用方明确不关心结果、且被调用方自己处理了 rejection」的位置；否则补 `await` 或 `.catch`，不用 `void` 掩盖问题。
- 删 `workspace()` 脚手架而不是保留 `root`：这几个测试根本不读写磁盘，留着只会每次建一个空临时目录再删。

### 📁 Files Modified

- `biome.jsonc`
- `docs/coding-standards/lint-conventions.md`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/main/test/custom-connection-protocol.test.ts`
- `apps/desktop/src/main/test/remote-host-session-cache.test.ts`
- `apps/desktop/src/renderer/test/app-message-queue.test.tsx`
- `apps/desktop/src/renderer/test/composer.test.tsx`
- `browser-bridge/apps/chrome-extension/src/background.js`
- `packages/composition/boot/src/harness-generations.ts`
- `packages/context/context-disclosure/src/test/disclosure.test.ts`
- `packages/core/runtime/src/session/session-controller.ts`
- `packages/core/runtime/src/session/session-projection.test.ts`
- `packages/core/tool-runtime/src/prepared-execution.ts`
- `packages/fs/tool-fs-read/src/test/node-ports.test.ts`
- `packages/fs/tool-fs-search/src/test/node-ports.test.ts`
- `packages/image/tool-image-generation/src/test/node-ports.test.ts`
- `packages/image/tool-image-inspection/src/test/node-ports.test.ts`
- `packages/session/session-persistence/src/test/coordinator.test.ts`
- `packages/web/tool-web/src/test/node-ports.test.ts`
- `scripts/package-agent-cli.mjs`
- `scripts/test/fixtures/agent-provider.mjs`
- `scripts/test/host-blocked-process.test.mjs`
- `scripts/test/host-subagent-drain-process.test.mjs`
