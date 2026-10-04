import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { HostError } from "@actspace/shared/host-protocol";
import type { NodeArtifactStore } from "./node-ports/artifact-store.js";
import type { HostUploads } from "./uploads.js";
/** Session-owned immutable snapshots; paths never become download capabilities. */
export class HostArtifacts {
  constructor(private readonly uploads: HostUploads, private readonly store: NodeArtifactStore) {}
  async reference(sessionId: string, workspace: string, path: string) {
    const root = await realpath(workspace), target = await realpath(resolve(root, path));
    const nested = relative(root, target);
    if (nested === ".." || nested.startsWith("../") || isAbsolute(nested)) throw new HostError("FORBIDDEN", "File is outside the Session workspace");
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      const verifiedTarget = await realpath(target), current = await stat(verifiedTarget);
      const verifiedNested = relative(root, verifiedTarget);
      if (verifiedNested === ".." || verifiedNested.startsWith("../") || isAbsolute(verifiedNested) || current.ino !== before.ino || current.dev !== before.dev) throw new HostError("FORBIDDEN", "Result path changed during access");
      if (!before.isFile() || before.size > 20 * 1024 * 1024) throw new HostError("LIMIT_EXCEEDED", "Result must be a regular file up to 20 MiB");
      const bytes = await file.readFile(), after = await file.stat();
      if (bytes.length !== before.size || after.mtimeMs !== before.mtimeMs || after.size !== before.size) throw new HostError("CONFLICT", "Result changed during snapshot; retry", true);
      const ref = await this.store.create({ bytes, mediaType: mediaType(bytes), owner: { sessionId, callId: "file-reference", pluginId: "actspace.agent-host", name: basename(target) } });
      return { id: ref.artifactId, name: basename(target), size: ref.size, sha256: ref.sha256, mediaType: ref.mediaType };
    } finally { await file.close(); }
  }
  async #read(sessionId: string, id: string) {
    try { return await this.uploads.readForSession(sessionId, id); }
    catch (error) { if (!(error instanceof HostError) || error.kind !== "NOT_FOUND") throw error; return this.store.readForSession(sessionId, id); }
  }
  async describe(sessionId: string, id: string) {
    try {
      const upload = await this.uploads.describe(sessionId, id), value = await this.uploads.resolve(sessionId, id);
      return { ...upload, mediaType: value.mediaType };
    } catch (error) { if (!(error instanceof HostError) || error.kind !== "NOT_FOUND") throw error; }
    return this.store.describeForSession(sessionId, id);
  }
  async read(sessionId: string, id: string, offset: number, length: number) {
    const value = await this.#read(sessionId, id);
    if (offset < 0 || offset > value.bytes.length || length < 1 || length > 262144) throw new TypeError("Invalid artifact range");
    const bytes = Buffer.from(value.bytes.subarray(offset, offset + length));
    return { data: bytes.toString("base64"), sha256: hash(bytes), size: value.bytes.length };
  }
}
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
function mediaType(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length <= 1024 * 1024 && !bytes.includes(0)) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return "text/plain"; } catch { /* binary */ }
  }
  return "application/octet-stream";
}
