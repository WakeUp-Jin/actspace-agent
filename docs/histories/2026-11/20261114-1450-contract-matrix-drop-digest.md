## [2026-11-14 14:50] | Task: 契约矩阵生成文档去掉头部 digest

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 看看这个任务继续吧，第一步的 97 和 98 两个 PR 已经做完了。（上一轮列出的整理清单第 1 项：契约矩阵生成文档头部的 digest 按 155 个源文件的全文计算，只改注释也会让它过期。）

### 🛠 Changes Overview

**Scope:** `scripts/contract-matrix/`、`scripts/test/`、`docs/design-docs/agent-plugin-runtime/`

**Key Actions:**

- **生成器**：`scripts/contract-matrix/generate.mjs` 渲染 Markdown 时不再写 `source digest`，头部只留生成器版本。`sourceDigest` 仍然计算，写进本地的 `artifacts/agent-contract-matrix.json`（不入库）并打印在命令输出里，校验器对它的格式检查不变。
- **生成文档**：重新生成 `agent-contract-matrix.generated.md`，只有头部这一行变化。
- **测试**：`scripts/test/contract-matrix.test.mjs` 原来的过期反例是「往 manifest 末尾加一行注释，`--check` 必须失败」，靠的就是 digest。现在分成两条：加注释后 `--check` 仍然通过；给一个包的 `package.json` 加一条 exports 后 `--check` 失败。另加一条断言：渲染出的 Markdown 里没有 digest。
- **文档**：[契约矩阵生成与检查边界](../../design-docs/agent-plugin-runtime/agent-spec-contract-matrix-generation.md)写明哪些改动需要重新生成、digest 为什么不进提交的文档；`docs/CICD.md` 里 `lint-typecheck` 的说明同步；[Provider seam 与契约矩阵](../../learnings/2026-08/provider-seam-and-contract-matrix.md)的常见陷阱补一条。

### 🧠 Design Intent (Why)

`--check` 本来就是重新生成后和已提交的 Markdown 整份比对，矩阵的每一格都来自声明，声明变了内容就变。头部的 digest 在这之上只多检查了一件事：源文件里声明以外的字节有没有变，也就是注释和实现代码。这件事和矩阵内容无关，却带来两种成本：

- 改一行注释，CI 的 `gen:contract-matrix --check` 就报过期，要重新生成、再推送一次。2026-11-07 到 11-12 `main` 上有 14 次合入重新生成过矩阵，其中 7 次只变了 digest 这一行；#98 第一次推送也是这样红的。
- 两个都重新生成过的 PR 必然在这一行冲突。

digest 留在 JSON 里，是因为它不入库、不参与比对，留着不产生上面的成本。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：无。新用例在旧生成器下会失败（注释用例退出码 1、Markdown 含 digest），在新生成器下通过。
- **遗留**：未合并的 #95、#100、#101 各自重新生成过矩阵，头部还带 digest。它们和这个改动谁后合并，谁就在头部这一行冲突一次，重新跑 `pnpm gen:contract-matrix` 即可，之后不再有。#100 还改了同一份测试文件和生成规范的其他行，没有重叠。

### 📁 Files Modified

- `scripts/contract-matrix/generate.mjs`
- `scripts/test/contract-matrix.test.mjs`
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-contract-matrix-generation.md`
- `docs/CICD.md`
- `docs/learnings/2026-08/provider-seam-and-contract-matrix.md`
