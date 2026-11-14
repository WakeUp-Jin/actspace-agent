import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ALLOWED,
  RENAMES,
  auditTransitionalNames,
  findTransitionalNames,
  isOutsideRoot,
  renameTransitionalNames,
  replacementFor,
  runCheck,
  runWrite,
} from "../check-transitional-names.mjs";

function tempRepo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "transitional-names-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test("drops V2 from the three spellings and leaves the rest of the name alone", () => {
  assert.equal(replacementFor("RuntimeV2JsonValue"), "RuntimeJsonValue");
  assert.equal(replacementFor("DesktopRuntimeV2Registry"), "DesktopRuntimeRegistry");
  assert.equal(replacementFor("bootDesktopRuntimeV2"), "bootDesktopRuntime");
  assert.equal(replacementFor("runtimeV2Registry"), "runtimeRegistry");
  assert.equal(replacementFor("RUNTIME_V2_FIXED_RENDERER_CHANNELS"), "RUNTIME_FIXED_RENDERER_CHANNELS");
  assert.equal(replacementFor("isRuntimeV2JsonValue"), "isRuntimeJsonValue");
  assert.equal(replacementFor("loadRuntimeV2Module"), "loadRuntimeModule");
  assert.equal(replacementFor("RuntimeV2State"), "RuntimeState");
});

test("names on the list are renamed as a whole, before the general rule", () => {
  assert.equal(replacementFor("RuntimeV2RuntimeState"), "RuntimeStateView");
  assert.equal(replacementFor("loadRuntimeV2"), "loadRuntimeModule");
  assert.equal(replacementFor("runV2Command"), "runCommand");
  assert.equal(replacementFor("RunV2Io"), "RunIo");
  assert.equal(replacementFor("bootCliV2"), "bootCli");
  assert.equal(replacementFor("CliV2ApprovalBroker"), "CliApprovalBroker");
  assert.equal(replacementFor("DesktopLegacyLlmAdapter"), "DesktopLlmAdapter");
});

test("format versions, legacy data names and unrelated names are not transitional", () => {
  for (const name of [
    "SettingsV4",
    "AppSettingsV2",
    "PersistedSettingsV3",
    "SessionEventEnvelopeV1",
    "getV4",
    "updateV2",
    "RV2",
    "Runtime",
    "runtime",
    "RUNTIME",
    "RuntimeState",
    "RuntimeV1Thing",
    "runtimeV3",
    "RUNTIME_V1",
    "RUNTIME_V",
    "RuntimeV",
    "legacyCallArgs",
    "migrateLegacyRemoteModels",
    "runCommand",
    "runV2",
    "V2Command",
    "CliV2",
    "LegacyProxyWireEngine",
    "legacyProxy",
    "DesktopLegacyLlmAdapterOptions",
    "LegacyLlmAdapter",
  ])
    assert.equal(replacementFor(name), null, name);
});

test("finds old names in code, comments and strings, one entry per occurrence", () => {
  const source = [
    'import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";',
    "// RuntimeV2DesktopSessionProjection 的 mock",
    'const constant = "RUNTIME_V2_FIXED_RENDERER_CHANNELS";',
    "const registry = new DesktopRuntimeV2Registry({ bootDesktopRuntimeV2 });",
    "",
    "await runV2Command(options, io as RunV2Io);",
    "const text = `${runtimeV2Registry.status()}`;",
    "obj.loadRuntimeV2?.();",
  ].join("\n");
  assert.deepEqual(findTransitionalNames(source), [
    { name: "RuntimeV2JsonValue", line: 1, replacement: "RuntimeJsonValue" },
    { name: "RuntimeV2SessionSnapshot", line: 1, replacement: "RuntimeSessionSnapshot" },
    { name: "RuntimeV2DesktopSessionProjection", line: 2, replacement: "RuntimeDesktopSessionProjection" },
    { name: "RUNTIME_V2_FIXED_RENDERER_CHANNELS", line: 3, replacement: "RUNTIME_FIXED_RENDERER_CHANNELS" },
    { name: "DesktopRuntimeV2Registry", line: 4, replacement: "DesktopRuntimeRegistry" },
    { name: "bootDesktopRuntimeV2", line: 4, replacement: "bootDesktopRuntime" },
    { name: "runV2Command", line: 6, replacement: "runCommand" },
    { name: "RunV2Io", line: 6, replacement: "RunIo" },
    { name: "runtimeV2Registry", line: 7, replacement: "runtimeRegistry" },
    { name: "loadRuntimeV2", line: 8, replacement: "loadRuntimeModule" },
  ]);
});

test("ignores paths, channel names, contract ids and names that only contain a listed name", () => {
  const source = [
    'import { loadRuntime } from "../runtime-v2/loader";',
    'import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";',
    'const channel = "runtime-v2:session/list";',
    'const contract = "actspace.runtime.v2";',
    'const dir = join(dataRoot, "sessions-v2", sessionId);',
    "const settings: SettingsV4 = await bridge.settings.getV4();",
    "const a = runV2CommandLine, b = myRunV2Command, c = $runV2Command, d = RunV2Io2, e = bootCliV2_, f = XCliV2ApprovalBroker;",
    'assert(created.status === "completed", "Runtime v2 failed to create fixture tab");',
    "const runtime_v2 = 1, Runtime_V2 = 2, runtimev2 = 3, RUNTIMEV2 = 4;",
  ].join("\n");
  assert.deepEqual(findTransitionalNames(source), []);
});

test("an old name is matched as a whole identifier, including $ and digits around it", () => {
  assert.deepEqual(
    findTransitionalNames("x.$RuntimeV2Json$1 = _RUNTIME_V2_9;").map((entry) => [entry.name, entry.replacement]),
    [
      ["$RuntimeV2Json$1", "$RuntimeJson$1"],
      ["_RUNTIME_V2_9", "_RUNTIME_9"],
    ],
  );
});

test("renaming changes only the old names and can be repeated", () => {
  const source = [
    'import { loadRuntimeV2, type RuntimeV2Module } from "./runtime-v2/loader";',
    "/** RuntimeV2RuntimeState 是只读视图。 */",
    'const marker = "APPROVED_BY_RUNTIME_V2";',
    "export const run = (io: RunV2Io) => runV2Command({ boot: bootCliV2, broker: new CliV2ApprovalBroker() }, io);",
    "",
  ].join("\r\n");
  const expected = [
    'import { loadRuntimeModule, type RuntimeModule } from "./runtime-v2/loader";',
    "/** RuntimeStateView 是只读视图。 */",
    'const marker = "APPROVED_BY_RUNTIME";',
    "export const run = (io: RunIo) => runCommand({ boot: bootCli, broker: new CliApprovalBroker() }, io);",
    "",
  ].join("\r\n");
  assert.equal(renameTransitionalNames(source), expected);
  assert.equal(renameTransitionalNames(expected), expected);
  assert.deepEqual(findTransitionalNames(expected), []);
});

test("renaming keeps the names it is told to keep", () => {
  const source = 'fill("APPROVED_BY_RUNTIME_V2"); const { loadRuntimeV2 } = require("./runtime-v2-client.cjs");';
  assert.equal(
    renameTransitionalNames(source, new Set(["APPROVED_BY_RUNTIME_V2"])),
    'fill("APPROVED_BY_RUNTIME_V2"); const { loadRuntimeModule } = require("./runtime-v2-client.cjs");',
  );
});

test("reports every old name in files that are not on the list, in path order", () => {
  const errors = auditTransitionalNames(
    [
      { path: "packages/b/src/b.ts", text: "const a = 1;\nexport type X = RuntimeV2JsonValue | RuntimeV2JsonValue[];" },
      { path: "apps/a/src/a.ts", text: "bootCliV2();" },
      { path: "packages/b/src/clean.ts", text: "export type X = RuntimeJsonValue;" },
    ],
    [],
  );
  assert.deepEqual(errors, [
    "apps/a/src/a.ts:1 bootCliV2 是过渡期的名字，改成 bootCli",
    "packages/b/src/b.ts:2 RuntimeV2JsonValue 是过渡期的名字，改成 RuntimeJsonValue",
    "packages/b/src/b.ts:2 RuntimeV2JsonValue 是过渡期的名字，改成 RuntimeJsonValue",
  ]);
});

test("a listed name must appear exactly the recorded number of times, and exempts nothing else", () => {
  const allowed = [{ file: "fixtures/smoke.cjs", name: "APPROVED_BY_RUNTIME_V2", count: 2, reason: "测试文本" }];
  const twice = 'fill("APPROVED_BY_RUNTIME_V2");\nexpect("APPROVED_BY_RUNTIME_V2");';
  assert.deepEqual(auditTransitionalNames([{ path: "fixtures/smoke.cjs", text: twice }], allowed), []);
  assert.deepEqual(
    auditTransitionalNames([{ path: "fixtures/smoke.cjs", text: `${twice}\nlog("APPROVED_BY_RUNTIME_V2");` }], allowed),
    ["fixtures/smoke.cjs：APPROVED_BY_RUNTIME_V2 有 3 处，清单只允许 2 处"],
  );
  assert.deepEqual(
    auditTransitionalNames([{ path: "fixtures/smoke.cjs", text: 'fill("APPROVED_BY_RUNTIME_V2");' }], allowed),
    ["fixtures/smoke.cjs：清单记了 2 处 APPROVED_BY_RUNTIME_V2，现在只有 1 处，请同步修改 ALLOWED"],
  );
  assert.deepEqual(auditTransitionalNames([], allowed), [
    "fixtures/smoke.cjs：清单记了 2 处 APPROVED_BY_RUNTIME_V2，现在只有 0 处，请同步修改 ALLOWED",
  ]);
  assert.deepEqual(
    auditTransitionalNames([{ path: "fixtures/smoke.cjs", text: `${twice}\nloadRuntimeV2();` }], allowed),
    ["fixtures/smoke.cjs:3 loadRuntimeV2 是过渡期的名字，改成 loadRuntimeModule"],
  );
  assert.deepEqual(
    auditTransitionalNames(
      [
        { path: "fixtures/smoke.cjs", text: twice },
        { path: "fixtures/other.cjs", text: twice },
      ],
      allowed,
    ),
    [
      "fixtures/other.cjs:1 APPROVED_BY_RUNTIME_V2 是过渡期的名字，改成 APPROVED_BY_RUNTIME",
      "fixtures/other.cjs:2 APPROVED_BY_RUNTIME_V2 是过渡期的名字，改成 APPROVED_BY_RUNTIME",
    ],
  );
});

const BAD = "export type Json = RuntimeV2JsonValue;\n";
const SCOPE_FILES = {
  "packages/a/src/value.ts": BAD,
  "packages/a/src/view.tsx": BAD,
  "packages/a/src/worker.mts": BAD,
  "packages/a/src/loader.cts": BAD,
  "packages/a/src/types.d.ts": BAD,
  "packages/a/loader.d.cts": BAD,
  "packages/a/src/value.test.ts": BAD,
  "packages/a/src/test/helpers.ts": BAD,
  "packages/a/src/fixtures/sample.ts": BAD,
  "apps/b/src/preload.js": BAD,
  "apps/b/src/widget.jsx": BAD,
  "apps/b/scripts/benchmark.mjs": BAD,
  "scripts/tool.mjs": BAD,
  "scripts/test/fixtures/cli.mjs": BAD,
  "browser-bridge/test-fixtures/acceptance/client.cjs": BAD,
  "packages/a/src/clean.ts": "export type Json = RuntimeJsonValue;\n",
  "scripts/check-transitional-names.mjs": BAD,
  "scripts/test/transitional-names-check.test.mjs": BAD,
  "scripts/test/current-docs.test.mjs": BAD,
  "packages/a/dist/value.js": BAD,
  "packages/a/build/value.js": BAD,
  "packages/a/coverage/value.js": BAD,
  "packages/a/node_modules/dep/index.js": BAD,
  "apps/b/out/main.js": BAD,
  "apps/b/dist-electron/main.js": BAD,
  "apps/b/release/main.js": BAD,
  "apps/b/.cache/main.ts": BAD,
  "packages/a/README.md": BAD,
  "packages/a/package.json": BAD,
  "docs/design-docs/example.md": BAD,
  "docs/example.ts": BAD,
  "tool.ts": BAD,
};
const SCANNED = [
  "apps/b/scripts/benchmark.mjs",
  "apps/b/src/preload.js",
  "apps/b/src/widget.jsx",
  "browser-bridge/test-fixtures/acceptance/client.cjs",
  "packages/a/loader.d.cts",
  "packages/a/src/fixtures/sample.ts",
  "packages/a/src/loader.cts",
  "packages/a/src/test/helpers.ts",
  "packages/a/src/types.d.ts",
  "packages/a/src/value.test.ts",
  "packages/a/src/value.ts",
  "packages/a/src/view.tsx",
  "packages/a/src/worker.mts",
  "scripts/test/fixtures/cli.mjs",
  "scripts/tool.mjs",
];

test("scans TypeScript and JavaScript under the four roots, tests included, but not build output or the files that spell out old names", (t) => {
  const root = tempRepo(t, SCOPE_FILES);
  assert.deepEqual(runCheck(root, []), {
    files: SCANNED.length + 1,
    errors: SCANNED.map((file) => `${file}:1 RuntimeV2JsonValue 是过渡期的名字，改成 RuntimeJsonValue`),
  });
});

test("--write renames exactly the files the check scans, then the check passes", (t) => {
  const root = tempRepo(t, SCOPE_FILES);
  assert.deepEqual(runWrite(root, []), SCANNED);
  assert.deepEqual(runCheck(root, []), { files: SCANNED.length + 1, errors: [] });
  for (const file of SCANNED)
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), "export type Json = RuntimeJsonValue;\n", file);
  for (const file of Object.keys(SCOPE_FILES).filter(
    (name) => !SCANNED.includes(name) && name !== "packages/a/src/clean.ts",
  )) {
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), BAD, file);
  }
  assert.deepEqual(runWrite(root, []), []);
});

test("--write with paths renames only those, Markdown included, and still skips build output", (t) => {
  const root = tempRepo(t, {
    "docs/design-docs/a.md": "`RuntimeV2JsonValue` 和 `RuntimeV2RuntimeState`\n",
    "docs/design-docs/nested/b.md": "`runV2Command`\n",
    "docs/design-docs/nested/data.json": '"RuntimeV2JsonValue"\n',
    "docs/design-docs/dist/c.md": "`RuntimeV2JsonValue`\n",
    "docs/histories/old.md": "`RuntimeV2JsonValue`\n",
    "packages/a/src/value.ts": BAD,
    "packages/a/src/other.ts": BAD,
  });
  assert.deepEqual(
    runWrite(root, [], ["docs/design-docs", path.join(root, "packages/a/src/value.ts"), "docs/design-docs/a.md"]),
    ["docs/design-docs/a.md", "docs/design-docs/nested/b.md", "packages/a/src/value.ts"],
  );
  assert.equal(
    fs.readFileSync(path.join(root, "docs/design-docs/a.md"), "utf8"),
    "`RuntimeJsonValue` 和 `RuntimeStateView`\n",
  );
  assert.equal(fs.readFileSync(path.join(root, "docs/design-docs/nested/b.md"), "utf8"), "`runCommand`\n");
  assert.equal(fs.readFileSync(path.join(root, "docs/design-docs/nested/data.json"), "utf8"), '"RuntimeV2JsonValue"\n');
  assert.equal(fs.readFileSync(path.join(root, "docs/design-docs/dist/c.md"), "utf8"), "`RuntimeV2JsonValue`\n");
  assert.equal(fs.readFileSync(path.join(root, "docs/histories/old.md"), "utf8"), "`RuntimeV2JsonValue`\n");
  assert.equal(fs.readFileSync(path.join(root, "packages/a/src/other.ts"), "utf8"), BAD);
});

test("--write accepts a path inside the repository whose name starts with two dots", (t) => {
  const root = tempRepo(t, {
    "..notes.md": "`RuntimeV2JsonValue`\n",
    "..drafts/a.md": "`runV2Command`\n",
    "docs/..b.md": "`RunV2Io`\n",
  });
  assert.deepEqual(runWrite(root, [], ["..notes.md", "..drafts", path.join(root, "docs/..b.md")]), [
    "..drafts/a.md",
    "..notes.md",
    "docs/..b.md",
  ]);
  assert.equal(fs.readFileSync(path.join(root, "..notes.md"), "utf8"), "`RuntimeJsonValue`\n");
  assert.equal(fs.readFileSync(path.join(root, "..drafts/a.md"), "utf8"), "`runCommand`\n");
  assert.equal(fs.readFileSync(path.join(root, "docs/..b.md"), "utf8"), "`RunIo`\n");
});

test("a target is outside the repository when it climbs out of it or sits on another drive, on both path flavours", () => {
  // 另一个盘符的情况在 Linux 上走不到（relative 的结果不会是绝对路径），所以判断接受一套路径规则，这里两套都跑。
  for (const [rules, root, target, outside] of [
    [path.posix, "/repo", "/repo/docs/a.md", false],
    [path.posix, "/repo", "/repo/..notes.md", false],
    [path.posix, "/repo", "/repo/..drafts/a.md", false],
    [path.posix, "/repo", "/", true],
    [path.posix, "/repo", "/elsewhere/a.md", true],
    [path.posix, "/repo", "/repo-old/a.md", true],
    [path.win32, "C:\\repo", "C:\\repo\\docs\\a.md", false],
    [path.win32, "C:\\repo", "C:\\repo\\..notes.md", false],
    [path.win32, "C:\\repo", "C:\\repo\\..drafts\\a.md", false],
    [path.win32, "C:\\repo", "C:\\", true],
    [path.win32, "C:\\repo", "C:\\elsewhere\\a.md", true],
    [path.win32, "C:\\repo", "D:\\repo\\docs\\a.md", true],
    [path.win32, "C:\\repo", "\\\\server\\share\\a.md", true],
  ])
    assert.equal(isOutsideRoot(rules.relative(root, target), rules), outside, `${root} → ${target}`);
});

test("--write refuses a missing path, a path outside the repository and the repository as a whole, and writes nothing", (t) => {
  // 「仓库」是临时目录里的一个子目录，越界的路径都指向这个临时目录里面：
  // 这道拦截要是坏了，被改掉的也只是下面这几个文件，不会是系统临时目录里别人的东西。
  const OLD = "`RuntimeV2JsonValue`\n";
  const files = ["repo/docs/design-docs/a.md", "repo/packages/a/src/value.ts", "elsewhere/notes.md", "notes.md"];
  const sandbox = tempRepo(t, Object.fromEntries(files.map((file) => [file, OLD])));
  const root = path.join(sandbox, "repo");
  assert.throws(() => runWrite(root, [], ["docs/design-docs", "docs/missing"]), /找不到 docs\/missing/);
  for (const outside of [
    "..",
    "../elsewhere",
    "../notes.md",
    "docs/../../notes.md",
    sandbox,
    path.join(sandbox, "elsewhere"),
  ]) {
    assert.throws(() => runWrite(root, [], ["docs/design-docs", outside]), /不在仓库里/, outside);
  }
  for (const whole of [".", root, "docs/.."])
    assert.throws(() => runWrite(root, [], [whole]), /不能整个仓库一起改/, whole);
  for (const file of files) assert.equal(fs.readFileSync(path.join(sandbox, file), "utf8"), OLD, file);
});

test("--write leaves listed names in their file and the check agrees with the result", (t) => {
  const allowed = [{ file: "browser-bridge/smoke.cjs", name: "APPROVED_BY_RUNTIME_V2", count: 1, reason: "测试文本" }];
  const root = tempRepo(t, {
    "browser-bridge/smoke.cjs": 'const { loadRuntimeV2 } = require("./client.cjs");\nfill("APPROVED_BY_RUNTIME_V2");\n',
    "browser-bridge/other.cjs": 'fill("APPROVED_BY_RUNTIME_V2");\n',
  });
  assert.deepEqual(runWrite(root, allowed), ["browser-bridge/other.cjs", "browser-bridge/smoke.cjs"]);
  assert.equal(
    fs.readFileSync(path.join(root, "browser-bridge/smoke.cjs"), "utf8"),
    'const { loadRuntimeModule } = require("./client.cjs");\nfill("APPROVED_BY_RUNTIME_V2");\n',
  );
  assert.equal(fs.readFileSync(path.join(root, "browser-bridge/other.cjs"), "utf8"), 'fill("APPROVED_BY_RUNTIME");\n');
  assert.deepEqual(runCheck(root, allowed), { files: 2, errors: [] });
});

test("every new name on the list is an identifier that is not itself an old name", () => {
  for (const [from, to] of RENAMES) {
    assert.match(to, /^[A-Za-z_$][A-Za-z0-9_$]*$/, from);
    assert.equal(replacementFor(to), null, `${from} → ${to}`);
    assert.notEqual(from, to);
  }
});

test("every listed exception is unique and says why it is allowed", () => {
  assert.equal(new Set(ALLOWED.map((entry) => `${entry.file}\n${entry.name}`)).size, ALLOWED.length);
  for (const entry of ALLOWED) {
    assert.notEqual(replacementFor(entry.name), null, entry.name);
    assert.ok(Number.isInteger(entry.count) && entry.count > 0, entry.file);
    assert.ok(entry.reason.trim().length > 0, entry.file);
  }
});

test("the repository has no old names outside the listed exceptions", () => {
  assert.deepEqual(runCheck().errors, []);
});
