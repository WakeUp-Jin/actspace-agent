import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatrix, renderJson, renderMarkdown, validateRows } from "../contract-matrix/generate.mjs";

test("contract matrix is deterministic and preserves the 13/10/6 event surfaces", async () => {
  const first = await buildMatrix();
  const second = await buildMatrix();
  assert.deepEqual(first, second);
  assert.equal(first.events.filter((item) => item.category === "core").length, 13);
  assert.equal(first.events.filter((item) => item.category === "agent-loop").length, 10);
  assert.equal(first.events.filter((item) => item.category === "notification").length, 6);
  assert.equal(first.events.find((item) => item.eventType === "goal/change")?.producerStatus, "not-implemented");
  assert.equal(first.events.find((item) => item.eventType === "schedule/change")?.producerStatus, "not-implemented");
  assert.doesNotMatch(renderJson(first), /\/Users\//u);
  assert.doesNotMatch(renderMarkdown(first), /\/Users\//u);
  assert.match(renderMarkdown(first), /Generated artifact; edit source declarations instead/u);
});

test("contract matrix validator fails closed for duplicate ids and notification veto metadata", async () => {
  const matrix = await buildMatrix();
  const duplicate = structuredClone(matrix);
  duplicate.services.push(structuredClone(duplicate.services[0]));
  const duplicateDiagnostics = validateRows(duplicate);
  assert.equal(duplicateDiagnostics.some((item) => item.code === "DUPLICATE_ID"), true);

  const veto = structuredClone(matrix);
  const notification = veto.events.find((item) => item.category === "notification");
  assert.ok(notification);
  notification.mode = "waterfall";
  const vetoDiagnostics = validateRows(veto);
  assert.equal(vetoDiagnostics.some((item) => item.code === "NOTIFICATION_VETO"), true);
});
