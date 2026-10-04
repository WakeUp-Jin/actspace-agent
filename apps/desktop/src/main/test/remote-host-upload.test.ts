import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { RemoteSessionRouter } from "../remote-hosts/session-router";
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
