// 路径包含检查：判断「一个路径在不在某个目录里面」只用 packages/util/shared/src/path-containment.ts 里的
// `isLexicallyInside` / `relativePathInside`（从 `@actspace/shared` 引入）。
// 各处自己写 `relative(root, target).startsWith("..")` 时，会把 `..notes.md` 这类名字当成往上走；
// 写对了前缀的，也各有各的漏（Windows 另一个盘符、目录本身算不算在里面）。
// 扫描 packages/、apps/、scripts/ 的 JS / TS 源码（不含测试和构建产物），找对「..」开头做前缀判断的写法：
//   startsWith("..")   startsWith("../")   startsWith("..\\")   startsWith(`..${sep}`)
// 只认 `startsWith` 这一种写法，按字面匹配，整行都是注释的不算；用正则或 `slice` 比较的认不出来。
// 按整份源码匹配，不按行：调用被格式化工具折成几行（括号后换行）照样认得出来，行号取 `startsWith` 所在的那一行。
// 可以保留的文件和处数记在下面的 ALLOWED 里，每条写明理由。处数对不上就失败：
// 多了说明新增了手写判断；少了说明清单过期，要同步改掉，免得空出来的名额被新的手写判断占用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["packages", "apps", "scripts"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-electron",
  "build",
  "out",
  "coverage",
  "test",
  "tests",
  "__tests__",
  "fixtures",
]);

export const ALLOWED = [
  { file: "packages/util/shared/src/path-containment.ts", count: 1, reason: "唯一的实现。" },
  {
    file: "packages/composition/cordis-adapter/src/source-loader.ts",
    count: 1,
    reason: "本包和 shared 同在最底层、互不依赖，留了一份写法相同的判断，改动时对照 shared 的用例。",
  },
  {
    file: "packages/composition/cordis-adapter/src/plugin-artifact.ts",
    count: 1,
    reason: "认 import 语句里以 ./ 或 ../ 开头的相对模块名，不是在判断路径包含。",
  },
  {
    file: "apps/desktop/src/renderer/components/markdown-common/paths.ts",
    count: 1,
    reason: "认 Markdown 链接里以 ./ 或 ../ 开头的相对写法，不是在判断路径包含。",
  },
  {
    file: "scripts/package-agent-cli.mjs",
    count: 1,
    reason: "构建脚本不引用工作区的包。这里的宽松写法只会多拒绝，真正起作用的是同一行的 resolve 比较。",
  },
  {
    file: "scripts/package-browser-components.mjs",
    count: 1,
    reason: "构建脚本不引用工作区的包。这里的宽松写法只会多拒绝，旁边另有 isAbsolute 和目录名检查。",
  },
  {
    file: "scripts/check-transitional-names.mjs",
    count: 1,
    reason: "检查脚本不引用工作区的包（没构建也要能跑），留了一份写法相同的判断，改动时对照 shared 的用例。",
  },
];

const PREFIX_CHECK = /startsWith\(\s*(["'`])\.\.(?:\1|[\\/]|\$\{)/g;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** 返回源码里对「..」开头做前缀判断的行号，一处一个，同一行出现几次就有几个。 */
export function findPrefixChecks(text) {
  // 整行注释换成空行，行号不变。
  const code = text
    .split("\n")
    .map((line) => (COMMENT_LINE.test(line) ? "" : line))
    .join("\n");
  return [...code.matchAll(PREFIX_CHECK)].map((match) => code.slice(0, match.index).split("\n").length);
}

/**
 * @param {{ path: string, text: string }[]} sources `path` 相对仓库根目录，用 `/` 分隔
 * @param {{ file: string, count: number }[]} allowed
 */
export function auditPathContainment(sources, allowed = ALLOWED) {
  const limits = new Map(allowed.map((entry) => [entry.file, entry.count]));
  const found = new Map();
  for (const { path: file, text } of sources) {
    const lines = findPrefixChecks(text);
    if (lines.length > 0) found.set(file, lines);
  }
  const errors = [];
  for (const file of [...new Set([...found.keys(), ...limits.keys()])].sort()) {
    const lines = found.get(file) ?? [];
    const limit = limits.get(file);
    if (limit === undefined) {
      for (const line of lines) errors.push(`${file}:${line} 对「..」开头做了前缀判断`);
    } else if (lines.length > limit) {
      errors.push(
        `${file}：对「..」开头做前缀判断的有 ${lines.length} 处（第 ${lines.join("、")} 行），清单只允许 ${limit} 处`,
      );
    } else if (lines.length < limit) {
      errors.push(`${file}：清单记了 ${limit} 处，现在只有 ${lines.length} 处，请同步修改 ALLOWED`);
    }
  }
  return errors;
}

function isSourceFile(name) {
  return (
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name) &&
    !/\.d\.[cm]?ts$/.test(name) &&
    !/\.(test|spec|bench|perf)\.[cm]?[jt]sx?$/.test(name)
  );
}

function readSources(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile() || !isSourceFile(entry.name)) continue;
      out.push({ path: path.relative(root, full).split(path.sep).join("/"), text: fs.readFileSync(full, "utf8") });
    }
  };
  for (const base of ROOTS) if (fs.existsSync(path.join(root, base))) walk(path.join(root, base));
  return out;
}

export function runCheck(root = repoRoot, allowed = ALLOWED) {
  const sources = readSources(root);
  return { files: sources.length, errors: auditPathContainment(sources, allowed) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, errors } = runCheck();
  if (errors.length > 0) {
    console.error(`路径包含检查失败（${errors.length} 处）：`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      "判断路径在不在某个目录里，用 packages/util/shared/src/path-containment.ts 里的 isLexicallyInside / relativePathInside（从 @actspace/shared 引入）。",
    );
    console.error("不是在判断路径包含的，把文件记进 scripts/check-path-containment.mjs 的 ALLOWED，写明理由。");
    process.exit(1);
  }
  console.log(`路径包含检查通过：检查了 ${files} 个文件。`);
}
