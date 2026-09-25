import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "../session-store.js";
import { createJsonlSessionPersistence } from "../session-persistence.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "fork-artifacts-")); roots.push(dataRoot);
  const registry = createCoreCodecRegistry();
  const copies = new Map<string, string>();
  const artifacts = {
    copyForSession: vi.fn(async (parent: string, child: string, id: string) => {
      if (id === "missing") throw new Error("missing artifact");
      const next = `${child}-${id}`; copies.set(next, child); return { artifactId: next };
    }),
    deleteForSession: vi.fn(async (_session: string, id: string) => { copies.delete(id); }),
  };
  const options = { dataRoot, registry, runtimeId: "test", forkArtifacts: artifacts };
  const persistence = createJsonlSessionPersistence(options);
  const store = new SessionStore(options, persistence);
  const createdWith = { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest };
  const parent = await store.create({ sessionId: "parent", lineage: null, createdAt: new Date().toISOString(), createdWith });
  async function message(id: string) {
    const content = [{ type: "image", artifactId: id, mimeType: "image/png" }, { type: "artifact", artifact: { artifactId: id, mediaType: "image/png" } }, { type: "text", text: `keep ${id}` }];
    await parent.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: id, content }, surface: { kind: "append", node: { kind: "user", messageId: id, content } } });
    await parent.flush();
  }
  async function fork(parentSessionId = "parent", newSessionId = "child", boundarySeq = 0) {
    return store.fork({ parentSessionId, newSessionId, boundarySeq, createdAt: new Date().toISOString(), createdWith });
  }
  return { dataRoot, store, persistence, parent, message, fork, artifacts, copies };
}

it("copies referenced artifacts once, rewrites data and surface, preserves parent and supports another fork", async () => {
  const f = await fixture();
  await f.message("image"); await f.message("later"); await f.parent.close();
  const child = await f.fork();
  expect(f.artifacts.copyForSession.mock.calls).toEqual([["parent", "child", "image"]]);
  const event = child.journal.events[0]!;
  expect(event.data).toMatchObject({ content: [{ artifactId: "child-image" }, { artifact: { artifactId: "child-image" } }, { text: "keep image" }] });
  expect(event.surface).toMatchObject({ node: { content: [{ artifactId: "child-image" }, { artifact: { artifactId: "child-image" } }, { text: "keep image" }] } });
  expect(JSON.stringify((await f.store.inspect("parent")).events)).not.toContain("child-image");
  await child.close();
  const grandchild = await f.fork("child", "grandchild");
  expect(f.artifacts.copyForSession).toHaveBeenLastCalledWith("child", "grandchild", "child-image");
  await grandchild.close();
  const reopened = await f.store.open("child");
  expect(reopened.journal.events[0]).toEqual(event); await reopened.close();
});

it("rolls back copied files and child directory when a later artifact cannot be copied", async () => {
  const f = await fixture();
  await f.message("image"); await f.message("missing"); await f.parent.close();
  await expect(f.fork("parent", "child", 1)).rejects.toThrow("missing artifact");
  expect(f.copies.size).toBe(0);
  expect(await readdir(join(f.dataRoot, "sessions-v2"))).toEqual(["parent"]);
});

it("does not overwrite an existing child or copy artifacts for an invalid boundary", async () => {
  const f = await fixture(); await f.message("image"); await f.parent.close();
  await expect(f.fork("parent", "bad", 99)).rejects.toThrow();
  expect(f.artifacts.copyForSession).not.toHaveBeenCalled();
  const child = await f.fork(); await child.close();
  await expect(f.fork()).rejects.toThrow();
  expect(f.artifacts.copyForSession).toHaveBeenCalledTimes(1);
  expect((await f.store.inspect("child")).header?.sessionId).toBe("child");
});

it("rolls back artifacts when publishing the child Journal fails", async () => {
  const f = await fixture(); await f.message("image"); await f.parent.close();
  vi.spyOn(f.persistence, "create").mockRejectedValueOnce(new Error("disk full"));
  await expect(f.fork()).rejects.toThrow("disk full");
  expect(f.artifacts.deleteForSession).toHaveBeenCalledWith("child", "child-image");
  expect(f.copies.size).toBe(0);
  expect(await readdir(join(f.dataRoot, "sessions-v2"))).toEqual(["parent"]);
});
