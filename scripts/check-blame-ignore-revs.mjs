// .git-blame-ignore-revs 检查。
// 这个文件列出只改排版、或只做机械改名的提交，git blame 会跳过它们
// （说明见 docs/coding-standards/lint-conventions.md 的「格式化」）。
// 它有两种坏法，都不容易被发现：
//   - 写了缩写的哈希：配置过 blame.ignoreRevsFile 的克隆里，git blame 直接报 invalid object name，谁都用不了；
//   - 写了历史里没有的哈希（记完哈希又改写了分支，或者 PR 被 squash、rebase 合并，哈希换了）：
//     git 不报错，只是不再跳过那个提交，这个文件等于没写。
//
// 查四件事：
//   1. 每个非空、非注释的行是一个完整的 40 位小写十六进制哈希，行内没有别的内容；
//   2. 哈希不重复；
//   3. 每个哈希的上一行是注释（写明这个提交是什么、怎么复现）；
//   4. 每个哈希都是 HEAD 的祖先提交。
// 第 4 条要完整的提交历史。浅克隆里看不到，默认跳过并说明；
// 加 `--require-history` 时，历史不完整就失败（CI 用，检出配置被改回浅克隆时不会悄悄跳过）。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const IGNORE_REVS_FILE = ".git-blame-ignore-revs";
const FULL_HASH = /^[0-9a-f]{40}$/;
const ANY_HEX = /^[0-9a-fA-F]+$/;

/**
 * 只看文本。返回 `revs`（按出现顺序，含行号）和 `problems`。
 * 不合格的行不进 `revs`，后面不再拿它去查历史。
 */
export function parseIgnoreRevs(text) {
  const revs = [];
  const problems = [];
  const firstLineOf = new Map();
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    if (!FULL_HASH.test(raw)) {
      problems.push({ line, message: `${describeBadLine(trimmed)}：${trimmed}` });
      return;
    }
    const previous = index > 0 ? lines[index - 1].trim() : "";
    if (!previous.startsWith("#")) {
      problems.push({ line, message: `哈希的上一行要有注释，写明这个提交是什么、怎么复现：${raw}` });
    }
    const first = firstLineOf.get(raw);
    if (first !== undefined) {
      problems.push({ line, message: `和第 ${first} 行重复：${raw}` });
      return;
    }
    firstLineOf.set(raw, line);
    revs.push({ hash: raw, line });
  });
  return { revs, problems };
}

/** 进来的都是原样不合格的行；`trimmed` 是去掉首尾空白之后的内容。 */
function describeBadLine(trimmed) {
  if (FULL_HASH.test(trimmed)) return "哈希前后不能有空白";
  if (ANY_HEX.test(trimmed) && trimmed.length === 40) return "哈希要用小写";
  if (ANY_HEX.test(trimmed) && trimmed.length < 40) {
    return `要写完整的 40 位哈希（这里是 ${trimmed.length} 位，缩写会让 git blame 直接报错）`;
  }
  return "一行只能是一个完整的 40 位哈希，说明写在上一行的注释里";
}

function git(repoRoot, args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    // 部分克隆里遇到没有的对象时，git 会去远端取；这里只看本地有什么。
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" },
  });
}

/** 这个目录里能不能看到完整的提交历史。看不到时 `reason` 说明原因。 */
export function inspectHistory(repoRoot) {
  const inside = git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.error) return { complete: false, reason: "没有找到 git 命令" };
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return { complete: false, reason: "这里不是 git 仓库" };
  const head = git(repoRoot, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head.status !== 0) return { complete: false, reason: "仓库里还没有提交" };
  const shallow = git(repoRoot, ["rev-parse", "--is-shallow-repository"]);
  if (shallow.status !== 0) return { complete: false, reason: "读不出仓库是不是浅克隆" };
  if (shallow.stdout.trim() === "true") return { complete: false, reason: "这是浅克隆，看不到完整的提交历史" };
  return { complete: true };
}

/** 历史完整时调用：每个哈希都得是 HEAD 的祖先提交。 */
export function checkAncestry(repoRoot, revs) {
  const problems = [];
  for (const { hash, line } of revs) {
    const result = git(repoRoot, ["merge-base", "--is-ancestor", `${hash}^{commit}`, "HEAD"]);
    if (result.status === 0) continue;
    if (result.status === 1) {
      problems.push({
        line,
        message: `这个提交不在当前分支的历史里：${hash}。带它的 PR 如果是 squash 或 rebase 合并的，哈希已经换了；改成新的哈希，或者删掉这一行`,
      });
      continue;
    }
    problems.push({ line, message: `仓库里没有这个提交：${hash}。核对哈希；确实没有了就删掉这一行` });
  }
  return problems;
}

/**
 * @param {{ repoRoot?: string, requireHistory?: boolean }} [options]
 * @returns {{ problems: string[], revCount: number, historyChecked: boolean, skippedReason?: string }}
 */
export function runCheck({ repoRoot = defaultRepoRoot, requireHistory = false } = {}) {
  const file = path.join(repoRoot, IGNORE_REVS_FILE);
  if (!fs.existsSync(file)) {
    return { problems: [`缺少 ${IGNORE_REVS_FILE}`], revCount: 0, historyChecked: false };
  }
  const { revs, problems: parsed } = parseIgnoreRevs(fs.readFileSync(file, "utf8"));
  const problems = parsed.map(formatProblem);
  const history = inspectHistory(repoRoot);
  if (!history.complete) {
    if (requireHistory) {
      problems.push(`${history.reason}，没法核对这些提交是不是在当前历史里（--require-history 要求能核对）`);
    }
    return { problems, revCount: revs.length, historyChecked: false, skippedReason: history.reason };
  }
  problems.push(...checkAncestry(repoRoot, revs).map(formatProblem));
  return { problems, revCount: revs.length, historyChecked: true };
}

function formatProblem({ line, message }) {
  return `${IGNORE_REVS_FILE}:${line} ${message}`;
}

function main(argv) {
  const unknown = argv.filter((arg) => arg !== "--require-history");
  if (unknown.length > 0) {
    console.error(`不认识的参数：${unknown.join(" ")}`);
    console.error("用法：node scripts/check-blame-ignore-revs.mjs [--require-history]");
    return 2;
  }
  const result = runCheck({ requireHistory: argv.includes("--require-history") });
  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(problem);
    console.error(`${IGNORE_REVS_FILE} 检查没有通过（${result.problems.length} 处）`);
    return 1;
  }
  const scope = result.historyChecked
    ? "都在当前分支的历史里"
    : `${result.skippedReason}，没有核对它们是不是在当前分支的历史里`;
  console.log(`${IGNORE_REVS_FILE} 检查通过：${result.revCount} 个提交，${scope}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
