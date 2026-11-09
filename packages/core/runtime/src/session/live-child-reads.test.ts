import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage } from "@actspace/session-persistence-jsonl";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { RuntimeSessionController } from "./session-controller.js";

/**
 * run6：4 个子 Agent 同时在跑时，右侧子 Agent 面板每秒对每个子会话调一次 inspectSessionEvents + inspectSession。
 * 子会话由子 Agent 管理器打开，经 registerExternal 登记在控制器里；读它们不应该再去整份读日志文件。
 */
it("reads live child sessions from memory instead of re-reading their journals", async () => {
  const root = await mkdtemp(join(tmpdir(), "live-child-reads-"));
  const registry = createCoreCodecRegistry();
  const storage = new JsonlSessionStorage({ dataRoot: root, runtimeId: "test", registry });
  let fullReads = 0, refreshes = 0;
  const inspect = storage.inspect.bind(storage), refresh = storage.refresh.bind(storage);
  storage.inspect = async (id) => { fullReads++; return inspect(id); };
  storage.refresh = async (id, base) => { refreshes++; return refresh(id, base); };
  const sessions = new RuntimeSessionController({ dataRoot: root, runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, storage));
  const children = [];
  const releases: (() => void)[] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const child = await sessions.store.create({ sessionId: `child-${i}`, createdAt: new Date().toISOString(),
        lineage: { origin: "delegation", parentSessionId: "parent", parentCallId: `call-${i}`, parentBoundarySeq: 0, seedDigest: "test", delegationDepth: 1 },
        createdWith: { profileId: "base", presetId: "actspace.explore", runtimeContractVersion: "2", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
      releases.push(sessions.registerExternal(child));
      children.push(child);
    }
    fullReads = 0; refreshes = 0;
    // 模拟 5 秒的面板轮询，期间每个子会话都在写新事件。
    for (let tick = 0; tick < 5; tick++) {
      for (const child of children) {
        await child.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: `t${tick}` }, surface: null });
        await child.flush();
        const events = await sessions.inspectEvents(child.header.sessionId);
        expect(events.at(-1)?.data).toEqual({ title: `t${tick}` });
        const snapshot = await sessions.inspect(child.header.sessionId);
        expect(snapshot.throughJournalSeq).toBe(child.lastSeq);
        // 列表取模型名只要最新一条某类事件。
        expect((await sessions.latestEvent(child.header.sessionId, "session/title-set"))?.data).toEqual({ title: `t${tick}` });
      }
    }
    expect({ fullReads, refreshes }).toEqual({ fullReads: 0, refreshes: 0 });

    // 子 Agent 结束、取消登记后，内存里的读模型一起释放：之后再读走磁盘，读到的仍是完整内容。
    releases[0]();
    const released = await sessions.inspect("child-0");
    expect(released.metadata.title).toBe("t4");
    expect(fullReads).toBeGreaterThan(0);
  } finally {
    for (const child of children) await child.close();
    await sessions.closeAll(); await rm(root, { recursive: true, force: true });
  }
});
