import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { SessionRef, HostMethod } from "@actspace/shared/host-protocol";
import type { RemoteHostRegistry } from "./registry";
import { decodeSessionLocator, encodeSessionLocator } from "@actspace/shared/session-locator";
export type AttachmentUploadSource = string | { artifactId: string };
export function attachmentUploadSources(ref: SessionRef, attachments: unknown): AttachmentUploadSource[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.map(attachment => {
    if (!attachment || typeof attachment !== "object") throw new Error("Invalid attachment");
    if (attachment.remoteArtifact) {
      const value = attachment.remoteArtifact;
      if (value.sessionId !== remoteSessionKey(ref) || typeof value.artifactId !== "string" || !value.artifactId) throw new Error("Attachment belongs to another session");
      return { artifactId: value.artifactId };
    }
    if (typeof attachment.path !== "string") throw new Error("Invalid attachment");
    return attachment.path;
  });
}
/** Transitional UI cache key; the wire always receives the original structured SessionRef. 编解码在 shared 的 session-locator。 */
export function remoteSessionKey(ref: SessionRef): string { return encodeSessionLocator(ref); }
export function parseRemoteSessionKey(key: string): SessionRef | null { return decodeSessionLocator(key); }
export class RemoteSessionRouter {
  constructor(private readonly hosts: RemoteHostRegistry) {}
  call(ref: SessionRef, method: HostMethod, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> { return this.hosts.call(ref.hostId, method, { ...params, sessionId: ref.sessionId }); }
  /** Attachment bytes stay in Main until Send. Never forward a local path to Host. */
  async upload(ref: SessionRef, paths: readonly AttachmentUploadSource[], progress?: (bytes: number, total: number) => void, existingIds: string[] = [], save: () => Promise<void> = async () => {}, readRemote?: (id: string) => Promise<{ bytes: Buffer; name: string }>): Promise<string[]> {
    if (paths.length > 10) throw new Error("每条消息最多添加 10 个附件。");
    const sources: { name: string; size: number; path?: string; bytes?: Buffer }[] = [];
    let total = 0;
    for (const path of paths) {
      const remote = typeof path === "string" ? undefined : await readRemote?.(path.artifactId);
      if (typeof path !== "string" && !remote) throw new Error("Remote attachment is unavailable");
      const info = typeof path === "string" ? await stat(path).catch(() => { throw new Error("无法读取附件，请确认文件仍存在并重新选择。"); }) : undefined;
      const size = remote?.bytes.length ?? info!.size;
      if ((info && !info.isFile()) || size > 20 * 1024 * 1024) throw new Error("附件必须是普通文件，单个文件不能超过 20 MiB。");
      total += size; if (total > 50 * 1024 * 1024) throw new Error("每条消息的附件总大小不能超过 50 MiB。");
      sources.push(remote ? { name: remote.name, bytes: remote.bytes, size } : { name: basename(path as string), path: path as string, size });
    }
    const ids: string[] = []; let transferred = 0;
    for (let index = 0; index < paths.length; index++) {
      const source = sources[index]!, bytes = source.bytes ?? await readFile(source.path!);
      if (bytes.length !== source.size) throw new Error("附件内容已变化，请重新选择文件。");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const begin = await (existingIds[index]
        ? this.call(ref, "uploads.status", { uploadId: existingIds[index] })
        : this.call(ref, "uploads.begin", { name: source.name, size: bytes.length, sha256 })) as { id: string; size: number; sha256: string; offset: number; complete: boolean };
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
