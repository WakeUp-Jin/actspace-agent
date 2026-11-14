## [2026-11-14 16:45] | Task: `@actspace/python-runtime` 的 locate 用例不再依赖跑测试的机器

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （接上一轮文档减负的汇报）继续。汇报里这一项是：`@actspace/python-runtime` 的 locate 用例在 Mac 上必然失败，全量测试因此要多跑几遍。

### 🛠 Changes Overview

**Scope:** `packages/shell/python-runtime/src/test/python-runtime.test.ts`（只改测试）

**Key Actions:**

- **原因**：用例里 `runtime.json` 的 target 取自跑测试的机器，断言却写死 `loadPythonRuntime(root, "linux", "x64")`。在 linux-x64 以外的机器上 target 对不上，返回 `undefined`，断言「shim 路径等于…」失败。跑测试的 workflow 全在 ubuntu 上，一直是绿的。
- **显式平台的断言**：manifest 固定成 linux-x64，每次调用都传 `"linux", "x64"`，结果不再取决于跑测试的机器。
- **`findBundledPythonRuntime`**：它不接受平台参数，只能按主机来。拆成单独一个用例，按主机的 target 摆放解释器和 shim（Windows 是 `python.exe` 和 `actspace-python.cmd`）；主机没有对应 target 时跳过。
- 原来 Windows 上在断言之前就 `return`，现在两个用例在 Windows 上都会跑完。

### 🧠 Design Intent (Why)

没有改 `locate.ts`。`loadPythonRuntime` 用参数里的平台决定 target 和 shim 文件名，用 `process.platform` 决定要不要检查可执行位，这两处各管各的：前者是「这份运行时给谁用」，后者是「这台机器的文件系统有没有可执行位」。问题只在测试把两种来源混在了一起。

没有给 `findBundledPythonRuntime` 加平台参数来方便测试：生产代码里它只按本机查找，为测试加参数会多出一条没人用的路径。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：没有在真实的 Mac 或 Windows 上跑。验证方法是在 Linux x64 上用 vitest 的 setup 文件改写 `process.platform` / `process.arch` 再跑这个包的测试：改之前 `darwin/arm64`、`darwin/x64`、`linux/arm64` 三种都复现了同一个失败（`expected undefined to be '…/shim/actspace-python'`），改之后这三种加 `win32/x64` 共 10 个用例全过，`win32/arm64`、`freebsd/x64`（没有对应 target）是 9 过 1 跳过。伪造的 `win32` 只覆盖到 target 推导、shim 文件名和「不查可执行位」这三处逻辑，路径分隔符仍是 Linux 的。
- **遗留**：
  - `ci.yml` 的测试 job 全在 `ubuntu-latest` 上，依赖主机平台的用例在别的系统上坏了不会被发现。这次没有加 macOS 的测试 job（会多占 runner，要不要加由 CI 提速那条线一起权衡）。
  - 包的 `tsconfig.json` 排除了 `src/test`，`pnpm typecheck` 不检查测试文件。这次另外用一份临时 tsconfig 把测试文件纳入检查，通过。

### 📁 Files Modified

- `packages/shell/python-runtime/src/test/python-runtime.test.ts`
