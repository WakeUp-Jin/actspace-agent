import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(repoRoot, "packages/desktop/src/renderer");
const tokensPath = path.join(rendererRoot, "styles/tokens.css");
const tailwindPath = path.join(rendererRoot, "styles/tailwind.css");

const REQUIRED_THEME_TOKENS = [
  "--act-color-bg",
  "--act-color-surface",
  "--act-color-surface-subtle",
  "--act-color-surface-raised",
  "--act-color-sidebar",
  "--act-color-selected",
  "--act-color-sidebar-selected",
  "--act-color-hover-overlay",
  "--act-color-border",
  "--act-color-border-strong",
  "--act-color-text",
  "--act-color-text-muted",
  "--act-color-text-faint",
  "--act-color-text-subtle",
  "--act-color-action",
  "--act-color-action-hover",
  "--act-color-on-action",
  "--act-color-operational",
  "--act-color-operational-hover",
  "--act-color-operational-soft",
  "--act-color-on-operational",
  "--act-color-info",
  "--act-color-info-hover",
  "--act-color-info-soft",
  "--act-color-on-info",
  "--act-color-warning",
  "--act-color-warning-soft",
  "--act-color-on-warning",
  "--act-color-danger",
  "--act-color-danger-hover",
  "--act-color-danger-soft",
  "--act-color-on-danger",
  "--act-color-on-danger-solid",
  "--act-color-success",
  "--act-color-success-soft",
  "--act-color-on-success",
  "--act-color-focus-ring",
  "--act-color-operational-focus-ring",
  "--act-color-selection",
  "--act-chart-series-1",
  "--act-chart-series-2",
  "--act-chart-series-3",
  "--act-chart-series-4",
  "--act-chart-series-5",
  "--act-chart-series-6",
];

const LITERAL_ALLOWLIST = new Map([
  [
    "components/Composer.tsx",
    [
      /\[background:linear-gradient\(/,
      /bg-\[rgba\(45,51,58,0\.86\)\]/,
      /bg-\[rgba\(31,36,42,0\.94\)\]/,
      /text-white/,
      /bg-white/,
    ],
  ],
  ["components/settings/SettingsPrimitives.tsx", [/bg-white/]],
]);

const REQUIRED_LITERAL_EXCEPTIONS = new Map([
  [
    "components/right-panel/HtmlRenderView.tsx",
    [
      /theme === "dark" \? "#242522" : "#ffffff"/,
      /theme === "dark" \? "#f1f1ed" : "#20201e"/,
    ],
  ],
]);

function fail(message) {
  console.error(`frontend theme check failed: ${message}`);
  process.exitCode = 1;
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function findBlock(source, marker, fromIndex = 0) {
  const start = source.indexOf(marker, fromIndex);
  if (start < 0) return null;
  const open = source.indexOf("{", start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  return null;
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute));
    else if (/\.(?:css|ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const tokensSource = read(tokensPath);
const lightBlock = findBlock(tokensSource, ":root");
const darkBlock = findBlock(tokensSource, ':root[data-theme="dark"]');
const mediaStart = tokensSource.indexOf("@media (prefers-color-scheme: dark)");
const systemDarkBlock = findBlock(tokensSource, ':root[data-theme="system"]', mediaStart);

for (const [label, block] of [
  ["light", lightBlock],
  ["dark", darkBlock],
  ["system-dark", systemDarkBlock],
]) {
  if (!block) {
    fail(`missing ${label} theme block`);
    continue;
  }
  for (const token of REQUIRED_THEME_TOKENS) {
    if (!new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(block)) {
      fail(`${label} is missing ${token}`);
    }
  }
}

const definedRootTokens = new Set([...lightBlock.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
const tailwindSource = read(tailwindPath);
for (const match of tailwindSource.matchAll(/var\((--act-[a-z0-9-]+)\)/g)) {
  if (!definedRootTokens.has(match[1])) fail(`tailwind.css references undefined ${match[1]}`);
}

const forbiddenLiteralPattern =
  /(?:text|bg|border|ring|outline|fill|stroke|from|via|to)-(?:black|white)(?:\/\d+)?|(?:text|bg|border|ring|outline|fill|stroke|from|via|to)-\[[^\]]*(?:#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\()[^\]]*\]|\[background:(?:linear|radial|conic)-gradient\([^\]]+\]/gi;

for (const filePath of collectFiles(rendererRoot)) {
  const relative = path.relative(rendererRoot, filePath).split(path.sep).join("/");
  const source = read(filePath);

  if (/brand|--act-color-brand/i.test(source)) fail(`${relative} still contains legacy brand naming`);
  if (/\bwarm\b|--act-color-warm|on-warm/i.test(source)) fail(`${relative} still contains legacy warm naming`);

  if (relative === "styles/tokens.css" || relative === "styles/markdown.css") continue;

  const uncommented = stripComments(source);
  const allowed = LITERAL_ALLOWLIST.get(relative) ?? [];
  for (const match of uncommented.matchAll(forbiddenLiteralPattern)) {
    if (!allowed.some((pattern) => pattern.test(match[0]))) {
      fail(`${relative} contains non-theme-aware color utility ${match[0]}`);
    }
  }
}

for (const [relative, patterns] of REQUIRED_LITERAL_EXCEPTIONS) {
  const source = read(path.join(rendererRoot, relative));
  for (const pattern of patterns) {
    if (!pattern.test(source)) fail(`${relative} literal exception drifted; update its documented srcDoc palette intentionally`);
  }
}

if (!process.exitCode) console.log("前端主题颜色契约检查通过");
