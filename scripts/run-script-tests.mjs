// `pnpm test:scripts` 的测试部分：一次 `node --test` 跑完 scripts/test/ 下的测试文件，文件之间并行。
// 逐个 `test:*` 脚本串行跑时，两个各带 31 s 固定等待的进程级测试排着队，整条链要 80 s 以上；
// 并行后总时长约等于那一段等待。新增的 scripts/test/*.test.mjs 自动包含在内，不用再登记到 package.json。
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 由 `pnpm test:agent-cli:process` 在 Agent CLI 工作流里按 CLI 支持的最低 Node 版本单独跑。 */
const EXCLUDED = new Set(["agent-cli-process.test.mjs", "agent-cli-safety.test.mjs"]);
/** 各有一段写死的 31 s 等待。排在最前，让它们先占住两个并发槽睡眠，其余文件在剩下的槽里跑完。 */
const SLOW_FIRST = ["harness-recovery-process.test.mjs", "host-receipt-process.test.mjs"];

const files = readdirSync(join(repoRoot, "scripts", "test"))
  .filter((name) => name.endsWith(".test.mjs") && !EXCLUDED.has(name))
  .sort();
const ordered = [...SLOW_FIRST.filter((name) => files.includes(name)), ...files.filter((name) => !SLOW_FIRST.includes(name))];

// 睡眠中的两个文件不占 CPU，所以 4 核及以下也给 4 个并发槽；核更多时沿用 node 的默认值（核数 - 1）。
const concurrency = Math.max(4, availableParallelism() - 1);
const result = spawnSync(
  process.execPath,
  ["--test", `--test-concurrency=${concurrency}`, ...ordered.map((name) => join("scripts", "test", name))],
  { cwd: repoRoot, stdio: "inherit" },
);
process.exit(result.status ?? 1);
