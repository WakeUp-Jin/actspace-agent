import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { inspectCordisAdmission } from "@actspace/cordis-adapter";
import type { SessionStorage } from "@actspace/session-storage";
import { createProfileComposition, RUNTIME_PROFILE_IDS } from "../profiles/composition.js";
import { runtimeCordisConfigPath } from "../config-path.js";
import type { RuntimeSessionController } from "../session/session-controller.js";
import { bootProfileRuntime, resetRuntimeProcessGuardForTest } from "./boot.js";
import { createRuntimeHostServices } from "./host-services.js";

afterEach(() => { resetRuntimeProcessGuardForTest(); });

const message = (id: string) => ({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: id, content: id }, surface: { kind: "append" as const } });

// 其它回退测试都自己 new 存储对象。这里走真实启动：Session Runtime 拿到的是插件注册在 session.storage 下的那个对象，
// 它少转发一个可选能力，回退就会变成"不支持"，增量读取就会退回整份重读，而且不报错。
it("the storage the booted Session runtime receives can rewind a Session and refresh incrementally", async () => {
  const root = await mkdtemp(join(tmpdir(), "session-storage-boot-"));
  const host = { hostKind: "cli-run" as const, capabilityCeiling: ["filesystem.read", "filesystem.write", "network", "approval", "credential", "process"] as const, runtimeContract: "actspace.runtime.v2" as const, invocationId: "test" };
  const composition = createProfileComposition(RUNTIME_PROFILE_IDS.headless, host);
  const env = { workspaceRoot: root, hostCapabilities: new Set<string>(host.capabilityCeiling), capabilitySet: { ids: host.capabilityCeiling, has: () => true, get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); } };
  const ports = Object.fromEntries(["web-tools", "image-generation", "image-inspection"].map(id => [`actspace.host.tools.${id}`, { createPorts: () => ({}) }]));
  const profile = await bootProfileRuntime({ host, dataRoot: root, toolEnvironment: env, composition, harnessStats: false,
    hostServices: createRuntimeHostServices({ descriptor: host, dataRoot: root, workspaceRoot: root, toolEnvironment: env, services: {
      ...ports, "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "test", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => { throw new Error("No model calls in this test."); } } }] },
    } }),
    cordis: { configPath: runtimeCordisConfigPath(), admission: await inspectCordisAdmission() },
  });
  try {
    const sessions = profile.context.get?.("session.runtime") as RuntimeSessionController;
    const storage: SessionStorage = sessions.store.storage;
    expect([typeof storage.refresh, typeof storage.rewritePrefix, typeof storage.retireInto]).toEqual(["function", "function", "function"]);

    const session = await sessions.create("rewound", root);
    await session.appendMany([message("one"), message("two"), message("three")]);
    await session.flush();
    const before = await readFile(storage.journalPath!("rewound"), "utf8");
    const lastSeq = session.journal.readEvents().at(-1)!.seq;
    const cutSeq = session.journal.readEvents().find(event => (event.data as { messageId?: string }).messageId === "two")!.seq;

    const result = await sessions.rewrite("rewound", { expectedLastSeq: lastSeq, cutSeq, closing: [], label: "rewind-1", retire: [] });

    expect(result.archive).toBe("recovery/rewind-1.journal.jsonl");
    expect(result.session.journal.readEvents().filter(event => event.type === "user/message").map(event => (event.data as { messageId: string }).messageId)).toEqual(["one"]);
    expect(sessions.getOpen("rewound")).toBe(result.session);
    expect(await readFile(join(storage.journalPath!("rewound"), "..", result.archive), "utf8")).toBe(before);
  } finally { await profile.shutdown(); await rm(root, { recursive: true, force: true }); }
});
