#!/usr/bin/env node
// T7 / T8 一次性字号替换：把 renderer 组件里的写死字号和 Tailwind 默认字号类换成 text-act-* token。
//
//   node font-size-codemod.mjs equal      # T7：只替换与规范档位完全相等的值（零视觉变化）
//   node font-size-codemod.mjs offscale   # T8：规范外的值按计划规则就近归档（有视觉变化）
//
// Tailwind 默认 text-xs / text-sm / text-xl 自带行高（16 / 20 / 28px），text-act-* 只设字号；
// 同一行没有 leading-* 时补上对应的 leading-4 / leading-5 / leading-7，保持原行高。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const rendererRoot = path.join(repoRoot, "apps/desktop/src/renderer");
const SKIP = new Set(["components/LabPage.tsx"]);

const SCALE = { 11: "xxs", 12: "xs", 13: "sm", 14: "md", 16: "lg", 20: "xl", 24: "title" };
// T8 规则：9/10 → 11（D4）；11.5/12.5 → 12；15 → 14（Composer 输入另按 D5 手工改 16）；17/18 → 16；22 → 20。
const OFFSCALE = { 9: 11, 10: 11, 11.5: 12, 12.5: 12, 15: 14, 17: 16, 18: 16, 22: 20 };
const TAILWIND_DEFAULTS = { xs: ["xs", "leading-4"], sm: ["md", "leading-5"], xl: ["xl", "leading-7"] };

function collect(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "test") files.push(...collect(absolute));
    } else if (/\.tsx?$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function equalPass(source) {
  let count = 0;
  let next = source.replace(/text-\[(\d+(?:\.\d+)?)px\]/g, (match, px) => {
    const step = SCALE[Number(px)];
    if (!step) return match;
    count += 1;
    return `text-act-${step}`;
  });
  next = next
    .split("\n")
    .map((line) => {
      const hasLeading = /(?<![\w-])leading-/.test(line);
      return line.replace(/(?<![\w\-[:])((?:[\w-]*(?:\[[^\]]*\])?:)*)text-(xs|sm|xl)(?![\w-])/g, (match, variants, size) => {
        const [step, leading] = TAILWIND_DEFAULTS[size];
        count += 1;
        return hasLeading ? `${variants}text-act-${step}` : `${variants}text-act-${step} ${variants}${leading}`;
      });
    })
    .join("\n");
  return { next, count };
}

function offscalePass(source) {
  let count = 0;
  const next = source.replace(/text-\[(\d+(?:\.\d+)?)px\]/g, (match, px) => {
    const target = OFFSCALE[Number(px)];
    if (!target) return match;
    count += 1;
    return `text-act-${SCALE[target]}`;
  });
  return { next, count };
}

const mode = process.argv[2];
const pass = mode === "equal" ? equalPass : mode === "offscale" ? offscalePass : null;
if (!pass) {
  console.error("usage: font-size-codemod.mjs equal|offscale [--only relative/path.tsx]");
  process.exit(2);
}
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex > 0 ? process.argv[onlyIndex + 1] : undefined;
let total = 0;
for (const file of collect(rendererRoot)) {
  const relative = path.relative(rendererRoot, file).split(path.sep).join("/");
  if (SKIP.has(relative) || (only && relative !== only)) continue;
  const source = fs.readFileSync(file, "utf8");
  const { next, count } = pass(source);
  if (count) {
    fs.writeFileSync(file, next);
    total += count;
    console.log(`${relative}: ${count}`);
  }
}
console.log(`total: ${total}`);
