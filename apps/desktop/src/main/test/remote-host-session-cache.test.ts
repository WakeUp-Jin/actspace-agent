import { expect, it } from "vitest";
import { RemoteSessionCache } from "../remote-hosts/session-cache";
import { parseRemoteSessionKey, remoteSessionKey } from "../remote-hosts/session-router";
it("isolates identical session ids and preserves offline observations", () => {
  const cache = new RemoteSessionCache();
  const a = { hostId: "a", sessionId: "same" }, b = { hostId: "b", sessionId: "same" };
  cache.setObservation(a, { sessionId: "same", snapshot: { marker: "a" } } as never);
  cache.setObservation(b, { sessionId: "same", snapshot: { marker: "b" } } as never);
  expect(cache.observation(a)?.snapshot).toEqual({ marker: "a" });
  expect(cache.observation(b)?.snapshot).toEqual({ marker: "b" });
  expect(parseRemoteSessionKey(remoteSessionKey(a))).toEqual(a);
  expect(remoteSessionKey(a)).not.toBe(remoteSessionKey(b));
  cache.removeHost("a"); expect(cache.observation(a)).toBeUndefined(); expect(cache.observation(b)).toBeDefined();
});
it("restores offline lists and session observations after Main restarts", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "remote-cache-"));
  try {
    const first = new RemoteSessionCache(root), ref = { hostId: "a", sessionId: "same" };
    await first.setList("a", [{ sessionId: "same", metadata: { title: "cached" } }] as never);
    await first.setObservation(ref, { sessionId: "same", snapshot: { marker: "durable cached history" } } as never);
    const key = JSON.stringify(["a", "/workspace", false, "cursor"]);
    await first.setPage(key, { items: [{ id: "s", title: "page cached" }], groups: [{ workspaceRoot: "/workspace", pinned: false, hasMore: true }] } as never);
    const restarted = new RemoteSessionCache(root); await restarted.open();
    expect(restarted.list([{ hostId: "a", name: "Cloud", state: "offline" }] as never)[0]?.session.metadata.title).toBe("cached");
    expect((await restarted.readObservation(ref))?.snapshot).toEqual({ marker: "durable cached history" });
    expect(await restarted.readObservation({ hostId: "other", sessionId: "same" })).toBeUndefined();
    expect((await restarted.readPage(key))?.items[0]?.title).toBe("page cached");
    expect(await restarted.readPage(JSON.stringify(["b", "/workspace", false, "cursor"]))).toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});
