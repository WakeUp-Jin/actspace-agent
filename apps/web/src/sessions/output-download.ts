import type { HostClient } from "@actspace/client/host";
import { HOST_LIMITS, isRecord } from "@actspace/shared/host-protocol";
import { isOutputPath } from "./turn-output-files";

export type OutputDownload = { readonly name: string; readonly size: number; readonly blob: Blob };
const digest = async (bytes: Uint8Array<ArrayBuffer>) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Snapshot at click time, then read only the session-owned immutable artifact. */
export async function readOutputDownload(client: Pick<HostClient, "call">, sessionId: string, path: string, signal: AbortSignal): Promise<OutputDownload> {
  if (!isOutputPath(path)) throw new Error("文件路径无效");
  signal.throwIfAborted();
  const ref = await client.call("files.reference", { sessionId, path });
  signal.throwIfAborted();
  if (!isRecord(ref) || typeof ref.id !== "string" || !ref.id || typeof ref.name !== "string" || !Number.isSafeInteger(ref.size) || (ref.size as number) < 0 || !isHash(ref.sha256)) throw new Error("文件信息无效，请重试");
  const size = ref.size as number;
  if (size > HOST_LIMITS.fileBytes) throw new Error("文件超过 20 MiB 下载上限");
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += HOST_LIMITS.chunkBytes) {
    const length = Math.min(HOST_LIMITS.chunkBytes, size - offset);
    const chunk = await client.call("artifacts.read", { sessionId, artifactId: ref.id, offset, length });
    signal.throwIfAborted();
    if (!isRecord(chunk) || chunk.size !== size || typeof chunk.data !== "string" || !isHash(chunk.sha256)) throw new Error("文件下载不完整，请重试");
    const data = Uint8Array.from(atob(chunk.data), char => char.charCodeAt(0));
    if (data.length !== length || await digest(data) !== chunk.sha256) throw new Error("文件内容校验失败，请重试");
    bytes.set(data, offset);
  }
  if (await digest(bytes) !== ref.sha256) throw new Error("文件内容校验失败，请重试");
  signal.throwIfAborted();
  const name = ref.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return { name: name && name !== "." && name !== ".." ? name : "download", size, blob: new Blob([bytes], { type: "application/octet-stream" }) };
}

/** Always save as an attachment; HTML/SVG are never navigated to or rendered. */
export function saveOutputDownload(file: OutputDownload): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    // Allow the browser to consume the Blob before revoking (including mobile browsers).
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
