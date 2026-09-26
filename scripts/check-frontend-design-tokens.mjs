// 前端设计 token 防回流检查：renderer 组件的字号、圆角、层级、时长必须来自 token，
// 且组件引用的 text-act-* / rounded-act-* / shadow-act-* / z-(--act-z-*) 必须在样式层有定义。
// 颜色契约由 check-frontend-theme-colors.mjs 负责；规范见 docs/design-docs/frontend/front-全局视觉语言规范.md。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(repoRoot, "apps/desktop/src/renderer");

// v1 遗留页，主题规范已声明不属于当前契约（front-主题与配色规范.md「已退役页面」）。
const SKIPPED_FILES = new Set(["components/LabPage.tsx"]);

// 精确到「文件 + 匹配串」的例外；每条都要能说清为什么不用 token。
export const LITERAL_ALLOWLIST = new Map([
  // 1–3px 的细进度条、时间轴刻度和指示点：圆角跟随元素厚度，不属于组件圆角档位。
  ["components/trajectory/TrajectoryTimeline.tsx", ["rounded-[1px]"]],
  ["components/review/ReviewDiffCanvas.tsx", ["rounded-[2px]"]],
  ["components/ContextPopup.tsx", ["rounded-[3px]"]],
  ["components/workspace/workspaceOpenTool.tsx", ["rounded-[3px]"]],
]);

export const RULES = [
  { id: "font-size-literal", pattern: /(?<![\w-])text-\[\d+(?:\.\d+)?px\]/g, hint: "字号用 text-act-{xxs,xs,sm,md,lg,xl,title}" },
  {
    id: "tailwind-default-font-size",
    pattern: /(?<![\w\-[])(?:[\w-]*(?:\[[^\]]*\])?:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g,
    hint: "Tailwind 默认字号与规范档位同名不同值，改用 text-act-*",
  },
  { id: "radius-literal", pattern: /(?<![\w-])rounded(?:-[a-z]{1,2})?-\[[^\]]+\]/g, hint: "圆角用 rounded-act-{xs,sm,md,group,lg,xl,pill}" },
  { id: "z-index-literal", pattern: /(?<![\w-])z-\[(?:\d*[3-9]\d*|\d{2,})\]/g, hint: "层级用 z-(--act-z-*)；组件内局部叠放用 z-1 / z-2" },
  { id: "cold-shadow", pattern: /rgba\(\s*31\s*,\s*45\s*,\s*61/g, hint: "阴影用 shadow-act-*（暖色基底）" },
  { id: "duration-literal", pattern: /(?<![\w-])duration-(?:\[[^\]]+\]|\d+)(?![\w-])/g, hint: "时长用 duration-(--motion-{fast,base,slow})" },
];

// 组件中引用的 token 类 → 需要在 tailwind.css / tokens.css 中存在的变量名。
const TOKEN_REFERENCES = [
  { pattern: /(?<![\w-])text-act-([a-z0-9]+)(?![\w-])/g, variable: (name) => `--text-act-${name}` },
  { pattern: /(?<![\w-])rounded(?:-[a-z]{1,2})?-act-([a-z0-9]+)(?![\w-])/g, variable: (name) => `--radius-act-${name}` },
  { pattern: /(?<![\w-])shadow-act-([a-z0-9]+)(?![\w-])/g, variable: (name) => `--shadow-act-${name}` },
  { pattern: /var\((--(?:act|motion)-[a-z0-9-]+)\)|\((--(?:act|motion)-[a-z0-9-]+)\)/g, variable: (_name, match) => match[1] ?? match[2] },
];

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

/** 检查单个文件的写死值；返回 { rule, match, line, hint }[]。 */
export function checkSource(relative, source) {
  if (SKIPPED_FILES.has(relative)) return [];
  const allowed = LITERAL_ALLOWLIST.get(relative) ?? [];
  const code = stripComments(source);
  const violations = [];
  for (const rule of RULES) {
    for (const match of code.matchAll(rule.pattern)) {
      if (allowed.includes(match[0])) continue;
      violations.push({ rule: rule.id, match: match[0], line: lineOf(code, match.index), hint: rule.hint });
    }
  }
  return violations;
}

/** 收集样式层定义过的 CSS 变量名。 */
export function collectDefinedVariables(styleSources) {
  const defined = new Set();
  for (const source of styleSources) {
    for (const match of source.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(match[1]);
  }
  return defined;
}

/** 检查组件引用的 token 是否已定义；返回 { match, variable, line }[]。 */
export function checkTokenReferences(relative, source, defined) {
  if (SKIPPED_FILES.has(relative)) return [];
  const code = stripComments(source);
  const missing = [];
  for (const reference of TOKEN_REFERENCES) {
    for (const match of code.matchAll(reference.pattern)) {
      const variable = reference.variable(match[1], match);
      if (!variable || defined.has(variable)) continue;
      missing.push({ match: match[0], variable, line: lineOf(code, match.index) });
    }
  }
  return missing;
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "test") files.push(...collectFiles(absolute));
    } else if (/\.tsx?$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

export function runCheck(root = rendererRoot) {
  const styleDir = path.join(root, "styles");
  const defined = collectDefinedVariables(
    fs.readdirSync(styleDir).filter((name) => name.endsWith(".css")).map((name) => fs.readFileSync(path.join(styleDir, name), "utf8")),
  );
  const problems = [];
  for (const file of collectFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    for (const v of checkSource(relative, source)) problems.push(`${relative}:${v.line} ${v.match} — ${v.hint}`);
    for (const m of checkTokenReferences(relative, source, defined)) problems.push(`${relative}:${m.line} ${m.match} — 未定义的 token ${m.variable}`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = runCheck();
  if (problems.length) {
    console.error(`frontend design token check failed (${problems.length}):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  } else {
    console.log("前端设计 token 检查通过");
  }
}
