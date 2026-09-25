import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopArtifactStore } from "../runtime-v2/artifact-store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("DesktopArtifactStore", () => {
  it("copies independently for a fork, preserves integrity and rejects copying another Session's file", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-artifact-fork-")); roots.push(root);
    const store = new DesktopArtifactStore(root);
    const source = await store.create({ bytes: Buffer.from("fork bytes"), mediaType: "image/png", owner: { sessionId: "parent", callId: "call", pluginId: "plugin", name: "image" } });
    await expect(store.copyForSession("other", "child", source.artifactId)).rejects.toThrow("does not belong");
    const copy = await store.copyForSession("parent", "child", source.artifactId);
    expect(copy.artifactId).not.toBe(source.artifactId);
    expect(copy).toMatchObject({ sha256: source.sha256, size: source.size, mediaType: source.mediaType });
    await expect(store.readForSession("parent", copy.artifactId)).rejects.toThrow("does not belong");
    await store.deleteForSession("parent", source.artifactId);
    expect(Buffer.from((await store.readForSession("child", copy.artifactId)).bytes).toString()).toBe("fork bytes");
    const grandchild = await store.copyForSession("child", "grandchild", copy.artifactId);
    await store.deleteForSession("child", copy.artifactId);
    await expect(store.readForSession("grandchild", grandchild.artifactId)).resolves.toMatchObject({ mediaType: "image/png" });
  });
  it("persists owner metadata, enforces Session ownership and detects byte tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-desktop-artifact-")); roots.push(root);
    const store = new DesktopArtifactStore(root);
    const ref = await store.create({ bytes: Buffer.from("original"), mediaType: "text/plain", owner: { sessionId: "session-a", callId: "call", pluginId: "plugin", name: "tool" } });
    await expect(store.readForSession("session-a", ref.artifactId)).resolves.toMatchObject({ mediaType: "text/plain" });
    const resolved = await store.resolveForSession("session-a", ref.artifactId);
    expect(resolved.path).toBe(await realpath(join(store.root, ref.artifactId)));
    expect(Buffer.from(resolved.bytes).toString("utf8")).toBe("original");
    await expect(store.readForSession("session-b", ref.artifactId)).rejects.toThrow("does not belong");
    const metadata = JSON.parse(await readFile(join(store.root, `${ref.artifactId}.json`), "utf8")) as { owner: { sessionId: string } };
    expect(metadata.owner.sessionId).toBe("session-a");
    await writeFile(join(store.root, ref.artifactId), "tampered");
    await expect(store.read(ref.artifactId)).rejects.toThrow("integrity check failed");
  });

  it("deletes staged artifacts only for their owning Session", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-desktop-artifact-delete-")); roots.push(root);
    const store = new DesktopArtifactStore(root);
    const ref = await store.create({ bytes: Buffer.from("staged"), mediaType: "text/plain", owner: { sessionId: "session-a", callId: "call", pluginId: "plugin", name: "attachment" } });
    await expect(store.deleteForSession("session-b", ref.artifactId)).rejects.toThrow("does not belong");
    await store.deleteForSession("session-a", ref.artifactId);
    await expect(store.read(ref.artifactId)).rejects.toThrow();
  });
});
