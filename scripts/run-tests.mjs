// `pnpm test`：每一段都跑完再汇总，有一段失败就以 1 退出。
// 原来是 `pnpm test:scripts && pnpm -r --if-present test`：脚本测试失败时各包测试不跑，一个包失败时其余的包不跑，
// 一轮只能看到第一个失败，改完一处要把整套重跑一遍才知道下一处。
// 不用 `pnpm run --sequential --no-bail "/正则/"` 串这两段：pnpm 10.33 下它会把每一段都跑完，但有段失败时仍以 0 退出。
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSteps } from "./run-steps.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

process.exitCode = await runSteps([
  { name: "仓库脚本与进程级测试", command: "pnpm test:scripts" },
  // --no-bail：一个包失败后其余的包照常跑完，pnpm 在结尾列出失败的包，退出码仍然非 0。
  { name: "各包测试", command: "pnpm -r --no-bail --if-present test" },
], { cwd: repoRoot });
