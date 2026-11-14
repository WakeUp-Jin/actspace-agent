import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ALLOWED, auditCoreEventWrites, findCoreEventSources, runCheck } from "../check-core-event-writes.mjs";

test("finds every way of writing the core event source by hand", () => {
  const source = [
    'function core(type: string, data: Json) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }',
    "await session.append({ type: \"session/title-set\", eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, data, surface: null });",
    "const event = { type, eventVersion: 1, source: {ownerPluginId:`@actspace/core`}, data };",
    "const candidate = {",
    '  type: "user/message",',
    "  source: {",
    '    ownerPluginId: "@actspace/core",',
    "  },",
    "};",
    'const SOURCE = { ownerPluginId: "@actspace/core" } as const;',
    "const viaConstant = { type, eventVersion: 1, source: { ownerPluginId: CORE_EVENT_OWNER }, data, surface: null };",
    'const twice = [{ ownerPluginId: "@actspace/core" }, { ownerPluginId: "@actspace/core", }];',
  ].join("\n");
  assert.deepEqual(findCoreEventSources(source), [1, 2, 3, 6, 10, 11, 12, 12]);
});

test("ignores other owners, objects with more fields, comparisons and comment lines", () => {
  const source = [
    'return { type, eventVersion: 1, source: { ownerPluginId: TODO_PLUGIN_ID }, data, surface: null };',
    'return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/tool-todo" }, data, surface: null };',
    'const codec = { type: "turn/start", ownerPluginId: "@actspace/core", eventVersion: 1 };',
    'const provenance = { contributorId: id, ownerPluginId: "@actspace/core", layer, order };',
    'const first = { ownerPluginId: "@actspace/core", scopeId };',
    'const last = { scopeId, ownerPluginId: "@actspace/core" };',
    'if (codec.ownerPluginId === "@actspace/core") return true;',
    'export const CORE_EVENT_OWNER = "@actspace/core";',
    'const other = { ownerPluginId: "@actspace/core-tools" };',
    'const named = { ownerPluginId: MY_CORE_EVENT_OWNER_ID };',
    '// 以前写的是 source: { ownerPluginId: "@actspace/core" }',
    "/**",
    ' * 不要再写 { ownerPluginId: "@actspace/core" }。',
    " */",
    '  /* { ownerPluginId: CORE_EVENT_OWNER } */',
  ].join("\n");
  assert.deepEqual(findCoreEventSources(source), []);
});

test("reports each hand-written source in a file that is not on the list", () => {
  const errors = auditCoreEventWrites([
    { path: "packages/a/src/writer.ts", text: 'const a = 1;\nawait session.append({ type: "x", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });' },
    { path: "apps/b/src/main.ts", text: '// 注释行不算，也不让后面的行号往前挪\nconst one = { ownerPluginId: "@actspace/core" };\n\nconst two = { ownerPluginId: CORE_EVENT_OWNER };' },
    { path: "packages/a/src/clean.ts", text: 'await session.append(coreEvent("turn/end", { turnId, reason: "completed" }));' },
  ], []);
  assert.deepEqual(errors, [
    "apps/b/src/main.ts:2 手写了 core 的事件来源",
    "apps/b/src/main.ts:4 手写了 core 的事件来源",
    "packages/a/src/writer.ts:2 手写了 core 的事件来源",
  ]);
});

test("a listed file must contain exactly the recorded number of sources", () => {
  const allowed = [{ file: "packages/a/src/impl.ts", count: 1, reason: "实现" }];
  const one = "return { type, eventVersion: 1, source: { ownerPluginId: CORE_EVENT_OWNER }, data, surface: null };";
  assert.deepEqual(auditCoreEventWrites([{ path: "packages/a/src/impl.ts", text: one }], allowed), []);
  assert.deepEqual(auditCoreEventWrites([{ path: "packages/a/src/impl.ts", text: `${one}\n\n${one}` }], allowed), [
    "packages/a/src/impl.ts：手写 core 事件来源的有 2 处（第 1、3 行），清单只允许 1 处",
  ]);
  assert.deepEqual(auditCoreEventWrites([{ path: "packages/a/src/impl.ts", text: "return coreEvent(type, data);" }], allowed), [
    "packages/a/src/impl.ts：清单记了 1 处，现在只有 0 处，请同步修改 ALLOWED",
  ]);
  assert.deepEqual(auditCoreEventWrites([], allowed), [
    "packages/a/src/impl.ts：清单记了 1 处，现在只有 0 处，请同步修改 ALLOWED",
  ]);
});

test("scans TypeScript product sources, not scripts, tests, build output or other directories", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-event-writes-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bad = 'export const source = { ownerPluginId: "@actspace/core" };\n';
  const files = {
    "packages/a/src/writer.ts": bad,
    "packages/a/src/view.tsx": bad,
    "packages/a/src/worker.mts": bad,
    "apps/b/src/loader.cts": bad,
    "packages/a/src/clean.ts": "export const ok = true;\n",
    "apps/b/scripts/benchmark.mjs": bad,
    "apps/b/src/preload.js": bad,
    "apps/b/src/main.cjs": bad,
    "apps/b/src/widget.jsx": bad,
    "packages/a/src/writer.test.ts": bad,
    "packages/a/src/writer.spec.tsx": bad,
    "packages/a/src/writer.bench.ts": bad,
    "packages/a/src/writer.perf.mts": bad,
    "packages/a/src/types.d.ts": bad,
    "packages/a/src/types.d.mts": bad,
    "packages/a/src/test/helpers.ts": bad,
    "packages/a/src/tests/helpers.ts": bad,
    "packages/a/src/__tests__/helpers.ts": bad,
    "packages/a/src/fixtures/sample.ts": bad,
    "packages/a/dist/writer.ts": bad,
    "packages/a/build/writer.ts": bad,
    "packages/a/coverage/writer.ts": bad,
    "packages/a/node_modules/dep/index.ts": bad,
    "apps/b/out/main.ts": bad,
    "apps/b/dist-electron/main.ts": bad,
    "apps/b/.cache/main.ts": bad,
    "packages/a/README.md": bad,
    "scripts/tool.ts": bad,
    "docs/example.ts": bad,
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  assert.deepEqual(runCheck(root, []), {
    files: 5,
    errors: [
      "apps/b/src/loader.cts:1 手写了 core 的事件来源",
      "packages/a/src/view.tsx:1 手写了 core 的事件来源",
      "packages/a/src/worker.mts:1 手写了 core 的事件来源",
      "packages/a/src/writer.ts:1 手写了 core 的事件来源",
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
