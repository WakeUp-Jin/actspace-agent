import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HARNESS_EVENT_DECLARATION_PATHS,
  inspectHarnessEvents,
  inspectHookRegistrations,
  readListenerSources,
} from "../check-harness-event-contracts.mjs";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
test("detects missing declarations, mode changes and wrapped dispatches", () => {
  const declarations = '/** @mode waterfall */ "tools/before": Handler;';
  assert.deepEqual(inspectHarnessEvents(declarations, [["test", 'waterfallDispatch(ctx, "tools/before", {});']]), []);
  assert.match(
    inspectHarnessEvents(declarations, [["test", 'ctx.emit("tools/before", {});']])[0],
    /requires waterfall/,
  );
  assert.match(
    inspectHarnessEvents(declarations, [["test", 'ctx.emit?.("tools/before", {});']])[0],
    /requires waterfall/,
  );
  assert.match(
    inspectHarnessEvents(declarations, [["test", 'emitNotification(ctx, "unknown", {});']])[0],
    /missing @mode/,
  );
  const every =
    '/** @mode waterfall */ "tools/before": Handler; /** @mode serial */ "agent/stopping": Handler; /** @mode emit */ "agent/status": Handler; /** @mode parallel */ "x/all": Handler; /** @mode bail */ "x/first": Handler;';
  assert.deepEqual(
    inspectHarnessEvents(every, [
      [
        "a.ts",
        'emitNotification(ctx, "agent/status", {}); ctx.emit("agent/status", {}); serialDispatch(ctx, "agent/stopping", {}); ctx.serial("agent/stopping", {}); ctx.waterfall("tools/before", {}); ctx.parallel("x/all"); ctx.bail("x/first"); other.dispatch("x/unknown"); emitLater(ctx, "x/unknown"); skip_serialDispatch(ctx, "x/unknown");',
      ],
    ]),
    [],
  );
  assert.deepEqual(
    inspectHarnessEvents(every, [
      [
        "a.ts",
        'ctx.serial("tools/before", {}); ctx.bail("x/all"); ctx.parallel("x/missing"); ctx.waterfall("agent/stopping", {});',
      ],
      [
        "b.ts",
        'serialDispatch(ctx, "agent/status", {}); waterfallDispatch(ctx, "agent/stopping", {}); emitNotification(ctx, "tools/before", {}); serialDispatch(this.ctx,\n  "x/missing", {});',
      ],
    ]),
    [
      "a.ts: tools/before requires waterfall, dispatched serial",
      "a.ts: x/all requires parallel, dispatched bail",
      "a.ts: missing @mode for x/missing",
      "a.ts: agent/stopping requires serial, dispatched waterfall",
      "b.ts: tools/before requires waterfall, dispatched emit",
      "b.ts: agent/stopping requires serial, dispatched waterfall",
      "b.ts: agent/status requires emit, dispatched serial",
      "b.ts: missing @mode for x/missing",
    ],
  );
});
test("rejects hook listeners registered with a raw on() and leaves notifications alone", () => {
  const declarations =
    '/** @mode waterfall */ "tools/before": Handler; /** @mode serial */\n  "agent/stopping": Handler; /** @mode emit */ "agent/status": Handler;';
  const inspect = (source) => inspectHookRegistrations(declarations, [["plugin.ts", source]]);
  assert.deepEqual(
    inspect('onHook(ctx, "tools/before", listener); ctx.on("agent/status", observe); socket.on("close", done);'),
    [],
  );
  for (const fine of [
    'hooks.mention("tools/before", listener)',
    'on("tools/before", listener)',
    'ctx.on(name, "tools/before")',
    'ctx.on("tools/before-all", listener)',
    'ctx.only("tools/before", listener)',
    "ctx.on(\"tools/before', listener)",
  ])
    assert.deepEqual(inspect(fine), [], fine);
  assert.deepEqual(
    inspectHookRegistrations(declarations, [
      ["a.ts", 'ctx.on("tools/before", one); ctx.once("agent/stopping", two);'],
      ["b.ts", 'ctx.on("agent/status", observe);'],
      ["c.ts", 'ctx.on?.("tools/before", three);'],
    ]),
    [
      'a.ts: tools/before is a waterfall hook, register its listener with onHook(ctx, "tools/before", listener)',
      'a.ts: agent/stopping is a serial hook, register its listener with onHook(ctx, "agent/stopping", listener)',
      'c.ts: tools/before is a waterfall hook, register its listener with onHook(ctx, "tools/before", listener)',
    ],
  );
  assert.deepEqual(inspect('ctx.on("tools/before", listener);'), [
    'plugin.ts: tools/before is a waterfall hook, register its listener with onHook(ctx, "tools/before", listener)',
  ]);
  for (const raw of [
    'ctx.on?.("tools/before", listener)',
    'ctx.once("tools/before", listener)',
    "ctx.on('tools/before', listener)",
    "ctx.on(`tools/before`, listener)",
    'ctx.on(\n  "tools/before", listener)',
  ])
    assert.match(inspect(raw)[0], /tools\/before is a waterfall hook/, raw);
  assert.match(inspect('ctx.on("agent/stopping", listener);')[0], /agent\/stopping is a serial hook/);
});
test("reads the TypeScript product sources of packages and apps as places a listener can be registered", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "harness-event-contracts-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const read = [
    "packages/a/src/plugin.ts",
    "packages/a/src/view.tsx",
    "packages/a/src/worker.mts",
    "packages/a/src/legacy.cts",
    "apps/b/src/main.ts",
  ];
  const skipped = [
    "packages/a/src/plugin.test.ts",
    "packages/a/src/plugin.spec.tsx",
    "packages/a/src/plugin.bench.ts",
    "packages/a/src/plugin.perf.ts",
    "packages/a/src/worker.test.mts",
    "packages/a/src/types.d.ts",
    "packages/a/src/types.d.mts",
    "packages/a/src/testing.ts",
    "packages/a/src/test/helpers.ts",
    "packages/a/tests/helpers.ts",
    "packages/a/src/__tests__/helpers.ts",
    "packages/a/src/fixtures/sample.ts",
    "packages/a/dist/plugin.ts",
    "packages/a/build/plugin.ts",
    "packages/a/coverage/plugin.ts",
    "packages/a/node_modules/dep/index.ts",
    "apps/b/dist-electron/main.ts",
    "apps/b/out/main.ts",
    "apps/b/.cache/main.ts",
    "apps/b/src/preload.js",
    "apps/b/src/tool.mjs",
    "apps/b/src/data.json",
    "scripts/tool.ts",
    "docs/example.ts",
  ];
  for (const file of [...read, ...skipped]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `// ${file}\n`);
  }
  const sources = await readListenerSources(root);
  assert.deepEqual(sources.map(([path]) => path).sort(), [...read].sort());
  assert.deepEqual(
    sources.find(([path]) => path === "apps/b/src/main.ts"),
    ["apps/b/src/main.ts", "// apps/b/src/main.ts\n"],
  );
});
test("reads the declarations and sources of this repository, and reports a raw on() planted among them", async () => {
  const declarations = HARNESS_EVENT_DECLARATION_PATHS.map((path) => readFileSync(join(repoRoot, path), "utf8")).join(
    "\n",
  );
  const sources = await readListenerSources(repoRoot);
  for (const known of ["packages/core/agent-loop/src/loop.ts", "packages/core/tool-runtime/src/prepared-execution.ts"])
    assert.ok(
      sources.some(([path]) => path === known),
      known,
    );
  assert.ok(sources.some(([path]) => path.startsWith("apps/")));
  assert.deepEqual(inspectHookRegistrations(declarations, sources), []);
  const planted = [...sources, ["packages/x/src/plugin.ts", 'ctx.on("agent/request", listener);']];
  assert.deepEqual(inspectHookRegistrations(declarations, planted), [
    'packages/x/src/plugin.ts: agent/request is a waterfall hook, register its listener with onHook(ctx, "agent/request", listener)',
  ]);
});
