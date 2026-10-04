import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { SessionRef, HostMethod } from "@actspace/shared/host-protocol";
import type { RemoteHostRegistry } from "./registry";
/** Transitional UI cache key; the wire always receives the original structured SessionRef. */
export function remoteSessionKey(ref: SessionRef): string { return `host:${Buffer.from(JSON.stringify([ref.hostId, ref.sessionId])).toString("base64url")}`; }
export function parseRemoteSessionKey(key: string): SessionRef | null {
  if (!key.startsWith("host:")) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(key.slice(5), "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2 || value.some(item => typeof item !== "string" || !item.length || item.length > 128)) throw new Error();
    const ref = { hostId: value[0] as string, sessionId: value[1] as string };
    if (remoteSessionKey(ref) !== key) throw new Error(); return ref;
  } catch { throw new Error("Invalid remote SessionRef"); }
}
export class RemoteSessionRouter {
  constructor(private readonly hosts: RemoteHostRegistry) {}
  call(ref: SessionRef, method: HostMethod, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> { return this.hosts.call(ref.hostId, method, { ...params, sessionId: ref.sessionId }); }
  /** Attachment bytes stay in Main until Send. Never forward a local path to Host. */
  async upload(ref: SessionRef, paths: readonly string[], progress?: (bytes: number, total: number) => void, existingIds: string[] = [], save: () => Promise<void> = async () => {}): Promise<string[]> {
    if (paths.length > 10) throw new Error("每条消息最多添加 10 个附件。");
    const sizes = await Promise.all(paths.map(async path => { const info = await stat(path).catch(() => { throw new Error("无法读取附件，请确认文件仍存在并重新选择。"); }); if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error("附件必须是普通文件，单个文件不能超过 20 MiB。"); return info.size; }));
    const total = sizes.reduce((sum, size) => sum + size, 0); if (total > 50 * 1024 * 1024) throw new Error("每条消息的附件总大小不能超过 50 MiB。");
    const ids: string[] = []; let transferred = 0;
    for (let index = 0; index < paths.length; index++) {
      const bytes = await readFile(paths[index]!);
      if (bytes.length !== sizes[index]) throw new Error("附件内容已变化，请重新选择文件。");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const begin = await (existingIds[index]
        ? this.call(ref, "uploads.status", { uploadId: existingIds[index] })
        : this.call(ref, "uploads.begin", { name: basename(paths[index]!), size: bytes.length, sha256 })) as { id: string; size: number; sha256: string; offset: number; complete: boolean };
      if (begin.size !== bytes.length || begin.sha256 !== sha256 || !Number.isSafeInteger(begin.offset) || begin.offset < 0 || begin.offset > bytes.length) throw new Error("附件内容已变化，请重新选择文件。");
      if (!existingIds[index]) { existingIds[index] = begin.id; await save(); }
      transferred += begin.offset; progress?.(transferred, total);
      for (let offset = begin.offset; offset < bytes.length; offset += 256 * 1024) {
        const chunk = bytes.subarray(offset, offset + 256 * 1024);
        await this.call(ref, "uploads.write", { uploadId: begin.id, offset, data: chunk.toString("base64"), sha256: createHash("sha256").update(chunk).digest("hex") });
        transferred += chunk.length; progress?.(transferred, total);
      }
      if (!begin.complete) await this.call(ref, "uploads.finish", { uploadId: begin.id }); ids.push(begin.id);
    }
    return ids;
  }
}
