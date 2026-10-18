import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  checkCssBlocks,
  checkNativeButtons,
  checkSource,
  checkTokenReferences,
  checkUiOnly,
  collectDefinedVariables,
  collectNativeButtonCounts,
  countNativeButtons,
  loadNativeButtonBaseline,
  runAllChecks,
  runCheck,
  WEB_PROFILE,
} from "../check-frontend-design-tokens.mjs";

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

const uiOnly = (relative, source) => checkUiOnly(relative, source).map((violation) => `${violation.rule}:${violation.match}`);

test("createPortal is only allowed in components/ui/", () => {
  const source = 'import { createPortal } from "react-dom";\nexport const A = () => createPortal(<div />, document.body);';
  assert.deepEqual(uiOnly("components/settings/A.tsx", source), [
    "create-portal-outside-ui:createPortal",
    "create-portal-outside-ui:createPortal",
  ]);
  assert.deepEqual(uiOnly("components/ui/Popover.tsx", source), []);
  assert.deepEqual(uiOnly("components/A.tsx", "// 以前在这里 createPortal，现在用 ui/Popover\nconst A = 1;"), []);
  assert.deepEqual(uiOnly("components/A.tsx", "const createPortalLike = 1;"), []);
});

test('role="dialog" is only allowed in components/ui/, with exact file exceptions', () => {
  assert.deepEqual(uiOnly("components/A.tsx", '<div role="dialog" aria-label="x" />'), ['role-dialog-outside-ui:role="dialog"']);
  assert.deepEqual(uiOnly("components/A.tsx", "<div role={'dialog'} />"), ["role-dialog-outside-ui:role={'dialog'"]);
  assert.deepEqual(uiOnly("components/A.tsx", 'const props = { role: "dialog" };'), ['role-dialog-outside-ui:role: "dialog"']);
  assert.deepEqual(uiOnly("components/A.tsx", '<div role="alertdialog" /><div role="dialogue" />'), []);
  assert.deepEqual(uiOnly("components/ui/Dialog.tsx", '<div role="dialog" />'), []);
  assert.deepEqual(uiOnly("components/composer/ResponseAnnotationPill.tsx", '<div role="dialog" />'), []);
  // 例外只放过登记的规则
  assert.deepEqual(uiOnly("components/composer/ResponseAnnotationPill.tsx", "createPortal(x, y)"), ["create-portal-outside-ui:createPortal"]);
});

test("native buttons are counted per .tsx file outside components/ui/", () => {
  assert.equal(countNativeButtons("components/A.tsx", '<button type="button" />\n<button\n  type="submit"\n/>\n<buttons /><button-group />'), 2);
  assert.equal(countNativeButtons("components/A.tsx", "// <button> 以前在这里\n/* <button> */\nconst a = 1;"), 0);
  assert.equal(countNativeButtons("components/ui/Button.tsx", "<button />"), 0);
  assert.equal(countNativeButtons("components/a.ts", 'const html = "<button>";'), 0);
});

test("native buttons above the baseline fail, below it only suggest tightening", () => {
  const baseline = { "components/A.tsx": 2, "components/B.tsx": 3, "components/Gone.tsx": 1 };
  const result = checkNativeButtons(new Map([["components/A.tsx", 3], ["components/B.tsx", 1], ["components/New.tsx", 1]]), baseline);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /^components\/A\.tsx 有 3 个原生 <button>，基线是 2/);
  assert.match(result.errors[1], /^components\/New\.tsx 有 1 个原生 <button>，基线是 0/);
  assert.equal(result.notices.length, 2);
  assert.match(result.notices[0], /^components\/B\.tsx 原生 <button> 从 3 降到 1/);
  assert.match(result.notices[1], /^components\/Gone\.tsx 已不存在/);
  assert.deepEqual(checkNativeButtons(new Map([["components/A.tsx", 2]]), { "components/A.tsx": 2 }), { errors: [], notices: [] });
});

test("runCheck reports a portal, a dialog and an extra native button in a renderer tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-tokens-"));
  try {
    fs.mkdirSync(path.join(root, "styles"));
    fs.writeFileSync(path.join(root, "styles/base.css"), ".tool-log-text-running { color: red; }\n.tool-log-text-running::after { display: none; }\n");
    fs.writeFileSync(path.join(root, "styles/diff.css"), ".file-diff-content { max-height: 4px; overflow-y: auto; overflow-x: auto; }\n");
    fs.mkdirSync(path.join(root, "components/ui"), { recursive: true });
    fs.writeFileSync(path.join(root, "components/ui/Dialog.tsx"), 'createPortal(<div role="dialog"><button /></div>, document.body);');
    fs.writeFileSync(path.join(root, "components/Panel.tsx"), '<div role="dialog"><button /><button /></div>;');
    fs.mkdirSync(path.join(root, "test"));
    fs.writeFileSync(path.join(root, "test/Panel.test.tsx"), "createPortal(<button />, document.body);");
    const notices = [];
    const problems = runCheck(root, { "components/Panel.tsx": 1 }, notices);
    assert.deepEqual(problems.map((problem) => problem.split(" ")[0]), ["components/Panel.tsx:1", "components/Panel.tsx"]);
    assert.match(problems[0], /role="dialog"/);
    assert.match(problems[1], /有 2 个原生 <button>，基线是 1/);
    assert.deepEqual(notices, []);
    assert.deepEqual([...collectNativeButtonCounts(root)], [["components/Panel.tsx", 2]]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the current renderer passes the check and matches the native button baseline exactly", () => {
  const notices = [];
  assert.deepEqual(runCheck(undefined, loadNativeButtonBaseline(), notices), []);
  assert.deepEqual(notices, []);
});

// ---- apps/web 扫描根 ----

const lightTokens = ["bg", "surface", "surface-subtle", "surface-raised", "sidebar", "selected", "sidebar-selected", "hover-overlay", "border", "border-strong", "meter-track", "toggle-off", "text", "text-muted", "text-faint", "text-subtle", "action", "action-hover", "on-action", "operational", "operational-hover", "operational-soft", "on-operational", "info", "info-hover", "info-soft", "on-info", "warning", "warning-soft", "on-warning", "danger", "danger-hover", "danger-soft", "on-danger", "on-danger-solid", "success", "success-soft", "on-success", "accent", "accent-hover", "on-accent", "toggle-on", "link", "focus-ring", "operational-focus-ring", "selection"]
  .map((name) => `--act-color-${name}: #112233;`)
  .join(" ");

function makeWebRepo(files) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-web-"));
  const src = path.join(repo, "apps/web/src");
  fs.mkdirSync(path.join(src, "styles"), { recursive: true });
  fs.writeFileSync(path.join(src, "styles/tailwind.css"), "@theme inline { --text-act-base: 15px; --text-act-sm: 13px; --radius-act-md: 8px; }\n");
  fs.writeFileSync(
    path.join(src, "styles/tokens.css"),
    `:root { ${lightTokens} --web-glass: rgba(255,255,255,.72); }\n@media (prefers-color-scheme: dark) { :root { ${lightTokens} --web-glass: rgba(36,37,34,.72); } }\n`,
  );
  for (const [relative, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, relative)), { recursive: true });
    fs.writeFileSync(path.join(src, relative), source);
  }
  return repo;
}

const webProblems = (files) => {
  const repo = makeWebRepo(files);
  try {
    return runAllChecks(repo, {}).flatMap((result) => result.problems);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
};

test("web root: text-act-base is valid in web but undefined in desktop tokens", () => {
  assert.deepEqual(webProblems({ "pages/A.tsx": 'export const A = () => <p className="text-act-base text-act-sm" />;' }), []);
  const desktopDefined = collectDefinedVariables([fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../apps/desktop/src/renderer/styles/tailwind.css"), "utf8")]);
  assert.deepEqual(checkTokenReferences("a.tsx", 'x="text-act-base"', desktopDefined).map((item) => item.variable), ["--text-act-base"]);
});

test("web root: hard-coded font sizes and undefined tokens fail", () => {
  const problems = webProblems({ "pages/A.tsx": 'export const A = () => <p className="text-[13px] text-act-huge" />;' });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^\[web\] pages\/A\.tsx:1 text-\[13px\]/);
  assert.match(problems[1], /未定义的 token --text-act-huge/);
});

test("web root: native <button>, createPortal and role=dialog are only allowed in ui/", () => {
  const problems = webProblems({
    "pages/A.tsx": 'createPortal(<div role="dialog"><button /></div>, document.body);',
    "ui/Button.tsx": 'export const Button = () => <button type="button" />;',
    "ui/Sheet.tsx": 'createPortal(<div role="dialog" />, document.body);',
    "test/A.test.tsx": "<button />;",
  });
  assert.equal(problems.length, 3);
  assert.ok(problems.some((problem) => /pages\/A\.tsx:1 createPortal — .*apps\/web|pages\/A\.tsx:1 createPortal — 弹层用 ui\//.test(problem)));
  assert.ok(problems.some((problem) => /role="dialog" — .*ui\//.test(problem)));
  assert.ok(problems.some((problem) => /^\[web\] pages\/A\.tsx 有 1 个原生 <button>，基线是 0 — 用 ui\/ 的 Button/.test(problem)));
});

test("web root is skipped when apps/web/src does not exist", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-noweb-"));
  try {
    assert.deepEqual(runAllChecks(repo, {}), []);
    assert.equal(WEB_PROFILE.root, "apps/web/src");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("theme check script scans apps/web/src and flags raw color utilities", () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../check-frontend-theme-colors.mjs");
  const run = (files) => {
    const repo = makeWebRepo(files);
    try {
      return spawnSync(process.execPath, [script], { env: { ...process.env, FRONTEND_CHECK_REPO_ROOT: repo }, encoding: "utf8" });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  };
  const ok = run({ "pages/A.tsx": 'x = "bg-surface text-text-main";' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /web/);
  const bad = run({ "pages/A.tsx": 'x = "bg-white text-[#fff]";' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /\[web\] pages\/A\.tsx contains non-theme-aware color utility bg-white/);
});
