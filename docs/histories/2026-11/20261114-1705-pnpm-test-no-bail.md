## [2026-11-14 17:05] | Task: `pnpm test` 一处失败不再挡住后面的测试

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （接上一轮文档减负的汇报）继续。汇报里这一项是：`pnpm test` 是一条串联命令，一步失败后面都不跑，那次会话的全量测试跑了 4 次才跑全。

### 🛠 Changes Overview

**Scope:** 根 `package.json` 的 `test` 和新增的 `test:run-steps`；新文件 `scripts/run-tests.mjs`、`scripts/run-steps.mjs`、`scripts/test/run-steps.test.mjs`；`docs/CICD.md`、`docs/design-docs/agent-plugin-runtime/agent-testing.md`

**Key Actions:**

- **`pnpm test`**：原来是 `pnpm test:scripts && pnpm -r --if-present test`，现在是 `node scripts/run-tests.mjs`。它依次跑 `pnpm test:scripts` 和 `pnpm -r --no-bail --if-present test`，前一段失败后一段照跑，结尾列出每一段是通过还是失败，有失败就以 1 退出。
- **各包测试加 `--no-bail`**：一个包失败后其余的包照常跑完，pnpm 在结尾列出所有失败的包。
- **`scripts/run-steps.mjs`**：「挨个跑完、最后汇总」的那一段。单独放一个文件是为了能测：测试直接 import 它，用几条真实的小命令验证。
- **测试**：`scripts/test/run-steps.test.mjs` 三条：失败的一步不拦后面的步骤；全部通过才返回 0；被信号杀掉的一步算失败，后面照跑。`scripts/run-script-tests.mjs` 会自动把它带进 `pnpm test:scripts`；另按现有惯例在 `package.json` 里登记了单独跑它的 `test:run-steps`。
- **文档**：`docs/CICD.md` 里 `pnpm test` 的组成；`agent-testing.md` 的「默认验证顺序」下加一句：一轮看全失败，修的时候只重跑失败的包或文件，都修完再整套跑一次。

### 🧠 Design Intent (Why)

原来的写法有两层「遇错即停」：`&&` 让脚本测试失败时各包测试根本不开始；`pnpm -r` 默认在第一个失败的包上停下。一轮只能看到一个失败，修完重跑才看到下一个。之前的性能任务和 CI 提速任务都是手敲 `pnpm -r --no-bail test` 来绕开它。

用 Node 脚本而不是 pnpm 自带的写法：`pnpm run --sequential --no-bail "/正则/"` 能把几个脚本都跑完，但 pnpm 10.33 下有脚本失败时它仍以 0 退出，不能用。`pnpm -r --no-bail` 没有这个问题，失败时退出码是 1。

没有把 `test:scripts` 里的五条 `check:*` 拆成各自一步：审查修复那一串 PR 正在往这一行里加检查，这里接管这份清单的话，两边合并时容易把对方加的检查丢掉。

没有在跑测试前自动构建：`pnpm test` 原来就不构建，加上会让每次都多等一段。

### Unverified & Leftovers（未验证与遗留）

- **对照**：在同一份工作区里临时加一条必定失败的脚本测试和 `@actspace/python-runtime` 里一条必定失败的用例（验证完已删），连同这台机器上本来就失败的 `packages/core/tool-runtime`，一共三处失败：
  - 新命令一轮 4 分 01 秒：135 个脚本用例跑完（129 过、1 败、5 跳过），73 个包都跑完（71 过 2 败），结尾列出两段都失败和两个失败的包，退出码 1。
  - 原来的命令 42 秒后停在脚本测试，各包测试没有开始。单跑它的后半段，1 秒后停在 `python-runtime`，73 个包只启动了 6 个，`tool-runtime` 的失败没有露出来。
- **不带临时失败的整轮**：3 分 58 秒，脚本测试通过（134 个用例，129 过 5 跳过），各包测试 71 过 2 败，退出码 1。两个失败都不是这次引入的，前面两次执行记录里都提到过，审查修复那一串里的 [#85](https://github.com/WakeUp-Jin/actspace-agent/pull/85) 都在修，这里没有动：
  - `packages/core/tool-runtime` 的 `runtime.test.ts` 三条：这台机器上有 `/workspace` 目录，技术债表里登记过。
  - `packages/session/session-persistence-jsonl` 的 `refresh.test.ts`「same-size rewrite falls back to a full read」：上一轮通过，这一轮失败；机器空闲时单独跑这个文件，20 次失败 19 次。这台机器的文件时间戳 4 ms 一跳，等长的改写落在同一跳里时，`refresh` 用来判断的那串 stat 值不变（连着写 2000 次，1994 次不变）。
- **未验证**：没有在 macOS 和 Windows 上跑。脚本只用了 `spawn(命令, { shell: true })`；「被信号杀掉」那条测试在 Windows 上跳过。
- **遗留**：
  - `test:scripts` 里五条 `check:*` 之间仍是 `&&`，前一条失败后面的检查和脚本测试不跑；这一段在汇总里记为失败，各包测试照跑。
  - 没有先构建就跑时（缺 `apps/cli/dist` 或各包的 `dist`），消费构建产物的测试会失败，其余的照常跑完。
  - CI 的「包测试」是直接调 `pnpm -r … test`，仍然遇错即停。`main` 上现在有偶发失败的用例（[#83](https://github.com/WakeUp-Jin/actspace-agent/pull/83) 在修），红的那次运行里总有几个包没跑到：[#105](https://github.com/WakeUp-Jin/actspace-agent/pull/105) 那次 72 个包只启动了 64 个。给它加 `--no-bail` 是一个词的改动，这次没有动 CI。

### 📁 Files Modified

- `package.json`
- `scripts/run-tests.mjs`
- `scripts/run-steps.mjs`
- `scripts/test/run-steps.test.mjs`
- `docs/CICD.md`
- `docs/design-docs/agent-plugin-runtime/agent-testing.md`
