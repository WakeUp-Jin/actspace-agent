import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectHarnessEvents } from '../check-harness-event-contracts.mjs';
test('detects missing declarations, mode changes and wrapped dispatches', () => {
  const declarations = '/** @mode waterfall */ "tools/before": Handler;';
  assert.deepEqual(inspectHarnessEvents(declarations, [['test', 'waterfallDispatch(ctx, "tools/before", {});']]), []);
  assert.match(inspectHarnessEvents(declarations, [['test', 'ctx.emit("tools/before", {});']])[0], /requires waterfall/);
  assert.match(inspectHarnessEvents(declarations, [['test', 'emitContained(ctx, "unknown", {});']])[0], /missing @mode/);
});
