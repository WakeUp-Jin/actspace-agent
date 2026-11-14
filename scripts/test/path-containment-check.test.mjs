import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ALLOWED, auditPathContainment, findPrefixChecks, runCheck } from "../check-path-containment.mjs";

test("finds every way of prefix-checking a relative path against ..", () => {
  const source = [
    'if (relative(root, target).startsWith("..")) return false;',
    "if (nested.startsWith('..')) return false;",
    "if (nested.startsWith(`..`)) return false;",
    'if (nested === ".." || nested.startsWith("../")) return false;',
    'if (nested.startsWith("..\\\\")) return false;',
    // `$` 和 `{` 拆开写：这是示例源码，不是漏写的模板字符串。
    "if (nested.startsWith(`..$" + "{sep}`) || nested.startsWith(`..$" + "{path.sep}`)) return false;",
    'if (nested.startsWith( ".." )) return false;',
  ].join("\n");
  assert.deepEqual(findPrefixChecks(source), [1, 2, 3, 4, 5, 6, 6, 7]);
});

test("finds a check that the formatter wrapped over several lines, reported at the startsWith line", () => {
  const source = [
    "const outside = path",
    "  .relative(workspaceRootDirectory, candidateTargetPath)",
    "  .startsWith(",
    '    "..",',
    "  );",
    "if (",
    "  nested.startsWith(",
    "    // 说明写在参数前面",
    "    `..$" + "{sep}`,",
    "  )",
    ") return false;",
  ].join("\n");
  assert.deepEqual(findPrefixChecks(source), [3, 7]);
});

test("ignores other dot prefixes, segment comparisons and comment lines", () => {
  const source = [
    'if (text.startsWith("...")) return "ellipsis";',
    'if (name.startsWith(".") || name.startsWith("./")) return "hidden";',
    'if (name.startsWith("..cache")) return "named";',
    'if (segment === ".." || parts.includes("..") || name.endsWith("..")) return null;',
    '// 以前写的是 relative(root, target).startsWith("..")',
    "/**",
    ' * 不要写 nested.startsWith("../")。',
    " */",
    '  /* nested.startsWith("..") */',
    "name.startsWith(",
    '  "...",',
    ");",
    "name.startsWith(",
    '  // "..",',
    '  ".",',
    ");",
  ].join("\n");
  assert.deepEqual(findPrefixChecks(source), []);
});

test("reports each hand-written check in a file that is not on the list", () => {
  const errors = auditPathContainment([
    { path: "packages/a/src/policy.ts", text: 'const a = 1;\nreturn !relative(root, target).startsWith("..");' },
    { path: "apps/b/src/open.ts", text: 'return rel === ".." || rel.startsWith("../") || rel.startsWith("..\\\\");' },
    { path: "packages/a/src/clean.ts", text: "return isLexicallyInside(nodePath, root, target, { includeRoot: true });" },
  ], []);
  assert.deepEqual(errors, [
    "apps/b/src/open.ts:1 对「..」开头做了前缀判断",
    "apps/b/src/open.ts:1 对「..」开头做了前缀判断",
    "packages/a/src/policy.ts:2 对「..」开头做了前缀判断",
  ]);
});

test("a listed file must contain exactly the recorded number of checks", () => {
  const allowed = [{ file: "packages/a/src/impl.ts", count: 1, reason: "实现" }];
  const one = 'return nested.startsWith("../");';
  assert.deepEqual(auditPathContainment([{ path: "packages/a/src/impl.ts", text: one }], allowed), []);
  assert.deepEqual(auditPathContainment([{ path: "packages/a/src/impl.ts", text: `${one}\n\n${one}` }], allowed), [
    "packages/a/src/impl.ts：对「..」开头做前缀判断的有 2 处（第 1、3 行），清单只允许 1 处",
  ]);
  assert.deepEqual(auditPathContainment([{ path: "packages/a/src/impl.ts", text: "return true;" }], allowed), [
    "packages/a/src/impl.ts：清单记了 1 处，现在只有 0 处，请同步修改 ALLOWED",
  ]);
  assert.deepEqual(auditPathContainment([], allowed), [
    "packages/a/src/impl.ts：清单记了 1 处，现在只有 0 处，请同步修改 ALLOWED",
  ]);
});

test("scans product and script sources, not tests, build output or other directories", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "path-containment-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bad = 'export const outside = (rel) => rel.startsWith("..");\n';
  const files = {
    "packages/a/src/policy.ts": bad,
    "packages/a/src/view.tsx": bad,
    "packages/a/src/worker.mts": bad,
    "packages/a/src/loader.cts": bad,
    "apps/b/src/main.cjs": bad,
    "apps/b/src/preload.js": bad,
    "apps/b/src/widget.jsx": bad,
    "scripts/pack.mjs": bad,
    "packages/a/src/clean.ts": "export const ok = true;\n",
    "packages/a/src/policy.test.ts": bad,
    "packages/a/src/policy.spec.tsx": bad,
    "packages/a/src/policy.bench.ts": bad,
    "packages/a/src/policy.perf.mjs": bad,
    "packages/a/src/types.d.ts": bad,
    "packages/a/src/test/helpers.ts": bad,
    "packages/a/src/tests/helpers.ts": bad,
    "packages/a/src/__tests__/helpers.ts": bad,
    "packages/a/src/fixtures/sample.ts": bad,
    "packages/a/dist/policy.js": bad,
    "packages/a/build/policy.js": bad,
    "packages/a/coverage/policy.js": bad,
    "packages/a/node_modules/dep/index.js": bad,
    "apps/b/out/main.js": bad,
    "apps/b/dist-electron/main.js": bad,
    "apps/b/.cache/main.js": bad,
    "scripts/test/helpers.mjs": bad,
    "packages/a/README.md": bad,
    "docs/example.ts": bad,
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  assert.deepEqual(runCheck(root, []), {
    files: 9,
    errors: [
      "apps/b/src/main.cjs:1 对「..」开头做了前缀判断",
      "apps/b/src/preload.js:1 对「..」开头做了前缀判断",
      "apps/b/src/widget.jsx:1 对「..」开头做了前缀判断",
      "packages/a/src/loader.cts:1 对「..」开头做了前缀判断",
      "packages/a/src/policy.ts:1 对「..」开头做了前缀判断",
      "packages/a/src/view.tsx:1 对「..」开头做了前缀判断",
      "packages/a/src/worker.mts:1 对「..」开头做了前缀判断",
      "scripts/pack.mjs:1 对「..」开头做了前缀判断",
    ],
  });
});

test("every listed exception is unique and says why it is allowed", () => {
  assert.equal(new Set(ALLOWED.map((entry) => entry.file)).size, ALLOWED.length);
  for (const entry of ALLOWED) {
    assert.ok(Number.isInteger(entry.count) && entry.count > 0, entry.file);
    assert.ok(entry.reason.trim().length > 0, entry.file);
  }
});

test("the repository passes", () => {
  const { files, errors } = runCheck();
  assert.ok(files > 0);
  assert.deepEqual(errors, []);
});
