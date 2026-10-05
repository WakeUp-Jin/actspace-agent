import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { attachmentUploadSources, remoteSessionKey, RemoteSessionRouter } from "../remote-hosts/session-router";
it("resumes at the Host acknowledged offset without resending acknowledged bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-upload-"));
  try {
    const bytes = Buffer.alloc(300000, 42), path = join(root, "file.bin"); await writeFile(path, bytes);
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const registry = { call: async (_host: string, method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === "uploads.status") return { id: "existing", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), offset: 262144, complete: false };
      return {};
    } };
    await new RemoteSessionRouter(registry as never).upload({ hostId: "h", sessionId: "s" }, [path], undefined, ["existing"]);
    expect(calls.map(call => call.method)).toEqual(["uploads.status", "uploads.write", "uploads.finish"]);
    expect(calls[1]?.params.offset).toBe(262144);
    expect(Buffer.from(String(calls[1]?.params.data), "base64")).toEqual(bytes.subarray(262144));
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("reuploads a restored remote artifact without reading a local path and resumes a lost upload reply", async () => {
  const ref = { hostId: "h", sessionId: "s" }, bytes = Buffer.from("remote image bytes"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const sources = attachmentUploadSources(ref, [{ id: "old", remoteArtifact: { sessionId: remoteSessionKey(ref), artifactId: "old" } }]);
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  let fail = true;
  const registry = { call: async (_host: string, method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === "uploads.begin") return { id: "new", size: bytes.length, sha256, offset: 0, complete: false };
    if (method === "uploads.status") return { id: "new", size: bytes.length, sha256, offset: bytes.length, complete: false };
    if (method === "uploads.write" && fail) { fail = false; throw new Error("reply lost"); }
    return {};
  } };
  const router = new RemoteSessionRouter(registry as never), ids: string[] = [], read = vi.fn(async () => ({ bytes, name: "visible.png" })), save = vi.fn(async () => {});
  await expect(router.upload(ref, sources, undefined, ids, save, read)).rejects.toThrow("reply lost");
  expect(ids).toEqual(["new"]); expect(save).toHaveBeenCalledTimes(1);
  expect(await router.upload(ref, sources, undefined, ids, save, read)).toEqual(["new"]);
  expect(calls.map(call => call.method)).toEqual(["uploads.begin", "uploads.write", "uploads.status", "uploads.finish"]);
  expect(calls[0]?.params.name).toBe("visible.png"); expect(read).toHaveBeenCalledWith("old");
  expect(() => attachmentUploadSources({ ...ref, sessionId: "other" }, [{ remoteArtifact: { sessionId: remoteSessionKey(ref), artifactId: "old" } }])).toThrow("another session");
  expect(() => attachmentUploadSources({ ...ref, hostId: "other" }, [{ remoteArtifact: { sessionId: remoteSessionKey(ref), artifactId: "old" } }])).toThrow("another session");
});
