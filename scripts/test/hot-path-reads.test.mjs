import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectCounts, compareWithBaseline, countSource } from "../check-hot-path-reads.mjs";

test("counts full journal reads, per-entry reads and deep copies", () => {
  const source = [
    "for (const event of session.journal.iterateEvents()) {}",
    "const all = journal.readEvents();",
    "const events = this.options.session.journal.events;",
    "const journal = await registry.inspectSessionEvents(input.sessionId);",
    "entries.flatMap(entry => journal.readEvents(seq, seq + 1));",
    "const copy = JSON.parse(JSON.stringify(value));",
    "const clone = structuredClone(value);",
  ].join("\n");
  assert.deepEqual(countSource(source), { "full-iterate": 1, "full-read": 1, "journal-events": 1, "inspect-events": 1, "per-entry-read": 1, "json-roundtrip": 1, "structured-clone": 1 });
});

test("does not count bounded reads, declarations or allowed lines", () => {
  const source = [
    "journal.iterateEvents(start, end);",
    "journal.readEvents(from, until);",
    "journal.eventsAfter(seq);",
    "journal.eventsCount;",
    "inspectSessionEvents(sessionId: string) { return this.app.inspectSessionEvents(sessionId); } // perf-allow: 透传",
    "// perf-allow: 打开会话时读一次",
    "const all = journal.readEvents();",
    "inspectSessionEvents(id: string): Promise<readonly Event[]>;",
  ].join("\n");
  assert.deepEqual(countSource(source), {});
});

test("an empty perf-allow reason does not count as allowed", () => {
  assert.deepEqual(countSource("const all = journal.readEvents(); // perf-allow:"), { "full-read": 1 });
});

test("fails above the baseline and suggests tightening below it", () => {
  const { problems, notices } = compareWithBaseline(
    { "a.ts": { "full-read": 2 }, "b.ts": { "structured-clone": 1 } },
    { "a.ts": { "full-read": 1 }, "b.ts": { "structured-clone": 3 } },
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /a\.ts：full-read 有 2 处，基线 1/);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /b\.ts：structured-clone 从 3 降到 1/);
});

test("skips tests, testing helpers, fixtures and build output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hot-path-reads-"));
  try {
    const write = (relative, content) => { fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), content); };
    const bad = "journal.readEvents();";
    write("packages/a/src/service.ts", bad);
    write("packages/a/src/service.test.ts", bad);
    write("packages/a/src/test/helper.ts", bad);
    write("packages/a/src/testing.ts", bad);
    write("packages/a/dist/service.js", bad);
    write("packages/a/src/types.d.ts", bad);
    assert.deepEqual(collectCounts(root), { "packages/a/src/service.ts": { "full-read": 1 } });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
