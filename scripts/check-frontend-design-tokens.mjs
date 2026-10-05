// 前端设计 token 防回流检查：renderer 组件的字号、圆角、层级、时长必须来自 token，
// 且组件引用的 text-act-* / rounded-act-* / shadow-act-* / z-(--act-z-*) 必须在样式层有定义。
// 另有少量 CSS 块规则（CSS_BLOCK_RULES），守住个别选择器里的禁用值和必要行为。
// 颜色契约（tokens、强调色、黑白与任意值颜色）由 check-frontend-theme-colors.mjs 负责；这里只拦 Tailwind 调色板色名和旧的彩色焦点环。
// 规范见 docs/design-docs/frontend/front-全局视觉语言规范.md。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(repoRoot, "apps/desktop/src/renderer");

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
  {
    id: "palette-color-literal",
    pattern:
      /(?<![\w-])(?:text|bg|border(?:-[xytblrse])?|divide|outline|ring(?:-offset)?|fill|stroke|from|to|via|accent|caret|shadow|decoration|placeholder)-(?:red|green|blue|amber|emerald|sky|yellow|gray|slate|zinc|neutral|stone|orange|lime|teal|cyan|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])/g,
    hint: "颜色用语义 token 类（text-text-* / bg-surface-* / text-danger / bg-operational 等），不用 Tailwind 调色板",
  },
  {
    id: "focus-ring-legacy",
    pattern: /focus(?:-visible|-within)?:(?:border|ring|outline)-(?:blue|green|sky|emerald)-/g,
    hint: "焦点环用 ring-focus-ring / outline-focus-ring，不用彩色焦点环",
  },
];

// CSS 块规则：只对 `file` 中精确命中 `selector` 的块生效。
// 选择器必须位于行首（允许缩进），后面直接跟 `{`；`.a.is-x {`、`.parent .a {`、`.a, .b {` 都不算命中。
// forbid 对每个命中的块逐一检查；require 只要在任一命中的块里出现即可（允许 @media 中的覆盖块）。
export const CSS_BLOCK_RULES = [
  {
    id: "tool-log-running-no-operational",
    file: "styles/base.css",
    // 扫光颜色写在 ::after 里，两个块都要守。
    selector: [".tool-log-text-running", ".tool-log-text-running::after"],
    forbid: [/--act-color-operational/],
    require: [],
    hint: "运行中的工具日志用中性墨色扫光，不用 operational（绿色）",
  },
  {
    id: "tool-log-running-reduced-motion",
    file: "styles/base.css",
    // 全局兜底只把动画缩到 0.01ms，扫光层仍会停在原地，所以 reduced motion 下要整个隐藏。
    selector: ".tool-log-text-running::after",
    forbid: [],
    require: [/display\s*:\s*none/],
    hint: "prefers-reduced-motion 下隐藏工具日志的扫光层（display: none）",
  },
  {
    id: "file-diff-content-bounded-scroll",
    file: "styles/diff.css",
    selector: ".file-diff-content",
    forbid: [],
    require: [/max-height\s*:\s*\d/, /overflow-y\s*:\s*auto/, /overflow-x\s*:\s*auto/],
    hint: "展开的 diff 必须在有界的滚动区域内（max-height + overflow-y: auto），长行横向滚动（overflow-x: auto）",
  },
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 截取 `selector {…}` 的块体；返回 { body, line }[]。 */
export function findCssBlocks(source, selector) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const blocks = [];
  for (const match of code.matchAll(new RegExp(`^[ \\t]*${escapeRegExp(selector)}\\s*\\{`, "gm"))) {
    const open = match.index + match[0].length;
    const close = code.indexOf("}", open);
    const body = code.slice(open, close === -1 ? code.length : close);
    // 块体截到第一个 `}`；嵌套规则会让截取失真，直接标记出来，由调用方报错。
    blocks.push({ body, line: lineOf(code, match.index), nested: body.includes("{") });
  }
  return blocks;
}

/** 对一个 CSS 文件运行适用的块规则；返回 { rule, match, line, hint }[]。 */
export function checkCssBlocks(relative, source, rules = CSS_BLOCK_RULES) {
  const violations = [];
  for (const rule of rules.filter((item) => item.file === relative)) {
    const selectors = Array.isArray(rule.selector) ? rule.selector : [rule.selector];
    for (const selector of selectors) {
      const blocks = findCssBlocks(source, selector);
      if (blocks.length === 0) {
        violations.push({ rule: rule.id, match: `找不到选择器 ${selector}`, line: 0, hint: rule.hint });
        continue;
      }
      for (const block of blocks) {
        if (block.nested) violations.push({ rule: rule.id, match: `${selector} 块内有嵌套规则，脚本无法准确截取`, line: block.line, hint: rule.hint });
        for (const pattern of rule.forbid) {
          const found = block.body.match(pattern);
          if (found) violations.push({ rule: rule.id, match: found[0], line: block.line, hint: rule.hint });
        }
      }
      for (const pattern of rule.require) {
        if (!blocks.some((block) => pattern.test(block.body))) {
          violations.push({ rule: rule.id, match: `缺少 ${pattern.source}`, line: blocks[0].line, hint: rule.hint });
        }
      }
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
  const styleFiles = fs.readdirSync(styleDir).filter((name) => name.endsWith(".css"));
  const styleSources = new Map(styleFiles.map((name) => [`styles/${name}`, fs.readFileSync(path.join(styleDir, name), "utf8")]));
  const defined = collectDefinedVariables([...styleSources.values()]);
  const problems = [];
  for (const rule of CSS_BLOCK_RULES) {
    if (!styleSources.has(rule.file)) problems.push(`${rule.file} — 找不到 CSS 块规则 ${rule.id} 指定的文件`);
  }
  for (const [relative, source] of styleSources) {
    for (const v of checkCssBlocks(relative, source)) problems.push(`${relative}:${v.line} ${v.match} — ${v.hint}`);
  }
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
