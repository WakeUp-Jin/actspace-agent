/**
 * 《诞生记》里出现的数字都从这里来：对着截止提交，把 git 历史和 docs/histories 重新数一遍。
 *
 *   node scripts/origin-stats.mjs              数到 src/origin/data.js 里写的截止提交
 *   node scripts/origin-stats.mjs --rev HEAD   换一个截止点（需要完整的 git 历史，浅克隆数不对）
 *
 * 输出 JSON。src/origin/data.js 里的数字是照这份输出抄的；口径的文字说明见 ORIGIN_STORY.md。
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { cutoff } from "../src/origin/data.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const { values: options } = parseArgs({ options: { rev: { type: "string", default: cutoff.rev } } });
const rev = options.rev;

/** 所有时刻都按仓库作者所在的时区（+08:00）算，「第几天」「晚上几点」才对得上开发记录。 */
const git = (...args) =>
  execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 30,
    env: { ...process.env, TZ: "Asia/Shanghai" },
  });
const lines = (text) => text.split("\n").filter(Boolean);

/** 累计增删行数不算这些：锁文件、图片、快照和生成物，它们不是谁写出来的。 */
const NOT_WRITTEN = /(pnpm-lock\.yaml|package-lock\.json|\.png$|\.jpg$|\.svg$|\.snap$|models\.generated|\.min\.js$|dist\/|\.lock$)/;

const CODE = ["*.ts", "*.tsx", "*.mts", "*.mjs", "*.js", "*.jsx", "*.css", "*.go", "*.rs", "*.astro"];
const NOT_CODE = [":!*.test.*", ":!*/test/*", ":!*/tests/*", ":!*.generated.*", ":!*/dist/*"];
const TESTS = ["*.test.ts", "*.test.tsx", "*.test.mjs", "*.test.js", "*/test/*.ts", "*/tests/*.ts", "*_test.go"];

/** 某个提交里，匹配这些路径的文件一共多少行。 */
function countLines(commit, pathspecs) {
  let output = "";
  try {
    output = git("grep", "-c", "", commit, "--", ...pathspecs);
  } catch {
    return 0; // 一个文件都没匹配到时 git grep 以 1 退出。
  }
  return lines(output).reduce((sum, line) => sum + Number(line.slice(line.lastIndexOf(":") + 1)), 0);
}

const dayOf = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000) + 1;
const dateOf = (day) => new Date(Date.parse(`${firstDate}T00:00:00Z`) + (day - 1) * 86_400_000).toISOString().slice(0, 10);

const history = lines(git("log", rev, "--reverse", "--format=%H|%ad|%an|%P", "--date=format-local:%Y-%m-%d %H:%M")).map((line) => {
  const [hash, at, author, parents] = line.split("|");
  return { hash, date: at.slice(0, 10), hour: Number(at.slice(11, 13)), author, merge: parents.includes(" ") };
});
const firstDate = history[0].date;
const lastDate = history.at(-1).date;
const days = dayOf(lastDate);

function churn() {
  let added = 0;
  let deleted = 0;
  for (const line of lines(git("log", rev, "--no-merges", "--numstat", "--format="))) {
    const [plus, minus, path] = line.split("\t");
    if (!/^\d+$/.test(plus) || NOT_WRITTEN.test(path)) continue;
    added += Number(plus);
    deleted += Number(minus);
  }
  return { added, deleted };
}

/** 每个有提交的日子，收工时仓库里有多少行代码、多少行测试。 */
function curve() {
  const lastOfDay = new Map(history.map((commit) => [commit.date, commit.hash]));
  return [...lastOfDay].map(([date, hash]) => [dayOf(date), countLines(hash, [...CODE, ...NOT_CODE]), countLines(hash, TESTS)]);
}

function packages(commit) {
  const workspace = git("show", `${commit}:pnpm-workspace.yaml`);
  const globs = [...workspace.split(/^\w/m)[1].matchAll(/-\s*["']?([^"'\s]+)/g)].map((match) => match[1]);
  const patterns = globs.map((glob) => new RegExp(`^${glob.replaceAll("*", "[^/]+")}/package\\.json$`));
  return lines(git("ls-tree", "-r", "--name-only", commit)).filter((path) => patterns.some((pattern) => pattern.test(path))).length;
}

/** 开发记录的「Runtime」一栏写的是谁；早期记录没有这一栏时退回看 Agent ID。 */
function runtimes(records) {
  const field = new Map();
  for (const line of lines(git("grep", "-E", "(Runtime|Agent ID)\\**\\s*[:：]", rev, "--", "docs/histories"))) {
    const [, path, text] = line.match(/^[^:]+:([^:]+):(.*)$/);
    const [, name, value] = text.match(/(Runtime|Agent ID)\**\s*[:：]\s*`?([^`\n]*)/);
    const entry = field.get(path) ?? {};
    entry[name] ??= value.trim();
    field.set(path, entry);
  }
  const tally = {};
  for (const path of records) {
    const { Runtime: runtime = "", "Agent ID": agent = "" } = field.get(path) ?? {};
    const text = `${runtime} ${agent}`.toLowerCase();
    const who = runtime.startsWith("ActSpace desktop")
      ? "ActSpace"
      : text.includes("codex")
        ? "Codex"
        : /claude[ -]code/.test(text)
          ? "Claude Code"
          : text.includes("cursor")
            ? "Cursor"
            : text.includes("dsh")
              ? "DSH"
              : "未注明";
    tally[who] = (tally[who] ?? 0) + 1;
  }
  return tally;
}

const tree = lines(git("ls-tree", "-r", "--name-only", rev, "--", "docs"));
const records = tree.filter((path) => /^docs\/histories\/.+\.md$/.test(path) && !path.endsWith("/template.md"));
const learnings = tree.filter((path) => /^docs\/learnings\/.+\.md$/.test(path) && !/\/(README|WRITING_GUIDE)\.md$/.test(path));
const owner = history.filter((commit) => !commit.merge && commit.author === history[0].author);
const night = owner.filter((commit) => commit.hour >= 20 || commit.hour < 6);

console.log(
  JSON.stringify(
    {
      rev: git("rev-parse", "--short=8", rev).trim(),
      firstDate,
      lastDate,
      days,
      commits: history.length,
      merges: history.filter((commit) => commit.merge).length,
      commitDays: new Set(history.map((commit) => commit.date)).size,
      churn: churn(),
      packages: packages(rev),
      records: records.length,
      recordsOnDay1: records.filter((path) => path.includes(`/${firstDate.replaceAll("-", "")}-`)).length,
      learnings: learnings.length,
      runtimes: runtimes(records),
      ownerCommits: owner.length,
      ownerCommitsAtNight: night.length,
      ownerCommitsByHour: Array.from({ length: 24 }, (_, hour) => owner.filter((commit) => commit.hour === hour).length),
      dateOfDay: Object.fromEntries([1, 94, 102, days].map((day) => [day, dateOf(day)])),
      curve: curve(),
    },
    null,
    1,
  )
    .replace(/\[\s+(\d+),\s+(\d+),\s+(\d+)\s+\]/g, "[$1, $2, $3]")
    .replace(/"ownerCommitsByHour": \[[^\]]+\]/, (list) => list.replace(/\s+/g, " ")),
);
