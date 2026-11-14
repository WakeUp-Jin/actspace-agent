import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  IGNORE_REVS_FILE,
  checkAncestry,
  inspectHistory,
  parseIgnoreRevs,
  runCheck,
} from "../check-blame-ignore-revs.mjs";

const script = fileURLToPath(new URL("../check-blame-ignore-revs.mjs", import.meta.url));
const HASH_A = "d26331adc3e1c66665a511becd4ccd15584c4239";
const HASH_B = "e2c9f059c6202148072407b1d0b340d29c401c11";

// 不读这台机器的全局 git 配置（钩子、签名、默认分支名），测试里的仓库只按这里写的来。
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_SYSTEM: os.devNull,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8" }).trim();
}

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function commit(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, "add", "--", file);
  git(repo, "commit", "-q", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

/** 一个带两个提交的仓库：`first` 之后是 `format`（要记进文件的那个）。 */
function tempRepo(t) {
  const repo = tempDir(t, "blame-ignore-revs-check-");
  git(repo, "init", "-q", "-b", "main");
  const first = commit(repo, "a.ts", "const a = 1\n", "first");
  const format = commit(repo, "a.ts", "const a = 1;\n", "format");
  return { repo, first, format };
}

function writeIgnoreRevs(repo, lines) {
  fs.writeFileSync(path.join(repo, IGNORE_REVS_FILE), `${lines.join("\n")}\n`);
}

test("reads full hashes and skips comments and blank lines", () => {
  const { revs, problems } = parseIgnoreRevs(
    ["# 说明", "#", "", "# 全量格式化", HASH_A, "", "  # 缩进的注释也是注释", "# 改名", HASH_B, ""].join("\n"),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(revs, [
    { hash: HASH_A, line: 5 },
    { hash: HASH_B, line: 9 },
  ]);
});

test("accepts CRLF line endings", () => {
  const { revs, problems } = parseIgnoreRevs(`# 全量格式化\r\n${HASH_A}\r\n`);
  assert.deepEqual(problems, []);
  assert.deepEqual(revs, [{ hash: HASH_A, line: 2 }]);
});

test("rejects an abbreviated hash, which makes git blame fail outright", () => {
  const { revs, problems } = parseIgnoreRevs(["# 全量格式化", "d26331ad"].join("\n"));
  assert.deepEqual(revs, []);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].line, 2);
  assert.match(problems[0].message, /完整的 40 位哈希（这里是 8 位/);
});

test("rejects upper case, surrounding whitespace and anything else on the line", () => {
  const { revs, problems } = parseIgnoreRevs(
    [
      "# 大写",
      HASH_A.toUpperCase(),
      "# 行尾空格",
      `${HASH_A} `,
      "# 行首空格",
      ` ${HASH_A}`,
      "# 行内带说明",
      `${HASH_A} # 全量格式化`,
      "# 不是哈希",
      "HEAD~3",
    ].join("\n"),
  );
  assert.deepEqual(revs, []);
  assert.deepEqual(
    problems.map((problem) => [problem.line, problem.message.split("：")[0]]),
    [
      [2, "哈希要用小写"],
      [4, "哈希前后不能有空白"],
      [6, "哈希前后不能有空白"],
      [8, "一行只能是一个完整的 40 位哈希，说明写在上一行的注释里"],
      [10, "一行只能是一个完整的 40 位哈希，说明写在上一行的注释里"],
    ],
  );
});

test("rejects a hash listed twice and keeps the first one", () => {
  const { revs, problems } = parseIgnoreRevs(["# 全量格式化", HASH_A, "", "# 又写了一遍", HASH_A].join("\n"));
  assert.deepEqual(revs, [{ hash: HASH_A, line: 2 }]);
  assert.deepEqual(problems, [{ line: 5, message: `和第 2 行重复：${HASH_A}` }]);
});

test("requires a comment on the line above each hash", () => {
  const { revs, problems } = parseIgnoreRevs(["# 全量格式化", "", HASH_A, HASH_B].join("\n"));
  // 两个哈希都照常读出来，后面还要核对历史；问题各报一条。
  assert.deepEqual(
    revs.map((rev) => rev.hash),
    [HASH_A, HASH_B],
  );
  assert.deepEqual(
    problems.map((problem) => problem.line),
    [3, 4],
  );
  for (const problem of problems) assert.match(problem.message, /上一行要有注释/);
});

test("passes when every listed commit is an ancestor of HEAD", (t) => {
  const { repo, first, format } = tempRepo(t);
  commit(repo, "b.ts", "const b = 2;\n", "later");
  writeIgnoreRevs(repo, ["# 第一个提交", first, "", "# 格式化", format]);
  assert.deepEqual(runCheck({ repoRoot: repo }), { problems: [], revCount: 2, historyChecked: true });
  assert.deepEqual(runCheck({ repoRoot: repo, requireHistory: true }), {
    problems: [],
    revCount: 2,
    historyChecked: true,
  });
});

test("fails when the file is missing", (t) => {
  const { repo } = tempRepo(t);
  assert.deepEqual(runCheck({ repoRoot: repo }), {
    problems: [`缺少 ${IGNORE_REVS_FILE}`],
    revCount: 0,
    historyChecked: false,
  });
});

test("fails for a commit that was squash-merged: the listed hash is no longer in the history", (t) => {
  const { repo } = tempRepo(t);
  git(repo, "checkout", "-q", "-b", "format-branch");
  const formatOnBranch = commit(repo, "a.ts", "const a = 1; // formatted\n", "format on a branch");
  git(repo, "checkout", "-q", "main");
  git(repo, "merge", "-q", "--squash", "format-branch");
  git(repo, "commit", "-q", "-m", "format (squashed)");
  writeIgnoreRevs(repo, ["# 格式化", formatOnBranch]);

  const result = runCheck({ repoRoot: repo });
  assert.equal(result.historyChecked, true);
  assert.equal(result.problems.length, 1);
  assert.match(
    result.problems[0],
    new RegExp(`^\\.git-blame-ignore-revs:2 这个提交不在当前分支的历史里：${formatOnBranch}`),
  );
  assert.match(result.problems[0], /squash 或 rebase/);

  // 改成 squash 之后的那个提交就通过。
  writeIgnoreRevs(repo, ["# 格式化", git(repo, "rev-parse", "HEAD")]);
  assert.deepEqual(runCheck({ repoRoot: repo }).problems, []);
});

test("passes for a commit that came in through a merge commit", (t) => {
  const { repo } = tempRepo(t);
  git(repo, "checkout", "-q", "-b", "format-branch");
  const formatOnBranch = commit(repo, "a.ts", "const a = 1; // formatted\n", "format on a branch");
  git(repo, "checkout", "-q", "main");
  commit(repo, "b.ts", "const b = 2;\n", "main moves on");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge format-branch", "format-branch");
  writeIgnoreRevs(repo, ["# 格式化", formatOnBranch]);
  assert.deepEqual(runCheck({ repoRoot: repo }), { problems: [], revCount: 1, historyChecked: true });
});

test("fails for a hash the repository does not have, and for one that is not a commit", (t) => {
  const { repo } = tempRepo(t);
  const tree = git(repo, "rev-parse", "HEAD^{tree}");
  const problems = checkAncestry(repo, [
    { hash: HASH_A, line: 2 },
    { hash: tree, line: 4 },
  ]);
  assert.deepEqual(
    problems.map((problem) => [problem.line, problem.message.split("。")[0]]),
    [
      [2, `仓库里没有这个提交：${HASH_A}`],
      [4, `仓库里没有这个提交：${tree}`],
    ],
  );
});

test("in a shallow clone the history check is skipped by default and fails with --require-history", (t) => {
  const { repo, format } = tempRepo(t);
  writeIgnoreRevs(repo, ["# 格式化", format]);
  git(repo, "add", "--", IGNORE_REVS_FILE);
  git(repo, "commit", "-q", "-m", "list the format commit");
  commit(repo, "b.ts", "const b = 2;\n", "later");

  const parent = tempDir(t, "blame-ignore-revs-shallow-");
  const shallow = path.join(parent, "clone");
  git(parent, "clone", "-q", "--depth", "1", pathToFileURL(repo).href, shallow);
  assert.equal(git(shallow, "rev-parse", "--is-shallow-repository"), "true");
  assert.deepEqual(inspectHistory(shallow), { complete: false, reason: "这是浅克隆，看不到完整的提交历史" });

  assert.deepEqual(runCheck({ repoRoot: shallow }), {
    problems: [],
    revCount: 1,
    historyChecked: false,
    skippedReason: "这是浅克隆，看不到完整的提交历史",
  });
  const required = runCheck({ repoRoot: shallow, requireHistory: true });
  assert.equal(required.historyChecked, false);
  assert.deepEqual(required.problems, [
    "这是浅克隆，看不到完整的提交历史，没法核对这些提交是不是在当前历史里（--require-history 要求能核对）",
  ]);

  // 文本上的问题在浅克隆里照样报。
  writeIgnoreRevs(shallow, ["# 格式化", format.slice(0, 12)]);
  assert.equal(runCheck({ repoRoot: shallow }).problems.length, 1);
});

test("in a treeless clone with the whole commit history the check runs in full", (t) => {
  // CI 的检出方式：提交全取，树和文件只取检出要用的。
  const { repo, format } = tempRepo(t);
  writeIgnoreRevs(repo, ["# 格式化", format]);
  git(repo, "add", "--", IGNORE_REVS_FILE);
  git(repo, "commit", "-q", "-m", "list the format commit");
  git(repo, "config", "uploadpack.allowFilter", "true");

  const parent = tempDir(t, "blame-ignore-revs-treeless-");
  const treeless = path.join(parent, "clone");
  git(parent, "clone", "-q", "--filter=tree:0", pathToFileURL(repo).href, treeless);
  assert.equal(git(treeless, "rev-parse", "--is-shallow-repository"), "false");
  assert.deepEqual(runCheck({ repoRoot: treeless, requireHistory: true }), {
    problems: [],
    revCount: 1,
    historyChecked: true,
  });

  // 写一个仓库里没有的哈希：报出来，不去远端取。
  writeIgnoreRevs(treeless, ["# 格式化", format, "", "# 没有的提交", HASH_A]);
  const result = runCheck({ repoRoot: treeless, requireHistory: true });
  assert.deepEqual(
    result.problems.map((problem) => problem.split("。")[0]),
    [`${IGNORE_REVS_FILE}:5 仓库里没有这个提交：${HASH_A}`],
  );
});

test("outside a git repository the history check is skipped, or fails with --require-history", (t) => {
  const dir = tempDir(t, "blame-ignore-revs-nogit-");
  writeIgnoreRevs(dir, ["# 格式化", HASH_A]);
  // 临时目录可能在别的仓库里面；把仓库查找挡在这个目录。
  const previous = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(dir);
  t.after(() => {
    if (previous === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = previous;
  });
  assert.deepEqual(runCheck({ repoRoot: dir }), {
    problems: [],
    revCount: 1,
    historyChecked: false,
    skippedReason: "这里不是 git 仓库",
  });
  assert.deepEqual(runCheck({ repoRoot: dir, requireHistory: true }).problems, [
    "这里不是 git 仓库，没法核对这些提交是不是在当前历史里（--require-history 要求能核对）",
  ]);
});

test("the repository's own file passes, and says whether the history was checked", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\.git-blame-ignore-revs 检查通过：\d+ 个提交，/);
  // 完整克隆里核对历史；CI 里跑脚本测试的 job 是浅克隆，这时要把「没有核对」说出来。
  assert.match(result.stdout, /都在当前分支的历史里|没有核对它们是不是在当前分支的历史里/);
});

test("the command line exits 1 and lists every problem, with file and line", (t) => {
  // 脚本按自己所在的位置找仓库根目录；拷一份到临时仓库里跑。
  const { repo, format } = tempRepo(t);
  fs.mkdirSync(path.join(repo, "scripts"));
  const copy = path.join(repo, "scripts", "check-blame-ignore-revs.mjs");
  fs.copyFileSync(script, copy);
  const run = (...args) => spawnSync(process.execPath, [copy, ...args], { encoding: "utf8" });

  writeIgnoreRevs(repo, ["# 格式化", format.slice(0, 8), "", "# 没有的提交", HASH_A]);
  const failed = run();
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, "");
  assert.deepEqual(
    failed.stderr
      .trim()
      .split("\n")
      .map((line) => line.split("：")[0]),
    [
      ".git-blame-ignore-revs:2 要写完整的 40 位哈希（这里是 8 位，缩写会让 git blame 直接报错）",
      ".git-blame-ignore-revs:5 仓库里没有这个提交",
      ".git-blame-ignore-revs 检查没有通过（2 处）",
    ],
  );

  writeIgnoreRevs(repo, ["# 格式化", format]);
  const passed = run("--require-history");
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(passed.stdout, ".git-blame-ignore-revs 检查通过：1 个提交，都在当前分支的历史里\n");
});

test("the command line in a shallow clone: says what it skipped, and fails with --require-history", (t) => {
  const { repo, format } = tempRepo(t);
  fs.mkdirSync(path.join(repo, "scripts"));
  fs.copyFileSync(script, path.join(repo, "scripts", "check-blame-ignore-revs.mjs"));
  writeIgnoreRevs(repo, ["# 格式化", format]);
  git(repo, "add", "--", IGNORE_REVS_FILE, "scripts");
  git(repo, "commit", "-q", "-m", "list the format commit");

  const parent = tempDir(t, "blame-ignore-revs-shallow-cli-");
  const shallow = path.join(parent, "clone");
  git(parent, "clone", "-q", "--depth", "1", pathToFileURL(repo).href, shallow);
  const copy = path.join(shallow, "scripts", "check-blame-ignore-revs.mjs");

  const lenient = spawnSync(process.execPath, [copy], { encoding: "utf8" });
  assert.equal(lenient.status, 0, lenient.stderr);
  assert.equal(
    lenient.stdout,
    ".git-blame-ignore-revs 检查通过：1 个提交，这是浅克隆，看不到完整的提交历史，没有核对它们是不是在当前分支的历史里\n",
  );

  const strict = spawnSync(process.execPath, [copy, "--require-history"], { encoding: "utf8" });
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /这是浅克隆，看不到完整的提交历史，没法核对这些提交是不是在当前历史里/);
});

test("the command line rejects arguments it does not know", () => {
  const result = spawnSync(process.execPath, [script, "--strict"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /不认识的参数：--strict/);
});
