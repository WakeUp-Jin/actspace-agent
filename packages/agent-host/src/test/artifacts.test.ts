import { mkdtemp, rm, writeFile, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
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
    await writeFile(join(root, "secret"), "outside"); await symlink(join(root, "secret"), join(workspace, "escape"));
    await expect(artifacts.reference("s", workspace, "escape")).rejects.toMatchObject({ kind: "FORBIDDEN" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
