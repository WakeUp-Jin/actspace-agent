import { mkdtemp, rm, writeFile, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { HostArtifacts } from "../artifacts.js";
import { HostUploads } from "../uploads.js";
import { NodeArtifactStore } from "../node-ports/artifact-store.js";
it("snapshots workspace results and rejects cross-session reads and symlink escape", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-artifacts-"));
  try {
    const workspace = join(root, "workspace"); await mkdir(workspace);
    await writeFile(join(workspace, "result.txt"), "original");
    const artifacts = new HostArtifacts(new HostUploads(join(root, "uploads")), new NodeArtifactStore(join(root, "data")));
    const ref = await artifacts.reference("s", workspace, "result.txt");
    await writeFile(join(workspace, "result.txt"), "replaced");
    expect(Buffer.from((await artifacts.read("s", ref.id, 0, 100)).data, "base64").toString()).toBe("original");
    await expect(artifacts.describe("other", ref.id)).rejects.toThrow("Session");
    await expect(artifacts.read("other", ref.id, 0, 100)).rejects.toThrow("Session");
    await rm(join(workspace, "result.txt"));
    const reopened = new HostArtifacts(new HostUploads(join(root, "uploads")), new NodeArtifactStore(join(root, "data")));
    expect(Buffer.from((await reopened.read("s", ref.id, 0, 100)).data, "base64").toString()).toBe("original");
    await writeFile(join(root, "secret"), "outside"); await symlink(join(root, "secret"), join(workspace, "escape"));
    await expect(artifacts.reference("s", workspace, "escape")).rejects.toMatchObject({ kind: "FORBIDDEN" });
    await expect(artifacts.reference("s", workspace, "../secret")).rejects.toMatchObject({ kind: "FORBIDDEN" });
    await writeFile(join(workspace, "large.bin"), Buffer.alloc(20 * 1024 * 1024 + 1));
    await expect(artifacts.reference("s", workspace, "large.bin")).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });
    await expect(artifacts.reference("s", workspace, ".")).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("explains missing source files and allows retry without invalidating snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-artifacts-missing-"));
  try {
    const workspace = join(root, "workspace"); await mkdir(workspace);
    const path = join(workspace, "result.txt"); await writeFile(path, "original");
    const artifacts = new HostArtifacts(new HostUploads(join(root, "uploads")), new NodeArtifactStore(join(root, "data")));
    const original = await artifacts.reference("s", workspace, "result.txt");
    await rm(path);
    await expect(artifacts.reference("s", workspace, "result.txt")).rejects.toMatchObject({
      kind: "NOT_FOUND", message: "Result file does not exist; restore or regenerate it, then retry",
    });
    expect(Buffer.from((await artifacts.read("s", original.id, 0, 100)).data, "base64").toString()).toBe("original");
    await writeFile(path, "restored");
    await expect(artifacts.reference("s", workspace, "result.txt/child")).rejects.toMatchObject({ kind: "NOT_FOUND" });
    const restored = await artifacts.reference("s", workspace, "result.txt");
    expect(Buffer.from((await artifacts.read("s", restored.id, 0, 100)).data, "base64").toString()).toBe("restored");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("does not misclassify snapshot persistence failures as missing source files", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-artifacts-storage-"));
  try {
    const workspace = join(root, "workspace"); await mkdir(workspace);
    await writeFile(join(workspace, "result.txt"), "present");
    const store = new NodeArtifactStore(join(root, "data"));
    const failure = Object.assign(new Error("owned snapshot storage unavailable"), { code: "ENOENT" });
    vi.spyOn(store, "create").mockRejectedValueOnce(failure);
    const artifacts = new HostArtifacts(new HostUploads(join(root, "uploads")), store);
    await expect(artifacts.reference("s", workspace, "result.txt")).rejects.toBe(failure);
  } finally { await rm(root, { recursive: true, force: true }); }
});
