## [2026-11-09 15:00] | Task: lint 债务第五批——noNonNullAssertion 删掉 747 处多余的 `!`，剩余不变量断言关闭规则

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 那么我们继续任务吧，还有 B 和 C（C = `noNonNullAssertion` 1892 处）

### 🛠 Changes Overview

**Scope:** `biome.jsonc`、`docs/coding-standards/lint-conventions.md`，267 个 ts / tsx 文件（desktop 127、web 15、packages 125），每处改动都只是删掉一个 `!`

**Key Actions:**

- 1892 处 = 产品代码 543 + 测试 1349。仓库任何一个 tsconfig 都没开 `noUncheckedIndexedAccess`，所以 `arr[i]!`、`obj[key]!`、`match[1]!`、`stat.turn_count!` 这类断言对 tsc 是空操作，纯粹是噪音。
- 用 TypeScript LanguageService 写了一次性脚本（放 `/tmp`，不入库）逐处试删：按包读 tsconfig 建工程，把 Biome 报出的每个 `!` 从后往前删，删后该文件的错误集合（`code@line`）没有新增就保留删除，否则还原。产品代码删 216 处、测试删 531 处，共 747 处；两个 commit 分开（产品 / 测试）。
- 不在任何 tsconfig include 里的测试文件（`tsconfig.package.json` 排除了 `src/**/test`，desktop 的 `tsconfig.electron.json` 是显式文件列表）临时并入所在包的工程判定，避免「没人 typecheck 就可以乱删」。
- 剩下 1145 处（产品 327、测试 818）每一处都是删掉就报 `possibly undefined` 的真断言，抽样核对全部在表达 tsc 看不见的不变量：`if (map.has(k)) map.get(k)!`、`length > 0 ? arr.shift()!`、`ids.at(-1)!`（前一行刚判过 `ids.length`）、`for (const char of text) char.codePointAt(0)!`、闭包里已经赋值过的局部变量 `socket!` / `writer!`。改成 `?.` 或抛错是改行为，不在 lint 清理范围内。
- 规则关闭，原因写进 `biome.jsonc`；`lint-conventions.md` 的 warn 层清空，`!` 的写法约束改为文字约定：索引访问不写 `!`，`!` 只用于同一函数里看得出来的不变量。

### 🧠 Design Intent (Why)

- 为什么不升 error 而是关：和 `noAssignInExpressions` / `noArrayIndexKey` 同一类判断——剩余命中全部有意，没有一个「不靠注释就能表达」的替代写法，1145 个 `biome-ignore` 比关规则更差。
- 为什么不用 `--write --unsafe`：Biome 的修复是把 `x!.y` 改成 `x?.y`，会改行为；本次要的是「删掉多余的」，只有 tsc 能判定哪些多余。
- 脚本的 LanguageService host 一开始没传 `realpath`，pnpm 符号链接下部分 import 解析不到、变成 `any`，导致试删时「没报错」而过度删除（`vi.fn` 返回值的 `.mock.calls[0]![0]` 被删后 tsc 实际会报 `possibly undefined`）。补 `realpath` 后重跑，并以根级 `tsc` 复核。

### ✅ Verification

- `pnpm lint`：0 error；`biome lint --only=style/noNonNullAssertion` 剩 1145 处，全部是真断言。
- `pnpm -r typecheck`（除 `apps/site` 的 `astro check` 本地交互卡住外）75 个包全部通过。
- 抽跑 `@actspace/desktop-app` 测试 28 用例通过；`!` 只影响类型层，esbuild 转译后无运行时差异。

### 📁 Files Modified

- `biome.jsonc`
- `docs/coding-standards/lint-conventions.md`
- `apps/desktop/src/**`（127 个）、`apps/web/src/**`（15 个）、`apps/site/src/**`、`packages/**/src/**`（125 个）：仅删除 `!`
