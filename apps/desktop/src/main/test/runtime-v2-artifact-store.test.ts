import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopArtifactStore } from "../runtime-v2/artifact-store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("DesktopArtifactStore", () => {
  const owner = (sessionId: string) => ({ sessionId, callId: "call", pluginId: "@actspace/desktop", name: "user-attachment" });
  async function store() {
    const root = await mkdtemp(join(tmpdir(), "actspace-artifact-name-")); roots.push(root);
    return new DesktopArtifactStore(root);
  }

  it("keeps an attachment's file name through reads and fork copies, only for its Session", async () => {
    const artifacts = await store();
    const ref = await artifacts.create({ bytes: Buffer.from("%PDF-"), mediaType: "application/pdf", owner: owner("a"), fileName: "季度报告.pdf" });
    await expect(artifacts.readForSession("a", ref.artifactId)).resolves.toMatchObject({ fileName: "季度报告.pdf", mediaType: "application/pdf" });
    const copy = await artifacts.copyForSession("a", "child", ref.artifactId);
    await expect(artifacts.readForSession("child", copy.artifactId)).resolves.toMatchObject({ fileName: "季度报告.pdf" });
    await expect(artifacts.readForSession("b", ref.artifactId)).rejects.toThrow("does not belong");
  });

  it("cleans the file name and omits it when nothing is left", async () => {
    const artifacts = await store();
    const dirty = await artifacts.create({ bytes: Buffer.from("x"), mediaType: "text/plain", owner: owner("a"), fileName: `a\u0000b\n${"n".repeat(300)}` });
    const read = await artifacts.readForSession("a", dirty.artifactId);
    expect(read.fileName).toBe(`ab${"n".repeat(238)}`);
    const empty = await artifacts.create({ bytes: Buffer.from("x"), mediaType: "text/plain", owner: owner("a"), fileName: "\u0001" });
    expect(await artifacts.readForSession("a", empty.artifactId)).not.toHaveProperty("fileName");
    const metadata = JSON.parse(await readFile(join(artifacts.root, `${empty.artifactId}.json`), "utf8")) as Record<string, unknown>;
    expect(metadata).not.toHaveProperty("fileName");
  });

  it("reads older metadata without a name and ignores an unusable one", async () => {
    const artifacts = await store();
    const old = await artifacts.create({ bytes: Buffer.from("x"), mediaType: "text/plain", owner: owner("a") });
    expect(await artifacts.readForSession("a", old.artifactId)).not.toHaveProperty("fileName");
    for (const bad of [42, ""]) {
      const path = join(artifacts.root, `${old.artifactId}.json`);
      const metadata = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      await writeFile(path, `${JSON.stringify({ ...metadata, fileName: bad })}\n`);
      const read = await artifacts.readForSession("a", old.artifactId);
      expect(read).not.toHaveProperty("fileName");
    }
  });

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
