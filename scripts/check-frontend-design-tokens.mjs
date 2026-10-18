// 前端设计 token 防回流检查：renderer 组件的字号、圆角、层级、时长必须来自 token，
// 且组件引用的 text-act-* / rounded-act-* / shadow-act-* / z-(--act-z-*) 必须在样式层有定义。
// 另有少量 CSS 块规则（CSS_BLOCK_RULES），守住个别选择器里的禁用值和必要行为。
// 颜色契约（tokens、强调色、黑白与任意值颜色）由 check-frontend-theme-colors.mjs 负责；这里只拦 Tailwind 调色板色名和旧的彩色焦点环。
// 基础组件约束（16 S8）：原生 <button> 按文件不超过基线；createPortal 和 role="dialog" 只能写在 components/ui/。
// 扫描根是一个列表（SCAN_PROFILES）：desktop = apps/desktop/src/renderer，web = apps/web/src（目录不存在时静默跳过）。
// 每个根读自己的 token 定义；web 的原生 <button>、createPortal、role="dialog" 只允许在 apps/web/src/ui/，其余基线为 0，没有字面量例外。
// 规范见 docs/design-docs/frontend/front-全局视觉语言规范.md 和 front-web-pwa客户端规范.md §10。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(repoRoot, "apps/desktop/src/renderer");
export const NATIVE_BUTTON_BASELINE_PATH = path.join(repoRoot, "scripts/native-button-baseline.json");
const UI_PRIMITIVES_DIR = "components/ui/";

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

// 只允许写在 components/ui/ 里的写法：业务组件用 ui/Dialog、ui/Popover 等原语，不自己 portal、不自己声明对话框。
export const UI_ONLY_RULES = [
  { id: "create-portal-outside-ui", pattern: /(?<![\w$])createPortal(?![\w$])/g, hint: "弹层用 components/ui/ 的原语（Dialog / Popover / Menu），不在业务组件里 createPortal" },
  { id: "role-dialog-outside-ui", pattern: /role\s*[=:]\s*\{?\s*["'`]dialog["'`]/g, hint: "对话框用 components/ui/Dialog，浮层用 ui/Popover；不在业务组件里写 role=\"dialog\"" },
];

// UI_ONLY_RULES 的例外，精确到「文件 + 规则」；每条都要能说清原因。
export const UI_ONLY_ALLOWLIST = new Map([
  // 批注胶囊保留 Radix HoverCard（悬停预览），卡片里有可操作的按钮，所以标成 dialog。见 docs/exec-runs/20261005-desktop-fe-00-overall/pauses.md P2。
  ["components/composer/ResponseAnnotationPill.tsx", ["role-dialog-outside-ui"]],
]);

/**
 * 扫描根配置。root 相对仓库根；styleFiles 为 null 表示读 styles/ 下全部 css。
 * 例外表和 CSS 块规则只属于 desktop；web 全部为空（不允许字面量例外）。
 */
export const DESKTOP_PROFILE = {
  name: "desktop",
  root: "apps/desktop/src/renderer",
  primitivesDir: UI_PRIMITIVES_DIR,
  styleFiles: null,
  literalAllowlist: LITERAL_ALLOWLIST,
  uiOnlyAllowlist: UI_ONLY_ALLOWLIST,
  cssBlockRules: CSS_BLOCK_RULES,
};
export const WEB_PROFILE = {
  name: "web",
  root: "apps/web/src",
  primitivesDir: "ui/",
  styleFiles: ["styles/tailwind.css", "styles/tokens.css"],
  literalAllowlist: new Map(),
  uiOnlyAllowlist: new Map(),
  cssBlockRules: [],
};
export const SCAN_PROFILES = [DESKTOP_PROFILE, WEB_PROFILE];

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
export function checkSource(relative, source, profile = DESKTOP_PROFILE) {
  const allowed = profile.literalAllowlist.get(relative) ?? [];
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

/** createPortal / role="dialog" 是否写在了 components/ui/ 之外；返回 { rule, match, line, hint }[]。 */
export function checkUiOnly(relative, source, profile = DESKTOP_PROFILE) {
  if (relative.startsWith(profile.primitivesDir)) return [];
  const allowed = profile.uiOnlyAllowlist.get(relative) ?? [];
  const code = stripComments(source);
  const violations = [];
  for (const rule of UI_ONLY_RULES) {
    if (allowed.includes(rule.id)) continue;
    for (const match of code.matchAll(rule.pattern)) {
      violations.push({ rule: rule.id, match: match[0], line: lineOf(code, match.index), hint: rule.hint.replaceAll(UI_PRIMITIVES_DIR, profile.primitivesDir) });
    }
  }
  return violations;
}

/** 文件里原生 `<button` 的个数（不含注释）；components/ui/ 不计数。 */
export function countNativeButtons(relative, source, primitivesDir = UI_PRIMITIVES_DIR) {
  if (relative.startsWith(primitivesDir) || !relative.endsWith(".tsx")) return 0;
  return stripComments(source).match(/<button(?![\w-])/g)?.length ?? 0;
}

/**
 * 原生按钮数量对照基线：超过基线（含基线里没有的新文件）是错误；低于基线只提示收紧。
 * 返回 { errors: string[], notices: string[] }。
 */
export function checkNativeButtons(counts, baseline, primitivesDir = UI_PRIMITIVES_DIR) {
  const errors = [];
  const notices = [];
  for (const [relative, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    const limit = baseline[relative] ?? 0;
    if (count > limit) {
      errors.push(`${relative} 有 ${count} 个原生 <button>，基线是 ${limit} — 用 ${primitivesDir} 的 Button / IconButton；确实需要原生按钮时说明原因并更新基线`);
    } else if (count < limit) {
      notices.push(`${relative} 原生 <button> 从 ${limit} 降到 ${count}，可以收紧基线`);
    }
  }
  for (const relative of Object.keys(baseline).sort()) {
    if (!counts.has(relative) && baseline[relative] > 0) notices.push(`${relative} 已不存在或没有原生 <button>，可以从基线删除`);
  }
  return { errors, notices };
}

export function loadNativeButtonBaseline(baselinePath = NATIVE_BUTTON_BASELINE_PATH) {
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
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

/** renderer 各文件的原生按钮数（只列大于 0 的）。 */
export function collectNativeButtonCounts(root = rendererRoot, primitivesDir = UI_PRIMITIVES_DIR) {
  const counts = new Map();
  for (const file of collectFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const count = countNativeButtons(relative, fs.readFileSync(file, "utf8"), primitivesDir);
    if (count > 0) counts.set(relative, count);
  }
  return counts;
}

export function runCheck(root, baseline = loadNativeButtonBaseline(), notices = [], profile = DESKTOP_PROFILE) {
  root = root ?? path.join(repoRoot, profile.root);
  const styleDir = path.join(root, "styles");
  const styleNames = profile.styleFiles ?? fs.readdirSync(styleDir).filter((name) => name.endsWith(".css")).map((name) => `styles/${name}`);
  const problems = [];
  const styleSources = new Map();
  for (const relative of styleNames) {
    const absolute = path.join(root, relative);
    if (fs.existsSync(absolute)) styleSources.set(relative, fs.readFileSync(absolute, "utf8"));
    else problems.push(`${relative} — 找不到 ${profile.name} 的样式层文件`);
  }
  const defined = collectDefinedVariables([...styleSources.values()]);
  for (const rule of profile.cssBlockRules) {
    if (!styleSources.has(rule.file)) problems.push(`${rule.file} — 找不到 CSS 块规则 ${rule.id} 指定的文件`);
  }
  for (const [relative, source] of styleSources) {
    for (const v of checkCssBlocks(relative, source, profile.cssBlockRules)) problems.push(`${relative}:${v.line} ${v.match} — ${v.hint}`);
  }
  for (const file of collectFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    for (const v of checkSource(relative, source, profile)) problems.push(`${relative}:${v.line} ${v.match} — ${v.hint}`);
    for (const m of checkTokenReferences(relative, source, defined)) problems.push(`${relative}:${m.line} ${m.match} — 未定义的 token ${m.variable}`);
    for (const v of checkUiOnly(relative, source, profile)) problems.push(`${relative}:${v.line} ${v.match} — ${v.hint}`);
  }
  const buttons = checkNativeButtons(collectNativeButtonCounts(root, profile.primitivesDir), baseline, profile.primitivesDir);
  problems.push(...buttons.errors);
  notices.push(...buttons.notices);
  return problems;
}

/**
 * 对仓库里存在的每个扫描根运行检查；根目录不存在则跳过。
 * 返回 { name, root, problems, notices }[]，problems / notices 已加上 `[name]` 前缀。web 的原生按钮基线固定为 0。
 */
export function runAllChecks(repo = repoRoot, desktopBaseline = loadNativeButtonBaseline()) {
  const results = [];
  for (const profile of SCAN_PROFILES) {
    const root = path.join(repo, profile.root);
    if (!fs.existsSync(root)) continue;
    const notices = [];
    const baseline = profile.name === "desktop" ? desktopBaseline : {};
    const problems = runCheck(root, baseline, notices, profile);
    results.push({
      name: profile.name,
      root: profile.root,
      problems: problems.map((problem) => `[${profile.name}] ${problem}`),
      notices: notices.map((notice) => `[${profile.name}] ${notice}`),
    });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes("--update-native-button-baseline")) {
  // 只在按钮数下降，或新增原生按钮已说明原因时运行；写回后在 diff 里核对每一行变化。
  const counts = Object.fromEntries([...collectNativeButtonCounts()].sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(NATIVE_BUTTON_BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`已写入 ${path.relative(repoRoot, NATIVE_BUTTON_BASELINE_PATH)}：${Object.keys(counts).length} 个文件，${Object.values(counts).reduce((sum, n) => sum + n, 0)} 个原生 <button>`);
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = runAllChecks();
  const problems = results.flatMap((result) => result.problems);
  for (const result of results) for (const notice of result.notices) console.log(`  提示：${notice}`);
  if (problems.length) {
    console.error(`frontend design token check failed (${problems.length}):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`前端设计 token 检查通过（${results.map((result) => `${result.name}: ${result.root}`).join("；")}）`);
  }
}
