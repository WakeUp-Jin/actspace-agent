import assert from "node:assert/strict";
import test from "node:test";
import { checkCssBlocks, checkSource, checkTokenReferences, collectDefinedVariables, runCheck } from "../check-frontend-design-tokens.mjs";

const rules = (relative, source) => checkSource(relative, source).map((violation) => `${violation.rule}:${violation.match}`);

test("flags hard-coded font sizes and Tailwind default font sizes", () => {
  assert.deepEqual(rules("components/A.tsx", 'const A = "text-[13px] text-sm max-[600px]:text-xs";'), [
    "font-size-literal:text-[13px]",
    "tailwind-default-font-size:text-sm",
    "tailwind-default-font-size:max-[600px]:text-xs",
  ]);
  assert.deepEqual(rules("components/A.tsx", 'const A = "text-act-sm text-text-main text-left";'), []);
});

test("flags radius, z-index, duration literals and the retired cold shadow", () => {
  assert.deepEqual(
    rules("components/A.tsx", 'const A = "rounded-[7px] rounded-l-[7px] z-[90] duration-[130ms] duration-150 shadow-[0_1px_2px_rgba(31,45,61,0.04)]";'),
    [
      "radius-literal:rounded-[7px]",
      "radius-literal:rounded-l-[7px]",
      "z-index-literal:z-[90]",
      "cold-shadow:rgba(31,45,61",
      "duration-literal:duration-[130ms]",
      "duration-literal:duration-150",
    ],
  );
  assert.deepEqual(rules("components/A.tsx", 'const A = "z-[1] z-[2] z-1 z-(--act-z-modal) duration-(--motion-fast) rounded-act-group";'), []);
});

test("flags Tailwind palette colors and legacy colored focus rings", () => {
  assert.deepEqual(
    rules("components/A.tsx", 'const A = "text-red-500 hover:bg-emerald-50 border-slate-200/60 focus:border-blue-400 focus-visible:ring-sky-300";'),
    [
      "palette-color-literal:text-red-500",
      "palette-color-literal:bg-emerald-50",
      "palette-color-literal:border-slate-200",
      "palette-color-literal:border-blue-400",
      "palette-color-literal:ring-sky-300",
      "focus-ring-legacy:focus:border-blue-",
      "focus-ring-legacy:focus-visible:ring-sky-",
    ],
  );
  assert.deepEqual(
    rules("components/A.tsx", 'const A = "border-b-rose-300 divide-gray-200 ring-offset-sky-100 placeholder-slate-400";'),
    [
      "palette-color-literal:border-b-rose-300",
      "palette-color-literal:divide-gray-200",
      "palette-color-literal:ring-offset-sky-100",
      "palette-color-literal:placeholder-slate-400",
    ],
  );
  assert.deepEqual(
    rules("components/A.tsx", 'const A = "text-danger bg-operational focus-visible:ring-focus-ring focus-visible:outline-focus-ring text-red-soft bg-blue-x1";'),
    [],
  );
});

test("ignores comments and exact allowlisted literals", () => {
  assert.deepEqual(rules("components/A.tsx", '// text-[13px] 只是说明\nconst A = "text-act-sm";'), []);
  assert.deepEqual(rules("components/ContextPopup.tsx", 'const A = "rounded-[3px]";'), []);
  assert.deepEqual(rules("components/ContextPopup.tsx", 'const A = "rounded-[4px]";'), ["radius-literal:rounded-[4px]"]);
});

test("reports token classes that the style layer never defines", () => {
  const defined = collectDefinedVariables([
    "@theme inline { --text-act-sm: 13px; --radius-act-md: var(--act-radius-md); --shadow-act-popover: var(--act-shadow-popover); }",
    ":root { --act-z-modal: 150; --motion-fast: 120ms; }",
  ]);
  const missing = checkTokenReferences(
    "components/A.tsx",
    'const A = "text-act-sm text-act-huge rounded-act-md rounded-t-act-xl shadow-act-popover shadow-act-float z-(--act-z-modal) z-(--act-z-top) duration-(--motion-fast)";',
    defined,
  ).map((item) => item.variable);
  assert.deepEqual(missing, ["--text-act-huge", "--radius-act-xl", "--shadow-act-float", "--act-z-top"]);
});

const blockRules = [
  { id: "no-green", file: "styles/a.css", selector: [".run", ".run::after"], forbid: [/--green/], require: [], hint: "" },
  { id: "bounded", file: "styles/b.css", selector: ".box", forbid: [], require: [/max-height\s*:\s*\d/, /overflow-y\s*:\s*auto/], hint: "" },
];
const blocks = (relative, source) => checkCssBlocks(relative, source, blockRules).map((violation) => `${violation.rule}:${violation.match}`);

test("CSS block rules flag forbidden and missing declarations inside the exact selector", () => {
  const running = ".run { color: var(--ink); }\n.run::after { color: var(--ink); }\n@media (x) {\n  .run::after { color: var(--green); }\n}";
  assert.deepEqual(blocks("styles/a.css", running), ["no-green:--green"]);
  assert.deepEqual(blocks("styles/b.css", ".box { max-height: 4px; overflow-y: hidden; }"), ["bounded:缺少 overflow-y\\s*:\\s*auto"]);
  // require 可以由 @media 中的覆盖块满足
  assert.deepEqual(blocks("styles/b.css", ".box { max-height: 4px; }\n@media (x) {\n  .box { overflow-y: auto; }\n}"), []);
  // 规则只对自己的文件生效
  assert.deepEqual(blocks("styles/c.css", ".run { color: var(--green); }"), []);
});

test("CSS block rules do not capture variants, descendants, comments or selector lists", () => {
  const source = [
    "/* .run { color: var(--green); } */",
    ".run { color: var(--ink); }",
    ".run::after { color: var(--ink); }",
    ".run.is-done { color: var(--green); }",
    ".parent .run { color: var(--green); }",
    ".run-label { color: var(--green); }",
  ].join("\n");
  assert.deepEqual(blocks("styles/a.css", source), []);
  assert.deepEqual(blocks("styles/b.css", ".box.is-streaming { max-height: 4px; overflow-y: auto; }\n.box { max-height: 4px; overflow-y: auto; }"), []);
});

test("CSS block rules reject unbounded values and nested rules they cannot slice", () => {
  assert.deepEqual(blocks("styles/b.css", ".box { max-height: none; overflow-y: auto; }"), ["bounded:缺少 max-height\\s*:\\s*\\d"]);
  assert.deepEqual(blocks("styles/a.css", ".run { color: var(--ink); & .x { color: var(--ink); } }\n.run::after { color: var(--ink); }"), [
    "no-green:.run 块内有嵌套规则，脚本无法准确截取",
  ]);
});

test("CSS block rules report a selector that no longer exists", () => {
  assert.deepEqual(blocks("styles/a.css", ".run { color: var(--ink); }"), ["no-green:找不到选择器 .run::after"]);
  assert.deepEqual(blocks("styles/b.css", ".box.is-streaming { max-height: 4px; overflow-y: auto; }"), ["bounded:找不到选择器 .box"]);
});

test("the current renderer passes the check", () => {
  assert.deepEqual(runCheck(), []);
});
