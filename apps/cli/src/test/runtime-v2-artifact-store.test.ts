import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CliV2ArtifactStore } from "../runtime-v2/artifact-store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("CliV2ArtifactStore", () => {
  it("persists owner metadata, enforces Session ownership and detects metadata tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-cli-artifact-")); roots.push(root);
    const store = new CliV2ArtifactStore(root);
    const ref = await store.create({ bytes: Buffer.from("original"), mediaType: "text/plain", owner: { sessionId: "session-a", callId: "call", pluginId: "plugin", name: "tool" } });
    await expect(store.readForSession("session-a", ref.artifactId)).resolves.toMatchObject({ mediaType: "text/plain" });
    await expect(store.readForSession("session-b", ref.artifactId)).rejects.toThrow("does not belong");
    await expect(store.resolveForSession("session-a", ref.artifactId)).resolves.toEqual({ path: await realpath(join(store.root, ref.artifactId)), mediaType: "text/plain" });
    await expect(store.resolveForSession("session-b", ref.artifactId)).rejects.toThrow("does not belong");
    const metadataPath = join(store.root, `${ref.artifactId}.json`);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    await writeFile(metadataPath, `${JSON.stringify({ ...metadata, sha256: "0".repeat(64) })}\n`);
    await expect(store.read(ref.artifactId)).rejects.toThrow("integrity check failed");
  });

  it("exports referenced ephemeral artifacts and removes the temporary store", async () => {
    const out = await mkdtemp(join(tmpdir(), "actspace-cli-artifact-out-")); roots.push(out);
    const store = await CliV2ArtifactStore.ephemeral(); const storeRoot = store.root;
    const ref = await store.create({ bytes: Buffer.from([137, 80, 78, 71]), mediaType: "image/png", owner: { sessionId: "session-a", callId: "call", pluginId: "plugin", name: "tool" } });

    await store.exportForSession("session-a", [ref], out);

    const manifest = JSON.parse(await readFile(join(out, "artifacts", "manifest.json"), "utf8")) as readonly { filename: string }[];
    expect(manifest).toEqual([{ artifactId: ref.artifactId, mediaType: "image/png", filename: `${ref.artifactId}.png` }]);
    expect(await readFile(join(out, "artifacts", manifest[0]!.filename))).toEqual(Buffer.from([137, 80, 78, 71]));
    await store.dispose();
    await expect(access(storeRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
