import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectHarnessEvents, inspectHookRegistrations } from '../check-harness-event-contracts.mjs';
test('detects missing declarations, mode changes and wrapped dispatches', () => {
  const declarations = '/** @mode waterfall */ "tools/before": Handler;';
  assert.deepEqual(inspectHarnessEvents(declarations, [['test', 'waterfallDispatch(ctx, "tools/before", {});']]), []);
  assert.match(inspectHarnessEvents(declarations, [['test', 'ctx.emit("tools/before", {});']])[0], /requires waterfall/);
  assert.match(inspectHarnessEvents(declarations, [['test', 'ctx.emit?.("tools/before", {});']])[0], /requires waterfall/);
  assert.match(inspectHarnessEvents(declarations, [['test', 'emitNotification(ctx, "unknown", {});']])[0], /missing @mode/);
});
test('rejects hook listeners registered with a raw on() and leaves notifications alone', () => {
  const declarations = '/** @mode waterfall */ "tools/before": Handler; /** @mode serial */\n  "agent/stopping": Handler; /** @mode emit */ "agent/status": Handler;';
  const inspect = (source) => inspectHookRegistrations(declarations, [['plugin.ts', source]]);
  assert.deepEqual(inspect('onHook(ctx, "tools/before", listener); ctx.on("agent/status", observe); socket.on("close", done);'), []);
  assert.deepEqual(inspect('ctx.on("tools/before", listener);'), ['plugin.ts: tools/before is a waterfall hook, register its listener with onHook(ctx, "tools/before", listener)']);
  for (const raw of ['ctx.on?.("tools/before", listener)', 'ctx.once("tools/before", listener)', "ctx.on('tools/before', listener)", 'ctx.on(`tools/before`, listener)', 'ctx.on(\n  "tools/before", listener)']) assert.match(inspect(raw)[0], /tools\/before is a waterfall hook/, raw);
  assert.match(inspect('ctx.on("agent/stopping", listener);')[0], /agent\/stopping is a serial hook/);
});
