import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatrix, renderJson, renderMarkdown, validateRows } from "../contract-matrix/generate.mjs";

test("contract matrix is deterministic and preserves declared event surfaces", async () => {
  const first = await buildMatrix();
  const second = await buildMatrix();
  assert.deepEqual(first, second);
  assert.equal(first.events.filter((item) => item.category === "core").length, 12);
  assert.equal(first.services.find(item => item.id === "session.checkpoint")?.providerId, "session.checkpoint:default");
  assert.equal(first.events.some(item => item.eventType === "session/checkpoint"), false);
  assert.equal(first.events.find(item => item.eventType === "agent/tasks-updated")?.mode, "emit");
  assert.deepEqual(validateRows(first).filter(item => item.severity === "error"), []);
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

test("matrix covers workspace packages and plugin manifests without stale sources", async () => {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { PACKAGE_PATHS, MANIFEST_PATHS } = await import("../contract-matrix/source-registry.mjs");
  async function files(root, depth) {
    const result = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const path = join(root, entry.name);
      if (entry.isDirectory() && depth > 0) result.push(...await files(path, depth - 1));
      else if (entry.isFile()) result.push(path);
    }
    return result;
  }
  const source = [...await files("packages", 4), ...await files("apps", 1)];
  const packages = source.filter(path => /^(packages\/[^/]+(?:\/[^/]+)?|apps\/[^/]+)\/package\.json$/.test(path));
  assert.deepEqual([...PACKAGE_PATHS].sort(), packages.sort());
  const manifests = source.filter(path => /^packages\/.*\/src\/manifest\.ts$/.test(path) && !path.includes("cordis-adapter/"));
  assert.deepEqual([...MANIFEST_PATHS].sort(), manifests.sort());
  const matrix = await buildMatrix();
  for (const id of ["agent.service", "harness.control", "host.application", "session.storage"]) assert.ok(matrix.services.some(row => row.id === id), id);
  for (const event of ["harness/selection-updated", "application/run-preparing", "session/disposed"]) assert.ok(matrix.events.some(row => row.eventType === event), event);
  const invalid = structuredClone(matrix);
  invalid.services[0].sourceRefs = ["missing/source.ts#value"];
  invalid.sourceDigest = "forged";
  assert.ok(validateRows(invalid).some(row => row.code === "INVALID_SOURCE_REF"));
  assert.ok(validateRows(invalid).some(row => row.code === "INVALID_DIGEST"));
});
