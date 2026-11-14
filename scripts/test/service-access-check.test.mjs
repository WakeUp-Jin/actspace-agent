import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ALLOWED,
  CATALOG_FILE,
  VIEWS_FILE,
  auditServiceAccess,
  collectIdTables,
  findConformanceRows,
  findKeyDeclarations,
  findLeaseCalls,
  findLookupCasts,
  findRawProvides,
  resolveId,
  runCheck,
} from "../check-service-access.mjs";

const catalog = {
  path: CATALOG_FILE,
  text: [
    "export const ACTSPACE_SERVICE_IDS = Object.freeze({",
    '  toolsRuntime: serviceId("tools.runtime"),',
    '  hostSession: serviceId("actspace.host.session"),',
    "} as const);",
    "export const ACTSPACE_SERVICE_DEFINITIONS = Object.freeze({",
    '  toolsRuntime: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.toolsRuntime, owner: "@actspace/tool-runtime" }),',
    '  sessions: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.hostSession, owner: "@actspace/runtime" }),',
    "});",
  ].join("\n"),
};

test("finds a lookup by id whose result is cast, however the call is written", () => {
  const source = [
    'const tools = ctx.get?.("tools.runtime") as ToolRuntime | undefined;',
    "const host = this.ctx.get?.(HOST_ID) as HostPort;",
    'const loader = context.get("loader") as Loader | undefined;',
    "const nested = group.ctx.get(name) as T;",
    'const wrapped = profile.context.get?.(idOf(kind, "x)")) as Wrapped;',
    'const forced = ctx.get?.("sandbox")! as Sandbox;',
    "const split = runtimeContext?.get?.(",
    '  "agent.runtime",',
    ")",
    "  as AgentRuntime | undefined;",
    "const get = <T>(id: string) => ctx.get?.(id) as T | undefined;",
    'const parent = parentCtx.get("parent") as Parent;',
    "const root = this.rootContext.get(id) as Root;",
    // 括号里有一个不成对的引号（正则里的），下一行还有别的字符串：这一行的右括号照样找得到。
    "const stripped = ctx.get?.(strip(name, /'/)) as Service;",
    "const later = 'x';",
  ].join("\n");
  assert.deepEqual(findLookupCasts(source), [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14]);
});

test("leaves existence checks, typed accessors, other containers and comment lines alone", () => {
  const source = [
    'if (ctx.get?.("actspace.host.remote") === undefined) return;',
    "const tools = getService(ctx, TOOL_RUNTIME_SERVICE);",
    "const missing = names.filter((name) => fiber.ctx?.get?.(name) === undefined);",
    "const cached = cache.get(key) as Entry | undefined;",
    "const rows = fullContext.get(index) ?? [];",
    'const label = ctx.get?.("x") ? "as usual" : "missing";',
    '// 以前写的是 ctx.get?.("tools.runtime") as ToolRuntime',
    "/**",
    ' * 不要写 ctx.get?.("sandbox") as Sandbox。',
    " */",
    '/* 也不要写 ctx.get?.("sandbox") as Sandbox */',
    // 不写分号的代码：下一行以 as 开头的名字不是断言。
    'const present = ctx.get?.("llm.service")',
    "assertReady(present)",
  ].join("\n");
  assert.deepEqual(findLookupCasts(source), []);
});

test("finds direct calls of a lease's or root's getService", () => {
  const source = [
    'const tools = lease.getService<ToolRuntime>("tools.runtime");',
    'const engine: ContextEngine | undefined = lease.getService("context.engine");',
    "const missing = required.filter((id) => root.getService(id) === undefined);",
    "return record.mount.getService <T>(name);",
    "const typed = getService(ctx, TOOL_RUNTIME_SERVICE);",
    "const leased = getLeasedService(lease, CONTEXT_ENGINE_SERVICE);",
    "const handle = { context, getService: tree.getService };",
    "type Lease = { getService<T>(name: string): T | undefined };",
    "const root = { getService: <T>(id: string): T | undefined => read(id) };",
    '// lease.getService<ToolRuntime>("tools.runtime")',
  ].join("\n");
  assert.deepEqual(findLeaseCalls(source), [1, 2, 3, 4]);
});

test("reads every definition with its constant name and the id it was declared with", () => {
  const source = [
    'export const A = serviceKey<AService>("a.service");',
    'export const B = serviceKey<Pick<BService, "read" | "write">>(B_SERVICE_ID);',
    "export const C = bindServiceType<CService>(ACTSPACE_SERVICE_DEFINITIONS.toolsRuntime);",
    "export const D_VIEW = serviceView<{ readonly flush: (sessionId: string) => Promise<void>; readonly names: Map<string, string[]> }>(ACTSPACE_SERVICE_IDS.hostSession);",
    "export const E = serviceKey<",
    "  EService",
    ">(",
    '  "e.service",',
    ");",
    'const PRIVATE_VIEW = serviceView<{ readonly a: string }>("a.service");',
    'const inline = getService(ctx, serviceView<{ readonly a: string }>("a.service"));',
    "export function serviceKey<TService>(id: string): ServiceKey<TService> { return Object.freeze({ id }); }",
    "export type View = ServiceView<{ readonly a: string }>;",
    '// export const F = serviceKey<FService>("f.service");',
    // 只带类型参数、没有调用：不是一个定义。后面那一行的括号不能被当成它的参数。
    "const makeKey = serviceKey<GService>;",
    "register(first, second);",
  ].join("\n");
  assert.deepEqual(findKeyDeclarations(source), [
    { kind: "serviceKey", name: "A", exported: true, line: 1, id: '"a.service"' },
    { kind: "serviceKey", name: "B", exported: true, line: 2, id: "B_SERVICE_ID" },
    { kind: "bindServiceType", name: "C", exported: true, line: 3, id: "ACTSPACE_SERVICE_DEFINITIONS.toolsRuntime" },
    { kind: "serviceView", name: "D_VIEW", exported: true, line: 4, id: "ACTSPACE_SERVICE_IDS.hostSession" },
    { kind: "serviceKey", name: "E", exported: true, line: 5, id: '"e.service"' },
    { kind: "serviceView", name: "PRIVATE_VIEW", exported: false, line: 10, id: '"a.service"' },
    { kind: "serviceView", name: "", exported: false, line: 11, id: '"a.service"' },
  ]);
});

test("reads which definition each conformance row compares a view against", () => {
  const source = [
    "type Covers<Provider extends View, View> = Provider;",
    "type Sessions = ServiceOf<typeof SESSION_RUNTIME_SERVICE>;",
    "export type ServiceViewConformance = {",
    "  // session.runtime",
    "  readonly todoSessions: Covers<Sessions, ServiceOf<typeof TODO_SESSIONS_VIEW>>;",
    "  readonly loopCheckpoint: Covers<ServiceOf<typeof SESSION_CHECKPOINT_SERVICE>, ServiceOf<typeof LOOP_CHECKPOINT_VIEW>>;",
    "  readonly unknownAlias: Covers<Missing, ServiceOf<typeof OTHER_VIEW>>;",
    "  // readonly retired: Covers<Sessions, ServiceOf<typeof RETIRED_VIEW>>;",
    "};",
  ].join("\n");
  assert.deepEqual(findConformanceRows(source), [
    { line: 5, view: "TODO_SESSIONS_VIEW", provider: "SESSION_RUNTIME_SERVICE" },
    { line: 6, view: "LOOP_CHECKPOINT_VIEW", provider: "SESSION_CHECKPOINT_SERVICE" },
    { line: 7, view: "OTHER_VIEW", provider: "" },
  ]);
});

test("resolves literal ids, catalog entries and upper-case string constants, and nothing else", () => {
  const tables = collectIdTables([
    catalog,
    {
      path: "packages/a/src/manifest.ts",
      text: 'export const A_SERVICE_ID = "a.service" as const;\nconst B_HOST_PORT_ID: string = "actspace.host.b";\nexport const C_ID = serviceId("c.service");\nconst lower = "not.a.constant";',
    },
    { path: "packages/b/src/one.ts", text: 'const SHARED_NAME = "one";' },
    { path: "packages/b/src/two.ts", text: 'const SHARED_NAME = "two";' },
    { path: "packages/b/src/quotes.ts", text: "const SINGLE_QUOTED_ID = 'single.service';" },
    // 长得像总表的内容写在别的文件里：不算总表。
    {
      path: "packages/b/src/not-the-catalog.ts",
      text: 'export const IDS = {\n  toolsRuntime: serviceId("other.runtime"),\n  extra: serviceId("extra.service"),\n};\nexport const DEFINITIONS = {\n  extra: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.toolsRuntime }),\n};',
    },
  ]);
  assert.equal(resolveId('"a.literal"', tables), "a.literal");
  assert.equal(resolveId("'single'", tables), "single");
  assert.equal(resolveId("`plain`", tables), "plain");
  assert.equal(resolveId("ACTSPACE_SERVICE_IDS.toolsRuntime", tables), "tools.runtime");
  assert.equal(resolveId("ACTSPACE_SERVICE_DEFINITIONS.toolsRuntime", tables), "tools.runtime");
  assert.equal(
    resolveId("ACTSPACE_SERVICE_DEFINITIONS.sessions", tables),
    "actspace.host.session",
    "定义的名字和它指向的 id 的名字可以不同",
  );
  assert.equal(resolveId("ACTSPACE_SERVICE_DEFINITIONS.hostSession", tables), undefined, "总表里没有叫这个名字的定义");
  assert.equal(resolveId("ACTSPACE_SERVICE_IDS.extra", tables), undefined);
  assert.equal(resolveId("ACTSPACE_SERVICE_DEFINITIONS.extra", tables), undefined);
  assert.equal(resolveId("SINGLE_QUOTED_ID", tables), "single.service");
  assert.equal(resolveId("A_SERVICE_ID", tables), "a.service");
  assert.equal(resolveId("B_HOST_PORT_ID", tables), "actspace.host.b");
  assert.equal(resolveId("C_ID", tables), "c.service");
  assert.equal(resolveId("ACTSPACE_SERVICE_IDS.unknown", tables), undefined);
  assert.equal(resolveId("ACTSPACE_SERVICE_DEFINITIONS.unknown", tables), undefined);
  assert.equal(resolveId("SHARED_NAME", tables), undefined, "两处值不同的同名常量读不出来");
  assert.equal(resolveId("lower", tables), undefined);
  assert.equal(resolveId("key.id", tables), undefined);
  // `$` 和 `{` 拆开写：这是示例源码，不是漏写的模板字符串。
  assert.equal(resolveId("`context.source.$" + "{kind}`", tables), undefined);
});

test("finds registrations by id, including the Service constructor", () => {
  const source = [
    'ctx.provide?.("tools.runtime", runtime);',
    "inner.provide(name, value);",
    "context.provide!(A_SERVICE_ID, value);",
    "provideService(ctx, TOOL_RUNTIME_SERVICE, runtime);",
    'class Runtime extends Service { constructor(ctx: Context) { super(ctx, "tools.runtime"); } }',
    "class Typed extends Service { constructor(ctx: Context) { super(ctx, TOOL_RUNTIME_SERVICE.id); } }",
    "class Tree extends Service { constructor(ctx: Context) { super(ctx); } }",
    'ctx.provide?.(key.id, combine(first, "x,y"));',
    'ctx.provide?.(idFor(kind, "x"), value);',
    'ctx.provide?.("a,b", value);',
    'ctx.provide?.("a\\",b", value);',
    "ctx.provide?.(`multi",
    "line,`, value);",
  ].join("\n");
  assert.deepEqual(findRawProvides(source), [
    { line: 1, id: '"tools.runtime"' },
    { line: 2, id: "name" },
    { line: 3, id: "A_SERVICE_ID" },
    { line: 5, id: '"tools.runtime"' },
    { line: 6, id: "TOOL_RUNTIME_SERVICE.id" },
    { line: 8, id: "key.id" },
    { line: 9, id: 'idFor(kind, "x")' },
    { line: 10, id: '"a,b"' },
    { line: 11, id: '"a\\",b"' },
    { line: 12, id: "`multi\nline,`" },
  ]);
});

test("reports casts, lease calls and registrations by id in files that are not on the list", () => {
  const errors = auditServiceAccess(
    [
      catalog,
      {
        path: "packages/a/src/service.ts",
        text: 'export const A_SERVICE_ID = "a.service";\nexport const A_SERVICE = serviceKey<AService>(A_SERVICE_ID);\nexport const TOOLS = bindServiceType<Tools>(ACTSPACE_SERVICE_DEFINITIONS.toolsRuntime);',
      },
      {
        path: "packages/a/src/plugin.ts",
        text:
          'ctx.provide?.(A_SERVICE_ID, service);\nctx.provide?.("a.marker", Object.freeze({}));\nctx.provide?.(`a.source.$' +
          "{kind}`, source);",
      },
      {
        path: "packages/b/src/consumer.ts",
        text: 'const a = ctx.get?.("a.service") as AService;\n\nconst tools = lease.getService<Tools>("tools.runtime");',
      },
      {
        path: "packages/c/src/runtime.ts",
        text: 'class Runtime extends Service { constructor(ctx: Context) { super(ctx, "tools.runtime"); } }',
      },
      {
        path: "packages/c/src/clean.ts",
        text: "const a = getService(ctx, A_SERVICE);\nprovideService(ctx, A_SERVICE, value);\nclass Typed extends Service { constructor(ctx: Context) { super(ctx, TOOLS.id); } }",
      },
    ],
    [],
  );
  assert.deepEqual(errors, [
    "packages/a/src/plugin.ts:1 按字符串 id 注册了有定义的服务 a.service",
    "packages/b/src/consumer.ts:1 按 id 取出服务后自己断言了类型",
    "packages/b/src/consumer.ts:3 直接调用了 .getService()",
    "packages/c/src/runtime.ts:1 按字符串 id 注册了有定义的服务 tools.runtime",
  ]);
});

test("a definition whose id cannot be read is an error", () => {
  const errors = auditServiceAccess(
    [
      catalog,
      {
        path: "packages/a/src/service.ts",
        text: 'export const A = serviceKey<AService>(idFor("a"));\nexport const B = serviceKey<BService>(ACTSPACE_SERVICE_IDS.missing);\nexport const C = serviceKey<CService>(lowerCaseName);',
      },
    ],
    [],
  );
  assert.deepEqual(errors, [
    'packages/a/src/service.ts:1 读不出这个定义的 id（idFor("a")）',
    "packages/a/src/service.ts:2 读不出这个定义的 id（ACTSPACE_SERVICE_IDS.missing）",
    "packages/a/src/service.ts:3 读不出这个定义的 id（lowerCaseName）",
  ]);
});

test("every view must be an exported constant with a conformance row", () => {
  const provider = {
    path: "packages/p/src/service.ts",
    text: 'export const A_SERVICE = serviceKey<AService>("a.service");',
  };
  const consumer = {
    path: "packages/a/src/consumer.ts",
    text: [
      'export const CHECKED_VIEW = serviceView<{ readonly a: string }>("a.service");',
      'export const UNCHECKED_VIEW = serviceView<{ readonly b: string }>("a.service");',
      'const PRIVATE_VIEW = serviceView<{ readonly c: string }>("a.service");',
      'const inline = getService(ctx, serviceView<{ readonly d: string }>("a.service"));',
    ].join("\n"),
  };
  const views = {
    path: VIEWS_FILE,
    text: [
      'import type { CHECKED_VIEW, UNCHECKED_VIEW } from "@actspace/a";',
      "type A = ServiceOf<typeof A_SERVICE>;",
      "export type ServiceViewConformance = {",
      "  readonly checked: Covers<A, ServiceOf<typeof CHECKED_VIEW>>;",
      "  // 注释里的不算：Covers<A, ServiceOf<typeof UNCHECKED_VIEW>>",
      "};",
    ].join("\n"),
  };
  assert.deepEqual(auditServiceAccess([provider, consumer, views], []), [
    `packages/a/src/consumer.ts:2 视图 UNCHECKED_VIEW 在 ${VIEWS_FILE} 里没有对照行`,
    "packages/a/src/consumer.ts:3 视图 PRIVATE_VIEW 没有导出",
    "packages/a/src/consumer.ts:4 serviceView 要先声明成导出的常量",
  ]);
  assert.deepEqual(auditServiceAccess([provider, { path: consumer.path, text: consumer.text.split("\n")[0] }], []), [
    `packages/a/src/consumer.ts:1 视图 CHECKED_VIEW 在 ${VIEWS_FILE} 里没有对照行`,
  ]);
});

test("a conformance row must compare a view with the definition registered under the same id", () => {
  const definitions = {
    path: "packages/p/src/service.ts",
    text: [
      'export const A_SERVICE = serviceKey<AService>("a.service");',
      'export const B_SERVICE = serviceKey<BService>("b.service");',
      'export const A_VIEW = serviceView<{ readonly a: string }>("a.service");',
      'export const B_VIEW = serviceView<{ readonly b: string }>("b.service");',
      'export const C_VIEW = serviceView<{ readonly c: string }>("a.service");',
    ].join("\n"),
  };
  const rows = (lines) => ({
    path: VIEWS_FILE,
    text: ["type A = ServiceOf<typeof A_SERVICE>;", "export type ServiceViewConformance = {", ...lines, "};"].join(
      "\n",
    ),
  });
  const good = [
    "  readonly a: Covers<A, ServiceOf<typeof A_VIEW>>;",
    "  readonly b: Covers<ServiceOf<typeof B_SERVICE>, ServiceOf<typeof B_VIEW>>;",
    "  readonly c: Covers<A, ServiceOf<typeof C_VIEW>>;",
  ];
  assert.deepEqual(auditServiceAccess([definitions, rows(good)], []), []);
  assert.deepEqual(
    auditServiceAccess(
      [definitions, rows([good[0], "  readonly b: Covers<A, ServiceOf<typeof B_VIEW>>;", good[2]])],
      [],
    ),
    [`${VIEWS_FILE}:4 视图 B_VIEW 的 id 是 b.service，对照的 A_SERVICE 却是 a.service`],
  );
  assert.deepEqual(
    auditServiceAccess(
      [
        definitions,
        rows([
          ...good,
          "  readonly d: Covers<Unknown, ServiceOf<typeof A_VIEW>>;",
          "  readonly e: Covers<A, ServiceOf<typeof GONE_VIEW>>;",
        ]),
      ],
      [],
    ),
    [
      `${VIEWS_FILE}:6 读不出这一行两边的定义（A_VIEW 和 真实服务）`,
      `${VIEWS_FILE}:7 读不出这一行两边的定义（GONE_VIEW 和 A_SERVICE）`,
    ],
  );
  // 两个包各有一个同名的定义、id 不同：只凭名字分不出是哪一个，按读不出来报。
  const sameName = {
    path: "packages/q/src/service.ts",
    text: 'export const B_SERVICE = serviceKey<Other>("other.service");',
  };
  assert.deepEqual(auditServiceAccess([definitions, sameName, rows(good)], []), [
    `${VIEWS_FILE}:4 读不出这一行两边的定义（B_VIEW 和 B_SERVICE）`,
  ]);
});

test("errors come back sorted, whichever rule found them", () => {
  const errors = auditServiceAccess(
    [
      { path: "packages/z/src/view.ts", text: 'const Z_VIEW = serviceView<{ readonly z: string }>("z.service");' },
      { path: "packages/m/src/key.ts", text: "export const M = serviceKey<MService>(idFor());" },
      { path: "packages/a/src/consumer.ts", text: 'const z = ctx.get?.("z.service") as Z;' },
    ],
    [],
  );
  assert.deepEqual(errors, [
    "packages/a/src/consumer.ts:1 按 id 取出服务后自己断言了类型",
    "packages/m/src/key.ts:1 读不出这个定义的 id（idFor()）",
    "packages/z/src/view.ts:1 视图 Z_VIEW 没有导出",
  ]);
});

test("a listed file must contain exactly the recorded number of each kind", () => {
  const allowed = [
    { file: "packages/a/src/access.ts", rule: "cast", count: 1, reason: "实现" },
    { file: "packages/a/src/access.ts", rule: "lease", count: 1, reason: "实现" },
  ];
  const cast = "return ctx?.get?.(key.id) as TService | undefined;";
  const lease = "return lease.getService<TService>(key.id);";
  const audit = (text) => auditServiceAccess([{ path: "packages/a/src/access.ts", text }], allowed);
  assert.deepEqual(audit(`${cast}\n${lease}`), []);
  assert.deepEqual(audit(`${cast}\n${lease}\n\n${cast}`), [
    "packages/a/src/access.ts：按 id 取出服务后自己断言了类型的有 2 处（第 1、4 行），清单只允许 1 处",
  ]);
  assert.deepEqual(audit(cast), [
    "packages/a/src/access.ts：清单记了 1 处「直接调用了 .getService()」，现在只有 0 处，请同步修改 ALLOWED",
  ]);
  assert.deepEqual(auditServiceAccess([], allowed), [
    "packages/a/src/access.ts：清单记了 1 处「按 id 取出服务后自己断言了类型」，现在只有 0 处，请同步修改 ALLOWED",
    "packages/a/src/access.ts：清单记了 1 处「直接调用了 .getService()」，现在只有 0 处，请同步修改 ALLOWED",
  ]);
});

test("scans product sources, not tests, build output or other directories", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "service-access-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bad = 'export const tools = ctx.get?.("tools.runtime") as Tools;\n';
  const files = {
    "packages/a/src/plugin.ts": bad,
    "packages/a/src/view.tsx": bad,
    "packages/a/src/worker.mts": bad,
    "packages/a/src/legacy.cts": bad,
    "apps/b/src/main.cjs": bad,
    "apps/b/src/preload.js": bad,
    "apps/b/src/panel.jsx": bad,
    "apps/b/src/tool.mjs": bad,
    "packages/a/src/clean.ts": "export const ok = true;\n",
    "packages/a/src/plugin.test.ts": bad,
    "packages/a/src/plugin.spec.tsx": bad,
    "packages/a/src/plugin.bench.ts": bad,
    "packages/a/src/plugin.perf.ts": bad,
    "apps/b/src/main.test.mjs": bad,
    "apps/b/src/main.spec.js": bad,
    "packages/a/src/types.d.ts": bad,
    "packages/a/src/types.d.mts": bad,
    "packages/a/src/data.json": bad,
    "packages/a/src/test/helpers.ts": bad,
    "packages/a/tests/helpers.ts": bad,
    "packages/a/src/__tests__/helpers.ts": bad,
    "packages/a/src/fixtures/sample.ts": bad,
    "packages/a/dist/plugin.js": bad,
    "packages/a/build/plugin.js": bad,
    "packages/a/coverage/plugin.js": bad,
    "apps/b/out/main.js": bad,
    "packages/a/node_modules/dep/index.js": bad,
    "apps/b/dist-electron/main.js": bad,
    "apps/b/.cache/main.js": bad,
    "scripts/tool.mjs": bad,
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
      "apps/b/src/main.cjs:1 按 id 取出服务后自己断言了类型",
      "apps/b/src/panel.jsx:1 按 id 取出服务后自己断言了类型",
      "apps/b/src/preload.js:1 按 id 取出服务后自己断言了类型",
      "apps/b/src/tool.mjs:1 按 id 取出服务后自己断言了类型",
      "packages/a/src/legacy.cts:1 按 id 取出服务后自己断言了类型",
      "packages/a/src/plugin.ts:1 按 id 取出服务后自己断言了类型",
      "packages/a/src/view.tsx:1 按 id 取出服务后自己断言了类型",
      "packages/a/src/worker.mts:1 按 id 取出服务后自己断言了类型",
    ],
  });
});

test("every listed exception is unique and says why it is allowed", () => {
  assert.equal(new Set(ALLOWED.map((entry) => `${entry.file}#${entry.rule}`)).size, ALLOWED.length);
  for (const entry of ALLOWED) {
    assert.ok(["cast", "lease", "raw-provide"].includes(entry.rule), entry.file);
    assert.ok(Number.isInteger(entry.count) && entry.count > 0, entry.file);
    assert.ok(entry.reason.trim().length > 0, entry.file);
  }
});

test("the repository passes", () => {
  const { files, errors } = runCheck();
  assert.ok(files > 0);
  assert.deepEqual(errors, []);
});
