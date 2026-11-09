import assert from "node:assert/strict";
import test from "node:test";
import { checkCoverage, checkScaleTestSource, journalReadingFiles } from "../check-scale-test-coverage.mjs";

const GOOD_TEST = [
  'import { countingHistory, syntheticSessionEvents } from "@actspace/session-journal/testing";',
  "const small = reads(1_000); const large = reads(10_000); expect(large).toBe(small);",
].join("\n");

test("a scale test must compare 1k and 10k, count reads and never time", () => {
  assert.deepEqual(checkScaleTestSource(GOOD_TEST), []);
  assert.deepEqual(checkScaleTestSource('import { syntheticJournal } from "@actspace/session-journal/testing";\nreads(10_000);'), ["没有同时在 1k 和 10k 事件的会话上跑同一个操作"]);
  assert.deepEqual(checkScaleTestSource("reads(1000); reads(10000);"), ["没有用读取计数（@actspace/session-journal/testing 的 countingHistory / syntheticJournal，或对 @actspace/session-journal 的计数 mock）"]);
  assert.deepEqual(checkScaleTestSource(`${GOOD_TEST}\nconst started = performance.now();`), ["断言或使用了时间（performance.now / Date.now / hrtime）；规模测试只计数，不计时"]);
  assert.deepEqual(checkScaleTestSource(`${GOOD_TEST}\n// perf-allow: 只用来生成时间戳\nconst at = Date.now();`), []);
  assert.deepEqual(checkScaleTestSource('vi.mock("@actspace/session-journal", () => ({}));\nreads(1_000); reads(10_000);'), []);
});

test("journal-reading files come from the read rules only", () => {
  assert.deepEqual(journalReadingFiles({ "a.ts": { "full-read": 1 }, "b.ts": { "structured-clone": 3 }, "c.ts": { "inspect-events": 0, "per-entry-read": 2 } }), ["a.ts", "c.ts"]);
});

function files(map) { return (relative) => (relative in map ? map[relative] : null); }

test("passes when every entry, scale test and reading file is accounted for", () => {
  const manifest = { entries: [{ path: "每次请求", source: "src/loop.ts", tests: ["src/test/loop.scale.test.ts"] }], pending: { "src/cold.ts": "低频" } };
  const problems = checkCoverage(manifest, {
    readFile: files({ "src/loop.ts": "", "src/test/loop.scale.test.ts": GOOD_TEST }),
    scaleTests: ["src/test/loop.scale.test.ts"],
    baseline: { "src/cold.ts": { "full-read": 1 }, "src/loop.ts": { "json-roundtrip": 1 } },
  });
  assert.deepEqual(problems, []);
});

test("fails on missing files, unregistered scale tests, uncovered reading files and stale pending", () => {
  const manifest = {
    entries: [
      { path: "a", source: "src/missing.ts", tests: ["src/test/missing.scale.test.ts"] },
      { path: "b", source: "src/b.ts", tests: ["src/test/b.test.ts"] },
      { path: "c", source: "src/c.ts", tests: ["src/test/c.scale.test.ts"] },
    ],
    pending: { "src/c.ts": "已有测试了", "src/gone.ts": "基线里没有了", "src/blank.ts": " " },
  };
  const problems = checkCoverage(manifest, {
    readFile: files({ "src/b.ts": "", "src/c.ts": "", "src/test/c.scale.test.ts": GOOD_TEST, "src/test/stray.scale.test.ts": GOOD_TEST }),
    scaleTests: ["src/test/c.scale.test.ts", "src/test/stray.scale.test.ts"],
    baseline: { "src/c.ts": { "full-iterate": 1 }, "src/reader.ts": { "inspect-events": 2 }, "src/blank.ts": { "full-read": 1 } },
  });
  assert.deepEqual(problems, [
    "src/missing.ts：entries 里的源文件不存在",
    "src/test/missing.scale.test.ts：entries 里的规模测试不存在",
    "src/test/b.test.ts：规模测试的文件名要以 .scale.test.ts 结尾",
    "src/test/stray.scale.test.ts：规模测试没有登记在 scripts/scale-test-coverage.json 的 entries 里",
    "src/reader.ts：hot-path-reads 基线里还有整份读日志的写法，但没有规模测试。补一个 entry 和 *.scale.test.ts；确实低频就写进 pending 并说明原因",
    "src/c.ts：已经有规模测试，从 pending 删掉",
    "src/gone.ts：hot-path-reads 基线里已经没有它的整份读写法，从 pending 删掉",
    "src/blank.ts：pending 要写明还没有规模测试的原因",
  ]);
});
