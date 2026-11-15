import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import * as nodePath from "node:path";
import { basename, resolve } from "node:path";
import { isLexicallyInside } from "@actspace/shared";
import { HOST_LIMITS, HostError, HostRequestError } from "@actspace/shared/host-protocol";
import type { NodeArtifactStore } from "./node-ports/artifact-store.js";
import type { HostUploads } from "./uploads.js";
/** Session-owned immutable snapshots; paths never become download capabilities. */
export class HostArtifacts {
  constructor(private readonly uploads: HostUploads, private readonly store: NodeArtifactStore) {}
  async reference(sessionId: string, workspace: string, path: string) {
    const source = await this.#snapshotSource(workspace, path).catch((error: unknown) => {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") throw new HostError("NOT_FOUND", "Result file does not exist; restore or regenerate it, then retry");
      throw error;
    });
    const ref = await this.store.create({ bytes: source.bytes, mediaType: mediaType(source.bytes), owner: { sessionId, callId: "file-reference", pluginId: "actspace.agent-host", name: source.name } });
    return { id: ref.artifactId, name: source.name, size: ref.size, sha256: ref.sha256, mediaType: ref.mediaType };
  }
  async #snapshotSource(workspace: string, path: string) {
    const root = await realpath(workspace), target = await realpath(resolve(root, path));
    // 工作区根目录本身放过去，下面会因为不是普通文件被拒。
    if (!isLexicallyInside(nodePath, root, target, { includeRoot: true })) throw new HostError("FORBIDDEN", "File is outside the Session workspace");
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      const verifiedTarget = await realpath(target), current = await stat(verifiedTarget);
      if (!isLexicallyInside(nodePath, root, verifiedTarget, { includeRoot: true }) || current.ino !== before.ino || current.dev !== before.dev) throw new HostError("FORBIDDEN", "Result path changed during access");
      if (!before.isFile() || before.size > 20 * 1024 * 1024) throw new HostError("LIMIT_EXCEEDED", "Result must be a regular file up to 20 MiB");
      const bytes = await file.readFile(), after = await file.stat();
      if (bytes.length !== before.size || after.mtimeMs !== before.mtimeMs || after.size !== before.size) throw new HostError("CONFLICT", "Result changed during snapshot; retry", true);
      return { bytes, name: basename(target) };
    } finally { await file.close(); }
  }
  async describe(sessionId: string, id: string) {
    try {
      const upload = await this.uploads.describe(sessionId, id), value = await this.uploads.resolve(sessionId, id);
      return { ...upload, mediaType: value.mediaType };
    } catch (error) { if (!(error instanceof HostError) || error.kind !== "NOT_FOUND") throw error; }
    return this.store.describeForSession(sessionId, id);
  }
  /** One chunk of a download. Reads only the requested range: a 20 MiB file is 80 of these calls. */
  async read(sessionId: string, id: string, offset: number, length: number) {
    try { return await this.uploads.read(sessionId, id, offset, length); }
    catch (error) { if (!(error instanceof HostError) || error.kind !== "NOT_FOUND") throw error; }
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > HOST_LIMITS.chunkBytes) throw new HostRequestError("Invalid artifact range");
    const { bytes, size } = await this.store.readRangeForSession(sessionId, id, offset, length);
    if (offset > size) throw new HostRequestError("Invalid artifact range");
    return { data: bytes.toString("base64"), sha256: hash(bytes), size };
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
