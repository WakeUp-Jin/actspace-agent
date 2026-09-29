import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(repoRoot, "apps/desktop/src/renderer");
const tokensPath = path.join(rendererRoot, "styles/tokens.css");
const tailwindPath = path.join(rendererRoot, "styles/tailwind.css");
const accentsPath = path.join(rendererRoot, "appearance/accents.ts");

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
  "--act-color-meter-track",
  "--act-color-toggle-off",
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
  "--act-color-accent",
  "--act-color-accent-hover",
  "--act-color-on-accent",
  "--act-color-toggle-on",
  "--act-color-link",
  "--act-color-focus-ring",
  "--act-color-operational-focus-ring",
  "--act-color-selection",
  "--act-color-annotation-highlight",
  "--act-scrollbar-thumb-subtle",
  "--act-scrollbar-thumb-subtle-hover",
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

// 强调色调色板（front-accent-palette.md）：accents.ts 每个 ID 都要有色样 token；
// 非默认 ID 要有带浅深源值的 data-accent 块，且源值满足对比度门槛；默认 ID 不得定义源值。
const DEFAULT_ACCENT_PALETTE = "default";
const ACCENT_MIN_CONTRAST = 4.5;
const accentRegistry = read(accentsPath).match(/ACCENT_PALETTES[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
const accentIds = [...accentRegistry.matchAll(/\bid:\s*"([a-z0-9-]+)"/g)].map((match) => match[1]);

function hexToken(block, token) {
  return block?.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})\\s*;`, "i"))?.[1] ?? null;
}

function contrast(a, b) {
  const luminance = (hex) =>
    [1, 3, 5]
      .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const sharedAccentBlock = findBlock(tokensSource, ':root[data-accent]:not([data-accent="default"])');
const accentBackdrops = {
  light: {
    "on-accent": hexToken(sharedAccentBlock, "--act-palette-light-on-accent"),
    surface: hexToken(lightBlock, "--act-color-surface"),
    bg: hexToken(lightBlock, "--act-color-bg"),
    "surface-subtle": hexToken(lightBlock, "--act-color-surface-subtle"),
  },
  dark: {
    "on-accent": hexToken(sharedAccentBlock, "--act-palette-dark-on-accent"),
    surface: hexToken(darkBlock, "--act-color-surface"),
    bg: hexToken(darkBlock, "--act-color-bg"),
    "surface-raised": hexToken(darkBlock, "--act-color-surface-raised"),
  },
};

if (!accentIds.includes(DEFAULT_ACCENT_PALETTE)) fail(`appearance/accents.ts is missing default palette ${DEFAULT_ACCENT_PALETTE}`);
if (lightBlock && /--act-palette-[a-z-]+\s*:/.test(lightBlock)) fail("light block must not define --act-palette-* source values (default palette falls back)");
for (const id of accentIds) {
  const swatch = id === DEFAULT_ACCENT_PALETTE ? `--act-preview-accent-${id}-ink` : `--act-preview-accent-${id}`;
  if (lightBlock && !lightBlock.includes(`${swatch}:`)) fail(`light is missing accent swatch ${swatch}`);
  const block = findBlock(tokensSource, `:root[data-accent="${id}"]`);
  if (id === DEFAULT_ACCENT_PALETTE) {
    if (block) fail(`default accent palette must not have a :root[data-accent="${id}"] block`);
    continue;
  }
  if (!block) {
    fail(`tokens.css is missing :root[data-accent="${id}"] block`);
    continue;
  }
  for (const tone of ["light", "dark"]) {
    const accent = hexToken(block, `--act-palette-${tone}-accent`);
    if (!accent) {
      fail(`accent palette ${id} is missing a hex --act-palette-${tone}-accent`);
      continue;
    }
    for (const [label, backdrop] of Object.entries(accentBackdrops[tone])) {
      if (!backdrop) {
        fail(`accent contrast check cannot resolve ${tone} ${label}`);
        continue;
      }
      const ratio = contrast(accent, backdrop);
      if (ratio < ACCENT_MIN_CONTRAST) fail(`accent palette ${id} ${tone} ${accent} vs ${label} ${backdrop} is ${ratio.toFixed(2)}:1 (< ${ACCENT_MIN_CONTRAST})`);
    }
  }
}
for (const match of tokensSource.matchAll(/:root\[data-accent="([a-z0-9-]+)"\]/g)) {
  if (!accentIds.includes(match[1])) fail(`tokens.css defines unregistered accent palette ${match[1]}`);
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
