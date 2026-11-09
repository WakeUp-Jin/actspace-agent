## [2026-11-09 12:00] | Task: lint 债务第三批——六条小规则清零或定性，useIterableCallbackReturn 升为 error

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> a（选择「一批小规则一次清零」：`useIterableCallbackReturn` 68、`noArrayIndexKey` 38、`noAssignInExpressions` 36、`useImportType` 31、`useOptionalChain` 23、`noConfusingVoidType` 23）

### 🛠 Changes Overview

**Scope:** `biome.jsonc`、`docs/coding-standards/lint-conventions.md`，以及约 100 个源文件的机械改动

**Key Actions:**

- `useImportType`（31）：`biome lint --write` 安全修复，`import { X }` 只在类型位置使用的改成 `import type { X }` / `import { type X }`。
- `useOptionalChain`（23）：`--write --unsafe` 修复，`!m || m.status !== "wait"` → `m?.status !== "wait"` 一类。逐条核对语义等价；唯一需要手改的是 `apps/desktop/src/renderer/test/helpers/reply-text.ts`，优化后表达式类型从 `boolean` 变成 `boolean | undefined`，补 `=== true`。
- `useIterableCallbackReturn`（68）：全部是 `forEach(x => f(x))` 表达式体，Biome 把它当成「回调返回了值」。用脚本按诊断位置把表达式体包成 `x => { f(x); }`，语义不变；规则升为 `error`，之后 `map` / `filter` 漏 `return` 能被拦住。
- `noConfusingVoidType`（23）：21 处是 `(…) => Handlers | void`、`Promise<Value | void>` 这种「回调可以不返回」的返回类型。试过改成 `| undefined`，tsc 立刻在 15 处要求每个分支显式 `return`（`TS2355` / `TS2322`），和 React 自己的 `EffectCallback = () => void | Destructor` 是同一种写法。撤销改动，规则关闭并写明原因。
- `noAssignInExpressions`（36）：全是 `x ??= init`、`(map[k] ??= []).push(v)`、`return this.#closing = (async () => …)()` 惰性初始化 / 记忆化，以及两处 `while ((offset = indexOf(…)) !== -1)`、`new Date(time += 1000)`。没有一处是 `if (a = b)` 手误。规则关闭。
- `noArrayIndexKey`（38）：命中的是 diff 行、语法 token、文本片段、图表坐标标签、Fragment 分段这类没有稳定身份也不会重排的派生列表，index 是正确的 key；带 `${item}-${index}` 的写法 Biome 同样会报，所以不存在「满足规则的等价写法」。有身份的数据（message、session、tool call）本来就用 id。规则关闭。
- `docs/coding-standards/lint-conventions.md` 规则分层同步：error 加 `useIterableCallbackReturn`，warn 只剩 `useExhaustiveDependencies` / `noNonNullAssertion`，off 补三条并说明核对结论。

### 🧠 Design Intent (Why)

- 「清零一条升一条」不等于每条规则都要改代码满足它。六条里三条逐处核对后结论是「规则与仓库有意的写法冲突」，这种情况下关掉并把理由留在 `biome.jsonc` 比加几十个 `biome-ignore` 或把代码改得更差要诚实。
- `useIterableCallbackReturn` 留着是因为它的另一半（`map` 没 `return`）是真 bug；代价是 `forEach` 一律写块语句，这条约定写进了规范。
- 全部改动都不改运行时行为：`import type` 只影响类型擦除；可选链替换逐条核对了 null / undefined / 空串三种输入下的真值；`forEach` 忽略回调返回值。

### 📁 Files Modified

- `biome.jsonc`
- `docs/coding-standards/lint-conventions.md`
- `apps/desktop/src/renderer/test/helpers/reply-text.ts`
- 约 100 个仅做 `import type` / 可选链 / `forEach` 块语句机械改动的源文件（见 PR diff）
