import assert from "node:assert/strict";
import test from "node:test";
import { checkSource, checkTokenReferences, collectDefinedVariables, runCheck } from "../check-frontend-design-tokens.mjs";

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

test("ignores comments, the retired Lab page and exact allowlisted literals", () => {
  assert.deepEqual(rules("components/A.tsx", '// text-[13px] 只是说明\nconst A = "text-act-sm";'), []);
  assert.deepEqual(rules("components/LabPage.tsx", 'const A = "text-[13px]";'), []);
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

test("the current renderer passes the check", () => {
  assert.deepEqual(runCheck(), []);
});
